"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CRATE, RECORD_SIZE, type Placement, type RecordKind, type RecordSpec } from "@/lib/three/crate-dig";

/**
 * Geometry, materials and canvas-drawn artwork for "dig the crate".
 *
 * The artwork is drawn in greys on purpose: each record's palette ink comes
 * from its instance colour, which multiplies the texture — white takes the
 * full ink, greys become darker shades of it, black stays black. One
 * texture per kind then serves every record, like a one-ink print run.
 *
 * Everything here is created by the caller and handed back with a single
 * dispose(), because R3F only disposes what it created from JSX.
 */

export const RECORD_KINDS: readonly RecordKind[] = ["lp", "single", "tape"];

export interface RecordKit {
  geometry: Record<RecordKind, THREE.BufferGeometry>;
  material: Record<RecordKind, THREE.Material[]>;
  dispose(): void;
}

function drawTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
};

/** Sleeve front: the record printed peeking out, a title bar, a catalogue strip. */
function sleeveArt(): THREE.Texture {
  return drawTexture(256, 256, (ctx, s) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    circle(ctx, s * 0.58, s * 0.54, s * 0.34, "#7a7a7a");
    for (let r = s * 0.32; r > s * 0.14; r -= s * 0.022) {
      ctx.beginPath();
      ctx.arc(s * 0.58, s * 0.54, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#6c6c6c";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    circle(ctx, s * 0.58, s * 0.54, s * 0.11, "#e2e2e2");
    circle(ctx, s * 0.58, s * 0.54, s * 0.012, "#3a3a3a");
    ctx.fillStyle = "#4a4a4a";
    ctx.fillRect(s * 0.07, s * 0.08, s * 0.36, s * 0.04);
    ctx.fillStyle = "#9a9a9a";
    ctx.fillRect(s * 0.07, s * 0.14, s * 0.2, s * 0.022);
    ctx.fillStyle = "#c4c4c4";
    ctx.fillRect(s * 0.07, s * 0.9, s * 0.86, s * 0.018);
  });
}

/** A 7-inch: tight grooves, a sheen, the label (inked) and the big centre hole. */
function discArt(): THREE.Texture {
  return drawTexture(256, 256, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, s, s);
    circle(ctx, c, c, c, "#101010");
    for (let r = c * 0.97; r > c * 0.4; r -= c * 0.024) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // two soft highlight wedges, the way grooves catch a ceiling light
    ctx.save();
    ctx.globalAlpha = 0.07;
    for (const a of [0.6, 0.6 + Math.PI]) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c * 0.97, a, a + 0.45);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();
    circle(ctx, c, c, c * 0.38, "#ffffff");
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(c - c * 0.22, c - c * 0.26, c * 0.44, c * 0.05);
    ctx.fillRect(c - c * 0.14, c + c * 0.2, c * 0.28, c * 0.04);
    circle(ctx, c, c, c * 0.12, "#050505");
  });
}

/** Cassette face: shell, label with writing lines, window with reels, head opening. */
function tapeArt(): THREE.Texture {
  return drawTexture(256, 164, (ctx, w, h) => {
    ctx.fillStyle = "#d4d4d4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(w * 0.06, h * 0.08, w * 0.88, h * 0.56);
    ctx.fillStyle = "#b8b8b8";
    ctx.fillRect(w * 0.1, h * 0.16, w * 0.8, h * 0.025);
    ctx.fillRect(w * 0.1, h * 0.24, w * 0.55, h * 0.025);
    ctx.fillStyle = "#262626";
    ctx.fillRect(w * 0.28, h * 0.34, w * 0.44, h * 0.22);
    for (const x of [0.37, 0.63]) {
      circle(ctx, w * x, h * 0.45, h * 0.085, "#0c0c0c");
      circle(ctx, w * x, h * 0.45, h * 0.04, "#e0e0e0");
    }
    ctx.fillStyle = "#a6a6a6";
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h);
    ctx.lineTo(w * 0.26, h * 0.78);
    ctx.lineTo(w * 0.74, h * 0.78);
    ctx.lineTo(w * 0.8, h);
    ctx.closePath();
    ctx.fill();
    for (const x of [0.36, 0.5, 0.64]) circle(ctx, w * x, h * 0.9, h * 0.03, "#3a3a3a");
  });
}

