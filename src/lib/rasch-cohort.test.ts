import { describe, it, expect } from "vitest";
import { estimateRasch, Observation, mean, stdev, raschThetaToT, MOCK_SCALE_MAX } from "./rasch";
import { gradeLevelFromScore } from "./mock-grade-level";
import { essayPointsToScore75, combineSectionScores } from "./native-cert";
import { tScoreToCertificate, formatScore, certificateMaxForSubject} from "./certificate-scale";
import { REFERENCE_DEFAULT } from "./reference-population";

// Проверка модели Раша на СИНТЕТИЧЕСКОЙ когорте — та самая, о которой просил
// владелец перед экзаменом на 100 человек, но без ботов и без нагрузки на
// боевой сайт.
//
// Идея простая: мы сами задаём ученикам способности и сложности заданиям,
// генерируем ответы ровно по формуле Раша — и смотрим, восстановит ли модель
// то, что мы в неё заложили. Если восстанавливает, значит на настоящих
// работах она посчитает то же самое, а не случайные числа.
//
// Тест детерминированный: ГПСЧ со своим зерном, без Math.random. Иначе он
// падал бы раз в сто прогонов и его перестали бы читать.

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Вероятность верного ответа по Рашу: чем способность выше сложности, тем выше.
const probability = (theta: number, difficulty: number) => 1 / (1 + Math.exp(-(theta - difficulty)));

// Когорта, устроенная как настоящая: способности рассыпаны вокруг нуля,
// задания — от лёгких к трудным.
function buildCohort(personCount: number, itemCount: number, seed: number) {
    const rand = mulberry32(seed);
    const abilities = Array.from({ length: personCount }, (_, n) =>
        // Ровный разброс от -2 до +2 логит плюс небольшой шум: так когорта
        // похожа на класс, где есть и сильные, и слабые.
        -2 + (4 * n) / (personCount - 1) + (rand() - 0.5) * 0.3);
    const difficulties = Array.from({ length: itemCount }, (_, i) =>
        -2 + (4 * i) / (itemCount - 1));

    const observations: Observation[] = [];
    for (let person = 0; person < personCount; person++) {
        for (let item = 0; item < itemCount; item++) {
            const correct = rand() < probability(abilities[person], difficulties[item]) ? 1 : 0;
            observations.push({ person, item, correct: correct as 0 | 1 });
        }
    }
    return { abilities, difficulties, observations };
}

