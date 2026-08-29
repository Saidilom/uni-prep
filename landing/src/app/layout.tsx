import type { Metadata } from "next";
import { Golos_Text } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/config";

const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-golos-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_DESCRIPTION}`,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={golosText.variable}>
      <body>{children}</body>
    </html>
  );
}
