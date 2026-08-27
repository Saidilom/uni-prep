# Аудит нового модуля тестов и PDF → AI import

Дата аудита: 25 августа 2026.

## 0. Разбор реального файла `mock 3.pdf`

Файл изучен локально: 13 страниц, стандартный PDF с текстовым слоем и визуальными объектами. Это математический `Milliy sertifikat testi`, Mock test 3, язык — узбекский (латиница), авторская маркировка Ahmadjonov Azamat / Unco Academy.

### Фактическая структура

| Диапазон | Вид задания | Что должен хранить движок |
|---|---|---|
| 1–32 | Single choice, варианты A–D | `single_choice`, четыре option, один answer key |
| 33–35 | Один общий геометрический stimulus и варианты A–F для трёх заданий | `matching_group` с тремя child items и общим choice pool |
| 36–45 | Составное задание с общим условием/рисунком и подпунктами `a`, `b` | `question_group` + два `short_text`/`numeric_expression` child items |

В документе 45 номеров, но **55 фактических полей ответа**: 32 + 3 + 10×2. Поэтому `total_questions` нельзя считать простым количеством верхнеуровневых блоков. Нужны отдельно `display_number` и количество/вес оцениваемых child items.

### Визуальный контент

В PDF присутствуют:

- стереометрические фигуры и кубы;
- координатные графики и окружности;
- графики функций и производных;
- геометрические чертежи;
- цветные схемы;
- формулы, дроби, степени, корни, интервалы, системы и тригонометрия.

Обычное извлечение text layer искажает порядок дробей, индексы, знаки, системы и привязку изображения к вопросу. Например, визуально корректная формула при plain-text extraction распадается на несколько строк и меняет порядок операндов. Значит, для этого проекта Claude должен получать **сам PDF/визуальные страницы**, а text layer использовать только как вспомогательный сигнал.

### Конкретное решение для структуры вопроса

```ts
type TestNode =
  | { type: "single_choice"; options: Choice[]; answerKey?: string }
  | { type: "matching_group"; choices: Choice[]; items: MatchItem[] }
  | { type: "question_group"; stimulusId: string; items: ResponseItem[] };

type ResponseItem = {
  id: string;
  label: string;              // "a" / "b"
  responseType: "short_text" | "number" | "math_expression";
  acceptedAnswers?: AcceptedAnswer[];
  maxPoints: number;
};
```

Для математики `short_text` недостаточно: ответы могут быть `π/8`, `3√2`, интервалы, несколько корней или выражения. Поэтому нужен `math_expression` с канонизацией, а не сравнение сырых строк. В первой версии безопаснее поддержать набор нормализованных допустимых строк/чисел и ручную проверку спорных выражений; полноценную symbolic equivalence можно добавить позже через отдельный sandboxed math engine.

### Изображения и формулы

- Страницу нельзя сохранять одним изображением как весь вопрос: на ней несколько заданий.
- Import pipeline должен извлекать/crop отдельный stimulus для каждого вопроса или группы и сохранять `source_page` + координаты crop.
- Формулу хранить в LaTeX/MathML для адаптивного рендера, но также сохранять crop исходника для review и fallback.
- Claude возвращает и `prompt_latex`, и `source_crop`; редактор показывает их рядом.
- Геометрический рисунок хранится отдельным immutable asset и связывается со stimulus.

### Чего нет в этом PDF

- Нет answer key.
- Нет критериев/баллов для разных частей.
- Нет listening audio или writing rubric.
- Нет явных метаданных сложности/темы у каждого вопроса.

Следовательно, импорт этого файла должен завершаться статусом `needs_answer_key`, а публикация блокируется, пока admin/teacher не заполнит и не проверит ответы и баллы. Claude может предложить решение как `inferred_answer`, но оно не становится официальным ключом автоматически.

### Правильный UX review именно для этого файла

