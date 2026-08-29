"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

// Thematic objects (a mortarboard, a pencil, an open book) built from plain
// three.js primitives — no external model files to fetch/host.
function GraduationCap(props: JSX.IntrinsicElements["group"]) {
  return (
    <group {...props}>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.42, 24]} />
        <meshStandardMaterial color="#31708E" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.55, 0.07, 1.55]} />
        <meshStandardMaterial color="#2B7A78" roughness={0.3} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.4} />
      </mesh>
      <mesh position={[0.55, 0.02, 0]} rotation={[0, 0, Math.PI / 10]}>
        <cylinderGeometry args={[0.012, 0.012, 0.45, 8]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.5} />
      </mesh>
      <mesh position={[0.62, -0.2, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#5085A5" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Pencil(props: JSX.IntrinsicElements["group"]) {
  return (
    <group {...props} rotation={[0, 0, Math.PI / 5]}>
      <mesh>
        <cylinderGeometry args={[0.085, 0.085, 1.5, 6]} />
        <meshStandardMaterial color="#5085A5" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <coneGeometry args={[0.085, 0.28, 6]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <coneGeometry args={[0.03, 0.12, 6]} />
        <meshStandardMaterial color="#2f2f2f" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.78, 0]}>
        <cylinderGeometry args={[0.095, 0.095, 0.1, 6]} />
        <meshStandardMaterial color="#c9c9c9" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.88, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.14, 12]} />
        <meshStandardMaterial color="#2B7A78" roughness={0.5} />
      </mesh>
    </group>
  );
}

function OpenBook(props: JSX.IntrinsicElements["group"]) {
  return (
    <group {...props}>
      <mesh position={[-0.46, 0, 0]} rotation={[0, 0.28, 0]}>
        <boxGeometry args={[0.95, 0.06, 1.2]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.6} />
      </mesh>
      <mesh position={[0.46, 0, 0]} rotation={[0, -0.28, 0]}>
        <boxGeometry args={[0.95, 0.06, 1.2]} />
        <meshStandardMaterial color="#F7F9FB" roughness={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.08, 0.08, 1.24]} />
        <meshStandardMaterial color="#31708E" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Rig({ scrollProgress }: { scrollProgress?: MotionValue<number> }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef(0);

  useFrame(({ pointer }, delta) => {
    if (!group.current) return;
    spin.current += delta * 0.12;
    const scroll = scrollProgress ? scrollProgress.get() : 0;
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      pointer.x * 0.3 + spin.current + scroll * Math.PI * 0.9,
      0.08,
    );
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, pointer.y * -0.2 + scroll * 0.4, 0.08);
  });

  return (
    <group ref={group}>
      <Float speed={1.3} rotationIntensity={0.7} floatIntensity={1.5}>
        <GraduationCap position={[1.05, 0.5, 0]} scale={1.05} />
      </Float>
      <Float speed={1.6} rotationIntensity={0.9} floatIntensity={1.8}>
        <Pencil position={[-1.25, -0.35, -0.6]} scale={0.85} />
      </Float>
      <Float speed={1.1} rotationIntensity={0.6} floatIntensity={1.3}>
        <OpenBook position={[-0.2, -1.0, -1.1]} scale={0.85} />
      </Float>
    </group>
  );
}

export default function Scene3D({ scrollProgress }: { scrollProgress?: MotionValue<number> }) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <div
        aria-hidden
        className="h-full w-full rounded-[2.5rem] bg-gradient-to-br from-[#5085A5] via-[#31708E] to-[#2B7A78] opacity-90"
      />
    );
  }

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 5], fov: 42 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 4, 2]} intensity={1.15} />
      <directionalLight position={[-3, -2, -2]} intensity={0.3} />
      <Rig scrollProgress={scrollProgress} />
    </Canvas>
  );
}
