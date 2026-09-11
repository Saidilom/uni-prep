import { describe, it, expect } from "vitest";
import { landingMetadata, landingJsonLd, SITEMAP_PATHS } from "./seo";
import { landingUrl, LANDING_PATH } from "./landing-routes";
import { SITE_URL } from "./app-config";
import { locales } from "./i18n/config";

// Сторож за разметкой для поиска.
//
// Проверяется ровно то, что ломается молча: hreflang, указывающий не туда,
// хуже отсутствующего — поиск склеивает страницы и показывает одну на оба
// языка, а узнать об этом можно только из Search Console недели спустя.

describe("адреса языковых версий", () => {
    it("узбекская версия живёт на корне, русская — на /ru", () => {
        // Именно ссылку testregiston.uz люди ищут и пересылают, поэтому
        // основной язык стоит на апексе, а не на /uz.
        expect(LANDING_PATH.uz).toBe("/");
        expect(LANDING_PATH.ru).toBe("/ru");
        expect(landingUrl(SITE_URL, "uz")).toBe(`${SITE_URL}/`);
        expect(landingUrl(SITE_URL, "ru")).toBe(`${SITE_URL}/ru`);
    });
});

describe("landingMetadata", () => {
    it("canonical каждой версии указывает на саму себя", () => {
        for (const locale of locales) {
            expect(landingMetadata(locale).alternates?.canonical).toBe(landingUrl(SITE_URL, locale));
        }
    });

    it("hreflang взаимен: обе страницы перечисляют обе версии одинаково", () => {
        // Google игнорирует разметку целиком, если ссылки не взаимны.
        const [first, ...rest] = locales.map((locale) => landingMetadata(locale).alternates?.languages);
        for (const other of rest) expect(other).toEqual(first);
        for (const locale of locales) {
            expect(first?.[locale]).toBe(landingUrl(SITE_URL, locale));
        }
        expect(first?.["x-default"]).toBe(landingUrl(SITE_URL, "uz"));
    });

    it("заголовок absolute — иначе шаблон раскладки припишет имя второй раз", () => {
        for (const locale of locales) {
            const title = landingMetadata(locale).title;
            expect(title).toHaveProperty("absolute");
            const text = (title as { absolute: string }).absolute;
            expect(text).toContain("Registan");
            // Имя ровно один раз: «… — Registan · Registan» это и есть тот
            // самый склеенный заголовок.
            expect(text.split("Registan")).toHaveLength(2);
        }
    });

    it("у каждого языка свои заголовок и описание", () => {
        const uz = landingMetadata("uz");
        const ru = landingMetadata("ru");
        expect(uz.title).not.toEqual(ru.title);
        expect(uz.description).not.toEqual(ru.description);
        // Описание короче ~160 символов, иначе поиск обрежет его на середине.
        for (const meta of [uz, ru]) expect(meta.description!.length).toBeLessThanOrEqual(165);
    });

    it("картинка соцсетей объявлена явно", () => {
        // Файловая opengraph-image.tsx подхватывается сама только там, где
        // страница не объявляет свой openGraph. Здесь объявляет.
        for (const locale of locales) {
            expect(landingMetadata(locale).openGraph?.images).toBeTruthy();
        }
    });
});

describe("landingJsonLd", () => {
    it("организация и сайт связаны одним идентификатором", () => {
        const graph = landingJsonLd("uz")["@graph"];
        const organization = graph.find((node) => node["@type"] === "EducationalOrganization");
        const website = graph.find((node) => node["@type"] === "WebSite");
        expect(organization).toBeTruthy();
        expect(website).toBeTruthy();
        // Ссылка WebSite → publisher обязана попадать в @id организации,
        // иначе поиск читает два несвязанных объекта.
        expect((website as { publisher: { "@id": string } }).publisher["@id"])
            .toBe((organization as { "@id": string })["@id"]);
    });

    it("язык разметки совпадает с языком страницы", () => {
        for (const locale of locales) {
            const website = landingJsonLd(locale)["@graph"].find((node) => node["@type"] === "WebSite");
            expect((website as { inLanguage: string }).inLanguage).toBe(locale);
        }
    });
});

describe("карта сайта", () => {
    it("содержит обе версии и не содержит /uz", () => {
        expect([...SITEMAP_PATHS]).toEqual(["/", "/ru"]);
        // /uz — тот же самый лендинг с каноническим адресом «/»; в карте он
        // был бы объявленным дублем.
        expect(SITEMAP_PATHS).not.toContain("/uz");
    });
});
