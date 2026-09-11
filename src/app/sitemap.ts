import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/app-config";
import { landingUrl } from "@/lib/landing-routes";
import { locales } from "@/lib/i18n/config";

// Карта сайта.
//
// В ней только языковые версии лендинга: всё остальное на сайте — за входом и
// для поиска закрыто (см. robots.ts). Карта из двух адресов выглядит скромно,
// но её задача не в количестве, а в том, чтобы обе языковые версии были
// объявлены явно и связаны между собой.
//
// Адрес /uz сюда НЕ попадает: его канонический адрес — корень, и объявлять
// обе ссылки значило бы показывать поиску дубль.
export default function sitemap(): MetadataRoute.Sitemap {
    const languages = Object.fromEntries(
        locales.map((locale) => [locale, landingUrl(SITE_URL, locale)]),
    );
    return locales.map((locale) => ({
        url: landingUrl(SITE_URL, locale),
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: locale === "uz" ? 1 : 0.9,
        alternates: { languages },
    }));
}
