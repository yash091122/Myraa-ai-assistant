import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import * as THREE from 'three';
import type { MyraaEmotion } from './MyraaCoreVisualizer';
import { MyraaAudioSession } from '../lib/audio';

interface VRMAvatarProps {
  url: string;
  activeEmotion: MyraaEmotion;
  characterState: "idle" | "thinking" | "talking";
  session: MyraaAudioSession | null;
  isWidgetMode?: boolean;
}

// ─── Organic Noise ─────────────────────────────────────────────────────────────
// Layers multiple sine waves with golden-ratio offsets to prevent
// the repetitive "robotic loop" feel of a single sine wave.
function organic(time: number, speed: number, seed: number): number {
  return (
    Math.sin(time * speed + seed) * 0.5 +
    Math.sin(time * speed * 1.618 + seed * 2.3) * 0.3 +
    Math.sin(time * speed * 0.618 + seed * 0.7) * 0.2
  );
}

// ─── Smooth Step Helper ────────────────────────────────────────────────────────
// Attempt to read an expression value, returning 0 on failure.
function safeGetExpression(vrm: VRM, preset: VRMExpressionPresetName): number {
  try {
    return vrm.expressionManager?.getValue(preset) ?? 0;
  } catch {
    return 0;
  }
}

function safeSetExpression(vrm: VRM, preset: VRMExpressionPresetName, value: number): void {
  try {
    vrm.expressionManager?.setValue(preset, value);
  } catch { /* expression may not exist on this model */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VRMAvatar Component
// ═══════════════════════════════════════════════════════════════════════════════
export function VRMAvatar({ url, activeEmotion, characterState, session, isWidgetMode = false }: VRMAvatarProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [error, setError] = useState<boolean>(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const blinkTimerRef = useRef<number>(3.0);
  const isBlinkingRef = useRef<boolean>(false);
  const analyserDataRef = useRef<Uint8Array | null>(null);
  const smoothAudioRef = useRef<number>(0);          // smoothed RMS audio volume
  const prevEmotionRef = useRef<MyraaEmotion>('idle');
  const emotionBlendRef = useRef<number>(1.0);       // 0→1 crossfade progress

  // ── Mouse tracking ───────────────────────────────────────────────────────
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ── Load VRM Model ───────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        if (!isMounted) return;
        const loadedVrm = gltf.userData.vrm as VRM;
        if (loadedVrm) {
          // Prevent frustum culling from hiding the mesh
          loadedVrm.scene.traverse((obj) => { obj.frustumCulled = false; });

          // Face forward
          loadedVrm.scene.rotation.y = 0;

          // Relax arms from default T-pose into natural A-pose
          if (loadedVrm.humanoid) {
            const leftUpperArm = loadedVrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = loadedVrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            if (leftUpperArm)  leftUpperArm.rotation.z = -1.25;
            if (rightUpperArm) rightUpperArm.rotation.z = 1.25;
          }

          setVrm(loadedVrm);
          setError(false);
        }
      },
      (progress) => console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%'),
      (err) => {
        console.error('Failed to load VRM:', err);
        if (isMounted) setError(true);
      }
    );

    analyserDataRef.current = new Uint8Array(256);

    return () => {
      isMounted = false;
    };
  }, [url]);

  // ── Emotion Crossfade Tracker ────────────────────────────────────────────
  useEffect(() => {
    if (activeEmotion !== prevEmotionRef.current) {
      emotionBlendRef.current = 0; // restart crossfade
      prevEmotionRef.current = activeEmotion;
    }
  }, [activeEmotion]);

  // ═════════════════════════════════════════════════════════════════════════
  // MAIN ANIMATION LOOP
  // ═════════════════════════════════════════════════════════════════════════
  useFrame((state, delta) => {
    if (!vrm) return;

    const t = state.clock.elapsedTime;
    const isTalking = characterState === 'talking';
    const isThinking = characterState === 'thinking';
    const isListening = session?.getState() === 'listening';

    // Advance emotion crossfade (reaches 1.0 in ~0.6s)
    if (emotionBlendRef.current < 1.0) {
      emotionBlendRef.current = Math.min(1.0, emotionBlendRef.current + delta * 1.7);
    }

    // ─── 1. AUDIO ANALYSIS ─────────────────────────────────────────────────
    let audioVolume = 0;
    const analyserData = analyserDataRef.current;
    const analyser = session?.outputAnalyser;

    if (analyser && isTalking && analyserData) {
      analyser.getByteTimeDomainData(analyserData);
      let sumSquares = 0;
      for (let i = 0; i < analyserData.length; i++) {
        const normalized = (analyserData[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      audioVolume = Math.sqrt(sumSquares / analyserData.length);
    }
    // Smooth the audio volume to prevent jittering
    smoothAudioRef.current += (audioVolume - smoothAudioRef.current) * 0.25;
    const smoothVol = smoothAudioRef.current;

    // ─── 2. LIP SYNC (Aa / Oh / Ih visemes) ────────────────────────────────
    if (isTalking && smoothVol > 0.01) {
      const targetAa = Math.min(1.0, smoothVol * 4.0);
      const targetOh = Math.min(0.5, smoothVol * 1.5) * Math.abs(organic(t, 8, 5));
      const targetIh = Math.min(0.3, smoothVol * 1.0) * Math.abs(organic(t, 5, 2));

      const curAa = safeGetExpression(vrm, VRMExpressionPresetName.Aa);
      safeSetExpression(vrm, VRMExpressionPresetName.Aa, THREE.MathUtils.lerp(curAa, targetAa, 0.40));
      const curOh = safeGetExpression(vrm, VRMExpressionPresetName.Oh);
      safeSetExpression(vrm, VRMExpressionPresetName.Oh, THREE.MathUtils.lerp(curOh, targetOh, 0.30));
      const curIh = safeGetExpression(vrm, VRMExpressionPresetName.Ih);
      safeSetExpression(vrm, VRMExpressionPresetName.Ih, THREE.MathUtils.lerp(curIh, targetIh, 0.30));
    } else {
      // Smooth decay back to closed mouth
      for (const p of [VRMExpressionPresetName.Aa, VRMExpressionPresetName.Oh, VRMExpressionPresetName.Ih]) {
        const cur = safeGetExpression(vrm, p);
        if (cur > 0.001) safeSetExpression(vrm, p, THREE.MathUtils.lerp(cur, 0, 0.12));
      }
    }

    // ─── 3. EMOTION-DRIVEN FACIAL EXPRESSIONS ──────────────────────────────
    {
      let targetExpr: VRMExpressionPresetName = VRMExpressionPresetName.Neutral;
      let targetIntensity = 1.0;

      if (activeEmotion === 'happy' || activeEmotion === 'playful' || activeEmotion === 'proud') {
        targetExpr = VRMExpressionPresetName.Happy;
      } else if (activeEmotion === 'sad') {
        targetExpr = VRMExpressionPresetName.Sad;
      } else if (activeEmotion === 'excited' || activeEmotion === 'surprised') {
        targetExpr = VRMExpressionPresetName.Surprised;
        targetIntensity = activeEmotion === 'excited' ? 0.7 : 1.0;
      } else if (activeEmotion === 'embarrassed') {
        targetExpr = VRMExpressionPresetName.Relaxed;
        targetIntensity = 0.5; // half-intensity for shy
      } else if (activeEmotion === 'confused') {
        targetExpr = VRMExpressionPresetName.Surprised;
        targetIntensity = 0.4;
      }

      if (isThinking) {
        targetExpr = VRMExpressionPresetName.Neutral;
        targetIntensity = 1.0;
      }

      // Crossfade: smoothly transition the target expression intensity
      const blend = emotionBlendRef.current;
      const finalIntensity = targetIntensity * blend;

      // Fade out all non-target presets, fade in the target
      const allPresets = [
        VRMExpressionPresetName.Happy,
        VRMExpressionPresetName.Sad,
        VRMExpressionPresetName.Surprised,
        VRMExpressionPresetName.Relaxed,
        VRMExpressionPresetName.Neutral,
        VRMExpressionPresetName.Angry,
      ];
      for (const preset of allPresets) {
        const cur = safeGetExpression(vrm, preset);
        const target = preset === targetExpr ? finalIntensity : 0;
        safeSetExpression(vrm, preset, THREE.MathUtils.lerp(cur, target, 0.08));
      }
    }

    // ─── 4. BLINKING (Natural Intervals + Double Blinks) ────────────────────
    blinkTimerRef.current -= delta;
    if (blinkTimerRef.current <= 0) {
      if (!isBlinkingRef.current) {
        isBlinkingRef.current = true;
        blinkTimerRef.current = 0.12; // blink duration
      } else {
        isBlinkingRef.current = false;
        const isDoubleBlink = Math.random() > 0.8;
        blinkTimerRef.current = isDoubleBlink
          ? 0.2 // quick re-blink
          : (isTalking ? 2.0 + Math.random() * 2.5 : 2.5 + Math.random() * 4.0);
      }
    }
    // Smooth eyelid transition
    const curBlink = safeGetExpression(vrm, VRMExpressionPresetName.Blink);
    const targetBlink = isBlinkingRef.current ? 1.0 : 0;
    safeSetExpression(vrm, VRMExpressionPresetName.Blink,
      THREE.MathUtils.lerp(curBlink, targetBlink, isBlinkingRef.current ? 0.45 : 0.20));

    // ─── 5. VOICE-REACTIVE AURA (Removed) ─────────────────────────

    // ═════════════════════════════════════════════════════════════════════════
    // SKELETON ANIMATION
    // ═════════════════════════════════════════════════════════════════════════
    if (!vrm.humanoid) { vrm.update(delta); return; }

    // ── Bone References ────────────────────────────────────────────────────
    const hips       = vrm.humanoid.getNormalizedBoneNode('hips');
    const spine      = vrm.humanoid.getNormalizedBoneNode('spine');
    const chest      = vrm.humanoid.getNormalizedBoneNode('chest');
    const neck       = vrm.humanoid.getNormalizedBoneNode('neck');
    const head       = vrm.humanoid.getNormalizedBoneNode('head');
    const leftEye    = vrm.humanoid.getNormalizedBoneNode('leftEye');
    const rightEye   = vrm.humanoid.getNormalizedBoneNode('rightEye');
    const lUpperArm  = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rUpperArm  = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const lLowerArm  = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rLowerArm  = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    const lHand      = vrm.humanoid.getNormalizedBoneNode('leftHand');
    const rHand      = vrm.humanoid.getNormalizedBoneNode('rightHand');
    const lUpperLeg  = vrm.humanoid.getNormalizedBoneNode('leftUpperLeg');
    const rUpperLeg  = vrm.humanoid.getNormalizedBoneNode('rightUpperLeg');
    const lLowerLeg  = vrm.humanoid.getNormalizedBoneNode('leftLowerLeg');
    const rLowerLeg  = vrm.humanoid.getNormalizedBoneNode('rightLowerLeg');

    // Finger bones for natural curl
    const fingerNames = [
      'ThumbProximal', 'IndexProximal', 'MiddleProximal', 'RingProximal', 'LittleProximal'
    ];
    const fingers = fingerNames.flatMap(f => [
      vrm.humanoid?.getNormalizedBoneNode(`left${f}` as any),
      vrm.humanoid?.getNormalizedBoneNode(`right${f}` as any),
    ]).filter(Boolean) as THREE.Object3D[];

    // ── Lerp Speed Constants ───────────────────────────────────────────────
    const SLOW = 0.015;    // dreamy transitions
    const MED  = 0.04;     // moderate transitions
    const FAST = 0.06;     // responsive but still smooth

    // ─── 6. EYE TRACKING + MICRO-SACCADES ──────────────────────────────────
    const targetLookX = mouse.current.x * 0.4;
    const targetLookY = mouse.current.y * 0.3;

    // Micro-saccades: tiny eye jitter every ~300ms
    const saccadeSeed = Math.floor(t * 3.3);
    const saccadeX = Math.sin(saccadeSeed * 43.123) * 0.025;
    const saccadeY = Math.cos(saccadeSeed * 17.541) * 0.025;

    // Gaze wander when mouse is relatively still
    const wanderSeed = Math.floor(t * 0.4);
    const wanderX = Math.sin(wanderSeed * 9.12) * 0.15;
    const wanderY = Math.cos(wanderSeed * 3.45) * 0.2;

    const eyeX = (Math.abs(mouse.current.x) > 0.05 ? targetLookX : wanderX) + saccadeX;
    const eyeY = (Math.abs(mouse.current.y) > 0.05 ? targetLookY : wanderY) + saccadeY;

    if (leftEye) {
      leftEye.rotation.y = THREE.MathUtils.lerp(leftEye.rotation.y, -eyeX, 0.10);
      leftEye.rotation.x = THREE.MathUtils.lerp(leftEye.rotation.x, -eyeY, 0.10);
    }
    if (rightEye) {
      rightEye.rotation.y = THREE.MathUtils.lerp(rightEye.rotation.y, -eyeX, 0.10);
      rightEye.rotation.x = THREE.MathUtils.lerp(rightEye.rotation.x, -eyeY, 0.10);
    }

    // ─── 7. BREATHING SYSTEM ────────────────────────────────────────────────
    const breathCycle = 2.2; // seconds per full breath
    const breathPhase = Math.sin(t * (Math.PI * 2) / breathCycle);
    const breathInhale = Math.max(0, breathPhase);   // 0→1→0 on inhale
    const breathExhale = Math.max(0, -breathPhase);  // 0→1→0 on exhale

    if (chest) {
      // Chest expands on inhale, contracts on exhale
      chest.rotation.x = THREE.MathUtils.lerp(
        chest.rotation.x,
        breathInhale * 0.015 - breathExhale * 0.005 + organic(t, 0.5, 3) * 0.005,
        MED
      );
    }
    if (spine) {
      spine.rotation.x = THREE.MathUtils.lerp(
        spine.rotation.x,
        breathInhale * 0.008 + organic(t, 0.3, 1) * 0.008,
        SLOW
      );
    }

    // ─── 8. HEAD TILT + NECK (Emotion-Aware) ────────────────────────────────
    {
      // Base: follow mouse gaze
      let headX = -targetLookY * 0.5;
      let headY = -targetLookX * 0.5;
      let headZ = organic(t, 0.35, 10) * 0.008;

      let neckX = organic(t, 0.5, 5) * 0.015;
      let neckY = organic(t, 0.4, 6) * 0.02;
      let neckZ = organic(t, 0.3, 7) * 0.01;

      // Emotion modifiers
      if (activeEmotion === 'sad') {
        headX += 0.10;           // chin down
        neckX += 0.03;
      } else if (activeEmotion === 'embarrassed') {
        headY += 0.10;           // look away
        headX += 0.04;
        headZ += 0.05;           // shy tilt
      } else if (activeEmotion === 'excited') {
        headZ += Math.sin(t * 2.5) * 0.025; // subtle bouncy tilt
        neckX -= 0.02;           // slight upward energy
      } else if (activeEmotion === 'curious') {
        headZ += 0.06;           // inquisitive tilt
        headX -= 0.03;           // slightly up
      } else if (activeEmotion === 'thinking') {
        headZ += 0.04;
        headX += 0.03;           // contemplative downward gaze
        headY -= 0.05;           // slight side shift
      }

      // Listening state: inquisitive tilt
      if (isListening) {
        headZ += 0.06;
        headX -= 0.02;
      }

      // Talking: add conversational micro-nods
      if (isTalking) {
        headX += organic(t, 1.0, 8) * 0.03 + smoothVol * 0.06;
        headY += organic(t, 0.4, 9) * 0.04;
        neckY += organic(t, 0.5, 11) * 0.03;
        neckZ += organic(t, 0.6, 12) * 0.015;
      }

      if (head) {
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, headX, MED);
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, headY, MED);
        head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headZ, MED);
      }
      if (neck) {
        neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, neckX - targetLookY * 0.6, MED);
        neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, neckY - targetLookX * 0.6, MED);
        neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, neckZ, MED);
      }
    }

    // ─── 9. POSTURE SYSTEM (Emotion-Driven Spine/Shoulders) ─────────────────
    {
      let spineY = organic(t, 0.2, 4) * 0.008;
      let spineZ = 0;

      if (activeEmotion === 'sad') {
        spineZ += 0.015;            // slight droop
      } else if (activeEmotion === 'embarrassed') {
        spineY += 0.02;             // slight inward rotation
        spineZ += 0.01;
      } else if (activeEmotion === 'excited') {
        if (spine) {
          // Slight chest-up energy
          spine.rotation.x = THREE.MathUtils.lerp(
            spine.rotation.x,
            spine.rotation.x - 0.01,
            SLOW
          );
        }
      }

      if (spine) {
        spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, spineY, SLOW);
        spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, spineZ, SLOW);
      }
    }

    // ─── 10. FINGER CURL ────────────────────────────────────────────────────
    // Natural relaxed finger pose — very slight curl, never flat boards
    fingers.forEach(finger => {
      const curlTarget = isTalking ? 0.12 + organic(t, 0.8, 30) * 0.04 : 0.18;
      finger.rotation.z = THREE.MathUtils.lerp(finger.rotation.z, curlTarget, 0.08);
      finger.rotation.x = THREE.MathUtils.lerp(finger.rotation.x, -0.08, 0.08);
    });

    // ─── 11. ARM & HAND SYSTEM ──────────────────────────────────────────────
    if (isTalking) {
      // ·· TALKING: Very subtle gestures ··
      // Arms mostly stay at sides, with gentle forearm lifts tied to speech
      const gestureSeed = Math.floor(t * 0.45);  // pose changes every ~2.2s
      const poseType = Math.abs(gestureSeed) % 5; // 0-1: resting, 2: left gesture, 3: right gesture, 4: both

      // Default: arms at sides (barely lifted from idle)
      let lZ = -1.15, lX = 0.0,  lBend = -0.12, lTwist = 0;
      let rZ =  1.15, rX = 0.0,  rBend = -0.12, rTwist = 0;

      if (poseType === 2 || poseType === 4) {
        // Left hand: gentle explanatory lift
        lZ = -0.85;
        lX = -0.15;
        lBend = -0.9;
        lTwist = -0.2;
      }
      if (poseType === 3 || poseType === 4) {
        // Right hand: gentle explanatory lift
        rZ = 0.85;
        rX = -0.15;
        rBend = -0.9;
        rTwist = 0.2;
      }

      // Add micro-drift tied to speech
      const speechDrift = smoothVol * 0.05;

      if (lUpperArm) {
        lUpperArm.rotation.z = THREE.MathUtils.lerp(lUpperArm.rotation.z, lZ + organic(t, 0.4, 10) * 0.02, FAST);
        lUpperArm.rotation.x = THREE.MathUtils.lerp(lUpperArm.rotation.x, lX + speechDrift, FAST);
      }
      if (lLowerArm) {
        lLowerArm.rotation.x = THREE.MathUtils.lerp(lLowerArm.rotation.x, lBend + organic(t, 0.5, 12) * 0.02, FAST);
        lLowerArm.rotation.z = THREE.MathUtils.lerp(lLowerArm.rotation.z, lTwist, FAST);
      }
      if (lHand) {
        const wristBend = lBend < -0.5 ? -0.15 : 0.03;
        lHand.rotation.x = THREE.MathUtils.lerp(lHand.rotation.x, wristBend + organic(t, 0.8, 14) * 0.03, FAST);
      }

      if (rUpperArm) {
        rUpperArm.rotation.z = THREE.MathUtils.lerp(rUpperArm.rotation.z, rZ + organic(t, 0.4, 20) * 0.02, FAST);
        rUpperArm.rotation.x = THREE.MathUtils.lerp(rUpperArm.rotation.x, rX + speechDrift, FAST);
      }
      if (rLowerArm) {
        rLowerArm.rotation.x = THREE.MathUtils.lerp(rLowerArm.rotation.x, rBend + organic(t, 0.5, 22) * 0.02, FAST);
        rLowerArm.rotation.z = THREE.MathUtils.lerp(rLowerArm.rotation.z, rTwist, FAST);
      }
      if (rHand) {
        const wristBend = rBend < -0.5 ? -0.15 : 0.03;
        rHand.rotation.x = THREE.MathUtils.lerp(rHand.rotation.x, wristBend + organic(t, 0.8, 24) * 0.03, FAST);
      }

    } else if (isThinking) {
      // ·· THINKING: Contemplative chin-touch pose ··
      // Right hand near chin, left arm supporting right elbow
      if (rUpperArm) {
        rUpperArm.rotation.z = THREE.MathUtils.lerp(rUpperArm.rotation.z, 0.4, FAST);
        rUpperArm.rotation.x = THREE.MathUtils.lerp(rUpperArm.rotation.x, -0.55, FAST);
      }
      if (rLowerArm) {
        rLowerArm.rotation.x = THREE.MathUtils.lerp(rLowerArm.rotation.x, -2.1, FAST);
        rLowerArm.rotation.z = THREE.MathUtils.lerp(rLowerArm.rotation.z, 0.7, FAST);
      }
      if (rHand) {
        rHand.rotation.x = THREE.MathUtils.lerp(rHand.rotation.x, -0.15, FAST);
      }
      // Left arm: supporting
      if (lUpperArm) {
        lUpperArm.rotation.z = THREE.MathUtils.lerp(lUpperArm.rotation.z, -0.55, FAST);
        lUpperArm.rotation.x = THREE.MathUtils.lerp(lUpperArm.rotation.x, -0.25, FAST);
      }
      if (lLowerArm) {
        lLowerArm.rotation.x = THREE.MathUtils.lerp(lLowerArm.rotation.x, -1.4, FAST);
        lLowerArm.rotation.z = THREE.MathUtils.lerp(lLowerArm.rotation.z, -0.4, FAST);
      }
      if (lHand) {
        lHand.rotation.x = THREE.MathUtils.lerp(lHand.rotation.x, -0.08, FAST);
      }

    } else {
      // ·· IDLE: Arms at sides with very subtle organic drift ··
      // Cycles between different relaxed resting poses every ~6.6s
      const idleSeed = Math.floor(t * 0.15);
      const idlePose = Math.abs(idleSeed) % 5;

      let lZ = -1.25, lX = 0.03, lB = -0.08, lT = 0;
      let rZ = 1.25,  rX = 0.03, rB = -0.08, rT = 0;

      if (idlePose === 1) {
        // Hands clasped loosely in front of waist
        lZ = -1.1; lX = -0.4; lB = -1.5; lT = -0.3;
        rZ =  1.1; rX = -0.4; rB = -1.5; rT =  0.3;
      } else if (idlePose === 2) {
        // Folded arms across chest
        lZ = -1.1; lX = -0.6; lB = -2.2; lT = -0.5;
        rZ =  1.1; rX = -0.6; rB = -2.2; rT =  0.5;
      } else if (idlePose === 3) {
        // Hands folded elegantly near chest (Namaste style)
        lZ = -1.2; lX = -0.5; lB = -2.0; lT = -0.7;
        rZ =  1.2; rX = -0.5; rB = -2.0; rT =  0.7;
      } else if (idlePose === 4) {
        // Hands clasped behind back
        lZ = -1.1; lX = 0.4; lB = -0.8; lT = 0;
        rZ =  1.1; rX = 0.4; rB = -0.8; rT = 0;
      }

      // Listening: small inward shift
      if (isListening) {
        lZ += 0.08;
        rZ -= 0.08;
      }

      if (lUpperArm) {
        lUpperArm.rotation.z = THREE.MathUtils.lerp(lUpperArm.rotation.z, lZ + organic(t, 0.2, 11) * 0.008, MED);
        lUpperArm.rotation.x = THREE.MathUtils.lerp(lUpperArm.rotation.x, lX, MED);
      }
      if (lLowerArm) {
        lLowerArm.rotation.x = THREE.MathUtils.lerp(lLowerArm.rotation.x, lB, MED);
        lLowerArm.rotation.z = THREE.MathUtils.lerp(lLowerArm.rotation.z, lT, MED);
      }
      if (rUpperArm) {
        rUpperArm.rotation.z = THREE.MathUtils.lerp(rUpperArm.rotation.z, rZ + organic(t, 0.2, 16) * 0.008, MED);
        rUpperArm.rotation.x = THREE.MathUtils.lerp(rUpperArm.rotation.x, rX, MED);
      }
      if (rLowerArm) {
        rLowerArm.rotation.x = THREE.MathUtils.lerp(rLowerArm.rotation.x, rB, MED);
        rLowerArm.rotation.z = THREE.MathUtils.lerp(rLowerArm.rotation.z, rT, MED);
      }
    }

    // ─── 12. LOWER BODY (Near-Invisible Weight Shifts & Sitting Override) ───
    if (hips) {
      const targetY = isWidgetMode ? -0.4 : 0;
      const targetRotX = isWidgetMode ? -0.2 : 0;
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, targetY, FAST);
      hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, organic(t, 0.12, 40) * 0.008, SLOW);
      hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, organic(t, 0.1, 41) * 0.005, SLOW);
      hips.rotation.x = THREE.MathUtils.lerp(hips.rotation.x, targetRotX, FAST);
    }
    
    // Default idle sway
    let lUpperLegX = organic(t, 0.08, 42) * 0.005;
    let rUpperLegX = organic(t, 0.08, 43) * 0.005;
    let lLowerLegX = 0;
    let rLowerLegX = 0;
    
    // Sitting posture override
    if (isWidgetMode) {
      lUpperLegX = -1.4; // Bend thigh backward
      rUpperLegX = -1.4;
      lLowerLegX = 1.4;  // Bend knee forward to make calves drop
      rLowerLegX = 1.4;
    }

    if (lUpperLeg) lUpperLeg.rotation.x = THREE.MathUtils.lerp(lUpperLeg.rotation.x, lUpperLegX, FAST);
    if (rUpperLeg) rUpperLeg.rotation.x = THREE.MathUtils.lerp(rUpperLeg.rotation.x, rUpperLegX, FAST);
    if (lLowerLeg) lLowerLeg.rotation.x = THREE.MathUtils.lerp(lLowerLeg.rotation.x, lLowerLegX, FAST);
    if (rLowerLeg) rLowerLeg.rotation.x = THREE.MathUtils.lerp(rLowerLeg.rotation.x, rLowerLegX, FAST);

    // ─── UPDATE VRM ─────────────────────────────────────────────────────────
    vrm.update(delta);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  if (error || !vrm) {
    return (
      <mesh position={[0, 1.5, 0]}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#a855f7"
          wireframe={true}
          emissive="#c084fc"
          emissiveIntensity={0.5}
        />
      </mesh>
    );
  }

  return <primitive object={vrm.scene} position={[0, 0.45, 0]} />;
}
