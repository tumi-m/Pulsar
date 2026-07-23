"use client";

import { useEffect, useRef, useState } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import type { VisualMode } from "./VisualCanvas";

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
uniform float uTime, uBass, uTreble, uLevel, uKick;
uniform int   uMode;      // 0 nebula, 1 aurora, 2 silhouette, 3 cover
uniform sampler2D uTex;
uniform float uHasTex;

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
vec3 palette(float t){
  return 0.5 + 0.5*cos(6.28318*(vec3(1.0,0.75,0.45)*t + vec3(0.0,0.18,0.35)));
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

const MODE_MAP: Record<VisualMode, number> = {
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
    if (release) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
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

    const freq = new Uint8Array(1024);
    let prevBass = 0;
    let kick = 0;
    let raf = 0;

    const render = () => {
      resize();
      const time = performance.now() / 1000;
      let bass = 0.12, treble = 0.08, level = 0.1;
      const analyser = getAnalyserRef.current();
      if (analyser && playingRef.current) {
        analyser.getByteFrequencyData(freq);
        const n = analyser.frequencyBinCount;
        const avg = (a: number, b: number) => {
          let s = 0;
          const lo = Math.floor(n * a), hi = Math.floor(n * b);
          for (let i = lo; i < hi; i++) s += freq[i];
          return s / Math.max(1, (hi - lo) * 255);
        };
        bass = avg(0, 0.06);
        treble = avg(0.3, 1);
        level = avg(0, 1);
      } else {
        // gentle idle motion when no live audio (e.g. mobile)
        bass = 0.14 + Math.sin(time * 1.4) * 0.06;
        treble = 0.1 + Math.sin(time * 2.7) * 0.04;
        level = 0.14 + Math.sin(time * 0.9) * 0.05;
      }
      const rise = bass - prevBass;
      prevBass = bass;
      kick = Math.max(kick * 0.82, rise > 0.035 ? Math.min(1, rise * 7) : 0);

      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.bass, bass);
      gl.uniform1f(u.treble, treble);
      gl.uniform1f(u.level, level);
      gl.uniform1f(u.kick, kick);
      gl.uniform1i(u.mode, MODE_MAP[modeRef.current] ?? 0);
      gl.uniform1f(u.hasTex, hasTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.tex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
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
