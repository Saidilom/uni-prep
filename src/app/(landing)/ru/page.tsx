import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import LandingView from "@/components/landing";
import { landingMetadata, landingJsonLd } from "@/lib/seo";
import { fetchLandingStats } from "@/lib/landing-stats-server";

// Русская версия лендинга. Устройство — как у узбекской (см. соседний файл),
// язык навязан вложенным LocaleProvider: cookie посетителя здесь не решает
// ничего, иначе адрес и текст расходились бы.
export const metadata: Metadata = landingMetadata("ru");

export default async function RuLandingPage() {
    // Числа считаются здесь, на сервере: в разметку они попадают уже готовыми,
    // и роботу не приходится ждать браузерного запроса.
    const stats = await fetchLandingStats();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd("ru")) }}
            />
            <LocaleProvider initialLocale="ru">
                <LandingView stats={stats} />
            </LocaleProvider>
        </>
    );
}
