"use client";

import { useEffect, useRef, useState } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import type { VisualMode } from "./VisualCanvas";
import { AudioEngine } from "@/lib/audio-engine";
import { extractPalette, FALLBACK_PALETTE, type Palette } from "@/lib/palette";

/**
 * Full-GPU visualiser. A single fullscreen triangle drives a fragment shader
 * that computes every pixel on the GPU — domain-warped nebula, flowing aurora,
 * a kaleidoscopic silhouette and a reactive cover, all driven by live audio
 * uniforms (bass / treble / level / kick). Video mode is handled by the parent.
 */

const VERT = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  uRes;
uniform float uTime, uBass, uMid, uTreble, uLevel, uKick, uBeat;
uniform int   uMode;      // 0 nebula, 1 aurora, 2 silhouette, 3 cover, 4 tunnel, 5 liquid
uniform sampler2D uTex;
uniform float uHasTex;
// Palette lifted from the album artwork, so every release is coloured by itself.
uniform vec3  uPrimary, uAccent;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.55; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ v+=a*noise(p); p=m*p; a*=0.5; }
  return v;
}
// Ramp between the cover's own two colours, with a cosine-palette shimmer laid
// over the top so it stays iridescent rather than a flat two-stop gradient.
vec3 palette(float t){
  float m = 0.5 + 0.5*sin(6.28318*t);
  vec3 base = mix(uPrimary, uAccent, m);
  vec3 shimmer = 0.5 + 0.5*cos(6.28318*(vec3(1.0,0.75,0.45)*t + vec3(0.0,0.18,0.35)));
  return mix(base, base*shimmer*1.6, 0.35);
}

