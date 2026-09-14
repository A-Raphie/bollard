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
    let last = performance.now();

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
        raf = requestAnimationFrame(draw);
        return;
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

      // table
      ctx.fillStyle = PALETTE.tableFill;
      roundedRect(
        ctx,
        X(TABLE.minX),
        Y(TABLE.minY),
        (TABLE.maxX - TABLE.minX) * scale,
        (TABLE.maxY - TABLE.minY) * scale,
        8,
      );
      ctx.fill();
      ctx.strokeStyle = PALETTE.lineStrong;
      ctx.lineWidth = 1;
      ctx.stroke();

      // placemats + tray
      for (const key of ["left-placemat", "right-placemat"] as const) {
        const z = ZONES[key];
        ctx.fillStyle = PALETTE.placematFill;
        roundedRect(ctx, X(z.x - 0.17), Y(z.y - 0.12), 0.34 * scale, 0.24 * scale, 5);
        ctx.fill();
        ctx.strokeStyle = PALETTE.line;
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

      // objects
      for (const def of OBJECTS) {
        const st = sim.scene.objects[def.id];
        if (!st || !st.onTable) continue;
        const px = X(st.x);
        const py = Y(st.y);
        ctx.fillStyle = def.safety === "sharp" ? PALETTE.bladeFill : def.safety === "hot" ? PALETTE.deny : PALETTE.neutral;
        ctx.beginPath();
        ctx.arc(px, py, 0.045 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = def.safety === "fragile" ? PALETTE.ink : PALETTE.lineStrong;
        ctx.stroke();
        // state glyph above the object — label + state text, never color alone
        ctx.font = "10px var(--font-geist-mono), monospace";
        ctx.fillStyle = PALETTE.ink2;
        let glyph = def.label;
        if (def.safety === "hot" && st.hot) glyph = "pan HOT";
        if (def.safety === "flame" && st.lit) glyph = "candle LIT";
        if (def.safety === "sharp") glyph = "knife BLADE";
        if (def.safety === "fragile") glyph = `${def.label} glass`;
        ctx.fillText(glyph, px, py - 0.075 * scale);
        if (st.heldBy) {
          ctx.strokeStyle = PALETTE.accent;
          ctx.beginPath();
          ctx.arc(px, py, 0.065 * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // arms: anchor → elbow → gripper
      for (const arm of ["left", "right"] as const) {
        const v = sim.arms[arm].visual;
        const anchor = ARM_ANCHOR[arm];
        const ax = X(anchor.x);
        const ay = Y(anchor.y);
        const gx = X(v.pos.x);
        const gy = Y(v.pos.y);
        // two-link IK: equal links, elbow perpendicular
        const mx = (ax + gx) / 2;
        const my = (ay + gy) / 2;
        const dx = gx - ax;
        const dy = gy - ay;
        const len = Math.hypot(dx, dy) || 1;
        const h = Math.min(0.16 * scale, Math.max(0.05 * scale, Math.sqrt(Math.max(0, (0.24 * scale) ** 2 - (len / 2) ** 2))));
        const ex = mx + (-dy / len) * h;
        const ey = my + (dx / len) * h;
        ctx.strokeStyle = arm === armRef.current && phaseRef.current !== "idle" ? PALETTE.accent : PALETTE.ink2;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        // anchor base
        ctx.fillStyle = PALETTE.ink3;
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "9px var(--font-geist-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = PALETTE.ink3;
        ctx.fillText(arm === "left" ? "ARM L" : "ARM R", ax, ay + 18);
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
      // post
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
