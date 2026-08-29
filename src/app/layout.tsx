import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { Golos_Text } from "next/font/google";
import AuthProvider from "@/components/auth-provider";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/app-config";
import "./globals.css";
import "katex/dist/katex.min.css";

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
  title: APP_NAME,
  description: APP_DESCRIPTION,
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
  return (
    <html lang="en" suppressHydrationWarning>
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
        className={`${golosText.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen relative app-bg`}
      >
        <div className="relative z-10 min-h-screen">
          <Suspense fallback={null}>
            <AuthProvider>{children}</AuthProvider>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