// Коэффициент ранговой корреляции Спирмена — насколько порядок, восстановленный
// моделью, совпал с заложенным.
function spearman(a: number[], b: number[]): number {
    const rank = (xs: number[]) => {
        const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
        const r = new Array(xs.length).fill(0);
        order.forEach(([, idx], position) => { r[idx] = position; });
        return r;
    };
    const ra = rank(a), rb = rank(b);
    const n = a.length;
    const d2 = ra.reduce((sum, x, i) => sum + (x - rb[i]) ** 2, 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
}

// Баллы когорты по той же цепочке, что работает на проде:
// estimateRasch → raschThetaToT (Z-стандартизация) → 0-75.
// Балл считается относительно ЭТАЛОННОЙ популяции, а не сдавших этот тест.
// Раньше здесь стояли mean/stdev самой когорты, и проверки вроде «центр 50»
// были тавтологией: Z-стандартизация даёт центр 50 по определению. Теперь
// эталон внешний, и то же утверждение стало содержательным — синтетическая
// когорта нарочно построена похожей на эталон (θ от −2 до +2, μ≈0, σ≈1.15).
function cohortScores(observations: Observation[], personCount: number, itemCount: number) {
    const { personAbility, itemDifficulty, converged } = estimateRasch(observations, personCount, itemCount);
    const { mu, sigma } = REFERENCE_DEFAULT;
    return {
        personAbility,
        itemDifficulty,
        converged,
        tScores: personAbility.map((theta) => raschThetaToT(theta, mu, sigma)),
    };
}

describe("модель Раша на когорте из 50 (узбекский)", () => {
    const PERSONS = 50, ITEMS = 49;  // 50 заданий минус эссе — оно считается отдельно
    const { abilities, difficulties, observations } = buildCohort(PERSONS, ITEMS, 20260907);
    const { personAbility, itemDifficulty, tScores, converged } = cohortScores(observations, PERSONS, ITEMS);

    it("сходится, а не упирается в предел итераций", () => {
        expect(converged).toBe(true);
    });

    it("восстанавливает порядок учеников по способности", () => {
        // Главная проверка: кого мы задумали сильнее, того модель и ставит выше.
        expect(spearman(abilities, personAbility)).toBeGreaterThan(0.9);
    });

    it("восстанавливает порядок заданий по сложности", () => {
        expect(spearman(difficulties, itemDifficulty)).toBeGreaterThan(0.9);
    });

    it("кто решил больше — у того балл не ниже", () => {
        // Свойство, ради которого модель и берут: балл не должен спорить с
        // числом решённых заданий на одном и том же тесте.
        const correctCount = new Array(PERSONS).fill(0);
        for (const o of observations) correctCount[o.person] += o.correct;
        const pairs = correctCount.map((c, n) => ({ c, t: tScores[n] })).sort((a, b) => a.c - b.c);
        for (let i = 1; i < pairs.length; i++) {
            if (pairs[i].c > pairs[i - 1].c) {
                expect(pairs[i].t).toBeGreaterThanOrEqual(pairs[i - 1].t);
            }
        }
    });

    it("шкала совпадает с документом: T = 50 + 10·(θ−μ)/σ", () => {
        // Проверяем саму формулу из Baholash_mezoni.pdf относительно ЭТАЛОНА, а
        // не то, что когорта попала в центр. Прежний тест требовал центр 50 и
        // разброс 10 — но при Z-стандартизации по своей же когорте это верно по
        // определению, то есть тавтология. Теперь эталон внешний, и когорта
        // вправе стоять где угодно: этот разброс вышел 13, потому что когорта
        // разбросана шире эталонной сигмы, и это правильный ответ.
        const { mu, sigma } = REFERENCE_DEFAULT;
        expect(mean(tScores)).toBeCloseTo(50 + 10 * (mean(personAbility) - mu) / sigma, 0);
        expect(stdev(tScores)).toBeCloseTo(10 * stdev(personAbility) / sigma, 0);
    });

    it("баллы не схлопываются и не упираются все в край", () => {
        // Если бы когорта получила один и тот же балл, экзамен ничего бы не
        // различал — а именно так вело себя старое поведение с подставными 50.
        const unique = new Set(tScores);
        expect(unique.size).toBeGreaterThan(10);
        expect(Math.min(...tScores)).toBeLessThan(45);
        expect(Math.max(...tScores)).toBeGreaterThan(55);
        expect(tScores.filter((t) => t === 0).length).toBeLessThan(PERSONS * 0.1);
        expect(tScores.filter((t) => t === MOCK_SCALE_MAX).length).toBeLessThan(PERSONS * 0.1);
    });

    it("ни одного NaN и всё внутри шкалы", () => {
        for (const t of tScores) {
            expect(Number.isFinite(t)).toBe(true);
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(MOCK_SCALE_MAX);
        }
    });

    it("уровни A+..C распределяются, а не сваливаются в один", () => {
        // Обёртка обязательна: .map передаёт индекс вторым аргументом, и раньше он
        // молча попадал в шкалу — все баллы становились A+. Теперь так не
        // скомпилируется, но и писать надо явно.
        const levels = new Set(tScores.map((t) => gradeLevelFromScore(t)));
        expect(levels.size).toBeGreaterThan(2);
        // Сверка порогов с документом на самих полученных баллах. Полосы —
        // полуоткрытые интервалы по ТОЧНОМУ T, без округления в полосу
        // (ТЗ §0.3, см. gradeLevelFromScore).
        for (const t of tScores) {
            const level = gradeLevelFromScore(t);
            if (t >= 70) expect(level).toBe("A+");
            else if (t >= 65) expect(level).toBe("A");
            else if (t >= 60) expect(level).toBe("B+");
            else if (t >= 55) expect(level).toBe("B");
            else if (t >= 50) expect(level).toBe("C+");
            else if (t >= 46) expect(level).toBe("C");
            else expect(level).toBe("below_c");
        }
    });

    // Решение владельца от 2026-09-10: сотня всем, английскому 75. Балл и
    // порог уровня по-прежнему одно число, но уже на шкале показа: пороги
    // масштабируются вместе с баллом (levelFloorsFor).
    it("итоговый балл узбекского выдаётся из 100, пропорционально T", () => {
        const max = certificateMaxForSubject("uzbek");
        expect(max).toBe(100);
        for (const t of tScores) {
            const certificate = tScoreToCertificate(t, "uzbek");
            expect(certificate).toBeGreaterThanOrEqual(0);
            expect(certificate).toBeLessThanOrEqual(max);
            // Пропорция, а не равенство: T = 50 даёт 66,7 из 100.
            expect(certificate).toBeCloseTo(t / MOCK_SCALE_MAX * max, 1);
        }
    });

    // Балл показывается с одной десятой, поэтому и полоса берётся от него же,
    // а не от неокруглённого T: иначе ученик с T = 64,96 увидел бы «65,0»
    // рядом с буквой B+. Границы у БМБА заданы с той же точностью 0.1 (§L.8).
    it("буква согласована с тем баллом, который показан", () => {
        for (const t of tScores) {
            const certificate = tScoreToCertificate(t, "uzbek");
            const shown = Number(formatScore(certificate).replace(",", "."));
            expect(gradeLevelFromScore(shown)).toBe(gradeLevelFromScore(certificate));
        }
    });

    // Свойство модели Раша, о которое разбивается ожидание «десятые разведут
    // всех»: сырой балл — достаточная статистика, поэтому одинаковое число
    // верных ответов даёт в точности одинаковую способность и одинаковый балл.
    // На проде это подтвердилось буквально — разброс θ внутри такой группы
    // равен нулю. Десятые убирают искусственное слипание от округлений, но
    // настоящие ничьи остаются, и это правильно.
    it("одинаковое число верных даёт одинаковый балл", () => {
        const rawByPerson = new Array(PERSONS).fill(0);
        for (const obs of observations) rawByPerson[obs.person] += obs.correct;

        const byRaw = new Map<number, number[]>();
        rawByPerson.forEach((raw, n) => {
            const bucket = byRaw.get(raw) ?? [];
            bucket.push(tScores[n]);
            byRaw.set(raw, bucket);
        });

        let checkedGroups = 0;
        for (const scores of Array.from(byRaw.values())) {
            if (scores.length < 2) continue;
            checkedGroups++;
            for (const score of scores) expect(score).toBeCloseTo(scores[0], 8);
        }
        // Иначе тест молча ничего не проверял бы.
        expect(checkedGroups).toBeGreaterThan(0);
    });
});

describe("узбекский: два раздела — тест и сочинение", () => {
    const PERSONS = 50, ITEMS = 49;
    const { observations } = buildCohort(PERSONS, ITEMS, 777);
    const { tScores } = cohortScores(observations, PERSONS, ITEMS);

    it("сочинение поднимает итог, а не пропадает", () => {
        // На проде это и было сломано: эссе на 20 из 24 уходило в модель как
        // проваленное задание. Теперь это отдельный раздел.
        const testSection = tScores[10];
        const essaySection = essayPointsToScore75(20, 24);
        const total = combineSectionScores([testSection, essaySection])!;

        // Таблица перевода сочинения остаётся целочисленной: её значения — это
        // сам документ (Baholash_mezoni.pdf, стр. 3-4), а не наше округление.
        expect(essaySection).toBe(67);
        expect(total).toBeCloseTo((testSection + essaySection) / 2, 10);
        expect(total).toBeGreaterThan(testSection);
    });

    it("несданное сочинение обнуляет свой раздел, но не весь балл", () => {
        const testSection = tScores[40];
        const total = combineSectionScores([testSection, essayPointsToScore75(0, 24)])!;
        expect(total).toBeCloseTo(testSection / 2, 10);
    });

    it("математика без сочинения считается одним разделом", () => {
        // Раздел один — среднее равно самому Rasch-баллу, ничего не делится.
        const testSection = tScores[25];
        expect(combineSectionScores([testSection])).toBe(testSection);
    });
});

describe("масштаб: 100 учеников × 50 заданий", () => {
    const PERSONS = 100, ITEMS = 50;
    const { abilities, observations } = buildCohort(PERSONS, ITEMS, 424242);

    it("отрабатывает быстро и даёт осмысленные баллы", () => {
        const startedAt = Date.now();
        const { personAbility, tScores, converged } = cohortScores(observations, PERSONS, ITEMS);
        const elapsed = Date.now() - startedAt;

        // Пересчёт идёт внутри роута с maxDuration = 300 c. Здесь важно
        // убедиться, что сама математика занимает секунды, а не минуты.
        expect(elapsed).toBeLessThan(10_000);
        expect(converged).toBe(true);
        expect(spearman(abilities, personAbility)).toBeGreaterThan(0.9);
        expect(tScores.every((t) => Number.isFinite(t))).toBe(true);
        expect(new Set(tScores).size).toBeGreaterThan(15);
    });
});

describe("вырожденные случаи, на которых экзамен не должен падать", () => {
    it("все ответили одинаково — балл всё равно есть", () => {
        // Когорта без разброса. Раньше это ломало расчёт: σ бралась из когорты и
        // обращалась в ноль. С внешним эталоном такого случая просто нет.
        const observations: Observation[] = [];
        for (let person = 0; person < 5; person++) {
            for (let item = 0; item < 10; item++) {
                observations.push({ person, item, correct: item < 5 ? 1 : 0 });
            }
        }
        const { tScores } = cohortScores(observations, 5, 10);
        for (const t of tScores) {
            expect(Number.isFinite(t)).toBe(true);
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(MOCK_SCALE_MAX);
        }
    });

    // Главный тест Этапа 1 и страховка от возврата дефекта.
    //
    // Было измерено на проде: средний T всегда выходил ровно 50, а средний балл
    // — 66.67 из 100, потому что μ и σ брались из когорты того же теста.
    // Математика решила 23.3% заданий и получила те же 66.67; когорта,
    // решившая 5%, получила бы столько же. Сильная когорта при этом понижала
    // балл каждому.
    it("чужие результаты не меняют балл ученика", () => {
        const ITEMS = 20;
        // Слабая когорта: пятеро решают по 6 заданий из 20.
        const weak: Observation[] = [];
        for (let person = 0; person < 5; person++) {
            for (let item = 0; item < ITEMS; item++) {
                weak.push({ person, item, correct: item < 6 ? 1 : 0 });
            }
        }
        // Та же пятёрка плюс пятеро сильных, решивших по 18 из 20.
        const mixed: Observation[] = weak.map((o) => ({ ...o }));
        for (let person = 5; person < 10; person++) {
            for (let item = 0; item < ITEMS; item++) {
                mixed.push({ person, item, correct: item < 18 ? 1 : 0 });
            }
        }

        const alone = cohortScores(weak, 5, ITEMS).tScores;
        const together = cohortScores(mixed, 10, ITEMS).tScores.slice(0, 5);

        // Сложность заданий переоценивается по новой матрице ответов, поэтому
        // абсолютного совпадения ждать нельзя — но балл слабых ОБЯЗАН остаться
        // низким, а не подтянуться к середине шкалы из-за появления сильных.
        for (const t of together) {
            expect(t).toBeLessThan(50);
        }
        // И порядок сохраняется: сильные выше слабых, а не «все около 50».
        const strong = cohortScores(mixed, 10, ITEMS).tScores.slice(5);
        for (const s of strong) {
            for (const w of together) expect(s).toBeGreaterThan(w);
        }
        // Прежнее поведение давало ровно 50 в среднем в ОБОИХ случаях —
        // теперь средние обязаны различаться.
        expect(mean(alone)).not.toBeCloseTo(mean(cohortScores(mixed, 10, ITEMS).tScores), 1);
    });

    it("один сдавший — балл есть и он не середина шкалы наугад", () => {
        const observations: Observation[] = Array.from({ length: 10 }, (_, item) => ({
            person: 0, item, correct: (item < 7 ? 1 : 0) as 0 | 1,
        }));
        const { tScores } = cohortScores(observations, 1, 10);
        expect(Number.isFinite(tScores[0])).toBe(true);
        expect(tScores[0]).toBeGreaterThan(0);
    });

    it("решивший всё стоит выше не решившего ничего", () => {
        const observations: Observation[] = [];
        for (let item = 0; item < 10; item++) {
            observations.push({ person: 0, item, correct: 1 });
            observations.push({ person: 1, item, correct: 0 });
        }
        const { tScores } = cohortScores(observations, 2, 10);
        expect(tScores[0]).toBeGreaterThan(tScores[1]);
    });
});
