"use client";

import { useTranslations } from "@/lib/i18n/locale-provider";

// «Путь ученика» — четыре шага.
//
// Была горизонтальная прокрутка с карточками на скролле; здесь она заменена
// нумерованным списком в чертёжной рамке, как показаны филиалы в макете:
// шифр слева, название, описание. Четыре шага целиком видны сразу, а не
// проматываются вбок — на телефоне это особенно заметно.

const STEPS = ["step1", "step2", "step3", "step4"] as const;

export default function LandingHowItWorks() {
  const t = useTranslations("landingHowItWorks");

  return (
    <section id="how-it-works" className="scroll-mt-16 py-[clamp(32px,4vw,56px)]">
      <span className="eyebrow">{t("eyebrow")}</span>
      <div className="rule" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-[clamp(30px,3.6vw,46px)] leading-[1.06]">
          {t("titleLine1")} {t("titleLine2")}
        </h2>
        <p
          className="max-w-[40ch] text-[16px] leading-6"
          style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}
        >
          {t("subtitle")}
        </p>
      </div>

      <div className="blueprint mt-9">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        {STEPS.map((step, index) => (
          <div
            key={step}
            className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 px-5 py-5"
            style={{ borderTop: index === 0 ? "none" : "1px solid var(--color-divider)" }}
          >
            <span
              className="heading text-[20px] tracking-[0.08em]"
              style={{ color: "var(--color-accent-700)" }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[19px] leading-tight">{t(`${step}Title` as "step1Title")}</h3>
            <span />
            <p className="text-[15px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
              {t(`${step}Description` as "step1Description")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
