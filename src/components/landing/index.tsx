"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import LandingNavbar from "./navbar";
import LandingHero from "./hero";
import LandingStatsStrip from "./stats-strip";
import LandingResults from "./results";
import LandingFeatures from "./features";
import LandingHowItWorks from "./how-it-works";
import LandingFaq from "./faq";
import LandingCtaSection from "./cta-section";
import LandingFooter from "./footer";
import type { LandingStats } from "@/lib/landing-stats";

// Порядок разделов взят из присланного макета: сначала доказательство
// (результаты), потом устройство (возможности, шаги), потом ответы на
// возражения (вопросы) и только в конце призыв.
//
// stats приходит ПРОПОМ с серверной страницы, а не запрашивается здесь: числа
// должны попасть в разметку до того, как её увидит поисковый робот.
// stats необязателен: в дашборде тот же лендинг показывается долю секунды
// после выхода из аккаунта, и данных там взять неоткуда — блоки с числами
// просто не рисуются.
export default function LandingView({ stats = null }: { stats?: LandingStats | null }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });

  return (
    <div className="min-h-dvh bg-background">
      <motion.div
        style={{ scaleX }}
        className="fixed left-0 right-0 top-0 z-[60] h-[3px] origin-left bg-[hsl(var(--brand-olive-ink))]"
      />
      <LandingNavbar />
      <LandingHero stats={stats} />
      <LandingStatsStrip stats={stats} />
      <LandingResults stats={stats} />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingFaq />
      <LandingCtaSection />
      <LandingFooter />
    </div>
  );
}
