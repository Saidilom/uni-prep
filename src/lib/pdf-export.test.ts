import { describe, it, expect } from "vitest";
import { planPageLayout, type PdfBlockSize } from "./pdf-export";

const PAGE = 700; // высота содержимого страницы, pt — круглое число для читаемых тестов
const GAP = 10;

const block = (heightPt: number): PdfBlockSize => ({ heightPt });

describe("planPageLayout — раскладка блоков по страницам", () => {
    it("несколько маленьких блоков умещаются на одной странице подряд", () => {
        const placements = planPageLayout([block(100), block(100), block(100)], PAGE, GAP);
        expect(placements).toHaveLength(3);
        expect(placements.every((p) => p.page === 0)).toBe(true);
        expect(placements[0].y).toBe(0);
        expect(placements[1].y).toBe(110); // 100 + gap
        expect(placements[2].y).toBe(220);
    });

    it("блок, не влезающий в остаток страницы, переносится целиком на новую", () => {
        // Первый блок съедает 690 из 700 pt, второй в 10 pt остатка не входит.
        const placements = planPageLayout([block(690), block(200)], PAGE, GAP);
        expect(placements[0].page).toBe(0);
        expect(placements[1].page).toBe(1);
        expect(placements[1].y).toBe(0);
        // Ни один блок не резался.
        expect(placements.every((p) => p.sourceOffset === 0)).toBe(true);
    });

    it("блок выше страницы режется на границе страниц", () => {
        const placements = planPageLayout([block(1500)], PAGE, GAP);
        // 1500 / 700 → три страницы: 700 + 700 + 100.
        expect(placements).toHaveLength(3);
        expect(placements.map((p) => p.page)).toEqual([0, 1, 2]);
        expect(placements.map((p) => p.height)).toEqual([700, 700, 100]);
        expect(placements.map((p) => p.sourceOffset)).toEqual([0, 700, 1400]);
        // Каждый срез — с самого верха своей страницы.
        expect(placements.every((p) => p.y === 0)).toBe(true);
    });

    it("режущийся блок всегда начинается с чистого листа", () => {
        // Регрессия: наивная раскладка положила бы первый срез в остаток
        // места после первого блока — получился бы разрез не по границе
        // страницы, а там, где случайно кончилось место.
        const placements = planPageLayout([block(200), block(1500)], PAGE, GAP);
        expect(placements[0].page).toBe(0); // маленький блок — на первой
        // Разрезанный блок начинается СО СЛЕДУЮЩЕЙ страницы, а не с остатка
        // первой (700 − 200 − gap = 490 pt, в которые первый срез бы не влез
        // при любом реалистичном размере, но и будь он меньше — начинать
        // резаный блок не с начала страницы всё равно неверно).
        expect(placements[1].page).toBe(1);
        expect(placements[1].y).toBe(0);
    });

    it("после разрезанного блока следующий блок продолжает на той же странице", () => {
        // 1500 → срезы 700+700+100, последний срез оставляет 700-100-gap
        // места на своей странице — туда должен войти следующий блок.
        const placements = planPageLayout([block(1500), block(100)], PAGE, GAP);
        const last = placements[2];
        const next = placements[3];
        expect(last.page).toBe(2);
        expect(next.page).toBe(2);
        expect(next.y).toBe(last.height + GAP);
    });

    it("блок ровно в высоту страницы не режется и не создаёт лишней страницы", () => {
        const placements = planPageLayout([block(PAGE)], PAGE, GAP);
        expect(placements).toHaveLength(1);
        expect(placements[0].sourceOffset).toBe(0);
        expect(placements[0].height).toBe(PAGE);
    });

    it("пустой список блоков не создаёт ни одной страницы", () => {
        expect(planPageLayout([], PAGE, GAP)).toEqual([]);
    });

    it("номера страниц монотонно не убывают в порядке блоков", () => {
        // Важно для вызывающего кода: он читает placements по порядку и
        // добавляет страницы в jsPDF по мере роста номера, не переключаясь
        // назад — так и должно оставаться при любых входных высотах.
        const placements = planPageLayout(
            [block(300), block(1200), block(50), block(690), block(690)],
            PAGE, GAP,
        );
        for (let i = 1; i < placements.length; i++) {
            expect(placements[i].page).toBeGreaterThanOrEqual(placements[i - 1].page);
        }
    });
});
