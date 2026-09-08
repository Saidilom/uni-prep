// Rasch (1-parameter logistic / 1PL IRT) model — Группа 7 из
// PLAN-REGISTAN-V3.md, задача 36 (математическая спецификация).
// ============================================
// Model:
//   P(correct | theta_n, b_i) = exp(theta_n - b_i) / (1 + exp(theta_n - b_i))
// where theta_n is the ability of person n and b_i is the difficulty of
// item i, both expressed in logits on the same scale.
//
// Identification constraint: mean(b_i) = 0 — the item difficulty scale is
// centered on itself every iteration (standard Rasch convention), which is
// what makes theta_n and b_i separately identifiable instead of only their
// difference.
//
// Estimation: Joint Maximum Likelihood Estimation (JMLE) via alternating
// Newton-Raphson passes — all item difficulties first (using the current
// abilities), then all person abilities (using the just-updated
// difficulties) — repeated to convergence. This sequential (Gauss-Seidel
// style) order converges markedly faster and more stably than updating
// both blocks from the same stale snapshot: each half-pass always works
// off the freshest available estimate of the other block. Supports
// incomplete data (not every person needs to have answered every item) —
// each parameter is updated only from whichever observations actually
// involve it.
//
// Perfect scores (all-correct or all-incorrect, for a person or an item)
// have no finite ML solution — the expected score keeps approaching the
// boundary without ever reaching the observed score, so the estimate would
// diverge to +/-Infinity. Applies Wright & Panchapakesan's (1969) standard
// extreme-score correction: the observed score is nudged by 0.3 toward the
// interior before estimating, which keeps those persons/items on the scale
// as a large-but-finite ability/difficulty instead.
//
// That correction alone isn't enough for the small/sparse samples this app
// will actually see early on (a handful of attempts on a given Mock test):
// near-separated response patterns can still send a plain Newton-Raphson
// step size to infinity (information -> 0 while the residual doesn't
// shrink fast enough). So every step is soft-damped via tanh (barely
// touches small, near-convergence deltas, but bounds large ones to at most
// 1 logit per iteration) and every parameter is hard-clamped to +-8
// logits, which is standard practice in production IRT software (e.g.
// Winsteps) and is wide enough to represent any realistic ability/
// difficulty (+-8 logits is already >99.9% vs <0.1% probability — anything
// beyond that carries no further practical distinction).
//
// Two more things a randomized numerical test (src/lib/rasch.test.ts)
// caught that reasoning alone didn't:
// 1. Convergence must be measured from the ACTUALLY APPLIED (post-clamp)
//    change, not the raw Newton delta — a parameter pinned at a clamp
//    boundary keeps producing the same large raw delta forever even though
//    its value has stopped moving, which made the old check never fire.
// 2. This sequential/coordinate-descent update (no cross theta/b Hessian
//    terms) can settle into a small but perfectly stable limit cycle
//    instead of a fixed point on some datasets — verified numerically: the
//    step size plateaus at a constant nonzero value indefinitely, not just
//    slowly. A step scale that decays with iteration count (Robbins-Monro
//    style) guarantees the applied step eventually shrinks below any
//    tolerance regardless, breaking the cycle without slowing down the
//    normal (already-converges-in-a-few-iterations) case, since the decay
//    is negligible for small iteration counts.

export type Observation = { person: number; item: number; correct: 0 | 1 };

export type RaschResult = {
    itemDifficulty: number[]; // length = itemCount, mean 0
    personAbility: number[]; // length = personCount
    iterations: number;
    converged: boolean;
};

const EXTREME_ADJUSTMENT = 0.3;
const MAX_STEP = 1.0;
const PARAM_CLAMP = 8;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
// Soft-clip via tanh instead of a hard cap: leaves small deltas (near
// convergence) essentially untouched, so genuine Newton-Raphson steps
// still shrink to zero instead of oscillating between +-MAX_STEP forever.
// stepScale additionally decays with iteration count so a persistent limit
// cycle (see module comment above) can't sustain itself indefinitely.
const dampStep = (delta: number, stepScale: number) => MAX_STEP * Math.tanh(delta / MAX_STEP) * stepScale;

