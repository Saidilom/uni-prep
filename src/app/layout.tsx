import type { Metadata } from "next";
import localFont from "next/font/local";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import AuthProvider from "@/components/auth-provider";
import "./globals.css";

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

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Uni-Prep",
  description: "Система подготовки к университету",
  icons: {
    icon: [
      { url: "/auto-Photoroom.png", sizes: "any", type: "image/png" },
      { url: "/auto-Photoroom.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/auto-Photoroom.png",
    apple: [
      { url: "/auto-Photoroom.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="512x512" href="/auto-Photoroom.png" />
        <link rel="icon" type="image/png" sizes="256x256" href="/auto-Photoroom.png" />
        <link rel="icon" type="image/png" sizes="128x128" href="/auto-Photoroom.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/auto-Photoroom.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/auto-Photoroom.png" />
        <link rel="shortcut icon" href="/auto-Photoroom.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/auto-Photoroom.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${inter.variable} antialiased min-h-screen relative app-bg`}
      >
        <div className="relative z-10 min-h-screen">
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
