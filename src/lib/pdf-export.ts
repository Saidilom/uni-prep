// Выгрузка экрана результатов в PDF — целиком, включая графики.
//
// ═══ ПОЧЕМУ ПОБЛОЧНО, А НЕ ОДНИМ СНИМКОМ ═══
//
// Самый простой способ — снять весь контейнер одним html2canvas и нарезать
// картинку на страницы по высоте A4. У него есть цена: разрез приходится ровно
// там, где кончилась страница, а не там, где кончилась карточка — заголовок
// панели «Надёжность» мог бы остаться на одной странице, а её числа уехать на
// следующую.
//
// Здесь каждый блок (`data-pdf-block`) снимается ОТДЕЛЬНЫМ канвасом, а
// раскладку по страницам решает чистая функция planPageLayout — без DOM и без
// канваса, поэтому она в тесте рядом (pdf-export.test.ts), а не только на
// глаз в браузере.
//
// Библиотеки — динамическим импортом: обе нужны только этой одной кнопке в
// админке, и тянуть ~200 КБ канваса в каждую страницу, которая рендерит
// список мок-тестов, незачем.

const PAGE_MARGIN_PT = 24;
const BLOCK_GAP_PT = 10;
// JPEG, не PNG: скриншот интерфейса — это не иконки с резкими краями, а вёрстка
// с текстом и заливками, и на них JPEG держит вид неотличимым от PNG при
// впятеро меньшем весе. При полусотне карточек это разница между файлом на
// 3 МБ и на 20.
const JPEG_QUALITY = 0.92;

export type PdfExportOptions = {
    /** Имя файла без расширения. */
    filename: string;
    /**
     * Масштаб рендера. 2 даёт чёткий текст на Retina, но на контейнере в
     * несколько экранов высотой это счётом мегапикселей: держим потолок,
     * чтобы вкладка не подвисла на канвасе-гиганте.
     */
    scale?: number;
};

// ═══════════════════════ Раскладка по страницам — чистая функция ═══════════════════════

export type PdfBlockSize = { heightPt: number };

export type PdfSlicePlacement = {
    /** Индекс блока во входном массиве. */
    blockIndex: number;
    /** Номер страницы, с нуля. */
    page: number;
    /** Отступ сверху внутри страницы, в pt (без учёта поля страницы). */
    y: number;
    /** Высота среза, в pt. */
    height: number;
    /** Смещение среза от начала блока, в pt. 0, если блок не резался. */
    sourceOffset: number;
};

/**
 * Раскладывает блоки известной высоты по страницам заданной высоты.
 *
 * Правило одно: блок, помещающийся вContentHeight целиком, переносится на
 * новую страницу без остатка, если не помещается на текущей; блок выше самой
 * страницы неизбежно режется, но режется на границе новой страницы, а не там,
 * где случайно кончилось место на предыдущей, — и только последний, самый
 * короткий срез оставляет на своей странице место для следующего блока.
 *
 * Ничего не знает ни про DOM, ни про канвас — входные и выходные единицы
 * одни и те же, pt, поэтому проверяется числами, без браузера.
 */
export function planPageLayout(
    blocks: readonly PdfBlockSize[],
    contentHeightPt: number,
    gapPt: number,
): PdfSlicePlacement[] {
    const placements: PdfSlicePlacement[] = [];
    let page = 0;
    let cursorY = 0;
    let pageHasContent = false;

    blocks.forEach((block, blockIndex) => {
        if (block.heightPt <= contentHeightPt) {
            if (pageHasContent && cursorY + block.heightPt > contentHeightPt) {
                page += 1;
                cursorY = 0;
                pageHasContent = false;
            }
            placements.push({ blockIndex, page, y: cursorY, height: block.heightPt, sourceOffset: 0 });
            cursorY += block.heightPt + gapPt;
            pageHasContent = true;
            return;
        }

        // Блок выше целой страницы — начинается с чистого листа, чтобы резать
        // по его собственным границам, а не по остатку места предыдущего блока.
        if (pageHasContent) {
            page += 1;
            cursorY = 0;
            pageHasContent = false;
        }
        let renderedPt = 0;
        let first = true;
        while (renderedPt < block.heightPt) {
            const slicePt = Math.min(contentHeightPt, block.heightPt - renderedPt);
            if (!first) {
                page += 1;
                cursorY = 0;
            }
            placements.push({ blockIndex, page, y: 0, height: slicePt, sourceOffset: renderedPt });
            cursorY = slicePt + gapPt;
            pageHasContent = true;
            renderedPt += slicePt;
            first = false;
        }
    });

    return placements;
}

// ═══════════════════════ Ввод-вывод: DOM, канвас, файл ═══════════════════════

