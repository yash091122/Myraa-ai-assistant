import re

with open('src/components/VRMAvatar.tsx', 'r') as f:
    content = f.read()

new_use_frame = """
  useFrame((state, delta) => {
    if (!vrm) return;

    const t = state.clock.elapsedTime;
    const isTalking = characterState === 'talking';
    const isThinking = characterState === 'thinking';
    const isListening = session?.state === 'listening';

    // 1. Audio Reactivity (Lip Sync + Aura)
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
      const targetAa = Math.min(1.0, audioVolume * 4.0);
      const targetOh = Math.min(0.5, audioVolume * 1.5) * Math.abs(organic(t, 8, 5));
      const targetIh = Math.min(0.3, audioVolume * 1.0) * Math.abs(organic(t, 5, 2));

      const currentAa = vrm.expressionManager?.getValue(VRMExpressionPresetName.Aa) || 0;
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, THREE.MathUtils.lerp(currentAa, targetAa, 0.4));
      
      try {
        const currentOh = vrm.expressionManager?.getValue(VRMExpressionPresetName.Oh) || 0;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, THREE.MathUtils.lerp(currentOh, targetOh, 0.3));
        const currentIh = vrm.expressionManager?.getValue(VRMExpressionPresetName.Ih) || 0;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, THREE.MathUtils.lerp(currentIh, targetIh, 0.3));
      } catch(e) {}
    } else {
      const currentAa = vrm.expressionManager?.getValue(VRMExpressionPresetName.Aa) || 0;
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, THREE.MathUtils.lerp(currentAa, 0, 0.15));
      try {
        const currentOh = vrm.expressionManager?.getValue(VRMExpressionPresetName.Oh) || 0;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Oh, THREE.MathUtils.lerp(currentOh, 0, 0.15));
        const currentIh = vrm.expressionManager?.getValue(VRMExpressionPresetName.Ih) || 0;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Ih, THREE.MathUtils.lerp(currentIh, 0, 0.15));
      } catch(e) {}
    }

    // Voice Reactive Aura (apply to materials)
    vrm.scene.traverse((obj: any) => {
      if (obj.isMesh && obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat: any) => {
            if (mat.name.toLowerCase().includes('hair') || mat.name.toLowerCase().includes('body')) {
              if (mat.emissiveIntensity !== undefined) {
                 mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, audioVolume * 1.5, 0.1);
              }
            }
          });
        } else {
          const mat = obj.material;
          if (mat.name.toLowerCase().includes('hair') || mat.name.toLowerCase().includes('body')) {
            if (mat.emissiveIntensity !== undefined) {
               mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, audioVolume * 1.5, 0.1);
            }
          }
        }
      }
    });

    // 2. Blinking (Natural Intervals)
    blinkTimerRef.current -= delta;
    if (blinkTimerRef.current <= 0) {
      if (!isBlinkingRef.current) {
        isBlinkingRef.current = true;
        blinkTimerRef.current = 0.12; // blink duration
      } else {
        isBlinkingRef.current = false;
        // Natural blink intervals (2 to 6 seconds) + double blinks occasionally
        const isDoubleBlink = Math.random() > 0.8;
        blinkTimerRef.current = isDoubleBlink ? 0.2 : 2.0 + Math.random() * 4.0;
      }
    }
    
    // Smooth eyelid transition
    const currentBlink = vrm.expressionManager?.getValue(VRMExpressionPresetName.Blink) || 0;
    const targetBlink = isBlinkingRef.current ? 1.0 : 0;
    vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, THREE.MathUtils.lerp(currentBlink, targetBlink, 0.3));

    // 3. Eye Tracking & Head Tilt
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
    const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
    
    const leftEye = vrm.humanoid?.getNormalizedBoneNode('leftEye');
    const rightEye = vrm.humanoid?.getNormalizedBoneNode('rightEye');

    // Smooth Cursor Tracking
    const targetLookX = mouse.current.x * 0.4;
    const targetLookY = mouse.current.y * 0.3;

    if (leftEye && rightEye) {
      // Natural saccades
      const saccadeSeed = Math.floor(t * 3); 
      const saccadeX = Math.sin(saccadeSeed * 43.123) * 0.03;
      const saccadeY = Math.cos(saccadeSeed * 17.541) * 0.03;

      leftEye.rotation.y = THREE.MathUtils.lerp(leftEye.rotation.y, saccadeY - targetLookX, 0.1);
      leftEye.rotation.x = THREE.MathUtils.lerp(leftEye.rotation.x, saccadeX - targetLookY, 0.1);
      
      rightEye.rotation.y = THREE.MathUtils.lerp(rightEye.rotation.y, saccadeY - targetLookX, 0.1);
      rightEye.rotation.x = THREE.MathUtils.lerp(rightEye.rotation.x, saccadeX - targetLookY, 0.1);
    }

    // 4. Breathing System
    const breathingRate = 2.0; // seconds per breath
    const breathOffset = Math.sin(t * Math.PI / breathingRate); // -1 to 1
    
    if (chest) {
      // Chest expands slightly on breath in
      chest.rotation.x = THREE.MathUtils.lerp(chest.rotation.x, breathOffset * 0.015, 0.05);
    }

    // 5. Head Tilt & Idle Motion
    if (head && neck && spine) {
      // Base sway
      let targetNeckZ = Math.sin(t * 0.5) * 0.02;
      let targetHeadX = -targetLookY * 0.6;
      let targetHeadY = -targetLookX * 0.6;
      let targetHeadZ = Math.cos(t * 0.4) * 0.01;

      // Emotion modifiers
      if (activeEmotion === 'sad') {
        targetHeadX += 0.1; // look down
      } else if (activeEmotion === 'embarrassed') {
        targetHeadY += 0.1; // look away
        targetHeadX += 0.05;
      } else if (activeEmotion === 'excited') {
        targetNeckZ += Math.sin(t * 2.0) * 0.03; // bouncy
      }

      // Listening state (subtle head tilt)
      if (isListening) {
        targetHeadZ += 0.08; // tilt head slightly
        targetHeadX -= 0.02; // look up slightly
      }

      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, targetHeadX, 0.05);
      head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, targetHeadY, 0.05);
      head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, targetHeadZ, 0.05);
      
      neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, organic(t, 0.5, 1) * 0.02, 0.05);
      neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, organic(t, 0.4, 2) * 0.03, 0.05);
      neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, targetNeckZ, 0.05);
      
      spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, organic(t, 0.3, 3) * 0.02, 0.05);
      spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, organic(t, 0.2, 4) * 0.02, 0.05);
    }

    // Fingers to fix the "stiff flat board" look
    const fingers = [
      'ThumbProximal', 'IndexProximal', 'MiddleProximal', 'RingProximal', 'LittleProximal'
    ].flatMap(f => [
      vrm.humanoid?.getNormalizedBoneNode(`left${f}` as any),
      vrm.humanoid?.getNormalizedBoneNode(`right${f}` as any)
    ]).filter(Boolean);

    fingers.forEach(finger => {
      if (finger) {
        finger.rotation.z = THREE.MathUtils.lerp(finger.rotation.z, 0.15, 0.1);
        finger.rotation.x = THREE.MathUtils.lerp(finger.rotation.x, -0.1, 0.1);
      }
    });

    // Arm positioning
    const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');

    if (isTalking) {
      // Gesturing
      const gestureSway = Math.sin(t * 2.0) * 0.1 * audioVolume;
      
      if (leftUpperArm && leftLowerArm) {
        leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, -0.8 + gestureSway, 0.05);
        leftUpperArm.rotation.x = THREE.MathUtils.lerp(leftUpperArm.rotation.x, -0.2, 0.05);
        leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, -1.2, 0.05);
      }
      if (rightUpperArm && rightLowerArm) {
        rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, 0.8 - gestureSway, 0.05);
        rightUpperArm.rotation.x = THREE.MathUtils.lerp(rightUpperArm.rotation.x, -0.2, 0.05);
        rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, -1.2, 0.05);
      }
    } else if (isThinking) {
      // Thinking pose
      if (leftUpperArm && leftLowerArm) {
        leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, -0.6, 0.05);
        leftUpperArm.rotation.x = THREE.MathUtils.lerp(leftUpperArm.rotation.x, -0.3, 0.05);
        leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, -1.5, 0.05);
      }
      if (rightUpperArm && rightLowerArm) {
        rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, 0.4, 0.05);
        rightUpperArm.rotation.x = THREE.MathUtils.lerp(rightUpperArm.rotation.x, -0.6, 0.05);
        rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, -2.2, 0.05);
      }
    } else {
      // Idle pose
      if (leftUpperArm && leftLowerArm) {
        leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, -1.2 + organic(t, 0.5, 5) * 0.02, 0.05);
        leftUpperArm.rotation.x = THREE.MathUtils.lerp(leftUpperArm.rotation.x, 0.05, 0.05);
        leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, -0.1, 0.05);
      }
      if (rightUpperArm && rightLowerArm) {
        rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, 1.2 + organic(t, 0.5, 6) * 0.02, 0.05);
        rightUpperArm.rotation.x = THREE.MathUtils.lerp(rightUpperArm.rotation.x, 0.05, 0.05);
        rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, -0.1, 0.05);
      }
    }

    vrm.update(delta);
  });
"""

# use regex to replace the old useFrame block
new_content = re.sub(r'  useFrame\(\(state, delta\) => \{.*vrm\.update\(delta\);\n  \}\);', new_use_frame.strip('\n'), content, flags=re.DOTALL)

with open('src/components/VRMAvatar.tsx', 'w') as f:
    f.write(new_content)

print("Done")
