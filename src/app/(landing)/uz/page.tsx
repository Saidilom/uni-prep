import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import LandingView from "@/components/landing";
import { landingMetadata, landingJsonLd } from "@/lib/seo";

// Узбекская версия лендинга.
//
// Открывается по адресу «/»: middleware переписывает корень сюда для тех, кто
// не вошёл (см. middleware.ts). Прямой адрес /uz тоже работает, но канонический
// у него — корень, поэтому дубля в поиске не возникает.
//
// ═══ ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ МАРШРУТ, А НЕ «/» ═══
//
// Лендинг и раньше рисовался на «/» строкой `if (!user) return <LandingView/>`,
// но до неё серверный рендер не доходил: раскладка (dashboard)/layout.tsx
// возвращает крутилку, пока `isLoading`, а стартовое значение в сторе — true,
// и на сервере оно истинно всегда. Робот получал 8 символов текста.
//
// Здесь раскладки (dashboard) нет, и та же самая разметка приезжает готовым
// HTML. Ни один компонент лендинга при этом не переписан: "use client"
// серверному рендеру не мешает — мешал именно гейт.
export const metadata: Metadata = landingMetadata("uz");

export default function UzLandingPage() {
    return (
        <>
            <script
                type="application/ld+json"
                // Данные наши собственные, не пользовательские: подставлять сюда
                // нечего, и JSON.stringify экранирует кавычки сам.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd("uz")) }}
            />
            <LocaleProvider initialLocale="uz">
                <LandingView />
            </LocaleProvider>
        </>
    );
}