export function estimateRasch(
    observations: Observation[],
    personCount: number,
    itemCount: number,
    opts: { maxIterations?: number; tolerance?: number } = {}
): RaschResult {
    const maxIterations = opts.maxIterations ?? 200;
    const tolerance = opts.tolerance ?? 0.02;

    const personScore = new Array(personCount).fill(0);
    const personMax = new Array(personCount).fill(0);
    const itemScore = new Array(itemCount).fill(0);
    const itemMax = new Array(itemCount).fill(0);
    const byPerson: Observation[][] = Array.from({ length: personCount }, () => []);
    const byItem: Observation[][] = Array.from({ length: itemCount }, () => []);

    for (const obs of observations) {
        personScore[obs.person] += obs.correct;
        personMax[obs.person] += 1;
        itemScore[obs.item] += obs.correct;
        itemMax[obs.item] += 1;
        byPerson[obs.person].push(obs);
        byItem[obs.item].push(obs);
    }

    const adjust = (score: number, max: number) => {
        if (max <= 0) return score;
        if (score <= 0) return EXTREME_ADJUSTMENT;
        if (score >= max) return max - EXTREME_ADJUSTMENT;
        return score;
    };
    const personTarget = personScore.map((s, n) => adjust(s, personMax[n]));
    const itemTarget = itemScore.map((s, i) => adjust(s, itemMax[i]));

    // Starting values: simple logit of the (adjusted) proportion correct.
    const theta = personTarget.map((s, n) => (personMax[n] > 0 ? clamp(Math.log(s / (personMax[n] - s)), -PARAM_CLAMP, PARAM_CLAMP) : 0));
    const b = itemTarget.map((s, i) => (itemMax[i] > 0 ? clamp(-Math.log(s / (itemMax[i] - s)), -PARAM_CLAMP, PARAM_CLAMP) : 0));
    recenter(b, theta);

    let converged = false;
    let iterations = 0;

    for (; iterations < maxIterations; iterations++) {
        let maxDelta = 0;
        const stepScale = 1 / (1 + iterations / 50);

        // Pass 1: item difficulties, using the current abilities.
        for (let i = 0; i < itemCount; i++) {
            let expected = 0;
            let info = 0;
            for (const obs of byItem[i]) {
                const p = probability(theta[obs.person], b[i]);
                expected += p;
                info += p * (1 - p);
            }
            if (info <= 1e-8) continue;
            const delta = (itemTarget[i] - expected) / info;
            const nextB = clamp(b[i] - dampStep(delta, stepScale), -PARAM_CLAMP, PARAM_CLAMP);
            maxDelta = Math.max(maxDelta, Math.abs(nextB - b[i]));
            b[i] = nextB;
        }
        recenter(b, theta);

        // Pass 2: person abilities, using the just-updated item difficulties.
        for (let n = 0; n < personCount; n++) {
            let expected = 0;
            let info = 0;
            for (const obs of byPerson[n]) {
                const p = probability(theta[n], b[obs.item]);
                expected += p;
                info += p * (1 - p);
            }
            if (info <= 1e-8) continue;
            const delta = (expected - personTarget[n]) / info;
            const nextTheta = clamp(theta[n] - dampStep(delta, stepScale), -PARAM_CLAMP, PARAM_CLAMP);
            maxDelta = Math.max(maxDelta, Math.abs(nextTheta - theta[n]));
            theta[n] = nextTheta;
        }

        if (maxDelta < tolerance) {
            converged = true;
            iterations++;
            break;
        }
    }

    return { itemDifficulty: b, personAbility: theta, iterations, converged };
}

function probability(theta: number, b: number): number {
    const x = theta - b;
    // Numerically stable logistic (avoids overflow in exp() for large |x|).
    if (x >= 0) {
        const e = Math.exp(-x);
        return 1 / (1 + e);
    }
    const e = Math.exp(x);
    return e / (1 + e);
}

function recenter(b: number[], theta: number[]): void {
    if (b.length === 0) return;
    const mean = b.reduce((a, x) => a + x, 0) / b.length;
    for (let i = 0; i < b.length; i++) b[i] -= mean;
    for (let n = 0; n < theta.length; n++) theta[n] -= mean;
}

// Описательная статистика и перевод способности в шкалу 0–75.
//
// mean/stdev остались общими помощниками, но для БАЛЛА они больше не
// используются: балл считается относительно эталонной популяции, а не
// сдавших. Они по-прежнему нужны там, где нужна статистика самой когорты —
// например в отчётах и в english-cefr.ts.
export function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

