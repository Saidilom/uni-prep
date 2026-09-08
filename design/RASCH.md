# Rasch Psychometric Engine — норма, дополнения и состояние реализации

Всё про измерение уровня ученика собрано здесь. Логика размазана по
`src/lib/rasch.ts`, `certificate-scale.ts`, `native-cert.ts`,
`mock-grade-level.ts`, `english-cefr.ts` и `/api/rasch/recalculate`; по одному
файлу картину не собрать, а цена ошибки — баллы живых учеников.

Норма — **Master Technical Specification v4.0** владельца, 267 разделов
(0–266). Исходник лежит рядом: [RASCH-SPEC-v4.0.docx](./RASCH-SPEC-v4.0.docx).
Часть II — его дословный перенос; формулы не переписаны и не «улучшены».

## Как читать

Спецификация описывает **универсальный** психометрический движок уровня
ETS/Pearson, а не движок под Миллий сертификат. Это проверено поиском по
тексту, и это важнее, чем звучит:

| Что искали в v4.0 | Найдено |
|---|---|
| BMA, БМБА, Milliy, Миллий, «сертификат» | **0 упоминаний** |
| Шкала 0–100, потолок 75 у языков | **нет** |
| Уровни A+ / A / B+ / B / C+ / C | **нет** |

То есть **самого нужного нам в норме нет**, а примерно 40% её объёма — про то,
чего Миллий сертификат не использует. Поэтому каждый раздел помечен уровнем:

- `CORE` — нужно для соответствия БМБА, делаем;
- `OPTIONAL` — полезно при определённых условиях (MFRM — только если задания
  проверяет человек);
- `FUTURE` — не в этой версии продукта.

Шкала БМБА и уровни живут не в норме, а в решениях владельца (часть V) и в
`Baholash_mezoni.pdf`. Их отсутствие в v4.0 — не наше упущение, а граница
документа.

## Разметка по уровням

| Уровень | Разделы | Почему |
|---|---|---|
| `FUTURE` | 140–158, 171–172, 210–211, 243, 252, 256, 262 — весь CAT: Sympson-Hetter, Stocking-Lewis, shadow test, blueprint infeasibility, pool exhaustion | Миллий сертификат — линейный фиксированный тест. Адаптив уводит результат дальше от реального |
| `FUTURE` | 94–96, 161, 247 — LLTM | Предсказание сложности по компонентам задания; для соответствия БМБА не даёт ничего |
| `FUTURE` | 97–99 — Multidimensional Rasch | Один сертификат = один предмет = одна шкала |
| `FUTURE` | 100–102, 248 — Mixed Rasch, latent classes | Исследовательский инструмент |
| `OPTIONAL` | 87–93, 179, 246 — MFRM, rater severity | Нужен **только** там, где оценивает человек. У нас это сочинение родного языка и письмо английского; для математики, физики, истории — нет |
| `OPTIONAL` | 108 — pairwise estimation | Лишний, если выбран один calibration estimator |
| `OPTIONAL` | 59 — Andersen LR; 169, 206 — simulation | Полезно, но не блокирует |
| `OPTIONAL` | 76–77 — multi-attempt, response time | Данные хранить можно, моделировать не обязательно |
| `CORE` | всё остальное | В том числе **130 (common-person design)** — именно он нужен для привязки к шкале БМБА, см. §268 |

## Дефекты самого документа

Найдены и подтверждены поиском; при переносе оставлены как есть, чтобы норма
совпадала с исходником:

- **§170 и §209 оба называются COVERAGE** — дубль;
- **§169 SIMULATION и §206 CALIBRATION SIMULATION** — пересекаются по смыслу;
- **§241–249** повторяют алгоритмы, уже описанные выше;
- в **§132** остался след копипаста — `(assess.com)`;
- **§166 SAMPLE SIZE** отказывается назвать хоть какое-то число («не
  использовать единственное магическое N ≥ X»). Для production это неудобно;
  практический ориентир — **≥250–300 ответов на задание** для устойчивого `b` с
  погрешностью ≈0.15 логита;
- многое названо, но без формулы: WLE, оценка порогов PCM, поправка bias JMLE
  `(N−1)/N`, критическое значение Q3. Часть закрыта в части III.

---

# Часть II. Спецификация v4.0 (дословно)

Перенос из `RASCH-SPEC-v4.0.docx` без изменений. Метка уровня после
названия раздела добавлена нами и частью нормы не является.
RASCH PSYCHOMETRIC ENGINE
MASTER TECHNICAL SPECIFICATION v4.0
Статус
Это полная спецификация психометрической логики Rasch Engine для образовательной assessment-платформы.
Документ определяет не UI, не dashboard, не роли пользователей и не дизайн продукта, а исключительно математическую и алгоритмическую механику психометрической системы.
Основное требование:
Реализация не должна просто знать НАИМЕНОВАНИЕ психометрического показателя. Она должна понимать, что этот показатель означает, из каких данных он получается, какой формулой вычисляется, каким алгоритмом оценивается, как интерпретируется и что делать в каждом особом случае.

### 0. ГЛАВНЫЙ ПРИНЦИП `CORE`

Система не должна работать как:
количество правильных ответов        ↓процент        ↓обычный балл        ↓оценка
Она должна работать как:
ответы  ↓scoring  ↓калиброванные параметры заданий  ↓Rasch probability model  ↓parameter estimation  ↓θ  ↓SE  ↓quality diagnostics  ↓scale transformation  ↓reported score / proficiency / decision

### 1. ОСНОВНЫЕ ОБЪЕКТЫ RASCH `CORE`

В базовой binary Rasch Model существуют два главных латентных параметра:
Person ability
θ_n
Способность человека n.
Item difficulty
b_i
Сложность задания i.
Оба параметра находятся на одной latent scale.

### 2. БИНАРНЫЙ ОТВЕТ `CORE`

Каждый ответ binary item представляет:
X_ni ∈ {0,1}
где:
1 = correct
0 = incorrect
Для missing response значение 0 не назначать автоматически.

### 3. ОСНОВНАЯ RASCH FORMULA `CORE`

Вероятность правильного ответа:
```
[ P_{ni} = e^{θ_n - b_i} / (1 + e^{θ_n - b_i}) ]
```
Эквивалентно:
```
[ P_{ni} = 1 / (1 + e^{-(θ_n - b_i)}) ]
```
Главное выражение:
```
[ θ_n - b_i ]
```
является разницей между ability человека и difficulty задания.

### 4. ИНТЕРПРЕТАЦИЯ РАЗНИЦЫ θ-b `CORE`

Если:
```
[ θ = b ]
```
то:
```
[ P = 0.5 ]
```
Если:
```
[ θ - b = 1 ]
```
то:
```
[ P ≈ 0.73 ]
```
Если:
```
[ θ - b = 2 ]
```
то:
```
[ P ≈ 0.88 ]
```
Если:
```
[ θ - b = -1 ]
```
то:
```
[ P ≈ 0.27 ]
```
Таким образом, ability и difficulty сравниваются непосредственно на одной шкале.

### 5. LOGIT `CORE`

Logit определяется:
```
[ logit(P) = ln[P / (1-P)] ]
```
Для Rasch:
```
[ logit(P_{ni}) = θ_n - b_i ]
```
Следовательно:
```
[ θ_n - b_i = ln[P_{ni} / (1-P_{ni})] ]
```
Logit — это не процент и не обычный балл.

### 6. ИДЕНТИФИКАЦИЯ ШКАЛЫ `CORE`

Rasch scale имеет произвольный ноль.
Если к каждому θ и b прибавить одну и ту же константу:
```
[ θ'_n = θ_n + c ]
```
```
[ b'_i = b_i + c ]
```
то:
```
[ θ'_n - b'_i = θ_n - b_i ]
```
следовательно, вероятности не меняются.
Поэтому calibration должна иметь identification constraint.
Production default:
```
[ Σ_{i=1}^{I} b_i = 0 ]
```
то есть:
```
[ mean(b) = 0 ]
```

### 7. RAW SCORE PERSON `CORE`

Для человека:
```
[ r_n = Σ_i X_{ni} ]
```
где r_n — количество correct responses.
В binary Rasch для фиксированного item set и известных item parameters raw score является sufficient statistic для person parameter.
Это означает:
при одинаковых:
- items
- calibration
- scoring
- estimator
одинаковый raw score приводит к одинаковому person estimate.

### 8. ПОЧЕМУ ОДИНАКОВЫЙ ПРОЦЕНТ НЕ ВСЕГДА ОДИНАКОВАЯ θ `CORE`

Например:
Form A:
20/40 = 50%
Form B:
20/40 = 50%
Это не гарантирует:
```
[ θ_A = θ_B ]
```
если difficulty distributions форм разные.
Поэтому сравнивать формы необходимо после common-scale linking/equating.

### 9. ITEM RAW SCORE `CORE`

Для item:
```
[ r_i = Σ_n X_{ni} ]
```
Это количество людей, ответивших правильно на item среди eligible observations.
Item difficulty оценивается не как
```
[ b_i = f(r_i) ]
```
а через соответствующую Rasch calibration procedure.

### 10. LIKELIHOOD PERSON `CORE`

Likelihood конкретного response pattern:
```
[ L(θ) = Π_i P_i^{X_i} (1-P_i)^{1-X_i} ]
```
Log-likelihood:
```
[ lnL(θ) = Σ_i [ X_i lnP_i + (1-X_i) ln(1-P_i) ] ]
```
MLE ищет:
```
[ θ̂_{MLE} = argmax_θ L(θ) ]
```

### 11. SCORE FUNCTION `CORE`

Производная log-likelihood для binary Rasch:
```
[ U(θ) = ∂lnL/∂θ = Σ_i (X_i - P_i) ]
```
MLE стремится решить:
```
[ U(θ) = 0 ]
```
То есть:
```
[ Σ_i X_i = Σ_i P_i ]
```
Интерпретация:
оценённая ability находится там, где ожидаемый raw score равен наблюдаемому raw score.

### 12. EXPECTED SCORE `CORE`

Для каждого item:
```
[ E(X_i|θ) = P_i(θ) ]
```
Для теста:
```
[ E(R|θ) = Σ_i P_i(θ) ]
```
где R — expected raw score.
Это Test Characteristic Function / Expected Score Function.

### 13. MONOTONICITY `CORE`

Поскольку:
```
[ ∂P/∂θ = P_i(1-P_i) > 0 ]
```
вероятность правильного ответа растёт при увеличении θ.
Следовательно:
```
[ ∂E(R|θ)/∂θ > 0 ]
```
для непустого набора items.
Это важное свойство должно сохраняться.

### 14. NEWTON-RAPHSON / FISHER SCORING `CORE`

Fisher information:
```
[ I(θ) = -E[∂²lnL/∂θ²] ]
```
Для binary Rasch:
```
[ I(θ) = Σ_i P_i(1-P_i) ]
```
Newton/Fisher update:
```
[ θ_{new} = θ_{old} + U(θ_{old}) / I(θ_{old}) ]
```
то есть:
```
[ θ_{new} = θ_{old} + (Σ_i X_i - Σ_i P_i) / I(θ_{old}) ]
```

### 15. ИТЕРАЦИОННАЯ ESTIMATION PROCEDURE `CORE`

Person estimation:
1. Получить valid responses.
2. Получить calibrated b_i.
3. Выбрать начальную θ.
4. Для каждого item вычислить P_i.
5. Вычислить U(θ).
6. Вычислить I(θ).
7. Выполнить update.
8. Проверить convergence.
9. Если convergence отсутствует — повторить.
10. Достигнут max iterations → NON_CONVERGED.
11. После convergence получить θ.
12. Вычислить SE.
13. Выполнить quality diagnostics.

### 16. НАЧАЛЬНАЯ θ `CORE`

Допустимые стратегии:
- mean item difficulty
- population mean
- prior mean
- previous valid linked measure
routing estimate для CAT.
Стратегия должна быть частью estimator configuration.

### 17. CONVERGENCE `CORE`

Convergence означает, что дальнейшие итерации почти не изменяют estimate.
Использовать минимум:
```
[ |θ_{t+1} - θ_t| < ε ]
```
Дополнительно:
```
[ |b_{t+1} - b_t| < ε ]
```
Оба значения должны быть configuration parameters.
Например:
```
[ ε = 0.001 ]
```
может быть production default, но не является универсальным психометрическим законом.

### 18. MAX ITERATIONS `CORE`

Установить:
MAX_ITERATIONS
При превышении:
status = NON_CONVERGED
Нельзя выдавать обычный official estimate без явно предусмотренного fallback.

### 19. EXTREME SCORE `CORE`

Если:
```
[ r = 0 ]
```
обычный MLE стремится к:
```
[ θ → -∞ ]
```
Если:
```
[ r = L ]
```
то:
```
[ θ → +∞ ]
```
где L — количество eligible items.
Это нормальное свойство MLE.

### 20. FINITE ESTIMATION `CORE`

Для extreme scores production engine должен применять явно выбранный метод:
- WLE
- MAP
- EAP
либо другой заранее утверждённый estimator.
Нельзя просто заменить ∞ на 10.

### 21. MLE `CORE`

