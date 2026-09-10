import { describe, it, expect } from "vitest";
import { estimateRasch, Observation, raschThetaToT, mean, stdev, MOCK_SCALE_MAX } from "./rasch";
import { REFERENCE_DEFAULT } from "./reference-population";
import { certificateMaxForSubject, tScoreToCertificate, tScoreToCertificateExact, formatScore, CERTIFICATE_MAX } from "./certificate-scale";
import { gradeLevelFromScore, gradeLevelDisplay, levelFloorsFor } from "./mock-grade-level";
import { essayPointsToScore75, combineSectionScores, isNativeCertSubject } from "./native-cert";
import { MOCK_SUBJECTS } from "./mock-import-schema";

// НАГЛЯДНАЯ ПРОВЕРКА ВСЕЙ ЦЕПОЧКИ: ответы → θ → T → балл → буква.
//
// Тест отвечает на два вопроса владельца одними числами:
//   1. у всех ли предметов потолок 75;
//   2. работает ли модель Раша — то есть зависит ли балл от того, КАК решали,
//      а не от того, кто ещё сдавал.
//
// Он печатает таблицы, а не только «passed»: смотреть глазами тут важнее, чем
// зелёную галочку. Прогон — `npx vitest run certificate-chain`.
//
// Детерминирован: ГПСЧ со своим зерном, без Math.random. Иначе таблицы
// менялись бы от запуска к запуску и сверить их с прошлым разом было бы нельзя.

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const probability = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

// Ранговая корреляция Спирмена: совпал ли ПОРЯДОК, а не сами числа. Для
// сложностей это и есть нужная мера — логит-шкала определена с точностью до
// сдвига (§6), поэтому сравнивать b поштучно бессмысленно.
function spearman(a: number[], b: number[]): number {
    const rank = (xs: number[]) => {
        const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
        const r = new Array(xs.length).fill(0);
        order.forEach(([, idx], position) => { r[idx] = position; });
        return r;
    };
    const ra = rank(a);
    const rb = rank(b);
    const ma = mean(ra);
    const mb = mean(rb);
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < ra.length; i++) {
        cov += (ra[i] - ma) * (rb[i] - mb);
        va += (ra[i] - ma) ** 2;
        vb += (rb[i] - mb) ** 2;
    }
    return cov / Math.sqrt(va * vb);
}

// Полная цепочка одного предмета: из θ получить то, что увидит ученик.
function scoreFromTheta(theta: number, subjectId: string) {
    const t = raschThetaToT(theta, REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma);
    const score = tScoreToCertificate(t, subjectId);
    const max = certificateMaxForSubject(subjectId);
    // Максимум обязателен: буква считается по шкале ПОКАЗА этого предмета.
    return { t, score, max, level: gradeLevelFromScore(score, { max: max }) };
}

const pad = (v: unknown, w: number) => String(v).padEnd(w);
const num = (v: number, w: number, d = 1) => v.toFixed(d).padStart(w);

// ─────────────────────────────────────────────────────────────────────────────

