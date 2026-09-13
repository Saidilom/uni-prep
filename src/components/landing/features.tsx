"use client";

import { useTranslations } from "@/lib/i18n/locale-provider";

// «Платформа» — сетка карточек-чертежей с шифром вместо иконки, как в макете.
//
// Шифров шесть в макете и пять здесь: шестой был «750+ словарный тренажёр»,
// раздела с таким названием в платформе нет.

export default function LandingFeatures() {
  const t = useTranslations("landingFeatures");

  const features = [
    { code: "MAP", title: t("schoolTitle"), body: t("schoolDescription") },
    { code: "MOCK", title: t("mockTitle"), body: t("mockDescription") },
    { code: "DATA", title: t("resultsTitle"), body: t("resultsDescription") },
    { code: "TEAM", title: t("teacherTitle"), body: t("teacherDescription") },
    { code: "ADMIN", title: t("adminTitle"), body: t("adminDescription") },
  ];

  return (
    <section id="platform" className="scroll-mt-16 py-[clamp(40px,5vw,72px)]">
      <span className="eyebrow">{t("sectionLabel")}</span>
      <div className="rule" />
      <h2 className="max-w-[26ch] text-[clamp(30px,3.6vw,46px)] leading-[1.06]">{t("mobileTitle")}</h2>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.code} className="blueprint p-6">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <span className="heading block text-[26px] tracking-[0.04em]" style={{ color: "var(--color-accent-700)" }}>
              {feature.code}
            </span>
            <h3 className="mt-4 text-[20px] leading-tight">{feature.title}</h3>
            <p className="mt-3 text-[15px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
              {feature.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