Maximum Likelihood:
```
[ θ̂_{MLE} = argmax_θ L(θ) ]
```
Преимущество:
не требует prior.
Недостаток:
extreme score может привести к бесконечному estimate.

### 22. WLE `CORE`

Weighted Likelihood Estimation корректирует bias conventional MLE, особенно в finite samples.
WLE должен быть реализован как отдельный estimator version.
Нельзя считать WLE и MLE одинаковым numerical result.

### 23. MAP `CORE`

MAP:
```
[ θ̂_{MAP} = argmax_θ [L(θ) · g(θ)] ]
```
или:
```
[ θ̂_{MAP} = argmax_θ [lnL(θ) + ln g(θ)] ]
```
где π(θ) — prior.

### 24. EAP `CORE`

EAP:
```
[ θ̂_{EAP} = ∫ θ L(θ) g(θ) dθ  /  ∫ L(θ) g(θ) dθ ]
```
EAP является posterior mean.

### 25. BAYESIAN PRIOR `CORE`

Если используется MAP/EAP, хранить:
- distribution type
- mean
- variance
- SD
prior version.
Изменение prior должно создавать новую estimator configuration/version.

### 26. ITEM INFORMATION `CORE`

Для binary Rasch:
```
[ I_i(θ) = P_i(1-P_i) ]
```
Поскольку:
```
[ P_i = P_i(θ) ]
```
получаем:
```
[ I_i(θ) = P_i(θ) [1 - P_i(θ)] ]
```

### 27. MAXIMUM ITEM INFORMATION `CORE`

При:
```
[ P = 0.5 ]
```
получаем:
```
[ I_i = 0.25 ]
```
Это происходит когда:
```
[ θ = b_i ]
```
Поэтому item наиболее информативен около своей difficulty.

### 28. TEST INFORMATION `CORE`

При local independence:
```
[ I_{test}(θ) = Σ_i I_i(θ) ]
```
то есть:
для каждого θ:    для каждого item:        вычислить P_i        вычислить I_i    сложить I_i

### 29. STANDARD ERROR `CORE`

При обычном large-sample approximation:
```
[ SE(θ) = 1 / √I(θ) ]
```
Чем больше information, тем меньше uncertainty.

### 30. INFORMATION И SE — НЕ ОДНО И ТО ЖЕ `CORE`

Information описывает потенциальную precision теста в конкретном месте шкалы.
SE описывает uncertainty конкретного estimated measure.
Reliability и separation являются другими sample-level indicators.
Их нельзя смешивать.

### 31. OBSERVED INFORMATION `CORE`

Помимо expected Fisher information допускается использовать observed information:
```
[ J(θ) = -∂²lnL/∂θ² ]
```
Для standard binary Rasch структура тесно связана с:
```
[ Σ_i P_i(1-P_i) ]
```
Но engine должен явно знать, какой тип information используется каждым estimator.

### 32. CONFIDENCE INTERVAL `CORE`

При приблизительном normal approximation:
```
[ CI_{95%} = θ ± 1.96 · SE(θ) ]
```
Для extreme/Bayesian/нестандартных случаев engine должен использовать соответствующую interval methodology, если она включена.

### 33. DIFFERENCE BETWEEN TWO MEASURES `CORE`

Для независимых measures:
```
[ SE(Δ) = √[SE_1² + SE_2²] ]
```
где:
```
[ Δ = θ_1 - θ_2 ]
```
Если measurements correlated:
```
[ Var(Δ) = Var(θ_1) + Var(θ_2) - 2Cov(θ_1,θ_2) ]
```
Следовательно:
```
[ SE_Δ = √Var(Δ) ]
```

### 34. ITEM TARGETING `CORE`

Item targeting сравнивает:
```
[ distribution(b_i) ]
```
с:
```
[ distribution(θ_n) ]
```
Если большая часть persons выше всех items:
ceiling problem.
Если ниже всех items:
floor problem.

### 35. PERSON-ITEM MAP `CORE`

Для каждого construct анализировать две distributions:
Persons:  θItems:    b
Они должны иметь достаточное overlap.

### 36. TEST CHARACTERISTIC CURVE `CORE`

Для каждой θ вычислять:
```
[ E(R|θ) = Σ_i P_i(θ) ]
```
Эта функция показывает ожидаемый raw score при данной ability.
Используется для:
- targeting
- test design
- score transformation
анализа формы.

### 37. ICC `CORE`

Item Characteristic Curve:
```
[ P_i(θ) = logistic(θ - b_i) ]
```
График должен быть монотонным и иметь midpoint в:
```
[ θ = b_i ]
```
для classic binary Rasch.

### 38. FIT — ОБЩЕЕ ОПРЕДЕЛЕНИЕ `CORE`

Fit показывает, насколько observed responses соответствуют тому, что модель ожидает.
Сначала для observation:
```
[ e_{ni} = X_{ni} - P_{ni} ]
```
Это residual.

### 39. EXPECTED VARIANCE `CORE`

Для binary response:
```
[ V_{ni} = P_{ni}(1-P_{ni}) ]
```
Это модельная variance конкретного observation.

### 40. STANDARDIZED RESIDUAL `CORE`

```
[ z_{ni} = e_{ni} / √V_{ni} ]
```
Следовательно:
```
[ z_{ni}² = (X_{ni}-P_{ni})² / [P_{ni}(1-P_{ni})] ]
```

### 41. OUTFIT MNSQ `CORE`

Outfit — outlier-sensitive fit.
Для item:
```
[ Outfit_i = (1/N) Σ_n z_{ni}² ]
```
то есть:
```
[ Outfit_i = (1/N) Σ_n (X_{ni}-P_{ni})² / [P_{ni}(1-P_{ni})] ]
```
Outfit сильнее чувствителен к неожиданным ответам на items, далеко расположенным от estimated ability.

### 42. INFIT MNSQ `CORE`

Infit — information-weighted fit.
Для item:
```
[ Infit_i = Σ_n (X_{ni}-P_{ni})² / Σ_n V_{ni} ]
```
Это эквивалентно:
```
[ Infit_i = Σ_n W_{ni} z_{ni}² / Σ_n W_{ni},  где W_{ni}=V_{ni} ]
```
Infit сильнее чувствителен к unexpected responses, которые находятся в более информативной части измерительной шкалы.

### 43. ОТКУДА БЕРУТСЯ INFIT И OUTFIT `CORE`

Алгоритм:
Для каждого eligible response:
1. Получить X.
2. Получить θ person.
3. Получить b item.
4. Рассчитать P.
5. Рассчитать V=P(1-P).
6. Рассчитать residual=X-P.
7. Рассчитать z=residual/sqrt(V).
8. z² участвует в Outfit.
9. residual² и V участвуют в Infit.
10. После обработки всех observations рассчитать MNSQ.

### 44. ИНТЕРПРЕТАЦИЯ MNSQ `CORE`

Теоретический reference value:
```
[ E(MNSQ) = 1 ]
```
Если:
```
[ MNSQ > 1 ]
```
наблюдается больше непредсказуемости, чем ожидает модель.
Если:
```
[ MNSQ < 1 ]
```
данные более predictable, чем ожидалось.
Например:
1.20 означает примерно 20% больше residual variation относительно reference level 1.
Но конкретный decision threshold должен быть policy-dependent, а не считаться универсальным законом.

### 45. OVERFIT `CORE`

Слишком низкий MNSQ может означать:
- чрезмерную predictability
- искусственную redundancy
- deterministic response pattern
- local dependence
scoring artefact.
Overfit также нужно исследовать, а не просто считать «хорошим».

### 46. UNDERFIT `CORE`

Высокий MNSQ может возникнуть из-за:
- noise
- multidimensionality
- wrong key
- DIF
- local dependence
- guessing
- careless mistakes
content mismatch.

### 47. ZSTD `CORE`

Mean-square может быть transformed в standardized statistic.
Например для Outfit возможно использование Wilson-Hilferty transformation.
ZSTD показывает отклонение от expected fit с учётом sampling distribution.
Он зависит от sample size и поэтому не должен рассматриваться отдельно от MNSQ.

### 48. ITEM FIT VS PERSON FIT `CORE`

Для item:
суммирование идёт по persons.
Для person:
суммирование идёт по items.
Person Outfit:
```
[ Outfit_n = (1/L) Σ_i z_{ni}² ]
```
Person Infit:
```
[ Infit_n = Σ_i (X_{ni}-P_{ni})² / Σ_i V_{ni} ]
```

### 49. POINT-MEASURE CORRELATION `CORE`

Для diagnostic analysis можно рассчитывать correlation между item score and person measure.
Идея:
если higher ability persons чаще отвечают correctly, correlation обычно положительная.
Сильно отрицательное значение может указывать на:
- wrong key
- miskeyed item
- reversed scoring
severe anomaly.
Однако point-measure correlation не заменяет Rasch fit.

### 50. LOCAL INDEPENDENCE `CORE`

Local independence означает:
после conditioning on latent trait ответы на разные items не должны оставаться зависимыми.
Формально:
```
[ P(X_1,…,X_L|θ) = Π_i P(X_i|θ) ]
```
если observations locally independent.

### 51. YEN Q3 `CORE`

После получения standardized residuals анализировать item pair:
```
[ Q3_{ij} = corr(z_i, z_j) ]
```
Q3 используется для обнаружения residual dependency между items.
Особенно важно для:
- shared passage
- shared stimulus
- repeated content
sequential dependency.

### 52. ПОЧЕМУ Q3 НУЖЕН `CORE`

Пример:
Question 2 содержит информацию, которая помогает решить Question 3.
Тогда responses могут быть correlated даже после учёта ability.
Это нарушает assumption:
```
[ P(X_i,X_j|θ) = P(X_i|θ) · P(X_j|θ) ]
```

### 53. Q3 АНАЛИЗ `CORE`

Для каждой pair:
1. Получить persons with valid responses на оба items.
2. Получить model residuals.
3. Рассчитать residual correlation.
4. Сравнить с reference distribution.
5. Проверить magnitude.
6. Проверить content relation.
7. Проверить testlet/passage relation.
8. Создать dependency flag.
Не использовать одно универсальное значение Q3 как абсолютный автоматический delete threshold.

### 54. TESTLET `CORE`

Если группа items зависит от одного stimulus:
создать conceptual testlet.
Например:
Passage A ├─ Question 1 ├─ Question 2 ├─ Question 3 └─ Question 4
Проверить residual dependency внутри группы.

### 55. СПОСОБЫ ОБРАБОТКИ TESTLET `CORE`

Варианты:
- переписать items
- уменьшить dependency
- объединить в super-item
- использовать testlet model/extension
оставить, если dependency несущественная и precision policy это допускает.
Но нельзя игнорировать dependency, если она существенно искажает precision.

### 56. DIMENSIONALITY `CORE`

Rasch scale предполагает dominant latent dimension.
Проверять:
- residual PCA
- residual contrasts
- residual correlations
- item content
- DIF
subgroup patterns.

### 57. RESIDUAL PCA `CORE`

После удаления основного Rasch dimension анализируются residuals.
Цель:
определить, остаётся ли структурированная информация, которую основной θ не объясняет.
Если появляется устойчивый second dimension:
исследовать scale structure.

### 58. MARTIN-LÖF TEST `CORE`

Martin-Löf type test используется как дополнительная проверка Rasch invariance/unidimensionality путём разделения item set и проверки согласованности модели между подмножествами.
Не использовать его как единственный критерий dimensionality.

### 59. ANDERSEN LR TEST `OPTIONAL`

Разделить population на две или более группы по заранее определённому правилу.
Например:
low-score groupvshigh-score group
Оценить item parameters условно для групп и проверить, согласуются ли они с invariant Rasch structure.
Концептуально:
```
[ LR = -2 [lnL_{restricted} - lnL_{alternative}] ]
```
где:
- restricted model = invariant item parameters
alternative = разные item parameters между группами.
При большом sample statistic сопоставляется с соответствующим reference distribution.
Andersen LR является глобальной проверкой Rasch-specific invariance, поэтому его нельзя заменять простым сравнением raw percentages.

### 60. DIF `CORE`

DIF означает:
при одинаковой latent ability item работает по-разному для групп.
Пусть:
```
[ b_{i,A} ]
```
и:
```
[ b_{i,B} ]
```
получены после соответствующего linking/identification.
Тогда:
```
[ DIF_i = b_{i,A} - b_{i,B} ]
```
Направление определяется заранее утверждённой convention.

### 61. DIF STANDARD ERROR `CORE`

Если estimates независимы:
```
[ SE(DIF_i) = √[SE(b_{i,A})² + SE(b_{i,B})²] ]
```
Если estimates correlated:
```
[ Var(DIF) = Var(b_A) + Var(b_B) - 2Cov(b_A,b_B) ]
```

### 62. DIF Z `CORE`

```
[ Z_{DIF} = DIF_i / SE(DIF_i) ]
```
Но statistical significance не равна practical significance.

### 63. DIF EFFECT SIZE `CORE`

Engine должен одновременно хранить:
- absolute DIF magnitude
- direction
- SE
- significance
- practical effect category
group sample sizes.
Решение:
statistical evidence+effect magnitude+content interpretation+sample adequacy

