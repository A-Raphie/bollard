"use client";

// The dinner-table renderer: top-down scene, two arms, and THE ROPE — the command's
// line from the bollard to the arm. Held while policy evaluates, paid out on ALLOW,
// snubbed on DENY. This is the product's core mechanic drawn on screen.

import { useEffect, useRef } from "react";
import { ARM_ANCHOR, OBJECTS, TABLE, ZONES } from "@/lib/scene";
import { PALETTE } from "@/lib/palette";
import type { TableSim } from "@/lib/sim/engine";

export type RopePhase = "idle" | "held" | "payout" | "snubbed";

export interface CanvasPulse {
  x: number;
  y: number;
  kind: "dest" | "blocked";
  until: number; // epoch ms
}

interface Props {
  simRef: React.RefObject<TableSim | null>;
  phase: RopePhase;
  activeArm: "left" | "right" | null;
  pulses: React.RefObject<CanvasPulse[]>;
}

export function TableCanvas({ simRef, phase, activeArm, pulses }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const armRef = useRef(activeArm);
  phaseRef.current = phase;
  armRef.current = activeArm;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = (now: number) => {
      try {
        runFrame(now);
      } catch (e) {
        (window as unknown as { __bollardDrawError?: string }).__bollardDrawError = String(e);
        return; // loop stops; the error surfaces on the debug handle
      }
      raf = requestAnimationFrame(draw);
    };
    if (import.meta.env.DEV) (window as unknown as { __bollardFrames?: number }).__bollardFrames = 0;
    const runFrame = (now: number) => {
      if (import.meta.env.DEV) {
        const w = window as unknown as { __bollardFrames?: number };
        if (typeof w.__bollardFrames === "number") w.__bollardFrames += 1;
      }
      const sim = simRef.current;
      if (!sim) {
        return; // wrapper reschedules
      }
      sim.advance();

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // world → screen: table centered, +y world is toward the viewer (down screen)
      const scale = Math.min(rect.width / 2.3, rect.height / 1.65);
      const cx = rect.width / 2;
      const cy = rect.height / 2 + 0.1 * scale;
      const X = (wx: number) => cx + wx * scale;
      const Y = (wy: number) => cy + wy * scale;

      // table: warm walnut on the slate cockpit
      ctx.fillStyle = PALETTE.tableWood;
      roundedRect(ctx, X(TABLE.minX), Y(TABLE.minY), (TABLE.maxX - TABLE.minX) * scale, (TABLE.maxY - TABLE.minY) * scale, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.tableRim;
      ctx.lineWidth = 2;
      ctx.stroke();
      // subtle top-edge highlight so the surface reads as lit from above
      ctx.strokeStyle = "rgba(255,236,200,0.05)";
      ctx.lineWidth = 1;
      roundedRect(ctx, X(TABLE.minX) + 3, Y(TABLE.minY) + 3, (TABLE.maxX - TABLE.minX) * scale - 6, (TABLE.maxY - TABLE.minY) * scale - 6, 8);
      ctx.stroke();

      // placemats (woven cloth) + tray
      for (const key of ["left-placemat", "right-placemat"] as const) {
        const z = ZONES[key];
        ctx.fillStyle = PALETTE.placematFill;
        roundedRect(ctx, X(z.x - 0.17), Y(z.y - 0.12), 0.34 * scale, 0.24 * scale, 5);
        ctx.fill();
        ctx.strokeStyle = PALETTE.line;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const tray = ZONES.tray;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = PALETTE.ink3;
      roundedRect(ctx, X(tray.x - 0.3), Y(tray.y - 0.08), 0.6 * scale, 0.16 * scale, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PALETTE.ink3;
      ctx.font = "9px var(--font-geist-mono), monospace";
      ctx.textAlign = "center";
      ctx.fillText("TRAY", X(tray.x), Y(tray.y - 0.12));

      // objects: per-class shapes with soft shadows; duplicates numbered; hazards captioned
      const familyTotals = new Map<string, number>();
      const familySeen = new Map<string, number>();
      for (const def of OBJECTS) {
        const st = sim.scene.objects[def.id];
        if (!st || !st.onTable) continue;
        familyTotals.set(def.label, (familyTotals.get(def.label) ?? 0) + 1);
      }
      const drawnLabels: Array<{ x: number; y: number }> = [];
      for (const def of OBJECTS) {
        const st = sim.scene.objects[def.id];
        if (!st || !st.onTable) continue;
        const px = X(st.x);
        const py = Y(st.y);
        const r = 0.045 * scale;
        // soft ground shadow
        ctx.fillStyle = PALETTE.shadow;
        ctx.beginPath();
        ctx.ellipse(px + 2, py + 4, r * 1.05, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        const seen = (familySeen.get(def.label) ?? 0) + 1;
        familySeen.set(def.label, seen);
        const numbered = (familyTotals.get(def.label) ?? 0) > 1 ? `${def.label} ${seen}` : def.label;

        switch (def.label) {
          case "plate": {
            ctx.fillStyle = PALETTE.ceramic;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.ceramicRim;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
            ctx.stroke();
            break;
          }
          case "glass": {
            ctx.fillStyle = PALETTE.glassFill;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.92, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.glassRim;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.beginPath();
            ctx.arc(px, py, r * 0.55, -2.3, -1.2);
            ctx.stroke();
            break;
          }
          case "bowl": {
            ctx.fillStyle = PALETTE.ceramic;
            ctx.beginPath();
            ctx.arc(px, py, r, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = PALETTE.ceramicRim;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            break;
          }
          case "knife": {
            ctx.strokeStyle = PALETTE.bladeFill;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px - r, py + r * 0.6);
            ctx.lineTo(px + r * 0.4, py - r * 0.6);
            ctx.stroke();
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + r * 0.4, py - r * 0.6);
            ctx.lineTo(px + r, py - r);
            ctx.stroke();
            break;
          }
          case "fork": {
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px - r, py + r);
            ctx.lineTo(px + r * 0.3, py - r * 0.3);
            ctx.stroke();
            for (const t of [-1, 0, 1]) {
              ctx.beginPath();
              ctx.moveTo(px + r * 0.3, py - r * 0.3);
              ctx.lineTo(px + r * 0.3 + t * r * 0.35 - r * 0.1, py - r);
              ctx.stroke();
            }
            break;
          }
          case "spoon": {
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px - r, py + r);
            ctx.lineTo(px + r * 0.2, py - r * 0.2);
            ctx.stroke();
            ctx.fillStyle = PALETTE.metal;
            ctx.beginPath();
            ctx.ellipse(px + r * 0.45, py - r * 0.45, r * 0.45, r * 0.3, -0.7, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case "napkin": {
            ctx.fillStyle = PALETTE.cloth;
            roundedRect(ctx, px - r, py - r * 0.8, r * 2, r * 1.6, 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
          }
          case "candle": {
            ctx.fillStyle = PALETTE.wax;
            roundedRect(ctx, px - r * 0.55, py - r, r * 1.1, r * 2, 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.stroke();
            if (st.lit) {
              const flick = Math.sin(now / 140) * r * 0.12;
              ctx.fillStyle = PALETTE.flame;
              ctx.beginPath();
              ctx.ellipse(px + flick, py - r * 1.5, r * 0.32, r * 0.6, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,0.65)";
              ctx.beginPath();
              ctx.ellipse(px + flick, py - r * 1.45, r * 0.12, r * 0.28, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          case "saucepan": {
            ctx.fillStyle = PALETTE.panBody;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.stroke();
            ctx.strokeStyle = PALETTE.panHandle;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px + r * 0.8, py - r * 0.5);
            ctx.lineTo(px + r * 1.8, py - r * 1.1);
            ctx.stroke();
            if (st.hot) {
              ctx.strokeStyle = "rgba(226,106,99,0.5)";
              ctx.lineWidth = 1.5;
              for (let s = 0; s < 2; s++) {
                ctx.beginPath();
                ctx.arc(px, py, r * (1.25 + s * 0.28), -2.6, -0.5);
                ctx.stroke();
              }
            }
            break;
          }
          case "teapot": {
            ctx.fillStyle = PALETTE.brass;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.stroke();
            ctx.fillStyle = PALETTE.brass;
            ctx.beginPath();
            ctx.moveTo(px + r * 0.6, py - r * 0.3);
            ctx.lineTo(px + r * 1.5, py - r * 0.8);
            ctx.lineTo(px + r * 1.5, py - r * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px - r * 0.9, py, r * 0.7, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
            break;
          }
          default: {
            ctx.fillStyle = PALETTE.neutral;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.stroke();
          }
        }

        // caption above the object — numbered duplicates, state text, never color alone
        ctx.font = "10px var(--font-geist-mono), monospace";
        let caption = numbered;
        if (def.label === "saucepan" && st.hot) caption = `${numbered} · HOT`;
        if (def.label === "candle" && st.lit) caption = `${numbered} · LIT`;
        if (def.label === "knife") caption = `${numbered} · BLADE`;
        if (def.safety === "fragile") caption = `${numbered} · careful`;
        let ly = py - r * 2.1;
        while (drawnLabels.some((p) => Math.abs(p.x - px) < 58 && Math.abs(p.y - ly) < 11)) {
          ly -= 11;
        }
        drawnLabels.push({ x: px, y: ly });
        ctx.fillStyle = PALETTE.ink2;
        ctx.textAlign = "center";
        ctx.fillText(caption, px, ly);
        if (st.heldBy) {
          ctx.strokeStyle = PALETTE.accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, r * 1.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // arms: base plate, two links, joints, gripper jaws
      for (const arm of ["left", "right"] as const) {
        const v = sim.arms[arm].visual;
        const anchor = ARM_ANCHOR[arm];
        const ax = X(anchor.x);
        const ay = Y(anchor.y);
        const gx = X(v.pos.x);
        const gy = Y(v.pos.y);
        const mx = (ax + gx) / 2;
        const my = (ay + gy) / 2;
        const dx = gx - ax;
        const dy = gy - ay;
        const len = Math.hypot(dx, dy) || 1;
        const h = Math.min(0.16 * scale, Math.max(0.05 * scale, Math.sqrt(Math.max(0, (0.24 * scale) ** 2 - (len / 2) ** 2))));
        const ex = mx + (-dy / len) * h;
        const ey = my + (dx / len) * h;
        const active = arm === armRef.current && phaseRef.current !== "idle";
        // base plate
        ctx.fillStyle = PALETTE.raised;
        roundedRect(ctx, ax - 14, ay - 8, 28, 16, 3);
        ctx.fill();
        ctx.strokeStyle = PALETTE.lineStrong;
        ctx.lineWidth = 1;
        ctx.stroke();
        // links
        ctx.strokeStyle = active ? PALETTE.accent : PALETTE.ink2;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.lineCap = "butt";
        // elbow + shoulder joints
        ctx.fillStyle = active ? PALETTE.accent : PALETTE.ink3;
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "9px var(--font-geist-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = PALETTE.ink3;
        ctx.fillText(arm === "left" ? "ARM L" : "ARM R", ax, ay + 22);
        // gripper jaws
        const open = (1 - v.grip) * 6 + 2;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx - open, gy - 4);
        ctx.lineTo(gx - open, gy + 4);
        ctx.moveTo(gx + open, gy - 4);
        ctx.lineTo(gx + open, gy + 4);
        ctx.stroke();
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // THE ROPE + BOLLARD — below the front edge of the table
      const bx = X(0);
      const by = Y(TABLE.maxY) + 26;
      const armNow = armRef.current;
      const ph = phaseRef.current;
      const ropeColor =
        ph === "snubbed" ? PALETTE.deny : ph === "held" ? PALETTE.warn : ph === "payout" ? PALETTE.ok : PALETTE.ink3;
      ctx.fillStyle = PALETTE.raised;
      roundedRect(ctx, bx - 7, by - 22, 14, 30, 3);
      ctx.fill();
      ctx.strokeStyle = ph === "idle" ? PALETTE.lineStrong : ropeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by - 24, 5, 0, Math.PI * 2);
      ctx.fillStyle = ph === "idle" ? PALETTE.ink3 : ropeColor;
      ctx.fill();
      ctx.font = "9px var(--font-geist-mono), monospace";
      ctx.fillStyle = PALETTE.ink3;
      ctx.fillText("BOLLARD", bx, by + 22);

      // rope line: bollard → active arm gripper (wrapped loops while held/snubbed)
      if (armNow && ph !== "idle") {
        const v = sim.arms[armNow].visual;
        const gx = X(v.pos.x);
        const gy = Y(v.pos.y);
        ctx.strokeStyle = ropeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by - 18);
        if (ph === "held" || ph === "snubbed") {
          ctx.bezierCurveTo(bx + 16, by - 20, bx + 16, by - 10, bx, by - 10);
          ctx.bezierCurveTo(bx - 16, by - 8, bx - 16, by + 2, bx, by + 2);
        }
        ctx.quadraticCurveTo((bx + gx) / 2, (by + gy) / 2 + 30, gx, gy + 6);
        ctx.stroke();
        if (ph === "snubbed") {
          ctx.fillStyle = PALETTE.deny;
          ctx.font = "10px var(--font-geist-mono), monospace";
          ctx.textAlign = "center";
          ctx.fillText("HELD", bx + 34, by - 14);
        }
      }

      // pulses (destination / blocked markers)
      const live = (pulses.current ?? []).filter((p) => p.until > now);
      pulses.current = live;
      for (const p of live) {
        ctx.strokeStyle = p.kind === "dest" ? PALETTE.ok : PALETTE.deny;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 0.09 * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [simRef, pulses]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-label="Dinner-table simulation with two robot arms and the bollard line" />;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
