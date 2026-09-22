import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HolographicEnvironmentProps {
  audioVolume: number;
  activeEmotion: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Glowing Holographic Platform
// A soft circular disc beneath the character with animated emissive glow.
// ═══════════════════════════════════════════════════════════════════════════════
function GlowingPlatform({ audioVolume }: { audioVolume: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (materialRef.current) {
      // Pulse emissive intensity with breathing rhythm + audio reactivity
      const breathPulse = Math.sin(t * 1.2) * 0.15 + 0.5;
      const audioPulse = audioVolume * 0.8;
      materialRef.current.emissiveIntensity = breathPulse + audioPulse;
      materialRef.current.opacity = 0.25 + Math.sin(t * 0.8) * 0.05 + audioVolume * 0.15;
    }
    if (meshRef.current) {
      // Very subtle Y rotation for holographic shimmer
      meshRef.current.rotation.y = t * 0.08;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, -0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.2, 64]} />
      <meshStandardMaterial
        ref={materialRef}
        color="#1a0a2e"
        emissive="#8b5cf6"
        emissiveIntensity={0.5}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform Edge Ring (soft outer glow ring)
// ═══════════════════════════════════════════════════════════════════════════════
function PlatformEdgeRing({ audioVolume }: { audioVolume: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.y = -t * 0.12;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.6 + Math.sin(t * 1.5) * 0.2 + audioVolume * 1.2;
      matRef.current.opacity = 0.15 + audioVolume * 0.25;
    }
  });

  return (
    <mesh ref={ringRef} position={[0, -0.40, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.15, 1.25, 64]} />
      <meshStandardMaterial
        ref={matRef}
        color="#2d1b69"
        emissive="#a78bfa"
        emissiveIntensity={0.6}
        transparent
        opacity={0.2}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Audio-Reactive Holographic Ring
// A floating torus that pulses scale and glow with speech volume.
// ═══════════════════════════════════════════════════════════════════════════════
function AudioReactiveRing({ audioVolume }: { audioVolume: number }) {
  const torusRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const scaleRef = useRef(1.0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (torusRef.current) {
      // Smooth scale pulse
      const targetScale = 1.0 + audioVolume * 0.3;
      scaleRef.current += (targetScale - scaleRef.current) * 0.08;
      const s = scaleRef.current;
      torusRef.current.scale.set(s, s, s);
      torusRef.current.rotation.y = t * 0.15;
      torusRef.current.rotation.x = Math.sin(t * 0.3) * 0.05;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.3 + audioVolume * 2.5;
      matRef.current.opacity = 0.08 + audioVolume * 0.35;
    }
  });

  return (
    <mesh ref={torusRef} position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.5, 0.008, 16, 100]} />
      <meshStandardMaterial
        ref={matRef}
        color="#4c1d95"
        emissive="#c4b5fd"
        emissiveIntensity={0.3}
        transparent
        opacity={0.1}
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reflective Floor
// A very subtle reflective plane beneath the character for premium depth.
// ═══════════════════════════════════════════════════════════════════════════════
function ReflectiveFloor() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  return (
    <mesh position={[0, -0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 12]} />
      <meshStandardMaterial
        ref={matRef}
        color="#0a0a1a"
        roughness={0.15}
        metalness={0.85}
        transparent
        opacity={0.4}
        depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rim Lighting
// Colored point/spot lights behind and to the sides for cinematic rim glow.
// ═══════════════════════════════════════════════════════════════════════════════
function RimLighting({ activeEmotion }: { activeEmotion: string }) {
  const leftRef = useRef<THREE.PointLight>(null);
  const rightRef = useRef<THREE.PointLight>(null);
  const backRef = useRef<THREE.SpotLight>(null);

  // Emotion-based color mapping
  const colors = useMemo(() => {
    switch (activeEmotion) {
      case 'happy':
      case 'playful':
        return { left: '#fbbf24', right: '#f59e0b', back: '#fcd34d' };
      case 'sad':
        return { left: '#60a5fa', right: '#3b82f6', back: '#93c5fd' };
      case 'excited':
      case 'surprised':
        return { left: '#f472b6', right: '#ec4899', back: '#f9a8d4' };
      case 'embarrassed':
        return { left: '#fb923c', right: '#f97316', back: '#fdba74' };
      case 'thinking':
      case 'curious':
        return { left: '#818cf8', right: '#6366f1', back: '#a5b4fc' };
      default:
        return { left: '#c4b5fd', right: '#8b5cf6', back: '#ddd6fe' };
    }
  }, [activeEmotion]);

  useFrame(() => {
    if (leftRef.current)  leftRef.current.color.set(colors.left);
    if (rightRef.current) rightRef.current.color.set(colors.right);
    if (backRef.current)  backRef.current.color.set(colors.back);
  });

  return (
    <>
      {/* Left rim */}
      <pointLight ref={leftRef} position={[-2, 1.5, -1]} intensity={1.5} distance={8} color={colors.left} />
      {/* Right rim */}
      <pointLight ref={rightRef} position={[2, 1.5, -1]} intensity={1.5} distance={8} color={colors.right} />
      {/* Back rim (spotlight for focused glow) */}
      <spotLight
        ref={backRef}
        position={[0, 2.5, -2.5]}
        angle={0.6}
        penumbra={0.8}
        intensity={2.0}
        distance={10}
        color={colors.back}
        target-position={[0, 1, 0]}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CameraBreathing
// Adds very subtle sine-wave offset to the camera position for cinematic feel.
// ═══════════════════════════════════════════════════════════════════════════════
export function CameraBreathing() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Very subtle floating camera motion
    state.camera.position.x = Math.sin(t * 0.15) * 0.03;
    state.camera.position.y = 1.2 + Math.sin(t * 0.2) * 0.015;
    state.camera.position.z = 5.5 + Math.sin(t * 0.1) * 0.02;
    state.camera.updateProjectionMatrix();
  });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main HolographicEnvironment Component
// ═══════════════════════════════════════════════════════════════════════════════
export function HolographicEnvironment({ audioVolume, activeEmotion }: HolographicEnvironmentProps) {
  return (
    <>
      <ReflectiveFloor />
      <GlowingPlatform audioVolume={audioVolume} />
      <PlatformEdgeRing audioVolume={audioVolume} />
      <AudioReactiveRing audioVolume={audioVolume} />
      <RimLighting activeEmotion={activeEmotion} />
    </>
  );
}
