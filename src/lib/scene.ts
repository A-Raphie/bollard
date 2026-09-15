// The dinner-table scene registry: objects, initial layout, geometry helpers.
// Coordinates are meters, origin at table center. Table: 1.6 × 0.9 (x ∈ [-0.8, 0.8], y ∈ [-0.45, 0.45]).
// Arms sit behind the top edge (y = -0.45 side): left anchor (-0.55, -0.62), right anchor (0.55, -0.62).

import type { ObjectState, SceneObject } from "./types";

export const TABLE = { minX: -0.8, maxX: 0.8, minY: -0.45, maxY: 0.45 };
export const ARM_ANCHOR: Record<"left" | "right", { x: number; y: number }> = {
  left: { x: -0.55, y: -0.62 },
  right: { x: 0.55, y: -0.62 },
};
export const ARM_REACH = 1.15;
export const TRAY = { x: 0, y: -0.78 }; // staging tray behind the table (off-table zone)

export const OBJECTS: SceneObject[] = [
  { id: "plate_1", label: "plate", synonyms: ["plate", "plates", "dish", "dishes"], safety: "safe" },
  { id: "plate_2", label: "plate", synonyms: ["plate", "plates", "dish", "dishes"], safety: "safe" },
  { id: "glass_1", label: "glass", synonyms: ["glass", "glasses", "cup", "cups", "tumbler"], safety: "fragile" },
  { id: "glass_2", label: "glass", synonyms: ["glass", "glasses", "cup", "cups", "tumbler"], safety: "fragile" },
  { id: "bowl", label: "bowl", synonyms: ["bowl", "bowls"], safety: "safe" },
  { id: "fork", label: "fork", synonyms: ["fork", "forks"], safety: "safe" },
  { id: "knife", label: "knife", synonyms: ["knife", "knives"], safety: "sharp" },
  { id: "spoon", label: "spoon", synonyms: ["spoon", "spoons"], safety: "safe" },
  { id: "napkin_1", label: "napkin", synonyms: ["napkin", "napkins", "serviette"], safety: "safe" },
  { id: "napkin_2", label: "napkin", synonyms: ["napkin", "napkins", "serviette"], safety: "safe" },
  { id: "candle", label: "candle", synonyms: ["candle", "candlestick"], safety: "flame" },
  { id: "saucepan", label: "saucepan", synonyms: ["saucepan", "pan", "pot", "skillet"], safety: "hot" },
  { id: "teapot", label: "teapot", synonyms: ["teapot", "kettle", "jug", "pitcher"], safety: "safe" },
];

export const ZONES: Record<string, { x: number; y: number; label: string }> = {
  "left-placemat": { x: -0.42, y: 0.08, label: "the left placemat" },
  "right-placemat": { x: 0.3, y: 0.08, label: "the right placemat" },
  center: { x: -0.05, y: -0.05, label: "the center of the table" },
  tray: { x: TRAY.x, y: TRAY.y, label: "the tray" },
};

export interface SceneState {
  objects: Record<string, ObjectState>;
}

export function initialScene(): SceneState {
  return {
    objects: {
      plate_1: { x: -0.62, y: 0.18, heldBy: null, onTable: true },
      plate_2: { x: -0.6, y: 0.21, heldBy: null, onTable: true },
      glass_1: { x: 0.58, y: -0.28, heldBy: null, onTable: true },
      glass_2: { x: 0.63, y: -0.24, heldBy: null, onTable: true },
      bowl: { x: -0.48, y: -0.22, heldBy: null, onTable: true },
      fork: { x: -0.02, y: 0.32, heldBy: null, onTable: true },
      knife: { x: 0.04, y: 0.32, heldBy: null, onTable: true },
      spoon: { x: 0.1, y: 0.32, heldBy: null, onTable: true },
      napkin_1: { x: -0.05, y: -0.32, heldBy: null, onTable: true },
      napkin_2: { x: 0.02, y: -0.34, heldBy: null, onTable: true },
      candle: { x: 0.18, y: -0.02, heldBy: null, onTable: true, lit: true },
      saucepan: { x: -0.18, y: -0.3, heldBy: null, onTable: true, hot: true },
      teapot: { x: 0.38, y: 0.28, heldBy: null, onTable: true },
    },
  };
}

export function cloneScene(s: SceneState): SceneState {
  return { objects: Object.fromEntries(Object.entries(s.objects).map(([k, v]) => [k, { ...v }])) };
}

/** Compact deterministic fingerprint of the scene for receipts. */
export function sceneFingerprint(s: SceneState): string {
  const ids = Object.keys(s.objects).sort();
  return ids
    .map((id) => {
      const o = s.objects[id];
      const pos = o.onTable ? `${o.x.toFixed(2)},${o.y.toFixed(2)}` : "tray";
      const flags = [o.heldBy ? `held:${o.heldBy}` : "", o.lit ? "lit" : "", o.hot ? "hot" : ""]
        .filter(Boolean)
        .join("|");
      return `${id}@${pos}${flags ? `#${flags}` : ""}`;
    })
    .join(";");
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Nearest arm that can reach the point; null if neither can. */
export function armForPoint(s: SceneState, x: number, y: number, holding?: Record<string, ObjectState>): "left" | "right" | null {
  const dl = distance(ARM_ANCHOR.left.x, ARM_ANCHOR.left.y, x, y);
  const dr = distance(ARM_ANCHOR.right.x, ARM_ANCHOR.right.y, x, y);
  const okL = dl <= ARM_REACH;
  const okR = dr <= ARM_REACH;
  if (okL && okR) return dl <= dr ? "left" : "right";
  if (okL) return "left";
  if (okR) return "right";
  return null;
}

/** Find an object id from a spoken noun, handling "a/the plate" against stacks (top-most first). */
export function resolveObject(scene: SceneState, spokenNoun: string): string | null {
  const noun = spokenNoun.toLowerCase().replace(/s$/, "");
  const matches = OBJECTS.filter((o) =>
    o.synonyms.some((syn) => syn.replace(/s$/, "") === noun),
  );
  if (matches.length === 0) return null;
  const ids = new Set(matches.map((m) => m.id));
  // prefer an on-table, unheld, top-of-stack instance
  const candidates = [...ids].filter((id) => {
    const st = scene.objects[id];
    return st && st.onTable && !st.heldBy;
  });
  const pick = [...candidates].sort((a, b) => {
    const sa = OBJECTS.find((o) => o.id === a);
    const sb = OBJECTS.find((o) => o.id === b);
    // later array entries are on top of a stack
    return (sa ? OBJECTS.indexOf(sa) : 0) - (sb ? OBJECTS.indexOf(sb) : 0);
  });
  return pick[0] ?? null;
}