### 64. MULTIPLE TESTING DIF `CORE`

Если тестируется множество items:
не интерпретировать сотни p-values без correction/overall policy.
Поддерживать:
- raw p
- adjusted p
- FDR или другой approved procedure
effect-size threshold.

### 65. DIF ПО BRANCH `CORE`

Branch можно использовать как grouping factor:
Branch A vs Branch B.
Но branch difference не является автоматически DIF.
Исследовать:
- curriculum
- sample
- language
- instruction
- exposure
item functioning.

### 66. ITEM DRIFT `CORE`

Drift:
```
[ Δb_i = b_{i,t2} - b_{i,t1} ]
```
Если:
```
[ |Δb_i| > threshold ]
```
становится существенным относительно uncertainty/stability criteria, item помечается для investigation.
Причины могут быть:
- curriculum change
- wording change
- population change
- exposure
- leak
- real construct change
calibration differences.

### 67. DRIFT STANDARDIZED DIFFERENCE `CORE`

Для приблизительно независимых estimates:
```
[ z_{drift} = Δb_i / SE(Δb_i) ]
```
При зависимости учитывать covariance.

### 68. ITEM EXPOSURE `CORE`

Хранить:
```
[ ExposureRate_i = (число предъявлений item_i) / (число участников) ]
```
В зависимости от CAT design denominator может быть определён иначе.
Exposure используется для security monitoring и exposure-control algorithms.

### 69. REPEATED ITEM EFFECT `CORE`

Повторное использование может привести к:
- memory
- practice
- familiarity
leakage.
Поэтому response data после known exposure может иметь отдельный calibration status.

### 70. INVALID ITEM `CORE`

Если выявлен wrong key:
не менять старый key silently.
Создать новый item version.

### 71. ITEM VERSION `CORE`

Изменение:
- text
- options
- key
- image
- stimulus
- scoring
создаёт новую item version.

### 72. SCORING BEFORE RASCH `CORE`

Перед Rasch estimation response должен пройти scoring.
Pipeline:
raw response ↓item version ↓scoring rule ↓0/1 или category score ↓validity state ↓Rasch engine

### 73. MISSING `CORE`

Missing не равен wrong.
Default conceptual states:
CORRECTINCORRECTOMITTEDNOT_REACHEDTECHNICAL_FAILUREINVALIDATED
Каждый state обрабатывается scoring policy.

### 74. NOT REACHED `CORE`

Если student не дошёл до item из-за time limit:
не превращать автоматически в incorrect, если assessment specification определяет его как not reached.

### 75. MULTI-ATTEMPT `CORE`

Каждая attempt является отдельным response evidence.
Не делать:
```
[ θ_{cumulative} ≠ mean(θ_{attempt1}, θ_{attempt2}, …) ]
```
простым arithmetic mean без специальной longitudinal methodology.

### 76. LONGITUDINAL CHANGE `OPTIONAL`

Если forms находятся на одной linked scale:
```
[ Δθ = θ_{t2} - θ_{t1} ]
```
При интерпретации учитывать:
```
[ SE_{Δθ} = √[SE(θ_{t1})² + SE(θ_{t2})²] ]
```
и scale linking uncertainty.

### 77. RESPONSE TIME `OPTIONAL`

Response time:
не часть classic Rasch ability.
Хранить отдельно:
```
[ RT = t_{submit} - t_{start} ]
```
Если speed становится частью psychometric model, это отдельная model extension.

### 78. RASCH POLYTOMOUS MODELS `CORE`

Если response принимает:
```
[ X ∈ {0, 1, 2, …, m} ]
```
использовать соответствующую polytomous Rasch model.

### 79. PARTIAL CREDIT MODEL `CORE`

Для PCM вероятность категории определяется через category-step parameters.
Одна из стандартных parameterizations:
```
[ P(X_{ni}=k|θ) = exp[Σ_{j=0}^{k}(θ_n - δ_{ij})] / Σ_{h=0}^{m} exp[Σ_{j=0}^{h}(θ_n - δ_{ij})] ]
```
с нормировочной convention для первого step.
Здесь:
- θ_n — ability
- δ_is — item-specific step parameters
k — category.
PCM позволяет разным items иметь разные category structures.

### 80. RATING SCALE MODEL `CORE`

RSM использует общую category structure для группы items.
Conceptually:
```
[ log[P_{ik} / P_{i,k-1}] = θ_n - b_i - τ_k ]
```
где:
- b_i — item location
τ_k — common category threshold/step.
RSM применяется, когда items используют одну и ту же rating-scale structure.

### 81. PCM VS RSM `CORE`

Использовать:
RSM
если category structure общая.
PCM
если category structure может отличаться item-to-item.
Нельзя выбирать между ними только потому, что одна модель даёт «лучше выглядящий score».
Учитывать:
- content
- category structure
- fit
- stability
interpretability.

### 82. POLYTOMOUS EXPECTED SCORE `CORE`

Для item:
```
[ E(X_i|θ) = Σ_{k=0}^{m_i} k · P_{ik}(θ) ]
```
Для всего теста:
```
[ E(R|θ) = Σ_i E(X_i|θ) ]
```

### 83. POLYTOMOUS VARIANCE `CORE`

Для item:
```
[ Var(X_i|θ) = E(X_i²|θ) - [E(X_i|θ)]² ]
```
где:
```
[ E(X_i²|θ) = Σ_k k² · P_{ik}(θ) ]
```
Эта variance используется при информации и fit calculations.

### 84. CATEGORY FUNCTIONING `CORE`

Проверять:
- frequency
- probability curves
- thresholds
- ordering
- category fit
category information.

### 85. DISORDERED THRESHOLDS `CORE`

Если:
```
[ τ_1 > τ_2 ]
```
или другой порядок противоречит intended category progression, возникает threshold disordering.
Не исправлять автоматически.
Исследовать:
- category wording
- scoring
- sparse use
- respondent interpretation
overlapping categories.

### 86. CATEGORY COLLAPSING `CORE`

Если категории объединяются:
создать новую scoring/model version.
Не перезаписывать старую calibration.

### 87. MANY-FACET RASCH MODEL `OPTIONAL`

MFRM расширяет Rasch при наличии дополнительных facets:
- person
- item
- rater
- task
- criterion
другие оценочные facets.
Для rating categories стандартная форма может быть представлена:
```
[ ln[P_{nijk} / P_{nij,k-1}] = B_n - D_i - C_j - F_k ]
```
в зависимости от выбранной facet parameterization.
Где:
- B_n — person ability
- D_i — item difficulty
- C_j — rater severity
- H_k — task/facet parameter
F_k — category step.
Официальные Rasch facet formulations задают именно относительное положение ability, item difficulty, rater severity и category steps на common logit scale.

### 88. RATER SEVERITY `OPTIONAL`

Rater severity показывает относительную строгость проверяющего.
Если:
```
[ C_j > 0 ]
```
при принятой convention rater более строг относительно reference point.
Если:
```
[ C_j < 0 ]
```
rater менее строг.
Ноль определяется identification constraint.

### 89. ПОЧЕМУ НЕЛЬЗЯ СЧИТАТЬ SEVERITY КАК «СРЕДНИЙ ПРОЦЕНТ» `OPTIONAL`

Нельзя:
```
[ severity ≠ 1 - mean(score) ]
```
потому что rating depends simultaneously on:
- person ability
- item difficulty
- category structure
- task
rater.
Severity оценивается как facet parameter внутри многогранной likelihood model.

### 90. MFRM ESTIMATION `OPTIONAL`

Для каждого observation:
1. Получить person.
2. Получить item.
3. Получить rater.
4. Получить task/criterion.
5. Получить category.
6. Построить model probability.
7. Рассчитать residual.
8. Рассчитать likelihood.
9. Обновить facet parameters.
10. Повторить до convergence.
11. Рассчитать SE для каждого facet.
12. Рассчитать fit каждого facet.

### 91. RATER FIT `OPTIONAL`

Для каждого rater:
использовать те же residual-based procedures:
```
[ Infit_j = Σ (X-E)² · W / Σ W ]
```
```
[ Outfit_j = (1/N_{observations}) Σ z² ]
```
Проверять:
- severity
- SE
- Infit
- Outfit
- consistency
unexpected patterns.

### 92. RATER SEVERITY COMPARISON `OPTIONAL`

Для двух calibrations:
```
[ Z = (C_{j1} - C_{j2}) / √[SE(C_{j1})² + SE(C_{j2})²] ]
```
если estimates independent.
Такая логика используется для сравнения facet severities между administrations.

### 93. RATER DESIGN `OPTIONAL`

Для идентификации severity необходима connected design.
Если:
- rater A оценивает только лёгкие items
- rater B только сложные
невозможно чисто отделить rater severity от item difficulty.
Нужна достаточная cross-rating connectivity.

### 94. LLTM `FUTURE`

Linear Logistic Test Model представляет item difficulty через item components.
Концептуально:
```
[ b_i = Σ_k q_{ik} η_k ]
```
где:
- q_ik — присутствие/weight component k в item i
η_k — estimated contribution component.

### 95. LLTM ЧТО ОЗНАЧАЕТ `FUTURE`

Например item имеет:
algebra = 1word_problem = 1multi_step = 1graph = 0
Тогда:
```
[ b_i = η_{algebra} + η_{word} + η_{multi-step} ]
```
LLTM оценивает вклад структурных components.
Это не означает, что заранее можно идеально знать future difficulty.

### 96. LLTM PREDICTED VS EMPIRICAL `FUTURE`

Новая item:
```
[ b_{predicted} = Σ_k q_{ik} η_k ]
```
После field data:
```
[ b_{empirical} ]
```
Система должна сравнить:
```
[ Δ_i = b_{empirical} - b_{predicted} ]
```
Большое отличие → diagnostic investigation.

### 97. MULTIDIMENSIONAL RASCH `FUTURE`

Если item зависит от нескольких dimensions:
```
[ θ = (θ_1, θ_2, …, θ_K) ]
```
Не использовать обычную одномерную:
```
[ не сводится к одномерной разнице θ - b ]
```
если модель действительно multidimensional.
Конкретная MDRM parameterization должна быть указана в model version.

### 98. MDRM ITEM STRUCTURE `FUTURE`

Для item хранить association with dimensions.
Например:
item ├─ Math reasoning └─ Reading comprehension
Но это должно быть теоретически обосновано.

### 99. MDRM RESULT `FUTURE`

Не возвращать:
one arbitrary theta
из нескольких dimensions.
Возвращать:
```
[ (θ_1, θ_2, …, θ_K) ]
```
либо заранее определённую theoretically justified composite measure.

### 100. MIXED RASCH `FUTURE`

Mixed Rasch Model предполагает наличие latent classes.
Концептуально:
```
[ P(X|θ) = Σ_c π_c · P(X|θ,c) ]
```
где:
- c — latent class
π_c — class probability.
Каждая class может иметь собственную parameter structure согласно выбранной model specification.

### 101. MIXTURE ESTIMATION `FUTURE`

Обычно используется iterative latent-class estimation, например EM:
1. Инициализировать classes.
2. E-step: вычислить posterior probability принадлежности person к class.
3. M-step: обновить class parameters.
4. Проверить likelihood/convergence.
5. Повторить.

### 102. CLASS LABEL SWITCHING `FUTURE`

Latent class 1 и class 2 могут менять numerical labels между runs.
Поэтому применять canonical ordering:
например по class mean ability.
Не менять исторические labels без versioned transformation.

### 103. CML `CORE`

Conditional Maximum Likelihood использует conditioning на person raw scores для устранения person parameters из conditional likelihood item calibration.
Conceptual pipeline:
raw scores persons ↓conditional likelihood ↓item parameters ↓scale identification
CML особенно соответствует Rasch-specific item calibration framework.

### 104. JMLE `CORE`

Joint Maximum Likelihood:
```
[ (θ̂, b̂) = argmax_{θ,b} L(θ,b|X) ]
```
Одновременно оцениваются persons и items.
Необходимо учитывать finite-sample bias characteristics.

### 105. MMLE `CORE`

Marginal Maximum Likelihood рассматривает person ability как latent random variable.
```
[ P(X|b) = ∫ P(X|θ,b) · g(θ) dθ ]
```
где:
g(θ) — latent ability distribution.
Item parameters оцениваются по marginal likelihood.

### 106. EM ДЛЯ MMLE `CORE`

E-step
При текущих item parameters вычислить posterior latent distribution.
M-step
Обновить item parameters и, если предусмотрено, параметры latent distribution.
Повторять:
```
[ E-step → M-step → повторять до convergence ]
```
до convergence.

### 107. LIKELIHOOD CONVERGENCE `CORE`

Каждый estimator хранит:
- initial values
- iterations
- final log-likelihood
- max parameter delta
- likelihood delta
convergence status.

### 108. PAIRWISE ESTIMATION `OPTIONAL`

Поддержать Pairwise Estimation как альтернативный calibration method для неполных/sparse matrices.
Результат должен быть:
- estimates
- SE
- convergence/status
- scale identification
dataset snapshot.
Не использовать Pairwise как скрытую замену CML.

