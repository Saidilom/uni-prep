import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { Golos_Text, Playfair_Display } from "next/font/google";
import AuthProvider from "@/components/auth-provider";
import { GlobalProviders } from "@/components/global-providers";
import { APP_NAME, APP_DESCRIPTION, SITE_URL } from "@/lib/app-config";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { getServerLocale } from "@/lib/i18n/get-locale";
import "./globals.css";
import "katex/dist/katex.min.css";

// Заголовок лендинга с засечками — по присланному макету. Подключён только
// как переменная: класс font-display применяется точечно, на сайте в целом
// шрифт не меняется.
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  weight: ["600", "700"],
});
const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-golos-text",
  weight: ["400", "500", "600", "700", "800"],
});
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  // Без metadataBase относительные ссылки на картинку соцсетей так и остаются
  // относительными, а Telegram и Google требуют абсолютных — карточка просто
  // не собирается.
  metadataBase: new URL(SITE_URL),
  title: {
    // Внутренние экраны оставляют короткое имя во вкладке; поисковый заголовок
    // задают страницы лендинга своим absolute-заголовком.
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    url: SITE_URL,
  },
  // Подтверждение прав в Search Console. Через окружение, а не строкой в коде:
  // код у каждого ресурса свой, и в репозитории ему делать нечего. Пока
  // переменной нет, тега тоже нет — пустой meta хуже отсутствующего.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  icons: {
    icon: [
      { url: "/gogg.png", sizes: "any", type: "image/png" },
      { url: "/gogg.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/gogg.png",
    apple: [
      { url: "/gogg.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = getServerLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="512x512" href="/gogg.png" />
        <link rel="icon" type="image/png" sizes="256x256" href="/gogg.png" />
        <link rel="icon" type="image/png" sizes="128x128" href="/gogg.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/gogg.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/gogg.png" />
        <link rel="shortcut icon" href="/gogg.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/gogg.png" />
      </head>
      <body
        className={`${golosText.variable} ${playfair.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen relative app-bg`}
      >
        <div className="relative z-10 min-h-screen">
          <LocaleProvider initialLocale={locale}>
            <Suspense fallback={null}>
              <AuthProvider>
                <GlobalProviders>{children}</GlobalProviders>
              </AuthProvider>
            </Suspense>
          </LocaleProvider>
        </div>
      </body>
    </html>
  );
}
