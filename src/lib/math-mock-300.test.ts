import { describe, it, expect } from "vitest";
import { estimateRasch, Observation, raschThetaToT, mean, stdev } from "./rasch";
import { REFERENCE_DEFAULT } from "./reference-population";
import { tScoreToCertificate, formatScore, certificateMaxForSubject } from "./certificate-scale";
import { gradeLevelFromScore, gradeLevelDisplay, GradeLevel } from "./mock-grade-level";

// 300 УЧЕНИКОВ НА РЕАЛЬНОМ БЕСПЛАТНОМ МОКЕ ПО МАТЕМАТИКЕ.
//
// Задание владельца: прогнать 300 «ботов» через математику и показать
// окончательные баллы, которые выдаёт модель Раша.
//
// ПОЧЕМУ БОТЫ НЕ ЗАВЕДЕНЫ В БАЗУ. Калибровка сложностей пересчитывается по
// ВСЕМ сдавшим этот тест: 300 ботов рядом с 36 настоящими учениками сдвинули
// бы сложности всех 55 заданий, а вместе с ними θ и балл каждого из 36 — тех,
// кому результат уже показан. Это ровно тот дефект, который описан в
// design/RASCH.md (§239, «Калибровка не отделена от оценки ученика»), и
// использовать его как способ сделать тест нельзя. Поэтому тест берёт РЕАЛЬНЫЕ
// параметры теста и прогоняет 300 учеников через тот же код, ничего не
// записывая.
//
// Что взято с прода (Mock Matematika, type = 'free', калибровка 2026-09-06):
//   55 заданий с их калиброванными сложностями — таблица ITEM_DIFFICULTY ниже;
//   распределение способностей 36 сдавших: θ = −1.8365 ± 1.0548;
//   решаемость: 462 верных из 1980, то есть 23.3%.
//
// Детерминирован: ГПСЧ со своим зерном. Тот же прогон — те же баллы.

// Сложности 55 заданий, как их оценила модель на реальных 36 работах.
// Отсортированы по возрастанию. Среднее равно нулю с точностью 1e-8 — это
// ограничение идентификации шкалы (§6), его же держит recenter().
const ITEM_DIFFICULTY: number[] = [
    -2.472587, -2.203947, -1.944562, -1.816085, -1.816085, -1.687331, -1.557500, -1.557500,
    -1.425766, -1.425766, -1.291248, -1.291248, -1.152968, -1.152968, -1.009808, -1.009808,
    -1.009808, -1.009808, -0.860443, -0.860443, -0.703255, -0.536197, -0.536197, -0.536197,
    -0.536197, -0.356582, -0.356582, -0.356582, -0.356582, -0.160746, -0.160746, 0.056563,
    0.056563, 0.303337, 0.303337, 0.303337, 0.303337, 0.592747, 0.592747, 0.592747,
    0.592747, 0.949134, 0.949134, 0.949134, 1.426499, 1.426499, 1.426499, 1.426499,
    1.426499, 2.195624, 3.455711, 3.455711, 3.455711, 3.455711, 3.455711,
];

const REAL_THETA_MEAN = -1.8365;
const REAL_THETA_SD = 1.0548;
const REAL_PCT_CORRECT = 23.3;
const STUDENTS = 300;