/**
 * Ждёт, пока в контейнере не останется ни одной заглушки загрузки
 * (`data-panel-skeleton`, см. panel-skeleton.tsx).
 *
 * ═══ ЗАЧЕМ ═══
 *
 * Панели на экране результатов грузят свои данные сами, в useEffect на
 * монтировании, — независимо от того, свёрнуты они или раскрыты. На открытой
 * секунду назад странице они уже почти наверняка загружены, но гарантии нет:
 * нажми «Скачать PDF» сразу после перехода на страницу — и выгрузка снимет
 * серые заглушки вместо графиков.
 *
 * Опрос, а не одна фиксированная пауза: с сетью получше это лишние сотни
 * миллисекунд ожидания впустую, с сетью похуже — недостаточно.
 */
async function waitForSkeletonsToClear(container: HTMLElement, timeoutMs = 8000): Promise<void> {
    const start = Date.now();
    while (container.querySelector("[data-panel-skeleton]")) {
        if (Date.now() - start > timeoutMs) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
}

async function loadLibs() {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
    ]);
    return { html2canvas, jsPDF };
}

/**
 * Рендерит один DOM-узел в канвас нужного масштаба.
 *
 * `backgroundColor: "#ffffff"` — не косметика: у карточек `bg-card` фон
 * прозрачный в тёмной теме, а PDF своей подложки не даёт вообще. Без явного
 * белого админ, открывший страницу в тёмном режиме, получил бы файл с чёрными
 * дырами вместо карточек.
 */
async function renderBlock(
    html2canvas: Awaited<ReturnType<typeof loadLibs>>["html2canvas"],
    el: HTMLElement,
    scale: number,
): Promise<HTMLCanvasElement> {
    return html2canvas(el, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
        // Без этого html2canvas по умолчанию режет на границе окна просмотра —
        // блоки ниже видимой области экрана (весь список учеников на длинном
        // моке) снимались бы пустыми.
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
    });
}

function cropCanvas(source: HTMLCanvasElement, offsetPx: number, heightPx: number): HTMLCanvasElement {
    const crop = document.createElement("canvas");
    crop.width = source.width;
    crop.height = heightPx;
    const ctx = crop.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D недоступен");
    ctx.drawImage(source, 0, offsetPx, source.width, heightPx, 0, 0, source.width, heightPx);
    return crop;
}

/**
 * Собирает PDF из блоков внутри `container`, помеченных `data-pdf-block`.
 *
 * Каждый такой узел — логическая единица разметки (карточка, панель, секция):
 * раскладка по страницам решена planPageLayout выше, здесь только рендер и
 * запись файла.
 */
export async function exportBlocksToPdf(
    container: HTMLElement,
    { filename, scale = 1.5 }: PdfExportOptions,
): Promise<void> {
    await waitForSkeletonsToClear(container);

    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-block]"))
        // Пустой блок (например, панель, у которой сейчас нечего показывать)
        // не должен стоить пустой страницы.
        .filter((el) => el.offsetHeight > 0 && el.offsetWidth > 0);
    if (elements.length === 0) {
        throw new Error("Нет ни одного блока для выгрузки");
    }

    const { html2canvas, jsPDF } = await loadLibs();
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidthPt = pageWidth - PAGE_MARGIN_PT * 2;
    const contentHeightPt = pageHeight - PAGE_MARGIN_PT * 2;

    const rendered = await Promise.all(elements.map((el) => renderBlock(html2canvas, el, scale)));
    const ptPerPxByBlock = rendered.map((canvas) => contentWidthPt / canvas.width);
    const sizes: PdfBlockSize[] = rendered.map((canvas, i) => ({ heightPt: canvas.height * ptPerPxByBlock[i] }));

    const placements = planPageLayout(sizes, contentHeightPt, BLOCK_GAP_PT);

    let currentPage = 1;
    for (const placement of placements) {
        const jsPdfPage = placement.page + 1;
        if (jsPdfPage > currentPage) {
            pdf.addPage();
            currentPage = jsPdfPage;
        }
        pdf.setPage(currentPage);

        const canvas = rendered[placement.blockIndex];
        const ptPerPx = ptPerPxByBlock[placement.blockIndex];
        const offsetPx = Math.round(placement.sourceOffset / ptPerPx);
        const heightPx = Math.round(placement.height / ptPerPx);
        // Блок мог не резаться вовсе — тогда обрезка не нужна, снимаем целиком.
        const slice = placement.sourceOffset === 0 && heightPx >= canvas.height
            ? canvas
            : cropCanvas(canvas, offsetPx, Math.min(heightPx, canvas.height - offsetPx));

        pdf.addImage(
            slice.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG",
            PAGE_MARGIN_PT, PAGE_MARGIN_PT + placement.y, contentWidthPt, placement.height,
        );
    }

    pdf.save(`${filename}.pdf`);
}
