import { describe, it, expect } from "vitest";
import {
    checkFigureFile, figureStoragePath, isOwnFigureUrl, questionFiguresPublicPrefix,
    FIGURE_MIME_TYPES, MAX_FIGURE_BYTES,
} from "./question-figure";

const SUPABASE = "https://qnujkeuknrpqlddsahbt.supabase.co";

describe("checkFigureFile — что примем в рисунок задания", () => {
    it("картинки трёх разрешённых видов проходят и получают расширение", () => {
        expect(checkFigureFile({ type: "image/png", size: 1000 })).toEqual({ ok: true, mime: "image/png", ext: "png" });
        expect(checkFigureFile({ type: "image/jpeg", size: 1000 })).toEqual({ ok: true, mime: "image/jpeg", ext: "jpg" });
        expect(checkFigureFile({ type: "image/webp", size: 1000 })).toEqual({ ok: true, mime: "image/webp", ext: "webp" });
    });

    it("регистр и пробелы в типе не мешают", () => {
        expect(checkFigureFile({ type: " IMAGE/PNG ", size: 10 }).ok).toBe(true);
    });

    it("PDF не картинка — именно с него всё и началось", () => {
        expect(checkFigureFile({ type: "application/pdf", size: 1000 })).toEqual({ ok: false, reason: "TYPE" });
    });

    it("пустой файл и файл больше лимита bucket'а отвергаются", () => {
        expect(checkFigureFile({ type: "image/png", size: 0 })).toEqual({ ok: false, reason: "EMPTY" });
        expect(checkFigureFile({ type: "image/png", size: MAX_FIGURE_BYTES + 1 })).toEqual({ ok: false, reason: "SIZE" });
        // Ровно лимит — ещё можно: bucket сравнивает так же.
        expect(checkFigureFile({ type: "image/png", size: MAX_FIGURE_BYTES }).ok).toBe(true);
    });

    it("список типов совпадает с тем, что разрешено bucket'у", () => {
        // Миграция 113 объявляет ровно эти три. Разъедутся — заливка начнёт
        // падать уже на хранилище, с невнятной ошибкой у человека.
        expect([...FIGURE_MIME_TYPES]).toEqual(["image/png", "image/jpeg", "image/webp"]);
    });
});

describe("figureStoragePath", () => {
    it("две загрузки одного задания не встают на один путь", () => {
        const a = figureStoragePath("test-1", "q-7", "aaaaaaaa", "png");
        const b = figureStoragePath("test-1", "q-7", "bbbbbbbb", "png");
        expect(a).not.toBe(b);
    });

    it("выход из папки через путь невозможен", () => {
        const path = figureStoragePath("../../etc", "q/../..", "s l o t", "png");
        // Ровно один слэш — тот, что отделяет папку импорта/теста, — и ни
        // одного «..» в имени: рассуждать о том, как хранилище разбирает путь,
        // не приходится вовсе.
        expect(path.split("/")).toHaveLength(2);
        expect(path).not.toContain("..");
        expect(path.endsWith(".png")).toBe(true);
    });
});

describe("isOwnFigureUrl — чужая ссылка в задание не попадёт", () => {
    it("ссылка из нашего bucket проходит", () => {
        expect(isOwnFigureUrl(`${questionFiguresPublicPrefix(SUPABASE)}import-1/manual-3-abc.png`, SUPABASE)).toBe(true);
    });

    it("чужой хост не проходит, даже если наш адрес спрятан внутри", () => {
        expect(isOwnFigureUrl("https://evil.example/pic.png", SUPABASE)).toBe(false);
        expect(isOwnFigureUrl(`https://evil.example/?u=${questionFiguresPublicPrefix(SUPABASE)}x.png`, SUPABASE)).toBe(false);
    });

    it("другой bucket того же проекта не проходит", () => {
        expect(isOwnFigureUrl(`${SUPABASE}/storage/v1/object/public/test-imports/x.pdf`, SUPABASE)).toBe(false);
    });

    it("сам префикс без имени файла — не ссылка на картинку", () => {
        expect(isOwnFigureUrl(questionFiguresPublicPrefix(SUPABASE), SUPABASE)).toBe(false);
    });

    it("пустые значения не проходят", () => {
        expect(isOwnFigureUrl("", SUPABASE)).toBe(false);
        expect(isOwnFigureUrl("https://x/y.png", "")).toBe(false);
    });

    it("лишний слэш в адресе проекта не ломает сравнение", () => {
        const url = `${questionFiguresPublicPrefix(SUPABASE)}a/b.png`;
        expect(isOwnFigureUrl(url, `${SUPABASE}/`)).toBe(true);
    });
});