### 109. ESTIMATOR VERSIONING `CORE`

Результат всегда должен знать:
model = RASCH_BINARYestimator = WLEestimator_version = ...configuration = ...

### 110. CALIBRATION DATA SNAPSHOT `CORE`

Перед calibration:
responses ↓eligibility filtering ↓immutable snapshot ↓calibration
Snapshot нельзя менять после запуска.

### 111. CALIBRATION ELIGIBILITY `CORE`

Каждое observation классифицировать.
Минимально:
VALIDOMITTEDNOT_REACHEDTECHNICAL_FAILUREINVALIDDUPLICATECONTAMINATEDEXCLUDED

### 112. CONTAMINATION `CORE`

Если response подозрителен:
не уничтожать raw data.
Хранить:
raw = retained
calibration_eligible = false
reason = ...

### 113. CHEATING И RASCH `CORE`

Cheating не является Rasch parameter.
Rasch engine может показать anomalous fit, но не должен заявлять:
«этот человек точно списывал»
только на основании fit statistic.

### 114. PERSON MISFIT `CORE`

Person misfit может быть обусловлен:
- random responding
- inconsistent response pattern
- multidimensionality
- guessing
- content-specific knowledge
careless errors.
Person measure можно математически получить, но quality status должен отражать misfit.

### 115. QUALITY STATUS `CORE`

Каждый result должен иметь:
VALID_HIGH_PRECISIONVALID_ACCEPTABLELOW_PRECISIONEXTREME_ESTIMATEPERSON_MISFITNON_CONVERGEDINSUFFICIENT_INFORMATIONINVALIDREVIEW_REQUIRED

### 116. ITEM QUALITY `CORE`

Item:
DRAFTPROVISIONALCALIBRATEDMISFITDIFDEPENDENCYDRIFTEXPOSEDINVALIDATEDRETIRED

### 117. ITEM SEPARATION `CORE`

Item separation показывает, насколько spread item measures велик относительно их uncertainty.
Для sample-level analysis может использоваться форма:
```
[ G_{items} = SD(b) / RMSE_{items} ]
```
Точная reported form зависит от выбранной Rasch software convention.

### 118. PERSON SEPARATION `CORE`

Аналогично:
```
[ G_{persons} = SD(θ) / RMSE_{persons} ]
```
Но individual SE остаётся главным показателем precision конкретного результата.

### 119. RELIABILITY `CORE`

Separation reliability в одной распространённой форме:
```
[ Reliability = G² / (1 + G²) ]
```
Но обязательно фиксировать exact definition, потому что разные implementation conventions существуют.

### 120. ANCHORS `CORE`

Anchor item используется для linking forms/calibrations.
Хороший anchor:
- стабильный
- representative
- secure
- достаточно информативный
- без серьёзного DIF
- не drifted
connected с обеими forms.

### 121. COMMON-ITEM LINKING `CORE`

Пусть одна calibration имеет:
```
[ b_i^A ]
```
и другая:
```
[ b_i^B ]
```
Для common anchors определить transformation:
```
[ b^B_{common scale} = A · b^B + B ]
```
Та же transformation применяется к person measures из Form B.

### 122. LINEAR SCALE TRANSFORMATION `CORE`

Общая transformation:
```
[ x' = A·x + B ]
```
Она изменяет numerical representation, но сохраняет порядок и относительное расположение при A>0.

### 123. MEAN-MEAN LINKING `CORE`

Использует mean anchor locations для estimate shift/linear relationship.
При достаточном различии scale spread может потребоваться дополнительный scale factor.

### 124. MEAN-SIGMA LINKING `CORE`

Использует:
- mean anchor difficulty
SD anchor difficulty.
Получается transformation, согласующая location и spread anchor set.

### 125. ANCHOR DRIFT `CORE`

Для anchor:
```
[ Δb_i = b_{i,new} - b_{i,old} ]
```
Проверять:
- абсолютное изменение
- uncertainty
- standardized shift
- DIF
- exposure
content change.

### 126. ROBUST ANCHOR CLEANING `CORE`

Для anchor shifts использовать robust diagnostics:
```
[ z_i = (Δb_i - median(Δb)) / MAD ]
```
при используемой robust normalizing convention.
Но outlier не равен автоматически bad anchor.
После statistical flag требуется investigation.

### 127. ANCHOR REMOVAL `CORE`

Если anchor удалён:
хранить:
- anchor ID
- removal reason
- statistic
- decision
calibration version.

### 128. EQUATING UNCERTAINTY `CORE`

Equated score имеет uncertainty от:
- calibration
- anchor measurements
linking transformation.
Engine должен хранить equating uncertainty отдельно.

### 129. NO LINK WITHOUT CONNECTIVITY `CORE`

Если Forms A и B не имеют достаточной connection:
нельзя выдавать искусственный common scale.
Вернуть:
LINKING_NOT_IDENTIFIABLE

### 130. COMMON-PERSON DESIGN `CORE`

Можно linking делать через persons, проходивших multiple forms.
Тогда common persons создают statistical connection между forms.

### 131. STANDARD SETTING `CORE`

Rasch scale не говорит автоматически:
PASS.
Cutscore является standard-setting decision.

### 132. BOOKMARK METHOD `CORE`

Порядок:
1. Откалибровать items.
2. Упорядочить items по difficulty/location.
3. Определить performance levels.
4. Подготовить Ordered Item Booklet.
5. Обучить experts.
6. Experts устанавливают bookmark.
7. Собрать judgments.
8. Обсудить disagreement.
9. Вычислить cutscore.
10. Link cutscore к Rasch scale.
11. Version standard-setting result.
Bookmark использует ordered item locations и expert judgments для установления performance-level cut scores. (assess.com)

### 133. CUT SCORE `CORE`

Например:
```
[ θ ≥ c → PASS ]
```
где c — approved cutscore.

### 134. MULTIPLE PERFORMANCE LEVELS `CORE`

Например:
```
[ c_1 < c_2 < c_3 ]
```
Тогда:
θ < c1       → Level 1c1 ≤ θ < c2  → Level 2c2 ≤ θ < c3  → Level 3θ ≥ c3       → Level 4
Все cut scores должны иметь standard-setting provenance.

### 135. CUTSCORE UNCERTAINTY `CORE`

Отдельно учитывать:
- measurement error
- panel judgment variability
linking uncertainty.

### 136. REPORTING TRANSFORMATION `CORE`

Психометрическая measurement:
```
[ θ ]
```
может быть преобразована:
```
[ S = A·θ + B ]
```
Например в score scale.
Transformation должна быть versioned.

### 137. SCORE ≠ θ `CORE`

Например:
θ = 0.73
может отображаться как:
Score = 612
только если существует утверждённая transformation.

### 138. PERCENTILE `CORE`

Percentile зависит от reference population.
Поэтому хранить:
- reference group
- reference date
- percentile methodology
version.

### 139. RANKING `CORE`

Ranking по θ имеет смысл внутри одного construct и common scale.
Не ранжировать напрямую:
Math θvsEnglish θ
как будто это единая ability.

### 140. CAT `FUTURE`

CAT — Computerized Adaptive Testing.
Основная последовательность:
initial θ ↓eligible item pool ↓content/security constraints ↓item selection ↓response ↓θ update ↓SE update ↓stopping check ↓continue / finish

### 141. CAT INITIAL θ `FUTURE`

Выбрать:
- prior mean
- population mean
- prior estimate
routing score.
Versioned configuration.

### 142. CAT ITEM INFORMATION SELECTION `FUTURE`

Базовая objective:
```
[ i* = argmax_i I_i(θ) ]
```
Но реальная production CAT не должна использовать только эту формулу.
После неё применять:
- blueprint
- exposure
- security
- testlet constraints
- enemy rules
content balance.

### 143. ELIGIBLE ITEM SET `FUTURE`

```
[ E = { i : status=active ∧ not administered ∧ not enemy ∧ blueprint allowed ∧ exposure allowed } ]
```
Только items из E допускаются к selection.

### 144. CAT SELECTION `FUTURE`

```
[ i* = argmax_{i∈E} Objective(i) ]
```
где objective может включать:
```
[ Objective(i) = Information(i, θ) ]
```
и penalties/constraints.

### 145. WHY NOT ALWAYS SELECT MAX INFORMATION `FUTURE`

Если всегда выбирать item с максимальной information:
несколько items могут использоваться чрезмерно.
Это создаёт:
- exposure
- leakage risk
- memorization
reduced bank security.

### 146. SYMPSON-HETTER `FUTURE`

После selection item может пройти exposure gate.
Концептуально:
```
[ P(Administer_i) = P(Selected_i) · P(Administer_i | Selected_i) ]
```
Требуется ограничивать итоговую exposure rate.

### 147. SYMPSON-HETTER ALGORITHM `FUTURE`

1. Рассчитать information ranking.
2. Выбрать candidate item.
3. Получить control probability p_i.
4. Random gate.
5. Если gate passed → administer.
6. Если gate failed → следующий eligible item.
7. Update exposure statistics.
Exposure probability является частью algorithm configuration.

### 148. STOCKING-LEWIS `FUTURE`

Поддержать отдельный exposure-control algorithm.
Не смешивать:
Sympson-Hetter parameters
и:
Stocking-Lewis parameters.
Каждый algorithm version хранит свои settings.

### 149. SHADOW TEST `FUTURE`

Shadow test — это полный test plan, который строится на каждом CAT step.
Он должен одновременно удовлетворять:
- information objective
- content constraints
- exposure
- security
- test length
enemy-item rules.

### 150. SHADOW TEST OBJECTIVE `FUTURE`

Типовая цель:
```
[ max Σ_i x_i · I_i(θ) ]
```
при выполнении hard constraints.
Это optimisation problem.

### 151. SHADOW TEST CONSTRAINTS `FUTURE`

Например:
```
[ Σ_i x_i = L ]
```
где:
```
[ x_i ∈ {0,1} ]
```
Также:
```
[ min_k ≤ Σ_i q_{ik} x_i ≤ max_k ]
```
для content category k.

### 152. BLUEPRINT INFEASIBILITY `FUTURE`

Если constraints невозможно удовлетворить:
не нарушать их silently.
Вернуть:
BLUEPRINT_INFEASIBLE
и зафиксировать причину.

### 153. ENEMY ITEMS `FUTURE`

Если item pair нельзя показывать вместе:
```
[ x_i + x_j ≤ 1 ]
```
Это hard constraint.
Причины:
- same passage
- repeated content
- answer dependency
security.

### 154. CAT STOPPING `FUTURE`

Поддержать:
SE stop
```
[ SE(θ) ≤ SE_{target} ]
```
Information stop
```
[ I(θ) ≥ I_{target} ]
```
Length stop
```
[ N ≥ N_{max} ]
```
Time stop
```
[ T ≥ T_{max} ]
```
Hybrid
несколько simultaneous conditions.

### 155. MINIMUM CAT LENGTH `FUTURE`

Даже если:
```
[ SE(θ) < SE_{target} ]
```
слишком рано, нужен minimum item count, если это предусмотрено assessment design.

### 156. MAXIMUM CAT LENGTH `FUTURE`

Если target precision недостижим:
```
[ N = N_{max} ]
```
→ остановить CAT.
Не продолжать бесконечно.

### 157. CAT NON-CONVERGENCE `FUTURE`

Если person estimator не converged:
- фиксировать status
- использовать только approved fallback
не бесконечно продолжать estimation.

### 158. CAT POOL EXHAUSTION `FUTURE`

Если eligible items недостаточно:
POOL_EXHAUSTED
или:
BLUEPRINT_INFEASIBLE.
Нельзя брать retired/invalid item просто чтобы закончить тест.

### 159. FIELD TEST ITEMS `CORE`

Для новых items:
FIELD_TEST
не должны без explicit calibration policy автоматически влиять на official theta.

### 160. FIELD-TEST PIPELINE `CORE`

item created ↓provisional prediction ↓field exposure ↓responses ↓calibration ↓fit/DIF/dependency ↓stable parameter ↓operational status

### 161. LLTM + FIELD ITEMS `FUTURE`

Если есть component structure:
```
[ b_{predicted} = Σ_k q_{ik} η_k ]
```
использовать predicted difficulty как provisional information.
После empirical responses:
```
[ b_{calibrated} ]
```
становится фактическим measurement parameter.

### 162. ITEM BANK CONNECTIVITY `CORE`

Для calibration network должна существовать sufficient connectivity.
Например:
Form A └─ anchor A1       │Form B └─ anchor A1
связывает формы.
Без связи:
Form A          Form B  │               │  └── no bridge ──┘
абсолютная common-scale comparison невозможна.

### 163. SPARSE MATRIX `CORE`

Если response matrix:
Person × Item
имеет много missing cells, проверять:
- responses/person
- responses/item
- connectivity
- category counts
calibration uncertainty.

### 164. ITEM CALIBRATION PRECISION `CORE`

Каждый item должен иметь:
```
[ b_i ]
```
и:
```
[ SE(b_i) ]
```
Не только difficulty number.

### 165. EXTREME ITEM SCORE `CORE`

