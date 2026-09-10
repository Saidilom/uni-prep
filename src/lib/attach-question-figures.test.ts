import { describe, it, expect, vi } from "vitest";
import {
    figureDecision, summarizeFigures, attachQuestionFigures,
    FigureCandidate, FigureOutcome,
} from "./attach-question-figures";

const q = (p: Partial<FigureCandidate> = {}): FigureCandidate => ({
    number: "1",
    sourcePage: 3,
    sourceFileIndex: 0,
    needsSourceImage: true,
    figureBox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
    ...p,
});

describe("figureDecision — резать или нет", () => {
    it("задание с рисунком и рамкой режется", () => {
        const d = figureDecision(q(), 1);
        expect(d.crop).toBe(true);
    });

    it("задание без рисунка пропускается", () => {
        expect(figureDecision(q({ needsSourceImage: false }), 1))
            .toEqual({ crop: false, reason: "NO_FIGURE" });
    });

    it("рисунок есть, а рамки нет — пропуск с причиной, а не выдуманный кусок", () => {
        expect(figureDecision(q({ figureBox: null }), 1))
            .toEqual({ crop: false, reason: "NO_BOX" });
    });

    it("ссылка на несуществующий файл не подменяется первым", () => {
        // Иначе вырезали бы кусок чужого документа и молча прикрепили к заданию.
        expect(figureDecision(q({ sourceFileIndex: 3 }), 2))
            .toEqual({ crop: false, reason: "NO_SOURCE_FILE" });
        expect(figureDecision(q({ sourceFileIndex: -1 }), 2))
            .toEqual({ crop: false, reason: "NO_SOURCE_FILE" });
    });

    it("рамка-полоска отбраковывается", () => {
        expect(figureDecision(q({ figureBox: { x: 0.1, y: 0.5, width: 0.8, height: 0.001 } }), 1))
            .toEqual({ crop: false, reason: "TOO_SMALL" });
    });
});

describe("attachQuestionFigures — сбой одной картинки не роняет импорт", () => {
    const files = [{ bytes: new Uint8Array([1, 2, 3]) }];

    it("отказ хранилища становится FAILED, остальные продолжают резаться", async () => {
        let call = 0;
        const outcomes = await attachQuestionFigures(
            [q({ number: "1" }), q({ number: "2" }), q({ number: "3", needsSourceImage: false })],
            files,
            async () => {
                call++;
                return call === 1 ? { error: "storage down" } : { url: "https://x/y.png" };
            },
            (question) => `figures/${question.number}.png`,
        ).catch((e) => e);

        // Ни одно исключение наружу не вышло.
        expect(Array.isArray(outcomes)).toBe(true);
        const list = outcomes as FigureOutcome[];
        expect(list).toHaveLength(3);
        expect(list[2]).toEqual({ status: "SKIPPED", reason: "NO_FIGURE" });
    });

    it("задания без рисунка не трогают ни PDF, ни хранилище", async () => {
        let uploads = 0;
        await attachQuestionFigures(
            [q({ needsSourceImage: false }), q({ figureBox: null })],
            files,
            async () => { uploads++; return { url: "u" }; },
            () => "p.png",
        );
        expect(uploads).toBe(0);
    });
});

// Вырезка идёт пачками (FIGURE_CONCURRENCY), а не строгой очередью — иначе
// десяток рендеров плюс заливок встали бы в критический путь импорта один за
// другим. Здесь проверяется единственное, чем за это платят: раскладка
// результатов по индексам. Перепутай их — и рисунок 40a уедет заданию 41b, а
// заметить это можно будет только глазами на экзамене.
describe("attachQuestionFigures — параллельность не путает задания", () => {
    const files = [{ bytes: new Uint8Array([1, 2, 3]) }];

    it("результат и путь загрузки соответствуют своему заданию", async () => {
        vi.resetModules();
        // Настоящий cropFigureToPng требует настоящего PDF, поэтому подменяем
        // только его: остальное — проверка рамки, порядок, пути — работает как
        // в бою. Задержка обратна номеру страницы, так что готовность приходит
        // в обратном порядке — самое злое для раскладки по индексам.
        vi.doMock("./pdf-figure-crop", async () => {
            const actual = await vi.importActual<typeof import("./pdf-figure-crop")>("./pdf-figure-crop");
            return {
                ...actual,
                cropFigureToPng: async (_bytes: Uint8Array, page: number) => {
                    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 20 - page)));
                    return { png: new Uint8Array([page]), width: 10, height: 10 };
                },
            };
        });
        const { attachQuestionFigures: attach } = await import("./attach-question-figures");

        // Девять заданий — больше двух пачек по четыре, так что границы пачек
        // проверяются тоже.
        const questions = Array.from({ length: 9 }, (_, index) => q({
            number: `q${index}`,
            sourcePage: index + 1,
            needsSourceImage: index % 3 !== 2,
        }));
        const paths: string[] = [];
        const outcomes = await attach(
            questions,
            files,
            async (path, png) => { paths.push(`${path}:${png[0]}`); return { url: `https://x/${path}` }; },
            (question, index) => `${question.number}-${index}.png`,
        );

        outcomes.forEach((outcome, index) => {
            if (index % 3 === 2) {
                expect(outcome).toEqual({ status: "SKIPPED", reason: "NO_FIGURE" });
                return;
            }
            // Ссылка того задания, что стоит на этом месте.
            expect(outcome).toEqual({ status: "ATTACHED", url: `https://x/q${index}-${index}.png`, bytes: 1 });
        });
        // Путь получил свой индекс, и байты — своей страницы.
        expect(paths).toContain(`q0-0.png:1`);
        expect(paths).toContain(`q7-7.png:8`);
        vi.doUnmock("./pdf-figure-crop");
    });
});

describe("summarizeFigures — о чём сказать учителю", () => {
    const attached: FigureOutcome = { status: "ATTACHED", url: "u", bytes: 100 };

    it("молчит, когда рисунков в тесте нет вовсе", () => {
        expect(summarizeFigures([
            { status: "SKIPPED", reason: "NO_FIGURE" },
            { status: "SKIPPED", reason: "NO_FIGURE" },
        ])).toBeNull();
    });

    it("называет число вырезанных", () => {
        const text = summarizeFigures([attached, attached, { status: "SKIPPED", reason: "NO_FIGURE" }]);
        expect(text).toContain("2");
    });

    it("не молчит о заданиях, где рамку определить не удалось", () => {
        // Учитель должен знать, где картинки не будет, а не обнаружить это на экзамене.
        const text = summarizeFigures([attached, { status: "SKIPPED", reason: "NO_BOX" }]);
        expect(text).toMatch(/рамк/i);
    });

    it("сообщает о сбоях вырезки отдельно от ненайденных рамок", () => {
        const text = summarizeFigures([{ status: "FAILED", reason: "boom" }]);
        expect(text).toMatch(/сбой/i);
    });
});
