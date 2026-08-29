"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import LandingNavbar from "./navbar";
import LandingHero from "./hero";
import LandingFeatures from "./features";
import LandingHowItWorks from "./how-it-works";
import LandingCtaSection from "./cta-section";
import LandingFooter from "./footer";

export default function LandingView() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });

  return (
    <div className="min-h-dvh bg-background">
      <motion.div
        style={{ scaleX }}
        className="fixed left-0 right-0 top-0 z-[60] h-[3px] origin-left bg-[hsl(var(--brand-blue-ink))]"
      />
      <LandingNavbar />
      <LandingHero />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingCtaSection />
      <LandingFooter />
    </div>
  );
}
