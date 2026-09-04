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

// Generic descriptive-stats + ability-to-scaled-score helpers — used to
// standardize a cohort's Rasch person abilities (theta) into a fixed 0-75
// scale (Z-score against that same mock's own test-takers, T = Z*10 + 50).
// Subject-agnostic: src/lib/english-cefr.ts reuses these for the officially
// mandated English scoring, and the generic per-mock grade level
// (src/lib/mock-grade-level.ts) reuses them for every other subject.
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

export function raschThetaToT(theta: number, cohortMean: number, cohortStdev: number): number {
    // With fewer than ~2 meaningfully-different ability estimates, a
    // population stdev is not a meaningful yardstick (and would divide by
    // ~0) — fall back to the scale's center point until there's enough data
    // to standardize against, rather than producing NaN/Infinity.
    //
    // Вызывающая сторона (/api/rasch/recalculate) отдельно проверяет тот же
    // признак и в этом случае пишет NULL вместо возвращённых отсюда 50: балл
    // теперь главный, и подставная середина шкалы была бы просто неверным
    // числом, одинаковым у всех.
    if (!Number.isFinite(cohortStdev) || cohortStdev < 1e-6) return 50;
    const z = (theta - cohortMean) / cohortStdev;
    const t = z * 10 + 50;
    return Math.max(0, Math.min(MOCK_SCALE_MAX, Math.round(t)));
}