export function buildRecordKit(): RecordKit {
  const textures = [sleeveArt(), discArt(), tapeArt()];
  const [sleeveTex, discTex, tapeTex] = textures;

  const [lw, lh, ld] = RECORD_SIZE.lp;
  const [sd, sh] = RECORD_SIZE.single;
  const [tw, th, tdp] = RECORD_SIZE.tape;
  const geometry: RecordKit["geometry"] = {
    lp: new THREE.BoxGeometry(lw, lh, ld),
    single: new THREE.CylinderGeometry(sd / 2, sd / 2, sh, 48, 1),
    tape: new THREE.BoxGeometry(tw, th, tdp),
  };

  const sleeveFace = new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.62 });
  const sleeveEdge = new THREE.MeshStandardMaterial({ color: "#a8a8a8", roughness: 0.75 });
  const discFace = new THREE.MeshStandardMaterial({ map: discTex, roughness: 0.32 });
  const discEdge = new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.4 });
  const tapeFace = new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.45 });
  const tapeEdge = new THREE.MeshStandardMaterial({ color: "#9c9c9c", roughness: 0.5 });

  // BoxGeometry groups: +x −x +y −y +z −z (the art faces are ±y, lying flat).
  // CylinderGeometry groups: side, top cap, bottom cap.
  const material: RecordKit["material"] = {
    lp: [sleeveEdge, sleeveEdge, sleeveFace, sleeveFace, sleeveEdge, sleeveEdge],
    single: [discEdge, discFace, discFace],
    tape: [tapeEdge, tapeEdge, tapeFace, tapeFace, tapeEdge, tapeEdge],
  };
  const unique = [sleeveFace, sleeveEdge, discFace, discEdge, tapeFace, tapeEdge];

  return {
    geometry,
    material,
    dispose() {
      Object.values(geometry).forEach((g) => g.dispose());
      unique.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

/**
 * The crate as ONE draw call: slatted walls with gaps, corner posts and a
 * floor, merged, each slat a slightly different shade of the wood via vertex
 * colour so it reads as boards rather than a brown box.
 */
export function buildCrateGeometry(): THREE.BufferGeometry {
  const { width: W, height: H, depth: D, wall: T, floor: F } = CRATE;
  const parts: THREE.BufferGeometry[] = [];
  let shadeSeed = 3;
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    shadeSeed = (shadeSeed * 9301 + 49297) % 233280;
    const shade = 0.82 + (shadeSeed / 233280) * 0.3;
    const colors = new Float32Array(g.getAttribute("position").count * 3).fill(shade);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };

  add(W - 0.02, F, D - 0.02, 0, F / 2, 0);
  const gap = 0.05;
  const slat = (H - F - gap * 2) / 3;
  for (let s = 0; s < 3; s++) {
    const y = F + s * (slat + gap) + slat / 2;
    add(W, slat, T, 0, y, D / 2 - T / 2);
    add(W, slat, T, 0, y, -(D / 2 - T / 2));
    add(T, slat, D - T * 2, W / 2 - T / 2, y, 0);
    add(T, slat, D - T * 2, -(W / 2 - T / 2), y, 0);
  }
  const post = 0.11;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(post, H, post, sx * (W / 2 - post / 2), H / 2, sz * (D / 2 - post / 2));
    }
  }

  const merged = mergeGeometries(parts, false) ?? new THREE.BoxGeometry(W, H, D);
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Soft contact shadow under the crate — a gradient quad, not a shadow map. */
export function blobShadowTexture(): THREE.Texture {
  return drawTexture(128, 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.6)");
    g.addColorStop(0.55, "rgba(0,0,0,0.32)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

/**
 * Write placements + inks into one kind's instanced mesh. `indices` maps
 * instance slot → spec index.
 */
export function writeInstances(
  mesh: THREE.InstancedMesh,
  indices: readonly number[],
  specs: readonly RecordSpec[],
  placements: readonly Placement[],
): void {
  indices.forEach((specIndex, slot) => {
    const { position, rotation } = placements[specIndex];
    _p.set(position[0], position[1], position[2]);
    _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]));
    mesh.setMatrixAt(slot, _m.compose(_p, _q, _s));
    mesh.setColorAt(slot, _c.set(specs[specIndex].color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // Raycasts test the cached sphere first; it must cover where the records are now.
  mesh.computeBoundingSphere();
}
