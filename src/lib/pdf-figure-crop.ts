// Вырезка рисунка задания из исходного PDF.
//
// ═══ ЗАЧЕМ ═══
//
// Раньше рисунка как отдельной картинки не существовало вовсе. Задание с
// needsSourceImage получало ссылку на ВЕСЬ исходный PDF, и на экране открывался
// просмотрщик файла целиком (`/api/mock-tests/[id]/source?page=N`). Ученик
// видел не свой рисунок, а страницу — а на странице 9 математики их четыре,
// от заданий 40a, 40b, 41a и 41b, — и мог листать остальные листы теста.
//
// Здесь из страницы вырезается ровно прямоугольник рисунка, названный моделью
// (figureBox), и получается PNG, который прикрепляется к заданию.
//
// ═══ СИСТЕМЫ КООРДИНАТ ═══
//
// Их две, и путать их нельзя:
//
//   figureBox — доли страницы 0..1, начало отсчёта СЛЕВА СВЕРХУ. Так думает
//               модель, и так же устроены координаты изображений.
//   PDF       — пункты, начало отсчёта задаёт сам документ через MediaBox, и
//               getBounds() возвращает [x0, y0, x1, y1] уже в его системе.
//
// Перевод идёт через getBounds(), а не через «высота минус y»: страница не
// обязана начинаться в нуле, у неё бывает смещённый MediaBox, и вычитание из
// высоты промахнулось бы ровно на это смещение.

/** Во сколько раз рендерить относительно пунктов. 2 даёт читаемый текст подписей. */
export const FIGURE_RENDER_SCALE = 2;

/** Поля вокруг рамки, в долях страницы: модель иногда обрезает подпись впритык. */
export const FIGURE_PADDING = 0.01;

/**
 * Ниже этого рамка не рисунок, а промах модели.
 *
 * Доля страницы по любой стороне. Полоска в 1% высоты — это строка текста, а не
 * график; вырезать её значило бы прикрепить к заданию обрезок.
 */
export const MIN_FIGURE_SIDE = 0.03;

export type FigureBox = { x: number; y: number; width: number; height: number };

export type NormalizedBox = FigureBox;

export type BoxRejection =
    | "NO_BOX"
    /** Числа не числа или вне 0..1. */
    | "OUT_OF_RANGE"
    /** Слишком узкая или низкая — это не рисунок. */
    | "TOO_SMALL";

export type BoxCheck =
    | { ok: true; box: NormalizedBox }
    | { ok: false; reason: BoxRejection };

/**
 * Проверка и подготовка рамки.
 *
 * Поля добавляются ДО обрезки по краям страницы, поэтому рамка у самого края
 * не выходит за лист, а просто упирается в него.
 *
 * Отказ возвращается статусом, а не молчаливой подстановкой (§233): рамки нет —
 * значит картинки не будет, и это честнее, чем вырезать случайный кусок.
 */
export function prepareFigureBox(raw: FigureBox | null | undefined): BoxCheck {
    if (!raw) return { ok: false, reason: "NO_BOX" };
    const { x, y, width, height } = raw;
    const finite = [x, y, width, height].every((v) => typeof v === "number" && Number.isFinite(v));
    if (!finite) return { ok: false, reason: "OUT_OF_RANGE" };
    if (width <= 0 || height <= 0) return { ok: false, reason: "OUT_OF_RANGE" };
    if (x < 0 || y < 0 || x > 1 || y > 1) return { ok: false, reason: "OUT_OF_RANGE" };

    const left = Math.max(0, x - FIGURE_PADDING);
    const top = Math.max(0, y - FIGURE_PADDING);
    const right = Math.min(1, x + width + FIGURE_PADDING);
    const bottom = Math.min(1, y + height + FIGURE_PADDING);

    const box = { x: left, y: top, width: right - left, height: bottom - top };
    if (box.width < MIN_FIGURE_SIDE || box.height < MIN_FIGURE_SIDE) {
        return { ok: false, reason: "TOO_SMALL" };
    }
    return { ok: true, box };
}

/** Границы страницы в пунктах, как их отдаёт mupdf: [x0, y0, x1, y1]. */
export type PageBounds = readonly [number, number, number, number];

/**
 * Рамка в долях страницы → прямоугольник в координатах PDF.
 *
 * y растёт вниз в долях и вниз же в системе mupdf (getBounds отдаёт y0 сверху),
 * поэтому переворачивать ось не нужно — нужно лишь сместиться на начало
 * страницы. Именно это и проверяет тест на смещённый MediaBox.
 */
export function boxToPdfRect(box: NormalizedBox, bounds: PageBounds): [number, number, number, number] {
    const [x0, y0, x1, y1] = bounds;
    const w = x1 - x0;
    const h = y1 - y0;
    return [
        x0 + w * box.x,
        y0 + h * box.y,
        x0 + w * (box.x + box.width),
        y0 + h * (box.y + box.height),
    ];
}

/** Размер вырезки в пикселях при заданном масштабе. */
export function cropPixelSize(box: NormalizedBox, bounds: PageBounds, scale = FIGURE_RENDER_SCALE) {
    const [rx0, ry0, rx1, ry1] = boxToPdfRect(box, bounds);
    return {
        width: Math.max(1, Math.round((rx1 - rx0) * scale)),
        height: Math.max(1, Math.round((ry1 - ry0) * scale)),
    };
}

/**
 * Вырезает рисунок и отдаёт PNG.
 *
 * mupdf грузится динамически: это WASM-модуль с top-level await, и статический
 * импорт затянул бы его в каждый бандл, где встретится этот файл.
 *
 * Ошибку не глотаем и не подменяем пустой картинкой — вызывающий решает, что
 * делать с заданием без рисунка.
 */
export async function cropFigureToPng(
    pdfBytes: Uint8Array,
    pageNumber: number,
    box: NormalizedBox,
    scale = FIGURE_RENDER_SCALE,
): Promise<{ png: Uint8Array; width: number; height: number }> {
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
    const pageCount = doc.countPages();
    if (pageNumber < 1 || pageNumber > pageCount) {
        throw new Error(`Страница ${pageNumber} вне документа (страниц: ${pageCount})`);
    }
    const page = doc.loadPage(pageNumber - 1);
    const bounds = page.getBounds() as unknown as PageBounds;
    const rect = boxToPdfRect(box, bounds);

    const matrix = mupdf.Matrix.scale(scale, scale);
    // Прямоугольник пикселей — та же рамка, проведённая через то же
    // преобразование. Считать его умножением на scale вручную нельзя: у
    // страницы со смещённым началом отсчёта результат разъехался бы.
    const bbox = (mupdf.Rect.transform(rect as unknown as never, matrix) as unknown as number[]).map(Math.round);
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox as unknown as never, false);
    // Белая подложка: у PDF прозрачный фон, и без неё вырезка вышла бы чёрной.
    pixmap.clear(255);
    const device = new mupdf.DrawDevice(matrix, pixmap);
    page.run(device, mupdf.Matrix.identity);
    device.close();

    return {
        png: pixmap.asPNG() as Uint8Array,
        width: pixmap.getWidth(),
        height: pixmap.getHeight(),
    };
}