1. Слева — оригинальная страница PDF с подсветкой crop.
2. Справа — распознанный номер, тип, формула, варианты/подпункты.
3. Счётчики: `45 blocks`, `55 response items`, `answer key: missing`.
4. Фильтры: повреждённая формула, не найден рисунок, низкая уверенность, отсутствует ключ.
5. Для 33–35 отдельный matching editor с общим A–F pool.
6. Для 36–45 group editor: общее условие/рисунок сверху, child `a/b` ниже.
7. Только после Preview as Student и заполнения ключей доступна публикация.

## 1. Целевая модель продукта

- **Super Admin** создаёт, импортирует, редактирует и публикует платные Mock-тесты.
- **Teacher** создаёт только бесплатные Mock-тесты и назначает их отдельным ученикам, нескольким ученикам или целому своему классу.
- **Super Admin** видит все тесты, тип теста, статус, автора-учителя, назначения и результаты.
- PDF загружается в черновик импорта. Claude определяет предмет/язык/структуру, извлекает материалы, секции, вопросы, варианты и ключи ответов. Человек обязан проверить результат перед публикацией.
- Модуль поддерживает не только A–D, но reading, listening, writing и универсальные задания остальных предметов.

## 2. Что есть сейчас

Текущая база уже содержит `mock_tests`, `mock_sections`, `mock_questions`, `mock_access`, `mock_results`, классы и `mock_class_assignments`. Есть административный редактор, каталог ученика, player теста, оплата-заглушка, назначения класса и teacher analytics.

Однако нынешняя модель построена вокруг одного типа вопроса:

```text
text + options {a,b,c,d} + correct_answer string + points
```

Она годится только для single-choice. В admin editor всегда рисуются ровно A–D и один правильный ответ. Player тоже хранит `Record<questionId, string>`, а SQL сравнивает строки через точное равенство.

## 3. Блокирующие проблемы текущей реализации

### P0 — доступ и отправка тестов расходятся

UI разрешает:

- бесплатный тест ученику с `isRegistanStudent=true`;
- `class_only` тест ученику из назначенного класса.

Но `submit_mock()` требует строку в `mock_access`. В проекте такая строка создаётся только после успешной оплаты. Поэтому бесплатный/классный тест может открыться, но результат не отправится. Проверка права должна быть одной серверной функцией и учитывать `paid access OR free eligibility OR active assignment`.

### P0 — учитель не может создавать тесты

RLS разрешает запись в `mock_tests`, `mock_sections`, `mock_questions` только admin. Учитель умеет управлять классом/назначением, но отдельного teacher test builder нет. В `mock_tests` отсутствуют `created_by`, `owner_role`, `subject_id`, `status`, поэтому Super Admin не может увидеть автора и жизненный цикл теста.

### P0 — небезопасный upload endpoint

`/api/upload` использует service-role, но не проверяет сессию/роль, MIME, расширение, размер и назначение файла; грузит в публичный bucket. Для экзаменационных PDF и ключей ответов это недопустимо. Нужны private bucket, signed URLs, лимиты, allow-list PDF/audio/image, rate limit и server-side RBAC.

### P0 — секрет Claude нельзя отдавать браузеру

Использовать только `ANTHROPIC_API_KEY` в `.env.local` без префикса `NEXT_PUBLIC_`. Вызовы Claude выполняются только в server route/job. API-ключ никогда не должен попадать в client component, логи или БД.

### P1 — схема вопроса не универсальна

Нет типов multiple-select, true/false/not-given, matching, ordering, gap-fill, short-answer, numeric/formula, table completion, essay, upload, passage/audio stimulus. Нет нормализации допустимых ответов, частичных баллов и ручной проверки writing.

### P1 — нет безопасного workflow черновик → проверка → публикация

Admin editor сразу пишет рабочий тест и при редактировании пересоздаёт секции. Нет версий, draft/published/archived, import job, confidence, warnings, оригинального PDF, page references и возможности сравнить распознанное с источником.

### P1 — ошибки Supabase игнорируются

В административном сохранении почти все `insert/update/delete` выполняются без проверки `error`, поэтому UI может показать завершение после частичной записи. Создание теста, секций и вопросов должно быть одной транзакционной RPC/серверной операцией.

### P1 — SECURITY DEFINER функции требуют усиления