function mulberry32(seed: number) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.min(2147483647, seed) ^ (seed >>> 15);
        t = (Math.imul(t, 1 | seed) + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Нормальное распределение из равномерного — Бокс–Мюллер. Нужно, чтобы
// способности были рассыпаны как в живой когорте, а не разложены по линейке.
function gaussian(rand: () => number) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const probability = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

type Student = {
    trueTheta: number;
    correct: number;
    theta: number;
    t: number;
    score: number;
    level: GradeLevel;
};

// Один прогон: 300 учеников с заданным распределением способностей отвечают на
// 55 реальных заданий, дальше — ровно тот путь, что в /api/rasch/recalculate.
function runCohort(seed: number, abilityOf: (n: number, rand: () => number) => number): Student[] {
    const rand = mulberry32(seed);
    const trueThetas = Array.from({ length: STUDENTS }, (_, n) => abilityOf(n, rand));

    const observations: Observation[] = [];
    for (let person = 0; person < STUDENTS; person++) {
        for (let item = 0; item < ITEM_DIFFICULTY.length; item++) {
            const correct = rand() < probability(trueThetas[person], ITEM_DIFFICULTY[item]) ? 1 : 0;
            observations.push({ person, item, correct: correct as 0 | 1 });
        }
    }

    // Как на проде: сложности оцениваются заново по этой же матрице ответов.
    const { personAbility, converged, iterations } = estimateRasch(observations, STUDENTS, ITEM_DIFFICULTY.length);
    expect(converged).toBe(true);
    expect(iterations).toBeLessThanOrEqual(200);

    const correctByPerson = new Array(STUDENTS).fill(0);
    for (const o of observations) correctByPerson[o.person] += o.correct;

    return trueThetas.map((trueTheta, n) => {
        const theta = personAbility[n];
        const t = raschThetaToT(theta, REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma);
        const score = tScoreToCertificate(t, "math");
        return { trueTheta, correct: correctByPerson[n], theta, t, score, level: gradeLevelFromScore(score) };
    });
}

const LEVELS: GradeLevel[] = ["A+", "A", "B+", "B", "C+", "C", "below_c"];

function report(title: string, students: Student[]) {
    const scores = students.map((s) => s.score).sort((a, b) => a - b);
    const correct = students.map((s) => s.correct);
    const pct = (100 * correct.reduce((a, b) => a + b, 0)) / (STUDENTS * ITEM_DIFFICULTY.length);
    const at = (q: number) => scores[Math.min(scores.length - 1, Math.floor(q * scores.length))];

    const lines: string[] = [];
    lines.push(`\n${"═".repeat(72)}\n${title}\n${"═".repeat(72)}`);
    lines.push(`учеников ${STUDENTS}   заданий ${ITEM_DIFFICULTY.length}   решаемость ${pct.toFixed(1)}%`);
    lines.push(`балл: средний ${mean(scores).toFixed(1)}   разброс ${stdev(scores).toFixed(1)}   от ${scores[0].toFixed(1)} до ${scores[scores.length - 1].toFixed(1)}   разных значений ${new Set(scores).size}`);
    lines.push(`квартили: 25% ниже ${at(0.25).toFixed(1)} · медиана ${at(0.5).toFixed(1)} · 75% ниже ${at(0.75).toFixed(1)}`);

    lines.push(`\nраспределение уровней:`);
    for (const level of LEVELS) {
        const group = students.filter((s) => s.level === level);
        if (group.length === 0) continue;
        const share = (100 * group.length) / STUDENTS;
        const bar = "█".repeat(Math.max(1, Math.round(share / 2)));
        const groupScores = group.map((s) => s.score);
        lines.push(
            `  ${gradeLevelDisplay(level, "ru").padEnd(8)} ${String(group.length).padStart(3)} чел  ${share.toFixed(1).padStart(5)}%  ` +
            `балл ${Math.min(...groupScores).toFixed(1)}–${Math.max(...groupScores).toFixed(1)}  ${bar}`
        );
    }

    // По одному ученику из каждого десятка процентов — чтобы видеть цепочку.
    lines.push(`\nсрез по шкале (верных → θ → T → балл → уровень):`);
    lines.push(`  ${"верных".padEnd(9)} ${"%".padEnd(6)} ${"θ".padStart(8)} ${"T".padStart(7)} ${"балл".padStart(7)}   уровень`);
    const byScore = [...students].sort((a, b) => a.score - b.score);
    for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1]) {
        const s = byScore[Math.min(byScore.length - 1, Math.floor(q * (byScore.length - 1)))];
        lines.push(
            `  ${`${s.correct}/${ITEM_DIFFICULTY.length}`.padEnd(9)} ${((100 * s.correct) / ITEM_DIFFICULTY.length).toFixed(0).padStart(4)}% ` +
            `${s.theta.toFixed(3).padStart(8)} ${s.t.toFixed(1).padStart(7)} ${formatScore(s.score).padStart(7)}   ${gradeLevelDisplay(s.level, "ru")}`
        );
    }
    console.log(lines.join("\n") + "\n");
    return { scores, pct };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("300 учеников на реальном моке по математике", () => {
    // Когорта как настоящая: способности из того же распределения, что у 36
    // сдавших 2026-09-06. Отвечает на вопрос «что выдаст система, если этот же
    // тест сдадут 300 таких же учеников».
    const realistic = runCohort(300_001, (_, rand) => REAL_THETA_MEAN + REAL_THETA_SD * gaussian(rand));

    // И вторая когорта — с полным разбросом способностей, чтобы стали видны все
    // уровни от «Ниже C» до A+. У первой их взяться не может: она решает 23%.
    const fullRange = runCohort(300_002, (n) => -3 + (6 * n) / (STUDENTS - 1));

    it("когорта как на настоящем экзамене: 300 таких же учеников", () => {
        const { pct } = report("300 учеников с подготовкой как у реальных 36 (θ = −1.84 ± 1.05)", realistic);
        // Решаемость обязана попасть примерно в реальные 23.3%: значит когорта
        // и правда похожа на настоящую, а не подогнана.
        expect(Math.abs(pct - REAL_PCT_CORRECT)).toBeLessThan(4);
        expect(realistic).toHaveLength(300);
    });

    it("когорта с полным разбросом: видны все уровни", () => {
        report("300 учеников с полным разбросом способностей (θ от −3 до +3)", fullRange);
        const levels = new Set(fullRange.map((s) => s.level));
        // Должны появиться и верхние уровни, недостижимые для слабой когорты.
        expect(levels.has("A+")).toBe(true);
        expect(levels.size).toBeGreaterThanOrEqual(6);
    });

    it("все 600 баллов внутри шкалы математики 0–100", () => {
        const mathMax = certificateMaxForSubject("math");
        for (const s of [...realistic, ...fullRange]) {
            expect(Number.isFinite(s.score)).toBe(true);
            expect(s.score).toBeGreaterThanOrEqual(0);
            expect(s.score).toBeLessThanOrEqual(mathMax);
            expect(s.score).toBe(Math.round(s.score * 10) / 10);
        }
    });

    it("больше верных — не ниже балл, ни у одного из 300", () => {
        // Монотонность на живом объёме: если она нарушится, ученик с большим
        // числом верных получит меньший балл, и объяснить это будет нечем.
        const sorted = [...realistic].sort((a, b) => a.correct - b.correct);
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].score).toBeGreaterThanOrEqual(sorted[i - 1].score);
        }
    });

    it("одинаковое число верных — одинаковый балл до последнего знака", () => {
        const byRaw = new Map<number, Student[]>();
        for (const s of realistic) {
            const bucket = byRaw.get(s.correct) ?? [];
            bucket.push(s);
            byRaw.set(s.correct, bucket);
        }
        let checked = 0;
        let biggest = 0;
        for (const group of Array.from(byRaw.values())) {
            if (group.length < 2) continue;
            checked++;
            biggest = Math.max(biggest, group.length);
            for (const s of group) expect(s.score).toBe(group[0].score);
        }
        expect(checked).toBeGreaterThan(5);
        console.log(`\nгрупп с одинаковым числом верных: ${checked}, самая большая — ${biggest} чел; внутри каждой балл совпал точно\n`);
    });

    // Полный список всех 300 баллов. Печатается только по запросу:
    //   DUMP_300=1 npx vitest run math-mock-300
    // В обычном прогоне 75 строк вывода мешали бы читать остальные тесты, а
    // числа детерминированы — тот же прогон даёт тот же список.
    it.runIf(process.env.DUMP_300 === "1")("печатает баллы всех 300 учеников", () => {
        const ranked = [...realistic].sort((a, b) => b.score - a.score);
        const cell = (s: Student, i: number) =>
            `${String(i + 1).padStart(3)}. ${`${s.correct}/55`.padStart(5)} ${formatScore(s.score).padStart(5)} ${gradeLevelDisplay(s.level, "ru").padEnd(7)}`;

        const COLS = 4;
        const rows = Math.ceil(ranked.length / COLS);
        const out: string[] = [];
        out.push(`\nВСЕ ${STUDENTS} УЧЕНИКОВ, по убыванию балла (место · верных · балл · уровень)\n`);
        for (let r = 0; r < rows; r++) {
            const line: string[] = [];
            for (let c = 0; c < COLS; c++) {
                const idx = c * rows + r;
                if (idx < ranked.length) line.push(cell(ranked[idx], idx));
            }
            out.push(line.join(" │ "));
        }
        console.log(out.join("\n") + "\n");

        // Список обязан быть полным и упорядоченным — иначе это не отчёт.
        expect(ranked).toHaveLength(300);
        for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
        }
    });

    it("буква у каждого из 300 согласована с показанным баллом", () => {
        for (const s of realistic) {
            const shown = Number(formatScore(s.score).replace(",", "."));
            expect(gradeLevelFromScore(shown)).toBe(s.level);
        }
    });

    it("300 сдавших не сдвигают точку отсчёта: θ = 0 по-прежнему T = 50", () => {
        // Отличие от прежнего механизма: сколько бы ни сдало и как бы ни
        // решили, точка отсчёта не двигается.
        const t0 = raschThetaToT(0, REFERENCE_DEFAULT.mu, REFERENCE_DEFAULT.sigma);
        expect(t0).toBe(50);
        // На шкале показа математики те же 50 логит-баллов выражаются как 66,7
        // из 100 — точка отсчёта не сдвинулась, изменилась только единица.
        expect(tScoreToCertificate(t0, "math")).toBe(66.7);
        // И средний балл когорты НЕ равен точке отсчёта — именно это и было
        // сломано, когда шкалу считали относительно самих сдавших.
        const avg = mean(realistic.map((s) => s.score));
        expect(Math.abs(avg - 66.7)).toBeGreaterThan(10);
        console.log(`\nсредний балл слабой когорты: ${avg.toFixed(1)} из 100 — а не 66,7, как выходило по прежнему правилу\n`);
    });
});
