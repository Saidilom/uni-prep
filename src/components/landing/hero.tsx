"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "@/lib/i18n/locale-provider";
import type { LandingStats } from "@/lib/landing-stats";

// Первый экран — по макету: слева крупный заголовок в верхнем регистре, где
// последняя строка выделена акцентом, справа снимок в чертёжной рамке.
//
// ═══ ЧТО ВМЕСТО ФОТО ═══
//
// В макете здесь <image-slot> с подписью «Фото: занятие в центре» — заглушка
// под снимок, которого у нас нет. Ставлю логотип на поле цвета поверхности:
// пустая рамка честнее выдуманной фотографии, а рамка с метками держит
// композицию сама.
//
// Строка внизу — с настоящим числом учеников, а не «12 000+» из макета.

export default function LandingHero({ stats }: { stats: LandingStats | null }) {
  const t = useTranslations("landingHero");

  return (
    <section className="grid items-center gap-[clamp(24px,4vw,64px)] py-[clamp(48px,7vw,96px)] pb-[clamp(32px,4vw,56px)] lg:grid-cols-2">
      <div>
        <h1 className="text-[clamp(44px,6.4vw,88px)] leading-[1.04] tracking-[0.01em] -ml-[0.052em]">
          <span className="block">{t("titleLead")}</span>
          <span className="block" style={{ color: "var(--color-accent-700)" }}>
            {t("titleHighlight")}
          </span>
        </h1>

        <p
          className="mt-8 max-w-[56ch] text-[16px] leading-6"
          style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}
        >
          {t("subtitle")}
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/join" className="btn btn-primary">
            {t("start")} →
          </Link>
          <a href="#results" className="btn btn-ghost">
            {t("login")}
          </a>
        </div>

        {stats && stats.students > 0 && (
          <p
            className="mt-7 flex items-center gap-2.5 text-[13px] uppercase tracking-[0.06em]"
            style={{ color: "var(--color-accent-700)" }}
          >
            <span className="h-px w-7" style={{ background: "var(--color-divider)" }} />
            {t("studentsNote").replace("{count}", new Intl.NumberFormat("ru-RU").format(stats.students))}
          </p>
        )}
      </div>

      <figure className="blueprint m-0 flex aspect-[4/5] max-h-[70vh] items-center justify-center" style={{ background: "var(--color-surface)" }}>
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <div className="relative h-28 w-28 opacity-40 sm:h-40 sm:w-40">
          <Image src="/registan-logo.png" alt="" fill className="object-contain" priority />
        </div>
      </figure>
    </section>
  );
}