RPC чтения вопросов и отправки теста должны явно проверять пользователя/назначение, фиксировать `search_path`, ограничивать `EXECUTE`, не возвращать ключи ответов и быть устойчивыми к повторной отправке.

### P2 — типы TS не совпадают с реальными snake_case строками БД

Интерфейсы используют `durationMinutes`, `createdAt`, `mockTestId`, но прямые Supabase-запросы возвращают `duration_minutes`, `created_at`, `mock_test_id`. В проекте уже встречаются ручные cast. Нужны generated Database types и единый mapper/domain layer.

## 4. Рекомендуемая универсальная схема

Не привязывать структуру к конкретному предмету. Предмет — metadata, а поведение задают `question_type`, `response_schema` и `scoring_schema`.

### Основные сущности

- `tests`: title, subject_id, language, access_type (`paid|assignment`), price, owner_id, owner_role, status (`draft|review|published|archived`), duration, version.
- `test_sections`: type (`reading|listening|writing|general`), instructions, timer/audio policy, order.
- `stimuli`: reusable passage/image/audio/table/formula, storage path, transcript, source page(s).
- `questions`: type, prompt, stimulus_id, config JSONB, answer_key JSONB, scoring JSONB, max_points, order.
- `test_assignments`: test_id, target_type (`student|class`), target_id, assigned_by, opens_at, due_at, attempt_limit.
- `attempts`: immutable published_version, status, started/submitted timestamps, auto_score, manual_score.
- `responses`: question_id, answer JSONB, auto_score, review_status, reviewer feedback.
- `test_imports`: file_path, status, detected_subject/type/language, model, prompt_version, raw result, warnings, progress, created_by.
- `import_issues`: entity path, page, confidence, severity, message, resolved_by.

### Минимальный набор `question_type`

1. `single_choice`
2. `multiple_choice`
3. `true_false` / `true_false_not_given`
4. `short_text`
5. `gap_fill` (один или несколько blank)
6. `numeric`
7. `matching`
8. `ordering`
9. `table_completion`
10. `essay` (manual review; AI может дать рекомендацию, но не финальный балл по умолчанию)

Reading — passage stimulus + любые вопросы. Listening — audio stimulus + transcript только для проверяющего. Writing — prompt stimulus + essay response + rubric. Такая композиция лучше отдельных таблиц для каждого предмета.

## 5. Claude PDF pipeline

Официальный Claude API умеет принимать PDF как document, видеть текст, изображения, графики и таблицы и возвращать структурированный JSON по JSON Schema. Ограничения API всё равно требуют собственного production pipeline: стандартный незашифрованный PDF, общий request limit 32 MB и лимит страниц, зависящий от модели/context window.

Рекомендуемый процесс:

```text
private upload
  → validation + malware scan
  → import job
  → PDF page/chunk analysis
  → subject + exam-format detection
  → extraction into strict JSON Schema
  → deterministic validation
  → confidence/warnings
  → human review with PDF side-by-side
  → transactional save as draft
  → preview as student
  → publish immutable version
```

Практические правила:

- Не просить модель одновременно распознать огромный PDF и сразу создать production rows.
- Первый проход: document map (subject, sections, page ranges, assets). Второй проход: extraction по секциям/страницам. Третий: consistency check (нумерация, потерянные вопросы, дубликаты, ключи).
- Использовать Structured Outputs (`output_config.format` + JSON Schema), затем ещё раз валидировать результат Zod на сервере.
- Сохранять `source_page`, `source_bbox` при возможности, `confidence`, `needs_review` и исходный фрагмент. Низкая уверенность никогда не публикуется автоматически.
- Ключ ответов лучше принимать отдельным PDF/диапазоном страниц. Если ключа нет, Claude не должен выдумывать correct answer: `answer_key_status = missing|inferred|provided`.
- Для сканов предусмотреть fallback OCR/page images. Для PDF с хорошим text layer достаточно native PDF support Claude.
- Listening PDF обычно содержит только booklet; аудио загружается отдельно. Claude не создаст исходную аудиодорожку из PDF. Нужна связка section ↔ audio asset и ручная проверка таймкодов.
- Writing оценивается по rubric и требует очереди manual review. AI score хранить отдельно как advisory, с моделью/prompt version.