// Верх шкалы, в которой ученику показывается балл за мок. Единственная шкала
// «из 75», оставшаяся в проекте (см. design/FIX.md, «Две шкалы 75») — та же,
// что у Агентства знаний для национального сертификата.
export const MOCK_SCALE_MAX = 75;

// Z-стандартизация по методике Агентства (Baholash_mezoni.pdf, стр. 1–2):
//
//   Z = (θ − μ) / σ,   T = 50 + 10·Z
//
// μ и σ — параметры ЭТАЛОННОЙ популяции, а не сдавших этот тест. Раньше сюда
// передавалась статистика когорты того же мока, и балл получался относительно
// самих измеряемых: средний T всегда выходил ровно 50 независимо от того, как
// решали. Откуда брать μ и σ — src/lib/reference-population.ts.
//
// Вырожденного случая здесь больше нет и быть не может: эталон — константа
// конфигурации, у которой σ никогда не равна нулю. Прежняя молчаливая подмена
// разброса нарушала §233 (NO SILENT FALLBACK) и вместе с ней ушла.
export function raschThetaToT(theta: number, referenceMean: number, referenceStdev: number): number {
    // σ ≤ 0 означает испорченную конфигурацию, а не данные. Молча подставлять
    // что-то своё нельзя (§233) — но и падать посреди выставления баллов тоже:
    // возвращаем NaN, а вызывающий обязан отличить его от балла (§215, §217).
    if (!Number.isFinite(referenceStdev) || referenceStdev <= 0) return NaN;
    const z = (theta - referenceMean) / referenceStdev;
    const t = z * 10 + 50;
    // Без округления. T — величина ПРОМЕЖУТОЧНАЯ: её ещё делят между разделами
    // и переводят в шкалу предмета, и округление на каждом из этих шагов
    // накапливалось. Особенно заметно это было на сотенной шкале: шаг целого T
    // после перевода равен 100/75 = 1,33 балла, поэтому баллы прыгали
    // 61 → 64 → 65 → 67, а по родному языку деление на два сливало 8 разных
    // результатов в одинаковые баллы. Округляет теперь только последний шаг —
    // roundScore в src/lib/certificate-scale.ts.
    return Math.max(0, Math.min(MOCK_SCALE_MAX, t));
}

// ═══ Точность измерения: информация теста и стандартная ошибка ═══
//
// Балл без погрешности обещает точность, которой нет. На реальном моке по
// математике SE вышла ±3,2–4,6 балла, а из 630 пар работ статистически
// различимы только 206 — то есть 31,4 и 32,1 это ОДИН результат. Ровно поэтому
// в модели Раша баллы «повторяются»: одинаковое число верных даёт одинаковую
// способность (достаточность сырого балла, §7–8), и добавлять сюда уникальности
// значило бы рисовать различия, которых в измерении нет.
//
// Формулы — ТЗ D.1–D.4:
//
//   I_i(θ) = P_i(1 − P_i)     информация одного задания, максимум 0.25 при θ = b
//   I(θ)   = Σ_i I_i(θ)       информация теста
//   SE(θ)  = 1 / √I(θ)
//
// Информация аддитивна по заданиям, SE — нет (D.5), поэтому храним обе.

export type MeasurementStatus =
    /** Измерение годное. */
    | "OK"
    /** Информации мало: балл есть, но точным его называть нельзя (§216). */
    | "LOW_INFORMATION"
    /** Информации нет вовсе, SE бесконечна — возвращаем статус, а не число (§217). */
    | "INSUFFICIENT_INFORMATION";

// Граница «мало информации»: одна логита SE.
//
// Одна логита — это 10 баллов T, то есть доверительный интервал ±19,6 балла
// при 95%. Он накрывает больше двух полос уровня разом: измерение, которое не
// может отнести ученика даже к паре соседних уровней, уровнем не является.
// Число не подобрано под данные — оно следует из ширины полос (по 5 баллов) и
// множителя 1,96.
export const LOW_INFORMATION_SE = 1.0;

// Ниже этого информация считается нулевой. Не «=== 0»: сумма P(1−P) по 55
// заданиям складывается из слагаемых порядка 1e-16 у экстремальной θ, и такая
// сумма арифметически положительна, но измерением не является.
const ZERO_INFORMATION = 1e-9;

