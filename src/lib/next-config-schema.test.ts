import { describe, it, expect } from "vitest";

// Сторож за next.config.mjs.
//
// ═══ ЗАЧЕМ ═══
//
// Next молча выбрасывает ключи, которых его версия не знает: в консоли сборки
// одна строка «Invalid next.config.mjs options detected», и сборка идёт дальше
// как ни в чём не бывало. Настройка при этом НЕ действует.
//
// Так и случилось с вырезкой рисунков заданий. В конфиге стояли
// `serverExternalPackages` и `outputFileTracingIncludes` — написание Next 15,
// а здесь Next 14.2. Оба ключа не сработали, mupdf попал в бандл и падал у
// каждого рисунка минифицированным «e is not a function». Заметили это не по
// сборке, а по проду: у живого мока десять заданий вместо графика показывали
// ученику весь PDF теста, и листать его можно было прямо на экзамене.
//
// Проверять руками список допустимых ключей бессмысленно — он меняется от
// версии к версии. Поэтому конфиг проверяется СОБСТВЕННОЙ схемой того Next,
// который стоит в node_modules: она перечисляет неизвестные ключи сама.
describe("next.config.mjs", () => {
    it("не содержит ключей, которых не знает установленная версия Next", async () => {
        // Схема лежит в CJS-файле; именованный экспорт из него у сборщиков
        // получается не всегда, отсюда запасной путь через default.
        const schemaModule = await import("next/dist/server/config-schema.js") as {
            configSchema?: { safeParse: (value: unknown) => { success: boolean; error?: unknown } };
            default?: { configSchema: { safeParse: (value: unknown) => { success: boolean; error?: unknown } } };
        };
        const configSchema = schemaModule.configSchema ?? schemaModule.default?.configSchema;
        expect(configSchema, "next/dist/server/config-schema перестал отдавать configSchema").toBeTruthy();

        const config = (await import("../../next.config.mjs")).default;
        const result = configSchema!.safeParse(config);

        // Сообщение об ошибке — в текст теста: без него падение выглядит как
        // «expected false to be true», и искать пришлось бы заново.
        expect(
            result.success,
            result.success ? "" : `next.config.mjs не прошёл схему Next: ${JSON.stringify(result.error, null, 2)}`,
        ).toBe(true);
    });

    it("mupdf объявлен внешним пакетом — иначе вырезка рисунков падает на сервере", async () => {
        const config = (await import("../../next.config.mjs")).default as {
            experimental?: {
                serverComponentsExternalPackages?: string[];
                outputFileTracingIncludes?: Record<string, string[]>;
            };
        };
        // Именно внутри experimental: в Next 14 это единственное действующее
        // место. Наверху тот же ключ пройдёт молча и не сделает ничего.
        expect(config.experimental?.serverComponentsExternalPackages).toContain("mupdf");
        // И .wasm обязан быть в трассировке роута импорта: без него модуль
        // грузится, но не находит своего бинарника.
        expect(config.experimental?.outputFileTracingIncludes?.["/api/mock-tests/import"]).toBeTruthy();
    });
});
