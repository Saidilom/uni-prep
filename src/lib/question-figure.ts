// Рисунок задания, загруженный человеком.
//
// ═══ ЗАЧЕМ РУЧНАЯ ЗАГРУЗКА, ЕСЛИ ЕСТЬ АВТОВЫРЕЗКА ═══
//
// Автовырезка (pdf-figure-crop.ts) держится на рамке figureBox, которую
// называет модель, а та её иногда не находит вовсе и по уговору возвращает
// null — выдуманная рамка вырезала бы случайный кусок страницы (§233). Раньше
// такое задание уезжало ученику с ссылкой на ВЕСЬ PDF теста. Теперь у него
// просто нет картинки, и долить её должен человек — отсюда этот файл.
//
// Здесь только чистые решения: что считать годным файлом, куда его положить и
// какую ссылку признать своей. Сеть и хранилище — в роуте.

/** Что принимаем. PNG даёт автовырезка, JPEG/WebP приносит человек скриншотом. */
export const FIGURE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type FigureMime = (typeof FIGURE_MIME_TYPES)[number];

/** Столько же стоит в самом bucket (миграция 107). Держать числа равными. */
export const MAX_FIGURE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<FigureMime, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};

export const QUESTION_FIGURES_BUCKET = "question-figures";

export type FigureFileCheck =
    | { ok: true; mime: FigureMime; ext: string }
    | { ok: false; reason: "TYPE" | "SIZE" | "EMPTY" };

/**
 * Годен ли файл в рисунок задания.
 *
 * Проверяется и на клиенте (сказать человеку сразу), и в роуте (клиенту верить
 * нельзя). Поэтому решение одно и живёт здесь, а не двумя копиями.
 */
export function checkFigureFile(file: { type: string; size: number }): FigureFileCheck {
    const mime = file.type.toLowerCase().trim() as FigureMime;
    if (!FIGURE_MIME_TYPES.includes(mime)) return { ok: false, reason: "TYPE" };
    if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, reason: "EMPTY" };
    if (file.size > MAX_FIGURE_BYTES) return { ok: false, reason: "SIZE" };
    return { ok: true, mime, ext: EXTENSIONS[mime] };
}

/**
 * Путь в хранилище. Каждая загрузка получает НОВОЕ имя.
 *
 * Перезаписывать один и тот же путь нельзя: bucket публичный, и по прежней
 * ссылке CDN ещё какое-то время отдавал бы старую картинку — человек заменил
 * рисунок, обновил страницу и увидел тот же самый. Уникальное имя снимает
 * вопрос целиком.
 */
export function figureStoragePath(scopeId: string, key: string, slot: string, ext: string): string {
    // Точка вырезается вместе с остальным: иначе из «q/../..» вышло бы имя с
    // «..» внутри, и рассуждать о безопасности пути пришлось бы через то, как
    // его разбирает хранилище. Разделяет расширение единственная точка, и её
    // ставим мы сами.
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64);
    return `${safe(scopeId)}/manual-${safe(key)}-${safe(slot)}.${safe(ext)}`;
}

/** Публичный префикс bucket'а рисунков у этого проекта Supabase. */
export function questionFiguresPublicPrefix(supabaseUrl: string): string {
    return `${supabaseUrl.trim().replace(/\/+$/, "")}/storage/v1/object/public/${QUESTION_FIGURES_BUCKET}/`;
}

/**
 * Наша ли это ссылка на рисунок.
 *
 * Черновик теста приезжает в /api/mock-tests от клиента, а imageUrl описан в
 * схеме как «любой валидный URL». Без этой проверки в задание можно положить
 * адрес чужого сайта, и он поедет ученику на экзамен: чужой хост увидит IP
 * каждого сдающего, а картинку там могут подменить в любой момент. Пускаем
 * только то, что лежит в нашем bucket.
 */
export function isOwnFigureUrl(url: string, supabaseUrl: string): boolean {
    if (!url || !supabaseUrl) return false;
    const prefix = questionFiguresPublicPrefix(supabaseUrl);
    const candidate = url.trim();
    // Строгое совпадение начала: префикс содержит и схему, и хост, и путь, так
    // что «https://evil.example/?u=https://наш/...» не пройдёт.
    return candidate.startsWith(prefix) && candidate.length > prefix.length;
}
