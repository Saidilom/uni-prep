"use client";

import dynamic from "next/dynamic";
import type { MotionValue } from "framer-motion";

const Scene3D = dynamic(() => import("./scene-3d"), { ssr: false });

export default function Scene3DLoader({ scrollProgress }: { scrollProgress?: MotionValue<number> }) {
  return <Scene3D scrollProgress={scrollProgress} />;
}