Если никто не ответил правильно:
```
[ r_i = 0 ]
```
обычная item MLE может стремиться к extreme difficulty.
Если все ответили правильно:
```
[ r_i = N ]
```
parameter может стремиться к opposite extreme.
Применяется отдельная finite estimation policy.

### 166. SAMPLE SIZE `CORE`

Не использовать единственное магическое:
N ≥ X.
Требуемая sample size зависит от:
- model
- item spread
- targeting
- categories
- DIF
- desired precision
sparsity.

### 167. CALIBRATION STABILITY `CORE`

Проводить sensitivity analysis:
full samplevssubsamplevstime windowvsbranch groups
Проверять:
```
[ b : full sample vs subsample vs time window vs branch groups ]
```
и его uncertainty.

### 168. ITEM PARAMETER STABILITY `CORE`

Для item:
```
[ z = Δb_i / SE(Δb_i) ]
```
для independent calibrations.

### 169. SIMULATION `OPTIONAL`

Создать simulation validation.
Известно:
```
[ θ_{true} ]
```
и:
```
[ b_{true} ]
```
После estimation получить:
```
[ θ̂, b̂ ]
```
и оценить:
```
[ Bias = θ̂ - θ_{true} ]
```
```
[ RMSE = √[mean((θ̂ - θ_{true})²)] ]
```

### 170. COVERAGE `CORE`

Если engine сообщает 95% CI, simulation должна проверять:
доля true parameters, попавших в reported intervals.
Она должна быть близка к заявленному confidence level при соответствующих условиях.

### 171. CAT SIMULATION `FUTURE`

Для CAT simulation измерять:
- bias
- RMSE
- average SE
- actual error
- test length
- item exposure
- content violations
- overlap
pool utilisation.

### 172. EXPOSURE DISTRIBUTION `FUTURE`

Для каждого item:
```
[ ExposureRate_i = n_{administered,i} / N_{testtakers} ]
```
Проверять:
- minimum
- maximum
- mean
- SD
- distribution
high-exposure items.

### 173. FORM SECURITY `CORE`

High exposure items могут быть:
- retired
- quarantined
- removed from operational CAT
moved to calibration-only status.
Это decision policy, а не непосредственная Rasch parameter.

### 174. RASCH MODEL НЕ ДЕЛАЕТ CHEATING DETECTION `CORE`

Psychometric anomalies могут помочь обнаружить unusual response patterns, но:
```
[ misfit ≠ cheating ]
```
Engine должен использовать термины:
ANOMALOUS_RESPONSE_PATTERN
и:
REVIEW_REQUIRED
вместо неподтверждённого обвинения.

### 175. STANDARD ERROR OF ITEM `CORE`

В calibration каждый b_i должен иметь estimated uncertainty.
В зависимости от calibration estimator она получается из соответствующей information/Hessian/conditional likelihood estimation procedure.

### 176. HESSIAN `CORE`

При likelihood-based estimation Hessian:
```
[ H(η) = ∂²lnL / ∂η∂η' ]
```
где η — vector of estimated parameters.
Approximate covariance:
```
[ Cov(η) ≈ (-H)^{-1} ]
```
при соответствующих regularity conditions.

### 177. COVARIANCE MATRIX `CORE`

При многопараметрической calibration полезно хранить:
```
[ Cov(η) ]
```
или достаточную information representation.
Это необходимо для корректного расчёта uncertainty при:
- differences
- contrasts
- linking
facets.

### 178. CONTRAST `CORE`

Для сравнения двух parameters:
```
[ C = a'η ]
```
Variance:
```
[ Var(C) = a'Cov(η)a ]
```
SE:
```
[ SE(C) = √Var(C) ]
```
Это более корректно, чем всегда предполагать независимость.

### 179. MFRM CONTRAST `OPTIONAL`

Например:
```
[ C = C_{raterA} - C_{raterB} ]
```
можно оценивать через covariance matrix.

### 180. CATEGORY STEP ESTIMATION `CORE`

Для PCM/RSM category thresholds оцениваются вместе с другими parameters через соответствующую likelihood.
Нельзя получать thresholds simple arithmetic averages of category percentages.

### 181. EXPECTED CATEGORY `CORE`

Для polytomous item:
```
[ P_{ik}(θ) ]
```
вычисляется для каждой category.
Затем:
```
[ E(X_i|θ) = Σ_k k · P_{ik}(θ) ]
```

### 182. POLYTOMOUS INFORMATION `CORE`

General information для ordered categorical item может вычисляться через derivative expected score:
```
[ I_i(θ) = Var[X_i|θ] ]
```
при canonical Rasch formulation.
То есть:
```
[ I_i(θ) = Σ_k (k - E_i)² · P_{ik}(θ) ]
```

### 183. POLYTOMOUS FIT `CORE`

Для category observation:
```
[ Residual = X - E(X|θ) ]
```
```
[ Variance = Var(X|θ) ]
```
```
[ z = Residual / √Variance ]
```
Далее аналогично формируются:
- Outfit
Infit.
Rasch documentation использует именно residual и modelled variance для category fit calculations.

### 184. MISSING POLYTOMOUS `CORE`

Не считать:
missing = category 0.
Missing должен быть исключён из likelihood согласно missing/scoring policy.

### 185. RATING SCALE VALIDITY `CORE`

Перед RSM проверить, что category meanings действительно одинаковы across items.
Если:
"3" на item A
имеет другое conceptual meaning, чем:
"3" на item B
RSM может быть неправильным model choice.

### 186. MODEL SELECTION `CORE`

Engine не должен silently switch models.
Каждый result должен иметь:
model_typemodel_version
Например:
RASCH_BINARYRASCH_PCMRASCH_RSMRASCH_MFRMRASCH_LLTMRASCH_MDRMRASCH_MIXED

### 187. MODEL BOUNDARIES `CORE`

Следующие модели нельзя silently смешивать с classic Rasch:
- 2PL
- 3PL
- 4PL
- non-Rasch multidimensional IRT
response-time IRT.
Если они добавляются — это отдельные models.

### 188. GUESSING `CORE`

Classic Rasch:
не имеет отдельного guessing parameter.
Поэтому нельзя самостоятельно вводить:
```
[ P = c + (1-c) · logistic(θ - b) ]
```
и продолжать называть полученную модель classic Rasch.

### 189. BRANCH COMPARISON `CORE`

Для branch comparisons:
- common calibration
- common scale
- DIF analysis
- targeting
uncertainty.
Не делать:
branch average percentage
как основной psychometric comparison.

### 190. SUBJECT SCALES `CORE`

Например:
MATHENGLISH_READINGENGLISH_WRITINGPHYSICS
каждый construct имеет собственную scale.

### 191. CROSS-SUBJECT COMPARISON `CORE`

Нельзя утверждать:
```
[ θ_{Math} = 1.2 ]
```
больше или меньше:
```
[ θ_{English} = 0.8 ]
```
в substantive sense только потому, что numerical logits одинакового формата.

### 192. CALIBRATION LIFECYCLE `CORE`

DRAFT ↓PILOT ↓PROVISIONAL ↓CALIBRATED ↓MONITORED ↓DRIFT / WARNING ↓RECALIBRATION ↓RETIRED

### 193. CALIBRATION PROMOTION `CORE`

Promote item only after соответствующих:
- sample adequacy
- convergence
- SE
- fit
- DIF
- dependency
- stability
- content
security checks.

### 194. CALIBRATION APPROVAL `CORE`

Calibration version должна содержать:
- dataset snapshot
- model
- estimator
- parameters
- SE
- fit
- DIF
- dependency
- dimensionality
- anchor/equating data
decision.

### 195. CALIBRATION REJECTION `CORE`

Причины:
NON_CONVERGEDINSUFFICIENT_DATAPOOR_CONNECTIVITYSE_TOO_LARGEMISFITDIFLOCAL_DEPENDENCECATEGORY_FAILUREDRIFTINVALID_SCORINGCONTENT_FAILURESECURITY_FAILURE

### 196. HISTORICAL PARAMETERS `CORE`

Никогда не делать:
old b = 1.25↓recalibration↓b = 0.97↓overwrite old value
Вместо этого:
Calibration v1 → b=1.25Calibration v2 → b=0.97

### 197. HISTORICAL RESULT `CORE`

Если student получил:
θ=0.83calibration=v1
этот result сохраняется.
Если позже calibration v2:
старый measurement не заменять silently.

### 198. RE-CALCULATION `CORE`

При revision:
old result+new calibration+reason=new revised result
Оба должны быть traceable.

### 199. PROVENANCE `CORE`

Для каждого official result можно восстановить:
person ↓response snapshot ↓item versions ↓scoring ↓calibration version ↓model version ↓estimator version ↓θ ↓SE ↓scale transformation ↓standard-setting version ↓final decision

### 200. NUMERICAL SAFETY `CORE`

Защититься от:
- exp(very_large)
- log(0)
- division by zero
- NaN
- Infinity
- zero information
- singular Hessian
- unstable covariance
non-convergence.

### 201. PROBABILITY CLIPPING `CORE`

Internal calculation должен использовать numerically stable logistic/log-likelihood methods.
Если probability становится numerically indistinguishable from 0 или 1:
не допускать:
```
[ P → 0 (или P → 1) ]
```
в likelihood calculation.

### 202. INTERNAL ROUNDING `CORE`

Не округлять:
θ
b
SE
thresholds
до reporting precision во время estimation.
Например:
не использовать внутренне:
0.84
если реальное значение:
0.836742....

### 203. REPORTING ROUNDING `CORE`

Rounding выполняется только после окончательного psychometric calculation.

### 204. DETERMINISM `CORE`

При одинаковых:
- data
- model
- estimator
- settings
- seed
result должен совпадать в пределах defined numerical tolerance.

### 205. RANDOM SEED `CORE`

Если использованы:
- bootstrap
- Monte Carlo
- stochastic CAT
- random exposure gate
seed должен сохраняться.

### 206. CALIBRATION SIMULATION `OPTIONAL`

Для каждого new psychometric algorithm обязательно запускать benchmark simulation:
known θknown b ↓generate responses ↓estimate ↓compare estimate vs truth

### 207. BIAS `CORE`

```
[ Bias = E[θ̂ - θ_{true}] ]
```
Использовать для проверки systematic estimation error.

### 208. RMSE `CORE`

```
[ RMSE = √E[(θ̂ - θ_{true})²] ]
```
RMSE одновременно отражает variance и bias.

### 209. COVERAGE `CORE`

Для confidence/credible interval:
```
[ Coverage = P(θ_{true} ∈ CI) ]
```
Проверять через simulation.

### 210. CAT PRECISION VALIDATION `FUTURE`

Проверять:
```
[ ActualError = |θ̂ - θ_{true}| ]
```
относительно reported:
```
[ SE(θ̂) ]
```
в simulation.

### 211. ITEM EXPOSURE VALIDATION `FUTURE`

После CAT simulation:
```
[ Exposure_i ≤ max допустимый ]
```
должен соответствовать configured exposure policy.

### 212. BLUEPRINT VALIDATION `CORE`

Для каждого CAT-generated test:
```
[ ConstraintViolationCount = 0 ]
```
для всех hard constraints.

### 213. ENEMY-ITEM VALIDATION `CORE`

В каждой generated form:
```
[ x_i + x_j ≤ 1 ]
```
для каждой enemy pair.

### 214. FIELD-TEST VALIDATION `CORE`

Field-test items должны иметь независимый status и не должны незаметно влиять на official score.

### 215. RESULT QUALITY VS RESULT EXISTENCE `CORE`

Возможны:
θ exists mathematically
но:
measurement quality = insufficient
Это два разных состояния.

### 216. PERSON WITH ONE ITEM `CORE`

Engine может вычислить estimate в зависимости от model/estimator, но SE может быть огромной.
Не считать такое measurement высокоточным автоматически.

### 217. ZERO INFORMATION `CORE`

Если:
```
[ I_{test}(θ) → 0 ]
```
то:
```
[ SE(θ) → ∞ ]
```
Engine должен вернуть:
INSUFFICIENT_INFORMATION
или другой configured status.

### 218. PERFECT TEST `CORE`

Если все items идеально отделяют population, это не означает автоматически high validity.
Проверять:
- dimensionality
- content
- targeting
- dependency
fit.

### 219. ALL PERSONS CORRECT ITEM `CORE`

Такой item может иметь extreme estimate.
Не публиковать его ordinary finite MLE без соответствующей estimation policy.

### 220. ALL PERSONS WRONG ITEM `CORE`

Аналогично.

### 221. QUESTION KEY ERROR `CORE`

Wrong key может вызвать:
- high outfit
- negative point-measure relationship
- DIF-like behaviour
item drift.
Но сначала проверять scoring/key.

### 222. LOCAL DEPENDENCE ДО УДАЛЕНИЯ `CORE`

Если items зависимы:
не удалять сразу.
Сначала установить substantive cause.

### 223. DIF ДО УДАЛЕНИЯ `CORE`

Если item показывает DIF:
проверить:
- measurement
- content
- translation
- curriculum
subgroup characteristics.

### 224. MISFIT ДО УДАЛЕНИЯ `CORE`

