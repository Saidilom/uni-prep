"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Подвал — три колонки, как в макете (марка, навигация, вход).
//
// Колонки «Контакты» из макета нет: телефона и почты у нас не существует, а
// выдуманный контакт на сайте, где принимают оплату, хуже отсутствующего — по
// нему напишут и не получат ответа. Появится, когда владелец даст настоящие.

export default function LandingFooter() {
  const t = useTranslations("landingFooter");
  const nav = useTranslations("landingNav");

  const links = [
    { label: nav("results"), href: "#results" },
    { label: nav("features"), href: "#platform" },
    { label: nav("faq"), href: "#faq" },
  ];

  const label = "text-[13px] uppercase tracking-[0.14em]";

  return (
    <footer
      className="grid gap-8 py-10 sm:grid-cols-3"
      style={{ borderTop: "1px solid var(--color-divider)" }}
    >
      <div>
        <span className="heading block text-[18px] tracking-[0.04em]">{APP_NAME.toUpperCase()}</span>
        <p className="mt-3 max-w-[32ch] text-[14px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>
          {t("tagline")}
        </p>
        <p className="mt-4 text-[13px]" style={{ color: "var(--color-neutral-600)" }}>
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>

      <div>
        <span className={label} style={{ color: "var(--color-neutral-600)" }}>{t("navigationLabel")}</span>
        <div className="mt-3 flex flex-col gap-2">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-[14px]" style={{ color: "var(--color-accent-700)" }}>
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div>
        <span className={label} style={{ color: "var(--color-neutral-600)" }}>{t("accountLabel")}</span>
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/login" className="text-[14px]" style={{ color: "var(--color-accent-700)" }}>{nav("login")}</Link>
          <Link href="/join" className="text-[14px]" style={{ color: "var(--color-accent-700)" }}>{nav("start")}</Link>
        </div>
      </div>
    </footer>
  );
}