void main(){
  vec2 res = uRes;
  vec2 uv = (gl_FragCoord.xy - 0.5*res) / res.y;
  float t = uTime * 0.14;
  float beat = uBass*1.4 + uKick*2.2;
  vec3 col = vec3(0.0);

  if(uMode == 1){                     // ── AURORA ──
    float wob = 0.35*sin(uv.x*3.0 + t*2.2)*(0.4 + uBass);
    float band = fbm(vec2(uv.x*2.2 + t, uv.y - t*0.5)*1.4);
    float y = uv.y*3.2 - band*1.6 + wob;
    float glow = exp(-abs(y)*(2.2 - uLevel));
    col = palette(uv.x*0.35 + t + uTreble*0.6) * glow * (1.0 + uLevel*2.2 + uKick);
    col += vec3(0.06,0.16,0.28) * exp(-length(uv)*1.4);
  } else if(uMode == 3 && uHasTex > 0.5){   // ── COVER (reactive) ──
    vec2 c = uv;
    c *= 1.0 / (0.86 + 0.06*sin(t*3.0) + beat*0.05);      // breathing zoom
    c += 0.02*vec2(sin(uv.y*8.0+t*4.0), cos(uv.x*8.0+t*4.0))*(0.3+uTreble); // shimmer warp
    vec2 smp = c + 0.5;                                   // centred square
    if(smp.x>0.0 && smp.x<1.0 && smp.y>0.0 && smp.y<1.0){
      col = texture(uTex, vec2(smp.x, 1.0 - smp.y)).rgb;
      col *= 1.0 + beat*0.35;
    } else {
      col = palette(t) * 0.06;
    }
    col += palette(t) * exp(-length(uv)*1.8) * (0.15 + uKick*0.4);
  } else if(uMode == 2 && uHasTex > 0.5){   // ── SILHOUETTE (kaleidoscope) ──
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 6.0;
    a = mod(a, 6.28318/seg);
    a = abs(a - 3.14159/seg);
    vec2 k = vec2(cos(a), sin(a)) * r * (1.2 - beat*0.15);
    k += 0.15*vec2(fbm(k*2.0 + t), fbm(k*2.0 - t));
    vec2 smp = k + 0.5;
    col = texture(uTex, fract(smp)).rgb;
    col = mix(col, palette(r + t), 0.3);
    col *= 1.0 + beat*0.4;
    col *= smoothstep(1.3, 0.2, r);
  } else if(uMode == 4){              // ── TUNNEL (MilkDrop lineage) ──
    // Polar remap: constant angular travel + 1/r depth reads as flying through
    // a corridor. Rings are quantised so each beat lands on a visible band.
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float depth = 0.55/max(r, 0.04) + uTime*0.55 + uBeat*0.22;
    float rings = fract(depth);
    float band  = smoothstep(0.5, 0.0, abs(rings - 0.5));
    float ribs  = 0.5 + 0.5*sin(a*8.0 + depth*3.0 + uMid*5.0);
    col  = palette(depth*0.35 + a*0.08) * band * (0.55 + uLevel*1.8 + uKick*1.4);
    col *= 0.45 + 0.55*ribs;
    // Horizon glow at the vanishing point, punched by the kick.
    col += uAccent * exp(-r*4.5) * (0.35 + uKick*1.2);
    col *= smoothstep(1.5, 0.15, r) + 0.15;
  } else if(uMode == 5){              // ── LIQUID (ferrofluid sheen) ──
    // Domain-warped height field shaded as a metal surface: cheap fake
    // lighting from the gradient gives it real depth without raymarching.
    vec2 q = uv*1.6;
    float warp = 0.55 + uBass*0.9;
    q += warp*vec2(fbm(q*1.3 + uTime*0.20), fbm(q*1.3 - uTime*0.16 + 3.7));
    float h  = fbm(q*1.7 + uTime*0.10);
    // Central gradient differences → surface normal.
    float e = 0.012;
    float hx = fbm(vec2(q.x+e, q.y)*1.7 + uTime*0.10) - h;
    float hy = fbm(vec2(q.x, q.y+e)*1.7 + uTime*0.10) - h;
    vec3 n = normalize(vec3(-hx, -hy, 0.035));
    vec3 lightDir = normalize(vec3(0.55, 0.7, 0.65));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(diff, 26.0);
    col  = palette(h*1.4 + uTime*0.05) * (0.22 + diff*1.15);
    col += vec3(1.0) * spec * (0.55 + uTreble*2.2);          // sharp highlight
    col += uAccent * pow(1.0 - abs(dot(n, vec3(0,0,1))), 3.0) * 0.55; // rim
    col *= 1.0 + uKick*0.5;
  } else {                            // ── NEBULA (default) ──
    vec2 q = uv*1.4;
    q += 0.6*vec2(fbm(q + t), fbm(q + vec2(5.2,1.3) - t*0.8));
    float f = fbm(q*(1.4 + uBass*2.2) + t*0.5);
    float density = smoothstep(0.15, 0.95, f + uLevel*0.45);
    col = palette(f + t*0.5 + uTreble*0.6) * density * (1.1 + beat);
    col += palette(t) * exp(-length(uv)*2.0) * (0.25 + uKick);
    // sparkle stars
    float s = hash(floor(uv*80.0 + 40.0));
    col += vec3(step(0.995, s)) * (0.4 + uTreble) * (0.5+0.5*sin(t*20.0 + s*30.0));
  }

  col *= 1.0 - 0.32*length(uv);       // vignette
  col = pow(max(col, 0.0), vec3(0.86)); // gentle tone-map
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Only the GPU-rendered modes appear here; the classic media-player modes
// (bars / waves / ambience) are drawn by WmpVisual instead.
const MODE_MAP: Partial<Record<VisualMode, number>> = {
  tunnel: 4,
  liquid: 5,
  nebula: 0,
  aurora: 1,
  silhouette: 2,
  art: 3,
  crowd: 0,
  video: 0,
};

export function GpuVisual({
  release,
  mode,
  className = "",
}: {
  release: Release | null;
  mode: VisualMode;
  className?: string;
}) {
  const player = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<VisualMode>(mode);
  const [failed, setFailed] = useState(false);

  // Refs so play/pause never rebuilds the WebGL context (which would reload the
  // shader + cover texture and hitch).
  const playingRef = useRef(player.playing);
  const getAnalyserRef = useRef(player.getAnalyser);
  useEffect(() => {
    playingRef.current = player.playing;
    getAnalyserRef.current = player.getAnalyser;
  }, [player.playing, player.getAnalyser]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Colours pulled from the album art. Held in a ref so the render loop reads
  // the latest palette without the GL context being rebuilt when it resolves.
  const paletteRef = useRef<Palette>(FALLBACK_PALETTE);
  useEffect(() => {
    let cancelled = false;
    paletteRef.current = FALLBACK_PALETTE;
    if (!release?.artwork_url) return;
    extractPalette(release.artwork_url).then((p) => {
      if (!cancelled) paletteRef.current = p;
    });
    return () => {
      cancelled = true;
    };
  }, [release?.artwork_url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    // fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      bass: gl.getUniformLocation(prog, "uBass"),
      treble: gl.getUniformLocation(prog, "uTreble"),
      level: gl.getUniformLocation(prog, "uLevel"),
      kick: gl.getUniformLocation(prog, "uKick"),
      mid: gl.getUniformLocation(prog, "uMid"),
      beat: gl.getUniformLocation(prog, "uBeat"),
      primary: gl.getUniformLocation(prog, "uPrimary"),
      accent: gl.getUniformLocation(prog, "uAccent"),
      mode: gl.getUniformLocation(prog, "uMode"),
      tex: gl.getUniformLocation(prog, "uTex"),
      hasTex: gl.getUniformLocation(prog, "uHasTex"),
    };

    // cover texture (1px placeholder until the artwork loads)
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 30, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    let hasTex = 0;
    // Guard the async Image.onload against the GL teardown: if the component
    // unmounts (or release changes) before the cover image resolves, the
    // texture/program would already be deleted — writing to it throws.
    let disposed = false;
    if (release) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (disposed) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          hasTex = 1;
        } catch {
          /* tainted / cross-origin — keep procedural */
        }
      };
      img.src = `/api/artwork?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`;
    }

    const isTouch =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    const maxDpr = isTouch ? 1.25 : 1.75;
    const resize = () => {
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
      const h = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Real analysis (log bands, onset detection, auto-gain) with synthesised
    // motion when there's no analyser — which is every touch device, since the
    // Web Audio graph is desktop-only.
    const engine = new AudioEngine({ bands: 32 });
    let last = performance.now();
    let raf = 0;

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      // Skip entirely while hidden: a background tab shouldn't burn the GPU.
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      resize();

      const f = engine.update(getAnalyserRef.current(), dt, playingRef.current);
      // Falls back to the house palette until the cover's colours resolve.
      const pal = paletteRef.current;

      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, f.time);
      gl.uniform1f(u.bass, f.bass);
      gl.uniform1f(u.mid, f.mid);
      gl.uniform1f(u.treble, f.treble);
      gl.uniform1f(u.level, f.level);
      gl.uniform1f(u.kick, f.kick);
      gl.uniform1f(u.beat, f.beatPhase);
      gl.uniform3f(u.primary, pal.primary[0], pal.primary[1], pal.primary[2]);
      gl.uniform3f(u.accent, pal.accent[0], pal.accent[1], pal.accent[2]);
      gl.uniform1i(u.mode, MODE_MAP[modeRef.current] ?? 0);
      gl.uniform1f(u.hasTex, hasTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.tex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release]);

  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#05050b]`}>
        <span className="text-[10px] font-mono uppercase tracking-widest text-star-white/30">GPU unavailable</span>
      </div>
    );
  }
  return <canvas ref={canvasRef} className={className} />;
}