Misfit:
diagnostic signal
а не:
automatic deletion command.

### 225. STANDARD SETTING НЕ МЕНЯЕТ θ `CORE`

Если cutscore изменился:
item calibration может остаться прежней.
Изменяется decision rule:
```
[ decision = f(θ, c) ]
```

### 226. EQUATING НЕ МЕНЯЕТ CONSTRUCT `CORE`

Equating меняет positioning of forms на common scale.
Оно не должно использоваться для искусственного улучшения/ухудшения student scores.

### 227. SCALE CHANGE `CORE`

При:
```
[ θ' = A·θ + B ]
```
measurement construct тот же, если A>0.

### 228. SCALE DRIFT `CORE`

Если transformations между periods начинают сильно отличаться, исследовать:
- anchor stability
- item pool
- population
- content
- security
calibration methodology.

### 229. CALIBRATION SNAPSHOT IMMUTABILITY `CORE`

Calibration должна всегда иметь immutable source dataset.
Нельзя запустить calibration сегодня на одном dataset, а завтра silently добавить responses и назвать это той же calibration.

### 230. AUDITABLE EXCLUSIONS `CORE`

Каждое исключённое observation должно иметь:
response_idreasonexcluded_fromtimestamppolicy_version

### 231. VERSION MATRIX `CORE`

Каждый result должен reference:
item_versionscoring_versionmodel_versionestimator_versioncalibration_versionscale_versionreporting_versionstandard_setting_version

### 232. COMPATIBILITY CHECK `CORE`

Перед calculation:
item versions compatible?scoring compatible?model compatible?calibration compatible?scale compatible?
Если нет:
CALIBRATION_MISMATCH.

### 233. NO SILENT FALLBACK `CORE`

Если estimator failed:
не делать незаметно:
MLE → percentage score.
Любой fallback должен быть:
- configured
- logged
versioned.

### 234. NO MAGIC COEFFICIENTS `CORE`

Запрещено делать:
theta = percentage × 2 - 1
и называть это Rasch.

### 235. NO DIFFICULTY = POINTS `CORE`

Запрещено:
b=-1 → 10 pointsb=0 → 20 pointsb=1 → 30 points
Difficulty и score — разные quantities.

### 236. NO BRANCH-SPECIFIC DIFFICULTY WITHOUT EVIDENCE `CORE`

Нельзя создавать:
item b in Branch Aitem b in Branch B
только потому, что branches have different average results.
Нужно иметь appropriate DIF/calibration evidence.

### 237. NO CROSS-SCALE MIXING `CORE`

Нельзя:
Math calibration+English calibration→one raw average theta
без explicit multidimensional/composite measurement framework.

### 238. NO SILENT 2PL/3PL `CORE`

Если появляется discrimination или guessing parameter:
это уже отдельная IRT model.

### 239. NO SILENT HISTORICAL RECALCULATION `CORE`

Recalculation → new result revision.

### 240. NO SILENT CATEGORY CHANGE `CORE`

Category collapse → new scoring/model calibration version.

### 241. COMPLETE FIXED-FORM ALGORITHM `CORE`

STEP 1Определить construct.STEP 2Определить model type.STEP 3Получить item versions.STEP 4Получить calibration version.STEP 5Получить responses.STEP 6Применить scoring.STEP 7Отфильтровать invalid observations.STEP 8Проверить minimum information/data conditions.STEP 9Получить b_i и необходимые thresholds.STEP 10Запустить estimator.STEP 11Выполнить iterations.STEP 12Проверить convergence.STEP 13Рассчитать θ.STEP 14Рассчитать information.STEP 15Рассчитать SE.STEP 16Рассчитать confidence/uncertainty.STEP 17Рассчитать person fit.STEP 18Проверить response quality.STEP 19Проверить extreme status.STEP 20Применить approved reporting transformation.STEP 21При необходимости применить cutscore.STEP 22Сохранить provenance.

### 242. COMPLETE ITEM CALIBRATION ALGORITHM `CORE`

RAW RESPONSES ↓ELIGIBILITY ↓IMMUTABLE SNAPSHOT ↓CONNECTIVITY ↓MODEL ↓INITIALIZATION ↓ESTIMATION ↓CONVERGENCE ↓ITEM b ↓ITEM SE ↓ITEM FIT ↓DIF ↓LOCAL DEPENDENCE ↓DIMENSIONALITY ↓DRIFT ↓TARGETING ↓CONTENT REVIEW ↓SECURITY REVIEW ↓CALIBRATION PROMOTION

### 243. COMPLETE CAT ALGORITHM `FUTURE`

INITIAL θ ↓CREATE ELIGIBLE SET ↓REMOVE INVALID ITEMS ↓REMOVE ADMINISTERED ITEMS ↓REMOVE ENEMY ITEMS ↓APPLY CONTENT CONSTRAINTS ↓APPLY EXPOSURE CONTROL ↓BUILD SHADOW TEST ↓OPTIMIZE INFORMATION + CONSTRAINTS ↓SELECT ITEM ↓ADMINISTER ↓RESPONSE ↓UPDATE θ ↓UPDATE SE ↓UPDATE FIT ↓UPDATE EXPOSURE ↓UPDATE BLUEPRINT ↓STOP? ├── NO → repeat └── YES → final θ + SE

### 244. COMPLETE EQUATING ALGORITHM `CORE`

CALIBRATION A      +CALIBRATION B      ↓IDENTIFY COMMON ANCHORS      ↓CHECK CONNECTIVITY      ↓CHECK ANCHOR STABILITY      ↓CHECK DIF      ↓CHECK EXPOSURE      ↓REMOVE/FLAG INVALID ANCHORS      ↓ESTIMATE TRANSFORMATION      ↓ESTIMATE UNCERTAINTY      ↓LINK FORMS      ↓VALIDATE EQUATING      ↓FREEZE SCALE VERSION

### 245. COMPLETE STANDARD-SETTING ALGORITHM `CORE`

RASCH ITEM SCALE ↓ORDER ITEMS ↓DEFINE PERFORMANCE LEVELS ↓EXPERT TRAINING ↓BOOKMARK JUDGMENTS ↓COLLECT JUDGMENTS ↓ANALYZE VARIABILITY ↓CONSENSUS ↓CUTSCORE ↓UNCERTAINTY ↓VALIDATION ↓STANDARD-SETTING VERSION

### 246. COMPLETE MFRM ALGORITHM `OPTIONAL`

PERSON+ITEM+RATER+TASK+CRITERION+CATEGORY ↓FACET MODEL ↓PROBABILITIES ↓LIKELIHOOD ↓ITERATIVE ESTIMATION ↓CONVERGENCE ↓ABILITY+ITEM DIFFICULTY+RATER SEVERITY+TASK PARAMETERS+CATEGORY STEPS ↓SE ↓FIT ↓FACET COMPARISONS

### 247. COMPLETE LLTM ALGORITHM `FUTURE`

ITEM COMPONENT MATRIX ↓q_ik ↓ESTIMATE η_k ↓PREDICT b_i ↓EMPIRICAL ITEM RESPONSES ↓EMPIRICAL b_i ↓COMPARE PREDICTED vs OBSERVED ↓MODEL DIAGNOSTICS

### 248. COMPLETE MIXED RASCH ALGORITHM `FUTURE`

INITIAL CLASSES ↓INITIAL PARAMETERS ↓E-STEP ↓POSTERIOR CLASS PROBABILITIES ↓M-STEP ↓UPDATE PARAMETERS ↓LIKELIHOOD ↓CONVERGENCE ↓CLASS STABILITY ↓FINAL MIXTURE MODEL

### 249. COMPLETE QUALITY ENGINE `CORE`

For every calibration/result:
DATA QUALITY ↓MODEL QUALITY ↓CONVERGENCE ↓PRECISION ↓FIT ↓DIMENSIONALITY ↓LOCAL DEPENDENCE ↓DIF ↓STABILITY ↓SECURITY ↓VALIDITY ↓FINAL QUALITY STATUS

### 250. DEFINITION OF A TRUSTED PERSON MEASURE `CORE`

A result should be considered high-quality only when:
valid responses+compatible calibration+correct estimator+convergence+sufficient information+acceptable response quality+acceptable measurement uncertainty+appropriate scale
are all satisfied.

### 251. DEFINITION OF A TRUSTED ITEM PARAMETER `CORE`

Item parameter should be operationally trusted only when:
valid calibration data+sufficient connectivity+convergence+acceptable SE+acceptable fit+acceptable DIF+acceptable local independence+no unresolved key/scoring issue+no unresolved serious drift+content approval+security approval

### 252. DEFINITION OF A TRUSTED CAT TEST `FUTURE`

CAT test valid only when:
all selected items valid+blueprint satisfied+security constraints satisfied+enemy rules satisfied+exposure policy satisfied+estimator converged+minimum test length satisfied+final precision/termination condition satisfied

### 253. MASTER DATA RELATIONSHIP `CORE`

Главное математическое отношение системы:
```
[ θ_n - b_i ]
```
Из него строятся:
```
[ Expected Response ]
```
```
[ Residual ]
```
```
[ Information ]
```
```
[ SE ]
```
```
[ Fit ]
```
```
[ CAT Selection ]
```
и остальные связанные процедуры.

### 254. MASTER STATISTICAL CHAIN `CORE`

X ↓P(θ,b) ↓Residual = X-P ↓Variance = P(1-P) ↓Standardized Residual ↓Fit ↓Likelihood ↓Estimation ↓Information ↓SE ↓Measurement Quality

### 255. MASTER SCALE CHAIN `CORE`

Items ↓Calibration ↓b_i ↓Common Scale ↓Person responses ↓θ ↓SE ↓Transformation ↓Reported Score ↓Cutscore ↓Decision

### 256. MASTER ADAPTIVE CHAIN `FUTURE`

θ_current ↓Information calculation ↓Eligible pool ↓Blueprint ↓Security ↓Exposure ↓Shadow Test ↓Item selection ↓Response ↓θ_new ↓SE_new ↓Stopping

### 257. MASTER EXTENDED MODEL CHAIN `CORE`

Binary └─ RaschPolytomous ├─ RSM └─ PCMMultiple facets └─ MFRMItem component structure └─ LLTMMultiple dimensions └─ MDRMLatent populations └─ Mixed RaschAdaptive administration └─ CAT

### 258. WHAT THE ENGINE MUST ALWAYS KNOW `CORE`

На этапе любого calculation engine должен знать:
WHO       = personWHAT       = constructWHICH ITEM       = exact item versionWHICH MODEL       = model versionWHICH CALIBRATION       = calibration versionWHICH ESTIMATOR       = estimator versionWHICH SCALE       = scale versionWHICH SCORING       = scoring versionWHICH STANDARD       = standard-setting version

### 259. WHAT MUST NEVER BE LOST `CORE`

Никогда не уничтожать:
- raw responses
- original scoring
- original item version
- original calibration
- estimator configuration
- historical theta
- historical b
- historical scale
- exclusion reasons
recalculation reasons.

### 260. FINAL PRODUCTION RULE `CORE`

Если система не знает, как вычисляется показатель, она не должна просто создавать приблизительное число.
Вместо этого:
INSUFFICIENT_SPECIFICATION
или:
NOT_IDENTIFIABLE
или:
NON_CONVERGED
или другой точный diagnostic status.

### 261. ФИНАЛЬНАЯ АРХИТЕКТУРА PSYCHOMETRIC LOGIC `CORE`

┌──────────────────┐                    │    RAW DATA      │                    └────────┬─────────┘                             ↓                    ┌──────────────────┐                    │    SCORING       │                    └────────┬─────────┘                             ↓                  ┌──────────────────────┐                  │ VALIDITY / ELIGIBLE  │                  └──────────┬───────────┘                             ↓                  ┌──────────────────────┐                  │ CALIBRATED ITEMS     │                  │ b_i / thresholds     │                  └──────────┬───────────┘                             ↓                   ┌────────────────────┐                   │ RASCH MODEL ENGINE │                   └─────────┬──────────┘                             ↓                  ┌──────────────────────┐                  │ PARAMETER ESTIMATION │                  └──────────┬───────────┘                             ↓                  ┌──────────────────────┐                  │ CONVERGENCE / SE     │                  └──────────┬───────────┘                             ↓                 ┌─────────────────────────┐                 │ PSYCHOMETRIC DIAGNOSIS  │                 │ FIT / DIF / Q3 / PCA     │                 │ DRIFT / TARGETING       │                 └───────────┬─────────────┘                             ↓                 ┌─────────────────────────┐                 │ COMMON SCALE / EQUATING │                 └───────────┬─────────────┘                             ↓                   ┌────────────────────┐                   │ θ + SE + QUALITY   │                   └─────────┬──────────┘                             ↓                  ┌──────────────────────┐                  │ REPORTING TRANSFORM  │                  └──────────┬───────────┘                             ↓                    ┌─────────────────┐                    │ STANDARD SETTING│                    └────────┬────────┘                             ↓                    ┌─────────────────┐                    │ FINAL DECISION  │                    └─────────────────┘

### 262. FINAL CAT ARCHITECTURE `FUTURE`

