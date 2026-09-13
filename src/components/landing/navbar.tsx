"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";
import { useLocale } from "@/lib/i18n/locale-provider";
import { LANDING_PATH } from "@/lib/landing-routes";
import { locales } from "@/lib/i18n/config";

// Шапка — по макету: липкая полоса без рамки, марка слева заголовочным
// шрифтом, якоря подряд, справа язык и одна кнопка.
//
// Переключатель языка здесь СВОЙ, а не общий LocaleSwitcher: в макете это две
// голые надписи RU / UZ, а общий компонент рисует «таблетку» с рамкой, чужую
// этой сетке. Ссылками, а не кнопками, — язык на лендинге задаёт адрес.

export default function LandingNavbar() {
  const t = useTranslations("landingNav");
  const { locale } = useLocale();

  const links = [
    { label: t("results"), href: "#results" },
    { label: t("features"), href: "#platform" },
    { label: t("howItWorks"), href: "#how-it-works" },
    { label: t("faq"), href: "#faq" },
  ];

  return (
    <nav
      className="sticky top-0 z-20 flex flex-wrap items-center gap-x-5 gap-y-2 px-[clamp(20px,5vw,72px)] py-3"
      style={{ background: "var(--color-bg)" }}
    >
      <Link
        href="/"
        className="heading mr-auto text-[18px] tracking-[0.04em]"
        style={{ color: "var(--color-text)" }}
      >
        {APP_NAME.toUpperCase()}
      </Link>

      <div className="hidden items-center gap-5 md:flex">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm transition-colors"
            style={{ color: "var(--color-text)" }}
          >
            {link.label}
          </a>
        ))}
      </div>

      <span className="ml-auto flex items-center gap-3">
        <span className="flex gap-2 text-[13px] tracking-[0.12em]">
          {locales.map((item) => (
            <Link
              key={item}
              href={LANDING_PATH[item]}
              hrefLang={item}
              style={{
                color: item === locale ? "var(--color-accent-700)" : "var(--color-neutral-600)",
                fontWeight: item === locale ? 700 : 400,
              }}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </span>
        <Link href="/join" className="btn btn-primary">
          {t("start")} →
        </Link>
      </span>
    </nav>
  );
}