describe("1. Потолок: 100 у всех, 75 у английского", () => {
    it("одна шкала на все предметы, и она видна в баллах порогов", () => {
        const rows: string[] = [];
        rows.push(`${pad("предмет", 12)} ${pad("потолок", 8)} ${pad("T=75", 6)} ${pad("T=70", 6)} ${pad("T=46", 6)} ${pad("T=45.9", 7)} буква на T=46`);
        for (const subject of MOCK_SUBJECTS) {
            const max = certificateMaxForSubject(subject);
            const top = tScoreToCertificate(MOCK_SCALE_MAX, subject);
            const aPlus = tScoreToCertificate(70, subject);
            const atC = tScoreToCertificate(46, subject);
            const belowC = tScoreToCertificate(45.9, subject);
            // Буква — от ТОЧНОГО балла, как и в роуте: округление до десятой
            // может унести значение под порог (61.3333 → 61.3 < 61.3333).
            const atCExact = tScoreToCertificateExact(46, subject);
            const belowCExact = tScoreToCertificateExact(45.9, subject);

            // Решение владельца от 2026-09-10: сотня всем, английскому 75.
            // Английские 75 — норма из Multilevel-bm.pdf, не наш выбор.
            expect(max).toBe(subject === "english" ? 75 : 100);
            expect(top).toBe(max);
            // Балл и порог уровня — одно и то же число НА СВОЕЙ шкале. Именно
            // этого не было на прежней сотенной шкале, где балл растягивали, а
            // пороги оставляли от семидесяти пяти.
            const floors = new Map(levelFloorsFor(max));
            expect(atC).toBeCloseTo(floors.get("C")!, 1);
            expect(aPlus).toBeCloseTo(floors.get("A+")!, 1);
            // Буква — по шкале ЭТОГО предмета: atC получен из T = 46, то есть
            // ровно порог C, на какой шкале его ни показывай.
            expect(gradeLevelFromScore(atCExact, { max: max })).toBe("C");
            expect(gradeLevelFromScore(belowCExact, { max: max })).toBe("below_c");

            rows.push(`${pad(subject, 12)} ${pad(max, 8)} ${num(top, 6)} ${num(aPlus, 6)} ${num(atC, 6)} ${num(belowC, 7)}  ${gradeLevelDisplay(gradeLevelFromScore(atC), "ru")}`);
        }
        console.log("\n" + rows.join("\n") + "\n");
        expect(CERTIFICATE_MAX).toBe(75);
    });

    it("выше своего потолка балл не выдаётся ни при какой способности", () => {
        // Даже у ученика, который решил всё, и даже если θ уехала в клампы ±8.
        for (const subject of MOCK_SUBJECTS) {
            for (const theta of [2, 4, 8, 100]) {
                const { score } = scoreFromTheta(theta, subject);
                expect(score).toBeLessThanOrEqual(certificateMaxForSubject(subject));
            }
            expect(scoreFromTheta(-100, subject).score).toBe(0);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("2. Цепочка целиком: что видит ученик при разной подготовке", () => {
    it("чем больше решено, тем выше балл — и это видно по шагам", () => {
        const ITEMS = 55;
        const rand = mulberry32(20260908);
        // Задания от лёгких к трудным, как в настоящем тесте.
        const difficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));

        // Семь учеников с заданной способностью — от очень слабого к очень
        // сильному. Ответы генерируются по формуле Раша, а не подставляются.
        const trueAbilities = [-2.5, -1.5, -0.5, 0, 0.5, 1.5, 2.5];
        const observations: Observation[] = [];
        // Чтобы модель имела на чём калиброваться, добавляем фоновую когорту:
        // задания оцениваются по всем сдавшим, это свойство модели, не костыль.
        const background = Array.from({ length: 60 }, (_, n) => -2 + (4 * n) / 59);
        const allAbilities = [...trueAbilities, ...background];
        for (let p = 0; p < allAbilities.length; p++) {
            for (let i = 0; i < ITEMS; i++) {
                observations.push({ person: p, item: i, correct: rand() < probability(allAbilities[p], difficulties[i]) ? 1 : 0 });
            }
        }

        const { personAbility } = estimateRasch(observations, allAbilities.length, ITEMS);
        const correctByPerson = new Array(allAbilities.length).fill(0);
        for (const o of observations) correctByPerson[o.person] += o.correct;

        const rows: string[] = [];
        rows.push(`${pad("верных", 9)} ${pad("%", 6)} ${pad("θ (логиты)", 11)} ${pad("T", 6)} ${pad("балл", 6)} ${pad("из", 4)} буква`);
        const scores: number[] = [];
        for (let p = 0; p < trueAbilities.length; p++) {
            const { t, score, max, level } = scoreFromTheta(personAbility[p], "math");
            scores.push(score);
            const correct = correctByPerson[p];
            rows.push(
                `${pad(`${correct}/${ITEMS}`, 9)} ${num((correct / ITEMS) * 100, 5, 0)}% ` +
                `${num(personAbility[p], 11, 3)} ${num(t, 6)} ${num(score, 6)} ${pad(max, 4)} ${gradeLevelDisplay(level, "ru")}`
            );
        }
        console.log("\n" + rows.join("\n") + "\n");

        // Монотонность: сильнее решил — выше балл. Без неё измерение бессмысленно.
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
        // И шкала не выродилась в одну точку, как было при когортной Z.
        expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(30);
    });

    it("способность вровень со средним заданием даёт ровно 50", () => {
        // Смысл точки отсчёта: 50 — не «середина класса», а «вровень со средним
        // заданием теста». Это и делает балл абсолютным, а не рейтинговым.
        const { t, score, level } = scoreFromTheta(0, "math");
        expect(t).toBe(50);
        // T = 50 — это по-прежнему «вровень со средним заданием». На шкале
        // показа математики оно выражается как 66,7 из 100, а буква остаётся
        // той же: C+ начинается с T = 50.
        expect(score).toBe(66.7);
        expect(level).toBe("C+");
        console.log(`\nθ = 0  →  T = ${t}  →  балл ${formatScore(score)} из 100  →  ${level}`);
        console.log(`θ = +1 →  T = ${scoreFromTheta(1, "math").t}  →  одна логита стоит 10 баллов`);
        console.log(`θ = −1 →  T = ${scoreFromTheta(-1, "math").t}\n`);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("3. Главное: балл больше НЕ зависит от того, кто ещё сдавал", () => {
    // Именно это было сломано. Балл считался Z-стандартизацией по когорте того
    // же теста, то есть человек измерялся относительно самих измеряемых: на
    // проде средний T выходил ровно 50 при любой подготовке, а средний балл —
    // 66.67 из 100. Тут это показано на числах.
    it("один и тот же набор ответов даёт один балл в сильной и в слабой группе", () => {
        const ITEMS = 40;
        const difficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));

        // Ученик-эталон: ФИКСИРОВАННЫЙ набор ответов, одинаковый в обоих
        // прогонах — верны первые 22 задания (самые лёгкие).
        const probePattern: Array<0 | 1> = Array.from({ length: ITEMS }, (_, i) => (i < 22 ? 1 : 0));

        const runWithCohort = (label: string, cohortCenter: number, seed: number) => {
            const rand = mulberry32(seed);
            const peers = Array.from({ length: 40 }, (_, n) => cohortCenter - 1 + (2 * n) / 39);
            const observations: Observation[] = [];
            // person 0 — эталон, дальше группа.
            probePattern.forEach((correct, item) => observations.push({ person: 0, item, correct }));
            peers.forEach((ability, idx) => {
                for (let item = 0; item < ITEMS; item++) {
                    observations.push({ person: idx + 1, item, correct: rand() < probability(ability, difficulties[item]) ? 1 : 0 });
                }
            });

            const { personAbility } = estimateRasch(observations, peers.length + 1, ITEMS);
            const probeTheta = personAbility[0];

            // Как считается СЕЙЧАС: относительно эталонной популяции.
            const now = scoreFromTheta(probeTheta, "math");
            // Как считалось РАНЬШЕ: относительно самой когорты.
            const cohortMean = mean(personAbility);
            const cohortSd = stdev(personAbility);
            const tOld = Math.max(0, Math.min(75, 50 + 10 * ((probeTheta - cohortMean) / (cohortSd || 1))));

            return { label, probeTheta, now, tOld, cohortMean };
        };

        const weak = runWithCohort("слабая группа", -1.5, 11);
        const strong = runWithCohort("сильная группа", 1.5, 12);

        const rows: string[] = [];
        rows.push(`Ученик-эталон: одни и те же 22 верных из ${ITEMS} в обоих прогонах.\n`);
        rows.push(`${pad("окружение", 16)} ${pad("θ группы", 10)} ${pad("θ ученика", 11)} ${pad("балл СЕЙЧАС", 12)} балл ПО-СТАРОМУ`);
        for (const r of [weak, strong]) {
            rows.push(
                `${pad(r.label, 16)} ${num(r.cohortMean, 10, 2)} ${num(r.probeTheta, 11, 3)} ` +
                `${num(r.now.score, 12)} ${num(r.tOld, 14)}`
            );
        }
        const nowGap = Math.abs(weak.now.score - strong.now.score);
        const oldGap = Math.abs(weak.tOld - strong.tOld);
        rows.push(`\nразброс балла из-за окружения:  СЕЙЧАС ${nowGap.toFixed(1)}   ПО-СТАРОМУ ${oldGap.toFixed(1)}`);
        console.log("\n" + rows.join("\n") + "\n");

        // Сейчас окружение почти не влияет: остаётся только погрешность оценки
        // сложностей на выборке в 41 человека.
        expect(nowGap).toBeLessThan(4);
        // А по-старому тот же ученик получал принципиально разные баллы —
        // именно это и чинилось.
        expect(oldGap).toBeGreaterThan(20);
        expect(oldGap).toBeGreaterThan(nowGap * 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("4. Свойства модели, без которых балл был бы произвольным", () => {
    const ITEMS = 30;
    const PERSONS = 80;
    const rand = mulberry32(777);
    const trueDifficulties = Array.from({ length: ITEMS }, (_, i) => -2 + (4 * i) / (ITEMS - 1));
    const abilities = Array.from({ length: PERSONS }, (_, n) => -2 + (4 * n) / (PERSONS - 1));
    const observations: Observation[] = [];
    for (let p = 0; p < PERSONS; p++) {
        for (let i = 0; i < ITEMS; i++) {
            observations.push({ person: p, item: i, correct: rand() < probability(abilities[p], trueDifficulties[i]) ? 1 : 0 });
        }
    }
    const result = estimateRasch(observations, PERSONS, ITEMS);

    it("модель сошлась, а не выдала что попало", () => {
        expect(result.converged).toBe(true);
        console.log(`\nсходимость: да, за ${result.iterations} итераций\n`);
    });

    it("сложность заданий восстанавливается из ответов, а не берётся из баллов", () => {
        // Задания мы делали от лёгких к трудным; модель обязана увидеть тот же
        // порядок, ничего не зная о нём заранее.
        //
        // Мерим ранговой корреляцией, а не «сколько соседних пар переставлено».
        // Соседние задания здесь отличаются на 4/29 ≈ 0.14 логиты, а погрешность
        // оценки b на 80 учениках — порядка 0.25. То есть перестановка СОСЕДЕЙ
        // ожидаема и правильна: модель честно говорит «эти два задания одинаковы
        // по сложности». Ошибкой было бы перепутать лёгкое с трудным.
        const estimated = result.itemDifficulty;
        const rho = spearman(trueDifficulties, estimated);
        const mae = mean(trueDifficulties.map((b, i) => Math.abs(b - estimated[i])));

        const rows = [`${pad("задание", 9)} ${pad("заложено b", 11)} оценено b`];
        for (const i of [0, 7, 14, 21, 29]) {
            rows.push(`${pad(`#${i + 1}`, 9)} ${num(trueDifficulties[i], 11, 2)} ${num(estimated[i], 10, 2)}`);
        }
        rows.push(`\nранговая корреляция с заложенной сложностью: ${rho.toFixed(3)}`);
        rows.push(`средняя ошибка: ${mae.toFixed(2)} логиты (шаг между соседними заданиями — 0.14)`);
        console.log("\n" + rows.join("\n") + "\n");

        expect(rho).toBeGreaterThan(0.95);
        expect(mae).toBeLessThan(0.4);
        // §6: шкала сложностей центрирована — это и делает θ = 0 осмысленным.
        expect(mean(estimated)).toBeCloseTo(0, 8);
    });

    it("одинаковое число верных даёт в точности одинаковый балл", () => {
        // Достаточность сырого балла (B.6). На проде подтвердилось буквально:
        // разброс θ внутри такой группы равен нулю.
        const correctByPerson = new Array(PERSONS).fill(0);
        for (const o of observations) correctByPerson[o.person] += o.correct;
        const byRaw = new Map<number, number[]>();
        correctByPerson.forEach((raw, p) => {
            const bucket = byRaw.get(raw) ?? [];
            bucket.push(scoreFromTheta(result.personAbility[p], "math").score);
            byRaw.set(raw, bucket);
        });
        let checked = 0;
        for (const scores of Array.from(byRaw.values())) {
            if (scores.length < 2) continue;
            checked++;
            for (const s of scores) expect(s).toBe(scores[0]);
        }
        expect(checked).toBeGreaterThan(0);
        console.log(`\nпроверено групп с одинаковым числом верных: ${checked} — внутри каждой балл совпал до последнего знака\n`);
    });

    it("буква всегда согласована с показанным баллом", () => {
        // Полоса берётся от округлённого балла, а не от точного T (L.8):
        // иначе рядом с «65,0» могла стоять буква B+.
        for (let p = 0; p < PERSONS; p++) {
            const { score, level, max } = scoreFromTheta(result.personAbility[p], "math");
            const shown = Number(formatScore(score).replace(",", "."));
            expect(gradeLevelFromScore(shown, { max: max })).toBe(level);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("5. Родной язык: два раздела, шкала показа 100", () => {
    it("сочинение усредняется с тестом, потолок остаётся своим", () => {
        expect(isNativeCertSubject("uzbek")).toBe(true);
        const nativeMax = certificateMaxForSubject("uzbek");   // 100
        const raschT = 60; // условный балл за тестовую часть

        const rows: string[] = [`${pad("сочинение", 14)} ${pad("раздел 1", 9)} ${pad("раздел 2", 9)} ${pad("итог", 6)} ${pad("из", 4)} буква`];
        for (const [label, earned] of [["не написано", 0], ["12 из 24", 12], ["24 из 24", 24]] as const) {
            const essayT = essayPointsToScore75(earned, 24);
            const combined = combineSectionScores([raschT, essayT])!;
            const score = tScoreToCertificate(combined, "uzbek");
            const level = gradeLevelFromScore(score, { max: nativeMax });
            // Разделы усредняются на T-шкале (0–75), и только потом балл
            // растягивается до шкалы показа этого предмета.
            expect(score).toBeLessThanOrEqual(nativeMax);
            rows.push(`${pad(label, 14)} ${num(raschT, 9)} ${num(essayT, 9)} ${num(score, 6)} ${pad(nativeMax, 4)} ${gradeLevelDisplay(level, "ru")}`);
        }
        console.log("\n" + rows.join("\n") + "\n");

        // Ненаписанное сочинение делит балл на два — это политика оценивания
        // (A.3: в режиме экзамена пропуск не даёт баллов), и по таблице
        // документа ноль даёт ровно 0, а не нижнюю границу шкалы.
        expect(essayPointsToScore75(0, 24)).toBe(0);
        // T = (60 + 0) / 2 = 30, а на шкале показа узбекского это 40 из 100.
        expect(combineSectionScores([raschT, 0])).toBe(30);
        expect(tScoreToCertificate(combineSectionScores([raschT, 0])!, "uzbek")).toBe(40);
    });
});
