"use client";

import { memo, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";
import { curtainAberration } from "@/lib/three/stage";
import { useSceneTime } from "@/components/three/sceneClock";

/**
 * The finishing pass (lazy chunk, full tier only).
 *
 * Bloom is luminance-thresholded high enough that only light SOURCES glow —
 * the wordmark's stacked additive points, the brighter stars, a glint off a
 * glossy 7-inch — while the lit deck inks (the crate, the sleeves) stay
 * below it and keep their colour. Then a gentle vignette, film grain at a
 * whisper, and a chromatic-aberration swell that only rides the curtain.
 *
 * The Canvas is `flat` (no tone mapping) and so is this chain, so the deck
 * background reads exactly #0b0d10 whether or not the composer is mounted.
 * Reduced motion keeps bloom and vignette but drops the grain (it changes
 * every frame) and the aberration (it moves).
 *
 * All five effects merge into one EffectPass (only the aberration samples
 * neighbours), so the aberration costs a few texture reads, not a pass —
 * which is why it stays mounted at zero rather than being unmounted after
 * the curtain and forcing a shader rebuild mid-scene.
 */

export interface FinishProps {
  reducedMotion: boolean;
  multisampling: number;
  /** Mounted — lets an on-demand canvas know a frame with the composer is due. */
  onReady?: () => void;
}

function Finish({ reducedMotion, multisampling, onReady }: FinishProps) {
  const aberration = useRef<ChromaticAberrationEffect>(null);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const sceneTime = useSceneTime();

  useFrame(() => {
    const fx = aberration.current;
    if (!fx) return;
    const a = curtainAberration(sceneTime(), reducedMotion);
    fx.offset.set(a, a * 0.6);
  });

  return (
    <EffectComposer multisampling={multisampling}>
      <Bloom mipmapBlur luminanceThreshold={0.62} luminanceSmoothing={0.22} intensity={0.95} radius={0.72} />
      {reducedMotion ? (
        <></>
      ) : (
        <ChromaticAberration ref={aberration} offset={[0, 0]} radialModulation modulationOffset={0.2} />
      )}
      <Vignette eskil={false} offset={0.32} darkness={0.58} />
      {/* soft-light grain barely touches near-black, so the deck stays clean */}
      {reducedMotion ? <></> : <Noise opacity={0.12} blendFunction={BlendFunction.SOFT_LIGHT} />}
    </EffectComposer>
  );
}

export default memo(Finish);
