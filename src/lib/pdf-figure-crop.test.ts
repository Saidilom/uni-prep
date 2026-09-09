import { describe, it, expect } from "vitest";
import {
    prepareFigureBox, boxToPdfRect, cropPixelSize,
    FIGURE_PADDING, MIN_FIGURE_SIDE, FIGURE_RENDER_SCALE,
} from "./pdf-figure-crop";

// Обычная страница A4 в пунктах, начало отсчёта в нуле.
const A4: readonly [number, number, number, number] = [0, 0, 595, 842];

describe("prepareFigureBox — что считается рамкой рисунка", () => {
    it("нормальная рамка проходит и получает поля", () => {
        const r = prepareFigureBox({ x: 0.2, y: 0.3, width: 0.4, height: 0.25 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.box.x).toBeCloseTo(0.2 - FIGURE_PADDING, 12);
        expect(r.box.y).toBeCloseTo(0.3 - FIGURE_PADDING, 12);
        expect(r.box.width).toBeCloseTo(0.4 + 2 * FIGURE_PADDING, 12);
        expect(r.box.height).toBeCloseTo(0.25 + 2 * FIGURE_PADDING, 12);
    });

    it("рамка у самого края упирается в лист, а не выходит за него", () => {
        const r = prepareFigureBox({ x: 0, y: 0, width: 1, height: 1 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.box.x).toBe(0);
        expect(r.box.y).toBe(0);
        expect(r.box.x + r.box.width).toBeLessThanOrEqual(1);
        expect(r.box.y + r.box.height).toBeLessThanOrEqual(1);
    });

    it("рамки нет — статус, а не выдуманный прямоугольник", () => {
        expect(prepareFigureBox(null)).toEqual({ ok: false, reason: "NO_BOX" });
        expect(prepareFigureBox(undefined)).toEqual({ ok: false, reason: "NO_BOX" });
    });

    it("значения вне 0..1 и нечисловые отвергаются", () => {
        for (const bad of [
            { x: -0.1, y: 0.2, width: 0.3, height: 0.3 },
            { x: 1.2, y: 0.2, width: 0.3, height: 0.3 },
            { x: 0.2, y: 0.2, width: 0, height: 0.3 },
            { x: 0.2, y: 0.2, width: 0.3, height: -0.3 },
            { x: Number.NaN, y: 0.2, width: 0.3, height: 0.3 },
        ]) {
            expect(prepareFigureBox(bad)).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
        }
    });

    it("полоска в одну строку текста — не рисунок", () => {
        // Именно так выглядит промах модели: она называет строку, а не график.
        const r = prepareFigureBox({ x: 0.1, y: 0.5, width: 0.8, height: 0.001 });
        expect(r).toEqual({ ok: false, reason: "TOO_SMALL" });
    });

    it("порог считается ПОСЛЕ добавления полей", () => {
        // Рамка чуть уже порога, но с полями проходит — иначе поля были бы
        // бессмысленны, а мелкие, но настоящие значки отбрасывались бы.
        const almost = MIN_FIGURE_SIDE - FIGURE_PADDING;
        const r = prepareFigureBox({ x: 0.4, y: 0.4, width: almost, height: almost });
        expect(r.ok).toBe(true);
    });
});

describe("boxToPdfRect — перевод в координаты страницы", () => {
    it("вся страница даёт её собственные границы", () => {
        expect(boxToPdfRect({ x: 0, y: 0, width: 1, height: 1 }, A4)).toEqual([0, 0, 595, 842]);
    });

    it("верхняя левая четверть остаётся верхней левой", () => {
        // Ось y НЕ переворачивается: getBounds отдаёт y0 сверху, и доли
        // считаются оттуда же.
        const rect = boxToPdfRect({ x: 0, y: 0, width: 0.5, height: 0.5 }, A4);
        expect(rect).toEqual([0, 0, 297.5, 421]);
    });

    it("смещённый MediaBox не сдвигает вырезку", () => {
        // Ловушка, ради которой перевод идёт через getBounds, а не через
        // «высота минус y»: страница не обязана начинаться в нуле.
        const shifted: readonly [number, number, number, number] = [20, 50, 615, 892];
        const rect = boxToPdfRect({ x: 0, y: 0, width: 0.5, height: 0.5 }, shifted);
        expect(rect).toEqual([20, 50, 20 + 297.5, 50 + 421]);
    });

    it("ширина рамки пропорциональна ширине страницы", () => {
        const wide: readonly [number, number, number, number] = [0, 0, 1190, 842];
        const [x0, , x1] = boxToPdfRect({ x: 0.25, y: 0, width: 0.5, height: 1 }, wide);
        expect(x1 - x0).toBeCloseTo(595, 6);
    });
});

describe("cropPixelSize", () => {
    it("масштаб умножает размер вырезки", () => {
        // Ровно вдвое требовать нельзя: округление стоит ПОСЛЕ умножения, и
        // 297.5 pt даёт 298 px при scale 1, но 595 px при scale 2. Округлять
        // раньше было бы хуже — накапливалась бы ошибка на каждом масштабе.
        const box = { x: 0, y: 0, width: 0.5, height: 0.5 };
        const one = cropPixelSize(box, A4, 1);
        const two = cropPixelSize(box, A4, 2);
        expect(Math.abs(two.width - one.width * 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(two.height - one.height * 2)).toBeLessThanOrEqual(1);
    });

    it("по умолчанию рендерит крупнее пунктов — иначе подписи нечитаемы", () => {
        expect(FIGURE_RENDER_SCALE).toBeGreaterThan(1);
        const size = cropPixelSize({ x: 0, y: 0, width: 1, height: 1 }, A4);
        expect(size.width).toBe(595 * FIGURE_RENDER_SCALE);
    });

    it("вырожденная рамка не даёт нулевой размер", () => {
        const size = cropPixelSize({ x: 0, y: 0, width: 0.0001, height: 0.0001 }, A4);
        expect(size.width).toBeGreaterThanOrEqual(1);
        expect(size.height).toBeGreaterThanOrEqual(1);
    });
});