## 6. Готовая библиотека или своя реализация

`SurveyJS Form Library` — MIT, React/TypeScript, JSON-driven, имеет 20+ типов, validation, matrix, text/comment и custom questions. Её можно использовать как renderer/player и ускорить базовые формы. Но экзаменационный authoring, immutable versions, защищённые ключи, listening controls, rubrics, назначения, оплату и Claude import всё равно придётся реализовать самостоятельно. `Survey Creator` требует отдельно проверить лицензию для коммерческого использования; не закладывать его в архитектуру до проверки цены/условий.

Рекомендация для этого репозитория: **собственная каноническая схема + собственный компактный React renderer registry**. SurveyJS можно сделать коротким spike и сравнить UX, но не хранить production данные прямо в vendor JSON. Так не будет vendor lock-in, а текущий брендовый UI останется управляемым.

## 7. Новые экраны

### Teacher

- `Мои тесты`: только созданные этим учителем; draft/published; duplicate/archive.
- `Создать`: вручную или `Импорт из PDF`.
- Review workspace: PDF слева, распознанная структура справа, фильтр `требует проверки`.
- Assignment dialog: отдельные ученики / несколько / весь свой класс, deadline, attempt limit.
- Results: auto-graded + writing pending review.

### Super Admin

- `Платные тесты`: создание/цена/публикация.
- `Тесты учителей`: автор, школа/класс, subject, assignments, attempts, status, moderation.
- `AI imports`: очередь, ошибки, стоимость/tokens, модель, повторный запуск.
- Возможность клонировать teacher test в admin-owned paid test без изменения оригинала.

## 8. RBAC/RLS правила

- Admin: полный CRUD и moderation.
- Teacher: CRUD только `owner_id = auth.uid()` и только `access_type='assignment'`, `price=0`; назначение только своим классам/их ученикам.
- Student: видит только published metadata и тест при серверно подтверждённом entitlement/assignment; никогда не читает `answer_key`.
- Доступ и submit используют одну DB-функцию `can_access_test(test_id, user_id)`.
- Опубликованную версию не редактировать: только новая версия. Attempt ссылается на точную version.
- Цена и роль владельца проверяются БД constraint/trigger/RPC, не только UI.

## 9. План реализации

### Фаза 0 — стабилизация (обязательно сначала)

1. Исправить единый server-side access check для free/paid/assignment.
2. Закрыть `/api/upload`: auth, role, private bucket, allow-list, size limit, rate limit.
3. Добавить проверку ошибок и транзакционное сохранение.
4. Зафиксировать snapshot/backup текущих данных и migration strategy.

### Фаза 1 — новая domain model

5. Миграции новых tests/versions/stimuli/questions/assignments/attempts/responses/imports.
6. Constraints, indexes, RLS, RPC и audit triggers.
7. TypeScript discriminated unions + Zod schemas + generated Supabase types.
8. Backfill текущих A–D mock tests в `single_choice`; старые результаты оставить read-only.

### Фаза 2 — универсальный player/editor

9. Renderer registry для 10 типов вопросов.
10. Авторский editor для admin/teacher с preview.
11. Server-side scoring engine с unit tests; manual review queue для writing.
12. Responsive/mobile и accessibility keyboard/focus testing.

### Фаза 3 — роли и назначения

13. Teacher `Мои тесты`, individual/class assignments.
14. Admin paid-only creation + teacher test oversight/author column.
15. Student catalog: paid tests отдельно от assigned free tests.

### Фаза 4 — Claude import

16. Установить official Anthropic TypeScript SDK и Zod.
17. Private PDF upload + import job state machine.
18. Two/three-pass extraction with structured outputs.
19. Review UI PDF side-by-side, warnings/confidence, retry per section.
20. Observability: tokens/cost/latency/errors/prompt version; deletion/retention policy.

### Фаза 5 — verification

