import type { Metadata } from "next";
import { SITE_URL, APP_NAME } from "./app-config";
import { landingUrl, LANDING_PATH } from "./landing-routes";
import { locales, type Locale } from "./i18n/config";

// Метаданные и разметка для поиска.
//
// ═══ ЗАЧЕМ ЭТОТ ФАЙЛ ═══
//
// Заголовок, описание, canonical и hreflang должны согласованно повторяться на
// каждой языковой версии лендинга. Разложенные по страницам, они разъезжаются
// при первой же правке — а hreflang, указывающий не туда, хуже отсутствующего:
// поиск склеивает страницы и выбирает показывать одну на оба запроса.

type LandingCopy = { title: string; description: string; ogLocale: string };

// Текст именно тот, которым ищут. «Платформа подготовки к Национальному
// сертификату» — это как мы себя называем, а не то, что набирают в поиске.
const COPY: Record<Locale, LandingCopy> = {
    uz: {
        title: "Milliy sertifikat va mock imtihonlar — Registan",
        description:
            "Milliy sertifikatga tayyorgarlik: darajani aniqlovchi kirish testi, haqiqiy imtihon formatidagi mock imtihonlar va har bir urinishdan keyin batafsil tahlil.",
        ogLocale: "uz_UZ",
    },
    ru: {
        title: "Подготовка к Национальному сертификату и Mock-экзамены — Registan",
        description:
            "Вступительный тест на уровень, Mock-экзамены в формате настоящего экзамена и разбор после каждой попытки. Для учеников, учителей и учебного центра.",
        ogLocale: "ru_RU",
    },
};

/**
 * hreflang одинаков на обеих страницах и перечисляет ОБЕ версии плюс себя.
 * Так требует Google: ссылки должны быть взаимными, иначе разметка
 * игнорируется целиком.
 */
function languageAlternates(): Record<string, string> {
    const alternates: Record<string, string> = {};
    for (const locale of locales) alternates[locale] = landingUrl(SITE_URL, locale);
    // x-default — куда отправлять посетителя, чей язык не совпал ни с одним.
    alternates["x-default"] = landingUrl(SITE_URL, "uz");
    return alternates;
}

export function landingMetadata(locale: Locale): Metadata {
    const copy = COPY[locale];
    return {
        // absolute — чтобы шаблон корневой раскладки не приклеил «· Registan»
        // к заголовку, в котором имя уже есть.
        title: { absolute: copy.title },
        description: copy.description,
        alternates: {
            // У `/uz` канонический адрес — корень: содержимое то же самое, а в
            // выдаче должен стоять сам домен, а не адрес с языком.
            canonical: landingUrl(SITE_URL, locale),
            languages: languageAlternates(),
        },
        openGraph: {
            type: "website",
            siteName: APP_NAME,
            url: landingUrl(SITE_URL, locale),
            title: copy.title,
            description: copy.description,
            locale: copy.ogLocale,
            // Картинку приходится называть явно. Файловая opengraph-image.tsx
            // подхватывается сама только там, где страница НЕ объявляет свой
            // openGraph, — а здесь объявляет, и без этой строки ссылка на
            // лендинг разворачивалась бы в мессенджере без картинки, хотя она
            // есть и отдаётся. Адрес относительный: абсолютным его делает
            // metadataBase.
            images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: copy.title }],
        },
        twitter: {
            card: "summary_large_image",
            title: copy.title,
            description: copy.description,
            images: ["/opengraph-image"],
        },
    };
}

/**
 * Разметка организации и сайта.
 *
 * Из неё поиск собирает карточку по брендовому запросу «registan» — название,
 * логотип, ссылку. Без разметки он берёт первое, что найдёт на странице.
 */
export function landingJsonLd(locale: Locale) {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "EducationalOrganization",
                "@id": `${SITE_URL}/#organization`,
                name: APP_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/registan-logo.png`,
                description: COPY[locale].description,
                areaServed: "UZ",
                availableLanguage: ["uz", "ru"],
            },
            {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: APP_NAME,
                inLanguage: locale,
                publisher: { "@id": `${SITE_URL}/#organization` },
            },
        ],
    };
}

/** Адреса, которые отдаём поиску в карте сайта. */
export const SITEMAP_PATHS = [LANDING_PATH.uz, LANDING_PATH.ru] as const;