CURRENT θ                     ↓             ┌───────────────┐             │ ITEM DATABASE │             └───────┬───────┘                     ↓            ELIGIBILITY FILTER                     ↓       ┌─────────────┼─────────────┐       ↓             ↓             ↓   CONTENT        SECURITY      EXPOSURE       └─────────────┼─────────────┘                     ↓                SHADOW TEST                     ↓               OPTIMIZATION                     ↓              NEXT ITEM                     ↓                  RESPONSE                     ↓              θ UPDATE                     ↓             SE / INFORMATION                     ↓              FIT / QUALITY                     ↓               STOPPING?              /          \            NO            YES            ↓              ↓       NEXT ITEM       FINAL RESULT

### 263. FINAL IMPLEMENTATION PRINCIPLE `CORE`

Rasch Engine должен быть реализован как measurement engine, а не score calculator.
Он обязан понимать:
```
[ θ, b, P(θ,b), SE(θ), Fit ]
```
Каждая цифра должна иметь математическое происхождение.

### 264. FINAL «DONE» CHECKLIST `CORE`

Система не считается полноценным Rasch Engine, пока не поддерживает необходимую часть следующего набора:
✓ Binary Rasch✓ Logit scale✓ Identification constraint✓ Likelihood✓ Log-likelihood✓ Score function✓ Expected score✓ ICC✓ Test Characteristic Curve✓ Item information✓ Test information✓ Fisher information✓ Observed information✓ SE✓ Confidence intervals✓ MLE✓ WLE✓ MAP✓ EAP✓ CML✓ JMLE✓ MMLE✓ EM✓ Pairwise estimation✓ Convergence rules✓ Extreme-score handling✓ Numerical stability✓ Item calibration✓ Person estimation✓ Item SE✓ Person SE✓ Infit✓ Outfit✓ Standardized residual✓ ZSTD✓ Point-measure diagnostics✓ Item fit✓ Person fit✓ Residual PCA✓ Martin-Löf✓ Andersen LR✓ Yen Q3✓ Local dependence✓ Testlets✓ DIF✓ DIF SE✓ DIF significance✓ DIF effect size✓ Multiple testing✓ Item drift✓ Scale drift✓ Exposure✓ PCM✓ RSM✓ Category probabilities✓ Category information✓ Category thresholds✓ Threshold disordering✓ MFRM✓ Rater severity✓ Rater fit✓ LLTM✓ Component parameters✓ MDRM✓ Multiple dimensions✓ Mixed Rasch✓ Latent classes✓ Class convergence✓ Common-item linking✓ Common-person linking✓ Mean-Mean✓ Mean-Sigma✓ Anchor analysis✓ Anchor drift✓ Robust anchor cleaning✓ Equating uncertainty✓ Standard setting✓ Bookmark✓ Multiple cut scores✓ Reporting transformation✓ CAT✓ Information-based selection✓ Blueprint constraints✓ Shadow testing✓ Sympson-Hetter✓ Stocking-Lewis✓ Exposure control✓ Enemy items✓ Field-test items✓ CAT stopping✓ CAT simulation✓ Calibration simulation✓ Bias✓ RMSE✓ Coverage✓ Sparse matrix diagnostics✓ Connectivity✓ Missing data✓ Not reached✓ Technical failures✓ Invalid items✓ Key versioning✓ Repeated-item handling✓ Historical calibration✓ Historical results✓ Recalculation revisions✓ Model versioning✓ Estimator versioning✓ Scale versioning✓ Standard-setting versioning✓ Provenance✓ Auditability✓ Deterministic reproducibility✓ Numerical regression tests

### 265. ABSOLUTE RULE `CORE`

Ни одна часть этой системы не должна быть реализована как «примерно так».
Для каждого calculation необходимо заранее определить:
INPUT→FORMULA / MODEL→ESTIMATION METHOD→ITERATION→CONVERGENCE→UNCERTAINTY→DIAGNOSTIC→INTERPRETATION→EDGE CASE→OUTPUT→VERSION
Если математическая величина не может быть идентифицирована из имеющихся данных, система должна сообщить об этом, а не придумывать значение.
Если estimator не converged, система должна сообщить NON_CONVERGED.
Если scale нельзя связать, система должна сообщить LINKING_NOT_IDENTIFIABLE.
Если информации недостаточно, система должна сообщить INSUFFICIENT_INFORMATION.
Если item invalid, система должна использовать его статус, а не скрыто подменять scoring.
Если модель не соответствует данным, система должна создавать diagnostic, а не искусственно корректировать параметры до «красивого» результата.

### 266. ИТОГ `CORE`

Фундаментальная математическая система:
```
[ θ_n - b_i ]
```
затем:
```
[ P_{ni} = 1 / (1+e^{-(θ_n-b_i)}) ]
```
```
[ logit(P_{ni}) = θ_n - b_i ]
```
```
[ L(θ) = Π_i P_i^{X_i}(1-P_i)^{1-X_i} ]
```
```
[ θ̂ = argmax_θ L(θ) ]
```
```
[ SE(θ) = 1/√I(θ) ]
```
```
[ Fit = f(Residual, Variance) ]
```
```
[ Reliability, Separation ]
```
и затем вся система более высокого уровня:
```
[ Common Scale → Reporting Transformation → Standard Setting → Decision ]
```
Именно эта логика должна быть реализована как единый, versioned, reproducible psychometric engine, а не как набор независимых формул.

---

# Часть III. Дополнения к спецификации

Разделы 267+. Взяты не для полноты: каждый закрывает пробел, который мешает
именно нашей цели. Нумерация продолжает норму.

### 267. WLE — ФОРМУЛА ПОПРАВКИ WARM `CORE`

§22 называет WLE и требует держать его отдельной версией estimator-а, но
формулы не даёт — реализовать по такому описанию нельзя.

У MLE на конечном тесте есть смещение к краям шкалы, из-за него крайние оценки
уходят в бесконечность (§19). Warm (1989) добавляет к score function поправку:

```
[ U_W(θ) = Σ_i (x_i − P_i) + J(θ) / (2·I(θ)) ]
```

где:

```
[ I(θ) = Σ_i P_i(1−P_i) ]
[ J(θ) = Σ_i P_i(1−P_i)(1−2P_i) ]
```

Итерации Newton-Raphson те же, что в §14, только `U(θ)` заменяется на `U_W(θ)`.

```
[ SE(θ̂) ≈ 1 / √I(θ̂) ]
```

Главное свойство: WLE даёт **конечную** оценку и при 0 верных, и при всех
верных. Это закрывает §19–20 без выдуманных констант, запрещённых §234. WLE —
кандидат в operational person estimator; MLE и WLE нельзя считать одним
численным результатом (§22).

### 268. ПРИВЯЗКА К ШКАЛЕ БМБА `CORE`

**Самый важный раздел для нашей цели и полностью отсутствующий в норме.**

Формула перевода θ → балл БМБА не публикуется. Никакой безупречный движок её
не угадает: математика может быть идеальной, а баллы всё равно не совпадут с
реальными. Единственный путь — эмпирический линкинг.

Процедура:

1. Собрать учеников, у которых есть **и** реальный сертификат БМБА, **и**
   прохождение нашего пробника. Минимум 100–150 на предмет.
2. Common-person linking (§130 — вот где он нужен): найти `A` и `B` в
   `[ Score_BMA = A·θ_наш + B ]`.
3. Пороги уровней A+/A/B+/B/C+/C **не** выводить bookmark-процедурой с
   экспертами (§132 нам поэтому не нужен) — они заданы извне официальными
   порогами БМБА.
4. Заложить критерий приёмки: **MAE** между нашим прогнозом и реальным баллом
   плюс **доля совпадения уровня**. Без этого «соответствие БМБА» — слова.

Пока линкинга нет, любой показанный балл — внутренняя величина платформы, и
называть его баллом сертификата нельзя.

### 269. ТАБЛИЦА RAW → θ → БАЛЛ → УРОВЕНЬ `CORE`

При полных данных в Rasch θ зависит **только от сырого балла** (§7–8). Значит
для каждой фиксированной формы таблица считается один раз:

```
верных → θ → SE → балл → уровень
```

Это быстро, детерминированно и аудируемо — и фактически так и работает БМБА. В
норме этого нет, а production упрощается в разы: выдача балла становится
поиском по таблице, а не прогоном оценки на каждый запрос.

Условие применимости: полные данные и одна форма. Как только появляются
пропуски с разной политикой или адаптивность, таблица перестаёт быть
достаточной.

### 270. DIF ПО ЯЗЫКУ ТЕСТА `CORE`

§60 описывает DIF абстрактно, §65 — по филиалам. У нас есть конкретный и
обязательный случай: **одно задание на узбекском и на русском**. Перевод меняет
сложность, и это не гипотеза, а типовой источник смещения.

Обязательный шаг контроля качества: для каждого задания, существующего в двух
языках, считать DIF между языковыми группами при сопоставимой θ (§60–64).
Найденное — флагом на разбор, не на автоудаление (§223).

### 271. СБОРКА ФИКСИРОВАННЫХ ФОРМ `CORE`

Blueprint в норме описан только внутри CAT (§151–152), то есть в разделе,
который у нас `FUTURE`. Для линейных пробников нужен свой модуль сборки:

- соответствие структуре БМБА — число заданий, распределение по темам;
- целевая test information function (§28) в диапазоне способностей
  выпускников;
- **параллельность вариантов между собой** — иначе один пробник окажется легче
  другого, и ученик увидит «скачок» балла там, где уровень не менялся.

### 272. АНАЛИЗ ДИСТРАКТОРОВ `CORE`

Для закрытых заданий нужна статистика по каждому варианту ответа:

- доля выбравших;
- средняя θ выбравших.

Главный инструмент автора заданий: находит ошибки в ключе и «мёртвые»
дистракторы, которые не выбирает никто. §221 (key error) без этого работает
вполсилы — он констатирует проблему, но не показывает, где именно.

### 273. ГРАФИЧЕСКИЙ ITEM FIT `CORE`

Разбить учеников на 5–8 групп по θ и для каждой сравнить наблюдаемую долю
верных с ожидаемой `P(θ)` из §37.

Один такой график говорит о задании больше, чем Infit и Outfit вместе, и
понятен методисту без психометрического образования. MNSQ (§41–44) сжимает всю
картину в одно число и теряет форму расхождения.

### 274. ФЛАГИ УРОВНЯ УЧЕНИКА `OPTIONAL`

§174 честно говорит: Rasch не занимается обнаружением списывания. Платформе тем
не менее нужны флаги на просмотр — **не как обвинение**:

- person misfit, `lz`-индекс (§114);
- аномально быстрые ответы (§77);
- паттерн «сложные верно, лёгкие неверно».

### 275. ОТЧЁТ УЧЕНИКУ `CORE`

Норма заканчивается на «final decision» (§260) — а ученику нужен результат.
Минимум:

- балл по шкале БМБА;
- доверительный интервал, ±SE в баллах, а не в логитах (§32);
- уровень;
- сколько не хватает до следующего уровня;
- разбор по темам.

Продуктовая часть, но именно она и есть продукт.

### 276. ПОЛИТИКА КАЛИБРОВКИ БАНКА В БОЕВОМ РЕЖИМЕ `CORE`

§159–160 описывают field-test pipeline, но без чисел. Для production нужны
конкретные пороги:

1. Новое задание ставится field-test позицией внутри реального пробника и **не
   влияет на балл ученика**.
2. Накопление ответов до порога — ориентир §166 выше, ≥250–300.
3. Калибровка, проверка fit и DIF.
4. Промоушен в active только после прохождения порогов; иначе — на доработку.

Пороги должны быть записаны как конфигурация с версией (§109), а не жить в
головах.

### 277. ЧЕГО СОЗНАТЕЛЬНО НЕТ `FUTURE`

- **2PL / 3PL / 4PL** — БМБА считает по Rasch. Добавить discrimination или
  guessing значит разойтись с реальными баллами; §187 и §238 это запрещают, и
  правильно, что моделей в норме нет.
- **LPCM** — это LLTM для политомных заданий, а сам LLTM `FUTURE`.
- **Saltus, hybrid Rasch** — модели изучения развития, не сертификации.
- **MST** — экзамен линейный. Если появится адаптивный тренировочный режим, MST
  практичнее CAT, но это отдельный продукт.
- **Kolmogorov–Smirnov, Cressie–Read** — Infit/Outfit плюс Andersen LR
  достаточно; графический fit (§273) полезнее.
- **Vertical scaling** — одна популяция (выпускники), одна шкала на предмет.
- **MCAR / MAR / MNAR формально** — статусов OMITTED и NOT_REACHED (§73–74)
  достаточно. Но нюанс, который надо прописать явно, иначе сделают наоборот:
  **в режиме экзамена пропуск = 0 баллов**, как у БМБА. Логика «missing ≠
  wrong» из §73 относится **только к калибровке**, не к выдаче балла ученику.
- **Generalizability theory** — только для rater studies, а их закрывает MFRM.
- **Автогенерация и клонирование заданий** — content-модуль, не движок.
  Единственное правило для движка: **клон ≠ оригинал по `b`**, клон калибруется
  заново.