export function testInformation(theta: number, itemDifficulty: number[]): number {
    if (!Number.isFinite(theta)) return 0;
    let info = 0;
    for (const b of itemDifficulty) {
        if (!Number.isFinite(b)) continue;
        const p = probability(theta, b);
        info += p * (1 - p);
    }
    return info;
}

export type Precision = {
    /** Информация теста в точке θ. Аддитивна по заданиям. */
    information: number;
    /** Стандартная ошибка θ в логитах. null — когда её не существует. */
    thetaSe: number | null;
    /** Та же ошибка в баллах шкалы: одна логита стоит 10 баллов T. */
    scoreSe: number | null;
    status: MeasurementStatus;
};

// Погрешность оценки способности по набору заданий, на которые ученик отвечал.
//
// Крайние случаи возвращают СТАТУС, а не выдуманное число (§215, §217, §233).
// Живой пример с прода: ученик, не ответивший верно ни на одно из 55 заданий,
// имеет I(θ) = 0,30 и SE = 1,84 логиты — это ±18 баллов, и показывать ему
// «0,0» как точный балл было бы неправдой о точности, а не о нём.
export function measurementPrecision(theta: number, itemDifficulty: number[]): Precision {
    const information = testInformation(theta, itemDifficulty);
    if (!Number.isFinite(information) || information <= ZERO_INFORMATION) {
        return { information: 0, thetaSe: null, scoreSe: null, status: "INSUFFICIENT_INFORMATION" };
    }
    const thetaSe = 1 / Math.sqrt(information);
    return {
        information,
        thetaSe,
        // T = 50 + 10·(θ−μ)/σ, поэтому при σ = 1 (нулевой эталон) множитель
        // ровно 10. Если эталон однажды сменится, множитель обязан приехать
        // оттуда же — см. src/lib/reference-population.ts.
        scoreSe: thetaSe * 10,
        status: thetaSe >= LOW_INFORMATION_SE ? "LOW_INFORMATION" : "OK",
    };
}

// Погрешность СЛОЖНОСТИ задания (E.10): та же формула, только сумма идёт по
// ученикам, а не по заданиям.
//
//   SE(b_i) = 1 / √( Σ_n P_ni(1 − P_ni) )
//
// Функция та же, что и для способности, и это не экономия на копипасте:
// P(1−P) не меняется при обмене θ и b местами, потому что logistic(−x) = 1 −
// logistic(x), а произведение p(1−p) симметрично относительно 0.5. То есть
// информация задания о сложности и информация теста о способности — буквально
// одна величина, посчитанная по другой оси матрицы ответов.
export function itemPrecision(difficulty: number, personAbility: number[]): Precision {
    return measurementPrecision(difficulty, personAbility);
}

// Доверительный интервал балла (D.7): S ± z·SE, зажатый в границы шкалы.
//
// Зажатие делает интервал НЕсимметричным у краёв, и это правильно: балл 2,4 с
// погрешностью ±9 не может уйти ниже нуля, и рисовать «−6,6» было бы ложью.
export function scoreConfidenceInterval(
    score: number,
    scoreSe: number | null,
    z = 1.96,
): { low: number; high: number } | null {
    if (scoreSe === null || !Number.isFinite(scoreSe) || !Number.isFinite(score)) return null;
    const margin = z * scoreSe;
    return {
        low: Math.max(0, score - margin),
        high: Math.min(MOCK_SCALE_MAX, score + margin),
    };
}

// Различимы ли две работы статистически (D.8).
//
//   SE(θ₁ − θ₂) = √(SE(θ₁)² + SE(θ₂)²)
//
// Нужна, чтобы не выдавать за прогресс или за разницу между учениками то, что
// целиком лежит внутри погрешности. На реальном моке так различимы лишь 33%
// пар работ.
export function scoresAreDistinguishable(
    scoreA: number, seA: number | null,
    scoreB: number, seB: number | null,
    z = 1.96,
): boolean | null {
    if (seA === null || seB === null) return null;
    if (!Number.isFinite(seA) || !Number.isFinite(seB)) return null;
    const seDiff = Math.sqrt(seA ** 2 + seB ** 2);
    return Math.abs(scoreA - scoreB) > z * seDiff;
}
