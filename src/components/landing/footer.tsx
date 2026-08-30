"use client";

import Image from "next/image";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

export default function LandingFooter() {
  const t = useTranslations("landingFooter");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="relative h-6 w-6 shrink-0">
            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" />
          </div>
          <span className="text-sm font-semibold text-foreground">{APP_NAME}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}. {t("tagline")}
        </p>
      </div>
    </footer>
  );
}
