"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Завершающий призыв — в макете это рамка чертежа во всю ширину.
export default function LandingCtaSection() {
  const t = useTranslations("landingCta");

  return (
    <section className="blueprint my-[clamp(40px,5vw,72px)] p-[clamp(32px,4vw,56px)]">
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <h2 className="max-w-[20ch] text-[clamp(30px,3.6vw,46px)] leading-[1.06]">{t("title")}</h2>
      <p
        className="mt-5 max-w-[52ch] text-[16px] leading-6"
        style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}
      >
        {t("subtitle")}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/join" className="btn btn-primary">{t("start")} →</Link>
        <Link href="/login" className="btn btn-ghost">{t("login")}</Link>
      </div>
    </section>
  );
}