- **Multidimensional CAT** — не нужны ни MDRM, ни CAT.


---

# Часть IV. Что у нас реализовано против нормы

Замер от 2026-09-08: 2 теста, 104 калиброванных задания, 90 работ с баллом,
4700 ответов. Все числа воспроизводимы запросами из части VII.

## Соответствует норме

| Требование | Где |
|---|---|
| §3 логистическая функция, численно устойчивая при больших \|θ−b\| | `probability` в [rasch.ts](../src/lib/rasch.ts) |
| §104 JMLE — совместная оценка θ и b по матрице ответов | `estimateRasch` |
| §6 идентификация шкалы центрированием `b` | `recenter` |
| §14 Newton-Raphson с демпфированием шага; §18 max iterations | `dampStep`, `maxIterations` |
| §19 поправка на крайние оценки (Wright & Panchapakesan, 0.3) | `adjust` |
| §187–188 чистый Rasch: без 2PL/3PL, без guessing-параметра | вся модель |
| §202 не округлять θ/b во время оценки | **исправлено** миграцией 085 — тройное округление снято |
| §203 округление только после финального расчёта | `roundScore` — единственная точка |
| §204 детерминизм: случайности в оценке нет | `estimateRasch` |
| §235 difficulty ≠ points | сложность нигде не выводится из баллов |
| §7–8 достаточность сырого балла | закреплено тестом в [rasch-cohort.test.ts](../src/lib/rasch-cohort.test.ts) |
| §136–137 балл — фиксированная функция θ, а не свойство когорты | **этап 1**: [reference-population.ts](../src/lib/reference-population.ts) |
| §233 никакого молчаливого fallback в шкале | **этап 1**: подмена разброса убрана, негодный эталон даёт NaN, а не выдуманный балл |

Ядро модели верное. Проблемы вокруг него.

## Балл зависел от когорты — исправлено на этапе 1

```
Замер до правки, 2026-09-08:
Mock Matematika    55 заданий   mean(b) = 0.0000000000   mean(θ) = −1.836   верных 23.3%   ср. балл = 66.67
Ona Tili           49 заданий   mean(b) = 0.0000000000   mean(θ) = −1.090   верных 35.4%   ср. балл = 33.34
```

**Что было.** Балл считался Z-стандартизацией по когорте ТОГО ЖЕ теста, то есть
люди измерялись относительно самих себя. Средний T всегда выходил ровно 50, а
средний балл — 66.67 из 100. Математика решила 23.3% заданий, оказалась заметно
ниже своего пула (θ = −1.836) и получила те же 66.67; когорта, решившая 5%,
получила бы столько же. Прогресс между месяцами измерить было нельзя, а сильная
когорта понижала балл каждому. Нарушались §136–137: балл не был функцией одной
θ.

**Что оказалось важным.** Методика Агентства (стр. 1–2) предписывает ровно
`Z = (θ−μ)/σ, T = 50 + 10Z` — формула была верная. Ошибка была в том, **какие μ
и σ** брать: БМБА стандартизует по национальной популяции, большой и
неизменной, а мы — по тем же тридцати шести, которых измеряли.

**Что сделано.** μ и σ вынесены в [reference-population.ts](../src/lib/reference-population.ts)
как замороженная версионированная конфигурация. Формула не менялась.
Побочно исчезла молчаливая подмена разброса при вырожденной когорте, нарушавшая
§233 — подменять стало нечего.

Эталон v1 заморожен по фактическим сдачам 2026-09-06, поэтому переход
**воспроизвёл уже показанные баллы один в один: 90 из 90** через реальный код.
Историю переписывать не понадобилось, ревизия по §239 не потребовалась.

**Что этим НЕ решено.** Абсолютной привязки к шкале БМБА по-прежнему нет: она
выводится только эмпирическим линкингом (§268). До него μ и σ — осознанный
placeholder, и эталон слаб: 36 и 54 человека, решившие 23% и 35%. Будущая
сильная когорта получит высокие баллы. Лечится линкингом, а не подкруткой чисел.

Остаётся нерешённым и второе: **каждый тест центрирует шкалу сам** —
`mean(b)` ноль до десятого знака в обоих тестах, у каждого свой произвольный
нуль (§228, §129). Сопоставимость между формами даёт только этап 4.

## Прямые попадания в запреты v4.0

| Норма | У нас |
|---|---|
| §217 при `I(θ)→0` вернуть `INSUFFICIENT_INFORMATION`; §215 «θ существует» ≠ «измерение достаточно» | информация не считается вовсе; статуса качества нет — вместо статуса выдаётся балл |
| §109 estimator versioning, §110 calibration snapshot, §199 provenance, §229 immutability | не версионируется ничего; калибровка перезаписывается upsert-ом |
| §239 **NO SILENT HISTORICAL RECALCULATION** — пересчёт создаёт новую ревизию | миграция 085 перезаписала 90 исторических баллов на месте, ревизии нет. Владелец правку одобрил, но норме она противоречит |
| §237 **NO CROSS-SCALE MIXING** | `averageCertificateScore` усредняет предметы в одно число. Это слой отчётности, не θ, — но требует явной оговорки как composite |
| §201 probability clipping | на практике безопасно: клампы ±8 не дают `P` уйти ниже ≈1e-7; явного clipping нет |

## Остальные расхождения

| № | Норма | Сейчас | Чем подтверждено |
|---|---|---|---|
| 1 | §29, §175 SE у θ и у b | **нет нигде** | `mock_item_calibration` — только `difficulty`, `sample_size`, `calibrated_at`; у `mock_results` ни SE, ни версии |
| 2 | §73–74 MISSING и NOT_REACHED различаются | всё неотвеченное идёт в модель как неверное | **683 из 4700** ответов (≈15%) не отвечены |
| 3 | §50–55 локальная независимость, Yen Q3, testlet | не считается | `group_key` заполнен у **51** задания: группы по 5 вопросов к одному тексту («termitlar», «gazal_sakkokiy») считаются независимыми → точность завышена |
| 4 | §41–47 Infit / Outfit / ZSTD | не считается | ни одно задание не проверено на соответствие |
| 5 | §60–65 DIF, включая филиалы; §270 по языку | не считается | метаданные есть, анализа нет |
| 6 | §120–130 якоря и linking; §162 связность банка | нет | `bank_id` пуст у всех заданий; 20 совпадающих текстов между тестами — случайность, не якоря |
| 7 | §56–58 размерность, residual PCA | не проверяется | |
| 8 | §66–69 дрейф и exposure | не отслеживается | |
| 9 | §115–119 quality status, separation, reliability | нет | `converged`/`iterations` уходят в HTTP-ответ и **нигде не сохраняются** |
| 10 | §192–195 жизненный цикл калибровки, статусы задания | нет | новое задание сразу идёт в operational-расчёт |
| 11 | §79–86 PCM/RSM для политомных | модель дихотомическая | **0 из 4700** ответов с частичным баллом — сегодня данные не искажены, но задания весом до 24 баллов уже есть |
| 12 | §268 привязка к шкале БМБА | нет | линкинга с реальными сертификатами не было; показанный балл — внутренняя величина |
| 13 | §269 таблица raw → балл | нет | балл считается прогоном оценки каждый раз |
| 14 | §272 анализ дистракторов | нет | |
| 15 | §275 отчёт ученику с доверительным интервалом | показывается только балл и буква | |

---

# Часть V. Решения владельца — не менять, не обсудив

Шкалы БМБА и уровней в норме нет (см. «Как читать»), поэтому здесь она и живёт.
Источник — `Baholash_mezoni.pdf` и решения владельца.

- **Итоговый балл: 100 у общеобразовательных, 75 у иностранных языков.**
  T-шкала (0–75) — промежуточная; перевод —
  [certificate-scale.ts](../src/lib/certificate-scale.ts).
- **Уровень A+..C — по ближайшему целому T** («ближе к 65 — значит уровень
  65»). Пороги 70/65/60/55/50/46 заданы на T-шкале, не на сотенной.
- **Балл показывается с одной десятой.** Единственное округление — `roundScore`.
- **Сумма баллов за задания свободная.** `normalizePointsTo75` и гейт «сумма =
  75» сняты специально (`design/FIX.md`, «Две шкалы 75»). Приводить сумму к 100
  нельзя — это вернуло бы самодельную шкалу и нарушило §235.
- **Родной язык — два раздела**: тест по Рашу плюс сочинение по 24-балльному
  критерию, итог — среднее арифметическое ([native-cert.ts](../src/lib/native-cert.ts)).
  Отсюда «половина балла» у тех, кто сочинение не написал.
- **Средние — простым средним по работам**, как у групп и учителей.
- **Placement/Diagnostic не показывает разбор по вопросам** никому, даже
  админу, — только итоговый процент.
- **Проценты остаются только у вступительных тестов**; у моков везде баллы.

---

# Часть VI. Порядок правок

Каждый этап опирается на предыдущий.

- **Этап 0 — этот документ.** Готово.
- **Этап 1 — балл перестаёт зависеть от когорты. Готово.** μ и σ вынесены в
  замороженную версионированную эталонную популяцию
  ([reference-population.ts](../src/lib/reference-population.ts)); формула
  Агентства не менялась. Эталон v1 взят по сдачам 2026-09-06, поэтому уже
  показанные баллы совпали один в один (90 из 90) и ревизия по §239 не
  потребовалась. Осталось из этапа: таблица raw → балл (§269).
- **Этап 2 — точность и статус.** SE у θ и b (§29, §175), информация теста
  (§28), сохранение `converged`/`iterations`, `INSUFFICIENT_INFORMATION` вместо
  молчаливого fallback (§217, §233), quality status (§115). Переход на WLE
  (§267) как operational estimator.
- **Этап 3 — версионирование.** Снимки калибровки (§110), ссылка из результата,
  запись estimator-а (§109), provenance (§199), неизменяемость (§229).
- **Этап 4 — банк и якоря.** Общий банк, якоря в формах, linking (§120–130),
  связность банка (§162). Только после этого «прогресс за месяц» — настоящая
  величина.
- **Этап 5 — диагностика.** Infit/Outfit (§41–44), Yen Q3 по существующему
  `group_key` (§51–55), DIF по филиалу и по языку (§65, §270), размерность
  (§56–57), графический fit (§273), дистракторы (§272). Обнаружение и флаги;
  **удаление заданий — никогда автоматически** (§222–224).
- **Этап 6 — пропуски.** OMITTED и NOT_REACHED (§73–74). Помнить: в режиме
  экзамена пропуск = 0, «missing ≠ wrong» — только для калибровки (§277).
- **Этап 7 — привязка к БМБА (§268).** Сбор учеников с реальными
  сертификатами, common-person linking, критерий приёмки MAE и совпадение
  уровня. Без этого «как в Миллий сертификате» проверить нечем.
- **Этап 8 — позже.** PCM (§79–86), MFRM для проверяющих (§87–93), сборка
  параллельных форм (§271), отчёт ученику (§275).

---

# Часть VII. Запросы для проверки

Ими получены все числа части IV; ими же проверяется, что правки подействовали.

```sql
-- Каждый тест центрирует шкалу сам: mean_b — ноль до десятого знака.
-- После общей шкалы (этап 4) обязан перестать быть нулём.
select mt.title, count(ic.id) as items,
       round(avg(ic.difficulty)::numeric, 10) as mean_b,
       (select round(avg(mr.rasch_score)::numeric,3) from mock_results mr where mr.mock_test_id = mt.id) as mean_theta,
       (select round(avg(mr.level_score)::numeric,2) from mock_results mr where mr.mock_test_id = mt.id) as mean_score
from mock_item_calibration ic join mock_tests mt on mt.id = ic.mock_test_id
group by mt.id, mt.title;

-- Средний балл — константа 66.67 при любой подготовке когорты.
-- После этапа 1 обязан начать зависеть от того, как решали.
select mt.subject_id,
       sum(mr.correct_answers) || '/' || sum(mr.total_questions) as correct_of_asked,
       round(100.0*sum(mr.correct_answers)/nullif(sum(mr.total_questions),0),1) as pct_correct,
       round(avg(mr.level_score),2) as mean_score
from mock_results mr join mock_tests mt on mt.id = mr.mock_test_id
group by mt.subject_id;

-- Доля неотвеченного, которое уходит в модель как неверное (§73–74).
select q.question_type, count(*) as answers,
       count(*) filter (where ad.selected_answer = 'null' or ad.selected_answer is null) as unanswered
from mock_answer_details ad join mock_questions q on q.id = ad.question_id
group by q.question_type order by answers desc;

-- Testlet-группы, которые модель считает независимыми (§50–55).
select mt.title, q.group_key, count(*) as items_in_group
from mock_questions q
join mock_sections s on s.id = q.section_id
join mock_tests mt on mt.id = s.mock_test_id
where q.group_key is not null
group by mt.title, q.group_key having count(*) > 1 order by items_in_group desc;

-- Есть ли вообще частичные баллы (сегодня 0 — политомность не срочна).
select count(*) as genuinely_partial from mock_answer_details
where coalesce(points_earned,0) > 0 and max_points is not null and points_earned < max_points;
```