21. Fixtures реальных PDF по каждому формату.
22. Golden tests: expected JSON vs extraction; scoring tests for every question type.
23. RLS tests for admin/teacher/student and answer-key exfiltration.
24. E2E: admin paid, teacher free + student/class assignment, student submit, writing review.

## 10. Переменные окружения

```dotenv
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
TEST_IMPORT_MAX_FILE_MB=...
TEST_IMPORT_RETENTION_DAYS=...
```

`ANTHROPIC_MODEL` лучше задавать конфигурацией, а не пришивать к коду: модели и цены меняются. На момент внедрения выбрать актуальную Sonnet-модель как основной баланс качества/стоимости и более сильную модель только для retry сложных страниц.

## 11. Аудит набора `tests-pdf`

Все предоставленные материалы просмотрены по текстовому слою и визуальной структуре страниц.

| Предмет/папка | Реальные особенности | Требования к движку |
|---|---|---|
| Математика (`mock 3.pdf`) | A–D, matching A–F, графики, геометрия, подпункты a/b, формулы | LaTeX, source page, groupKey, choice + math expression |
| Физика | 45 заданий, формулы/единицы, электрические схемы, графики, открытые подпункты | безопасный math renderer, изображения, numeric/math answers |
| Биология | сложные таблицы/схемы, 40 закрытых и отдельные расширенные работы 41–44 с a–d | table stimulus, groups, extended/manual responses |
| География | карты, диаграммы, таблицы; после закрытой части составные задания | source image/page, group questions, short/numeric answers |
| История | длинные источники, хронология, matching, закрытая и составная открытая часть | shared reading stimulus, matching, short text |
| Русский язык и литература | длинные тексты/произведения, 1–35 закрытые, далее короткие и составные ответы, отдельная essay rubric | reading groups, short text, essay + rubric/manual review |
| Узбекский язык и литература | аналогично: тексты/газели, закрытая и открытая части, отдельные требования к эссе | reading groups, language=uz, essay rubric |
| Английский | предоставлены multilevel scoring rules и B2/C1 writing rubrics, но не полный booklet/audio | reading/listening/writing sections, отдельный audio upload обязателен |

В каталоге приложения также есть химия и информатика, но реальных PDF-образцов по ним в `tests-pdf` сейчас нет. Схема не ограничена фиксированными семью предметами: неизвестный предмет получает `other` и предупреждение для ручной проверки.

## 12. Реализовано по результатам аудита

- Миграция `017_pdf_first_mock_tests.sql`: автор, предмет, язык, status, private PDF, универсальные question fields, individual assignments, imports, RLS, RPC, audit triggers.
- Единая серверная `can_access_mock()` исправляет отправку бесплатных/назначенных тестов.
- Super Admin создаёт через PDF только paid Mock; Teacher — только бесплатный `class_only`. Ограничение продублировано на уровне БД.
- Прямая загрузка PDF в private Supabase Storage через signed URL, без лимита request body хостинга.
- Claude Files API + Structured Outputs + Zod; временный файл Claude удаляется после обработки.
- Review workspace: PDF слева, весь тест одной прокруткой справа, редактирование типа/условия/вариантов/ключей.
- Ученический scroll-player для choice, multiple choice, short/numeric/math и essay; исходная PDF-страница показывается для графиков/карт/рисунков.
- Назначение teacher Mock целому классу или отдельному ученику.
- Admin list показывает все тесты и автора-учителя.
- Миграция `018_mock_manual_review.sql` и teacher results UI: ручной балл/feedback для writing, затем пересчёт итоговой accuracy.

Остаются входные данные, которые нельзя получить из этих PDF автоматически: реальные listening audio, официальные answer keys там, где их нет, и решение организации о процессе утверждения баллов за writing. Claude может предложить `inferred` answer, но UI блокирует публикацию автоматического задания без ключа.

## Источники исследования

- Claude PDF support: https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Claude Structured Outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Claude Files API: https://platform.claude.com/docs/en/build-with-claude/files
- Claude models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- SurveyJS Form Library: https://github.com/surveyjs/survey-library
