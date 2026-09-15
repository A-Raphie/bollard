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

      const tableX = X(TABLE.minX);
      const tableY = Y(TABLE.minY);
      const tableW = (TABLE.maxX - TABLE.minX) * scale;
      const tableH = (TABLE.maxY - TABLE.minY) * scale;

      // 1. TABLE: Precision aerospace/robotics slate workbench with radial lighting & atmospheric glow
      ctx.save();
      // Outer ambient drop shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;
      roundedRect(ctx, tableX, tableY, tableW, tableH, 14);
      ctx.fillStyle = PALETTE.tableWood;
      ctx.fill();
      ctx.restore();

      // Subtle radial workbench surface illumination
      const tableGrad = ctx.createRadialGradient(cx, cy, 0.05 * scale, cx, cy, 0.85 * scale);
      tableGrad.addColorStop(0, PALETTE.tableSurfaceCenter);
      tableGrad.addColorStop(0.7, PALETTE.tableWood);
      tableGrad.addColorStop(1, "#0a0e14");
      ctx.fillStyle = tableGrad;
      roundedRect(ctx, tableX, tableY, tableW, tableH, 14);
      ctx.fill();

      // Table perimeter rim and precision chamfer highlight
      ctx.strokeStyle = PALETTE.tableRim;
      ctx.lineWidth = 2.5;
      roundedRect(ctx, tableX, tableY, tableW, tableH, 14);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.tableHighlight;
      ctx.lineWidth = 1;
      roundedRect(ctx, tableX + 3, tableY + 3, tableW - 6, tableH - 6, 12);
      ctx.stroke();

      // Surface precision grid: micro registration marks at 0.3m intervals
      ctx.fillStyle = "rgba(232, 236, 242, 0.07)";
      for (let gx = -0.6; gx <= 0.61; gx += 0.3) {
        for (let gy = -0.3; gy <= 0.31; gy += 0.3) {
          const px = X(gx);
          const py = Y(gy);
          ctx.fillRect(px - 3, py - 0.5, 6, 1);
          ctx.fillRect(px - 0.5, py - 3, 1, 6);
        }
      }

      // ATMOSPHERIC LIGHTING: Candle flame aura cast on table
      const candleObj = sim.scene.objects["candle"];
      if (candleObj && candleObj.onTable && candleObj.lit) {
        const clx = X(candleObj.x);
        const cly = Y(candleObj.y);
        const clg = ctx.createRadialGradient(clx, cly, 10, clx, cly, 0.55 * scale);
        clg.addColorStop(0, "rgba(245, 158, 11, 0.22)");
        clg.addColorStop(0.35, "rgba(245, 158, 11, 0.09)");
        clg.addColorStop(1, "rgba(245, 158, 11, 0)");
        ctx.fillStyle = clg;
        roundedRect(ctx, tableX, tableY, tableW, tableH, 14);
        ctx.fill();
      }

      // ATMOSPHERIC LIGHTING: Saucepan thermal radiation on table
      const panObj = sim.scene.objects["saucepan"];
      if (panObj && panObj.onTable && panObj.hot) {
        const pnx = X(panObj.x);
        const pny = Y(panObj.y);
        const png = ctx.createRadialGradient(pnx, pny, 12, pnx, pny, 0.38 * scale);
        png.addColorStop(0, "rgba(239, 68, 68, 0.16)");
        png.addColorStop(0.5, "rgba(220, 38, 38, 0.05)");
        png.addColorStop(1, "rgba(220, 38, 38, 0)");
        ctx.fillStyle = png;
        roundedRect(ctx, tableX, tableY, tableW, tableH, 14);
        ctx.fill();
      }

      // 2. PLACEMATS: Clean silicone inspection mats with corner registration ticks & stitched border
      for (const key of ["left-placemat", "right-placemat"] as const) {
        const z = ZONES[key];
        const pw = 0.36 * scale;
        const ph = 0.26 * scale;
        const px = X(z.x - 0.18);
        const py = Y(z.y - 0.13);

        ctx.fillStyle = PALETTE.placematFill;
        roundedRect(ctx, px, py, pw, ph, 6);
        ctx.fill();

        ctx.strokeStyle = PALETTE.placematBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Stitched inner hemline
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        roundedRect(ctx, px + 4, py + 4, pw - 8, ph - 8, 4);
        ctx.stroke();
        ctx.setLineDash([]);

        // Corner registration brackets ┌ ┐ └ ┘
        ctx.strokeStyle = PALETTE.accent;
        ctx.lineWidth = 1.5;
        const armLen = 8;
        // top-left
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 4 + armLen);
        ctx.lineTo(px + 4, py + 4);
        ctx.lineTo(px + 4 + armLen, py + 4);
        ctx.stroke();
        // top-right
        ctx.beginPath();
        ctx.moveTo(px + pw - 4 - armLen, py + 4);
        ctx.lineTo(px + pw - 4, py + 4);
        ctx.lineTo(px + pw - 4, py + 4 + armLen);
        ctx.stroke();
        // bottom-left
        ctx.beginPath();
        ctx.moveTo(px + 4, py + ph - 4 - armLen);
        ctx.lineTo(px + 4, py + ph - 4);
        ctx.lineTo(px + 4 + armLen, py + ph - 4);
        ctx.stroke();
        // bottom-right
        ctx.beginPath();
        ctx.moveTo(px + pw - 4 - armLen, py + ph - 4);
        ctx.lineTo(px + pw - 4, py + ph - 4);
        ctx.lineTo(px + pw - 4, py + ph - 4 - armLen);
        ctx.stroke();

        ctx.font = "8px var(--font-geist-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(154, 166, 182, 0.6)";
        ctx.fillText(key === "left-placemat" ? "ZONE 1 · LEFT PLACE" : "ZONE 2 · RIGHT PLACE", px + pw / 2, py + ph - 8);
      }

      // 3. STAGING TRAY: Recessed metallic staging bay behind the table
      const tray = ZONES.tray;
      const trayW = 0.64 * scale;
      const trayH = 0.18 * scale;
      const trayX = X(tray.x - 0.32);
      const trayY = Y(tray.y - 0.09);

      ctx.fillStyle = PALETTE.trayFill;
      roundedRect(ctx, trayX, trayY, trayW, trayH, 5);
      ctx.fill();

      ctx.strokeStyle = PALETTE.trayBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Subtle inner depth line
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;
      roundedRect(ctx, trayX + 1, trayY + 1, trayW - 2, trayH - 2, 4);
      ctx.stroke();

      ctx.font = "9px var(--font-geist-mono), monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = PALETTE.ink3;
      ctx.fillText("STAGING TRAY · OFF-TABLE ZONE", X(tray.x), trayY + trayH / 2 + 3);

      // 4. OBJECT RENDERING & SMART NON-COLLIDING LABELS
      // Pre-compute object visibility and coordinates
      interface RenderableObject {
        id: string;
        label: string;
        safety: string;
        px: number;
        py: number;
        r: number;
        st: (typeof sim.scene.objects)[string];
      }

      const activeObjects: RenderableObject[] = [];
      for (const def of OBJECTS) {
        const st = sim.scene.objects[def.id];
        if (!st || !st.onTable) continue;
        activeObjects.push({
          id: def.id,
          label: def.label,
          safety: def.safety,
          px: X(st.x),
          py: Y(st.y),
          r: 0.045 * scale,
          st,
        });
      }

      // Draw object shapes first
      for (const obj of activeObjects) {
        const { label, px, py, r, st, safety } = obj;

        // Ground shadow
        ctx.fillStyle = PALETTE.shadow;
        ctx.beginPath();
        ctx.ellipse(px + 2, py + 4, r * 1.05, r * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();

        switch (label) {
          case "plate": {
            // High-craft ceramic plate with depth gradient and double rim
            const plateGrad = ctx.createRadialGradient(px - r * 0.2, py - r * 0.2, r * 0.1, px, py, r);
            plateGrad.addColorStop(0, "#ffffff");
            plateGrad.addColorStop(0.7, PALETTE.ceramic);
            plateGrad.addColorStop(1, PALETTE.ceramicRim);
            ctx.fillStyle = plateGrad;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(43, 54, 72, 0.4)";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Inner rim
            ctx.strokeStyle = "rgba(154, 166, 182, 0.6)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.62, 0, Math.PI * 2);
            ctx.stroke();

            // Specular highlight arc
            ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.88, -2.4, -1.2);
            ctx.stroke();

            // If stacked with another plate, render crisp micro 2× tag on the top plate
            const otherPlate = activeObjects.find((o) => o.id !== obj.id && o.label === "plate" && Math.hypot(o.px - px, o.py - py) < 0.06 * scale);
            if (otherPlate && obj.id === "plate_2") {
              ctx.save();
              ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
              ctx.strokeStyle = PALETTE.tableHighlight;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + r * 0.72, py - r * 0.72, 7.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.font = "bold 8px var(--font-geist-mono), monospace";
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.fillText("2×", px + r * 0.72, py - r * 0.72 + 2.5);
              ctx.restore();
            }
            break;
          }
          case "glass": {
            // Translucent crystal tumbler with refractions
            ctx.fillStyle = PALETTE.glassFill;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.9, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = PALETTE.glassRim;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Inner reflection ring
            ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.65, -2.6, -1.0);
            ctx.stroke();

            // Center base highlight
            ctx.fillStyle = "rgba(83, 213, 232, 0.25)";
            ctx.beginPath();
            ctx.arc(px, py, r * 0.35, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case "bowl": {
            // Ceramic soup bowl with interior concave shading
            const bowlGrad = ctx.createRadialGradient(px, py, r * 0.2, px, py, r);
            bowlGrad.addColorStop(0, "#cbd5e1");
            bowlGrad.addColorStop(0.85, PALETTE.ceramic);
            bowlGrad.addColorStop(1, PALETTE.ceramicRim);
            ctx.fillStyle = bowlGrad;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.95, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = PALETTE.ceramicRim;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner depth basin
            ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
            ctx.beginPath();
            ctx.arc(px, py, r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case "knife": {
            // Precision chef blade with metallic bevel
            ctx.strokeStyle = PALETTE.bladeFill;
            ctx.lineWidth = 3.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px - r * 0.9, py + r * 0.6);
            ctx.lineTo(px + r * 0.3, py - r * 0.6);
            ctx.stroke();

            // Handle
            ctx.strokeStyle = PALETTE.panHandle;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px + r * 0.3, py - r * 0.6);
            ctx.lineTo(px + r * 0.9, py - r * 1.1);
            ctx.stroke();
            ctx.lineCap = "butt";
            break;
          }
          case "fork": {
            // Polished fork with 3 distinct tines
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px - r * 0.9, py + r * 0.9);
            ctx.lineTo(px + r * 0.2, py - r * 0.2);
            ctx.stroke();

            // Tines
            for (const t of [-1, 0, 1]) {
              ctx.beginPath();
              ctx.moveTo(px + r * 0.2, py - r * 0.2);
              ctx.lineTo(px + r * 0.2 + t * r * 0.3 - r * 0.1, py - r * 0.85);
              ctx.stroke();
            }
            ctx.lineCap = "butt";
            break;
          }
          case "spoon": {
            // Polished dinner spoon
            ctx.strokeStyle = PALETTE.metal;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px - r * 0.9, py + r * 0.9);
            ctx.lineTo(px + r * 0.2, py - r * 0.2);
            ctx.stroke();

            // Oval bowl
            ctx.fillStyle = PALETTE.metal;
            ctx.beginPath();
            ctx.ellipse(px + r * 0.45, py - r * 0.45, r * 0.42, r * 0.28, -0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineCap = "butt";
            break;
          }
          case "napkin": {
            // Folded cloth napkin
            ctx.fillStyle = PALETTE.cloth;
            roundedRect(ctx, px - r * 0.9, py - r * 0.7, r * 1.8, r * 1.4, 3);
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Fold crease line
            ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
            ctx.beginPath();
            ctx.moveTo(px - r * 0.9, py);
            ctx.lineTo(px + r * 0.9, py);
            ctx.stroke();

            const otherNapkin = activeObjects.find((o) => o.id !== obj.id && o.label === "napkin" && Math.hypot(o.px - px, o.py - py) < 0.06 * scale);
            if (otherNapkin && obj.id === "napkin_2") {
              ctx.save();
              ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
              ctx.strokeStyle = PALETTE.tableHighlight;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + r * 0.8, py - r * 0.65, 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.font = "bold 8px var(--font-geist-mono), monospace";
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.fillText("2×", px + r * 0.8, py - r * 0.65 + 2.5);
              ctx.restore();
            }
            break;
          }
          case "candle": {
            // Pillar wax candle with glowing flame and ambient heat halo
            ctx.fillStyle = PALETTE.wax;
            roundedRect(ctx, px - r * 0.5, py - r * 0.8, r * 1.0, r * 1.6, 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
            ctx.stroke();

            if (st.lit) {
              const flick = Math.sin(now / 120) * r * 0.1;
              // Ambient warm table glow
              const flameGlow = ctx.createRadialGradient(px, py - r * 1.4, 2, px, py - r * 1.4, r * 1.8);
              flameGlow.addColorStop(0, "rgba(245, 158, 11, 0.35)");
              flameGlow.addColorStop(1, "rgba(245, 158, 11, 0)");
              ctx.fillStyle = flameGlow;
              ctx.beginPath();
              ctx.arc(px, py - r * 1.4, r * 1.8, 0, Math.PI * 2);
              ctx.fill();

              // Outer flame
              ctx.fillStyle = PALETTE.flame;
              ctx.beginPath();
              ctx.ellipse(px + flick, py - r * 1.4, r * 0.32, r * 0.58, 0, 0, Math.PI * 2);
              ctx.fill();

              // Inner hot white core
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              ctx.ellipse(px + flick, py - r * 1.35, r * 0.12, r * 0.26, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          case "saucepan": {
            // Heavy stainless / cast-iron saucepan
            ctx.fillStyle = PALETTE.panBody;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = PALETTE.lineStrong;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Insulated handle
            ctx.strokeStyle = PALETTE.panHandle;
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px + r * 0.8, py - r * 0.5);
            ctx.lineTo(px + r * 1.8, py - r * 1.1);
            ctx.stroke();
            ctx.lineCap = "butt";

            // Animated thermal emission waves if hot
            if (st.hot) {
              const pulsePhase = (now % 1600) / 1600;
              ctx.strokeStyle = `rgba(226, 106, 99, ${0.7 * (1 - pulsePhase)})`;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(px, py, r * (1.2 + pulsePhase * 0.5), -2.6, -0.5);
              ctx.stroke();

              const pulsePhase2 = ((now + 800) % 1600) / 1600;
              ctx.strokeStyle = `rgba(226, 106, 99, ${0.7 * (1 - pulsePhase2)})`;
              ctx.beginPath();
              ctx.arc(px, py, r * (1.2 + pulsePhase2 * 0.5), -2.6, -0.5);
              ctx.stroke();
            }
            break;
          }
          case "teapot": {
            // Polished brass teapot
            ctx.fillStyle = PALETTE.brass;
            ctx.beginPath();
            ctx.arc(px, py, r * 0.95, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Spout
            ctx.fillStyle = PALETTE.brass;
            ctx.beginPath();
            ctx.moveTo(px + r * 0.6, py - r * 0.3);
            ctx.lineTo(px + r * 1.5, py - r * 0.8);
            ctx.lineTo(px + r * 1.4, py - r * 0.2);
            ctx.closePath();
            ctx.fill();

            // Handle
            ctx.strokeStyle = PALETTE.panHandle;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(px - r * 0.85, py, r * 0.65, -Math.PI / 2, Math.PI / 2);
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

        // Active focus target ring if currently held by an arm
        if (st.heldBy) {
          ctx.strokeStyle = PALETTE.accent;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(px, py, r * 1.45, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 4. SAFETY HAZARD BADGES & ELEGANT TABLEWARE MICRO-LABELS
      // Prominent annunciator badges are ONLY rendered for hazardous items (hot, flame, blade, fragile)
      // to keep the tabletop clean, uncluttered, and realistic. Safe tableware gets subtle micro-labels.
      interface HazardBadge {
        text: string;
        tone: "fragile" | "hot" | "flame" | "sharp";
        x: number;
        y: number;
        w: number;
        h: number;
      }

      const hazardBadges: HazardBadge[] = [];
      const handled = new Set<string>();

      for (let i = 0; i < activeObjects.length; i++) {
        const objA = activeObjects[i];
        if (handled.has(objA.id)) continue;

        const isHazard =
          (objA.label === "saucepan" && objA.st.hot) ||
          (objA.label === "candle" && objA.st.lit) ||
          objA.label === "knife" ||
          objA.safety === "fragile";

        if (!isHazard) {
          // Safe tableware: draw crisp, subtle micro-label directly without blocking the table
          ctx.font = "8.5px var(--font-geist-mono), monospace";
          ctx.fillStyle = objA.st.heldBy ? PALETTE.accent : "rgba(164, 177, 196, 0.7)";
          ctx.textAlign = "center";
          ctx.fillText(objA.label, objA.px, objA.py + objA.r + 11);
          continue;
        }

        // Check for clustered hazards (e.g. 2 fragile glasses)
        const cluster = [objA];
        for (let j = i + 1; j < activeObjects.length; j++) {
          const objB = activeObjects[j];
          if (objA.label === objB.label && Math.hypot(objA.px - objB.px, objA.py - objB.py) < 0.08 * scale) {
            cluster.push(objB);
            handled.add(objB.id);
          }
        }
        handled.add(objA.id);

        let labelText = "";
        let tone: HazardBadge["tone"] = "fragile";

        if (objA.label === "saucepan" && objA.st.hot) {
          labelText = "Saucepan · HOT 85°C";
          tone = "hot";
        } else if (objA.label === "candle" && objA.st.lit) {
          labelText = "Candle · LIT FLAME";
          tone = "flame";
        } else if (objA.label === "knife") {
          labelText = "Knife · BLADE";
          tone = "sharp";
        } else if (objA.safety === "fragile") {
          labelText = cluster.length > 1 ? `${cluster.length}× Glasses · FRAGILE` : "Glass · FRAGILE";
          tone = "fragile";
        }

        const avgX = cluster.reduce((sum, o) => sum + o.px, 0) / cluster.length;
        const avgY = cluster.reduce((sum, o) => sum + o.py, 0) / cluster.length;

        ctx.font = "10px var(--font-geist-mono), monospace";
        const textMetrics = ctx.measureText(labelText);
        const bw = textMetrics.width + 18;
        const bh = 18;

        let targetY = avgY - objA.r - 14;
        if (avgY < tableY + 50) {
          targetY = avgY + objA.r + 14;
        }

        hazardBadges.push({
          text: labelText,
          tone,
          x: avgX - bw / 2,
          y: targetY - bh / 2,
          w: bw,
          h: bh,
        });
      }

      // Repulsion relaxation on hazard badges to prevent overlap
      for (let iter = 0; iter < 6; iter++) {
        for (let a = 0; a < hazardBadges.length; a++) {
          for (let b = a + 1; b < hazardBadges.length; b++) {
            const b1 = hazardBadges[a];
            const b2 = hazardBadges[b];
            const overlapX = Math.min(b1.x + b1.w, b2.x + b2.w) - Math.max(b1.x, b2.x);
            const overlapY = Math.min(b1.y + b1.h, b2.y + b2.h) - Math.max(b1.y, b2.y);
            if (overlapX > 0 && overlapY > 0) {
              const pushY = (overlapY + 4) / 2;
              if (b1.y < b2.y) {
                b1.y -= pushY;
                b2.y += pushY;
              } else {
                b1.y += pushY;
                b2.y += pushY;
              }
            }
          }
        }
      }

      // Render the prominent hazard badges with warning pips
      for (const badge of hazardBadges) {
        ctx.fillStyle = PALETTE.labelBg;
        roundedRect(ctx, badge.x, badge.y, badge.w, badge.h, 4);
        ctx.fill();

        let borderColor: string = PALETTE.labelBorder;
        let dotColor: string = PALETTE.ink3;
        let textColor: string = PALETTE.ink2;

        if (badge.tone === "hot") {
          borderColor = "rgba(226, 106, 99, 0.5)";
          dotColor = PALETTE.deny;
          textColor = "#fca5a5";
        } else if (badge.tone === "flame") {
          borderColor = "rgba(229, 177, 68, 0.5)";
          dotColor = PALETTE.warn;
          textColor = "#fde047";
        } else if (badge.tone === "fragile") {
          borderColor = "rgba(83, 213, 232, 0.4)";
          dotColor = PALETTE.accent;
          textColor = "#a5f3fc";
        } else if (badge.tone === "sharp") {
          borderColor = "rgba(229, 177, 68, 0.4)";
          dotColor = PALETTE.warn;
          textColor = "#fed7aa";
        }

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Hazard status pip
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(badge.x + 8, badge.y + badge.h / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Label text
        ctx.font = "10px var(--font-geist-mono), monospace";
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(badge.text, badge.x + 14, badge.y + badge.h / 2 + 3.5);
      }

      // 5. ARTICULATED INDUSTRIAL ROBOT ARMS
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

        // Heavy base pedestal
        ctx.fillStyle = PALETTE.raised;
        roundedRect(ctx, ax - 18, ay - 10, 36, 20, 4);
        ctx.fill();
        ctx.strokeStyle = PALETTE.tableRim;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Base mounting bolts
        ctx.fillStyle = PALETTE.ink3;
        for (const bx of [-12, 12]) {
          for (const by of [-5, 5]) {
            ctx.beginPath();
            ctx.arc(ax + bx, ay + by, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Arm Links: Dual-segment robotic limbs with metallic thickness
        // Link 1: Shoulder -> Elbow
        ctx.strokeStyle = PALETTE.armMetal;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Center groove on Link 1
        ctx.strokeStyle = active ? PALETTE.accent : PALETTE.armJoint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Link 2: Elbow -> Wrist
        ctx.strokeStyle = PALETTE.armMetal;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(gx, gy);
        ctx.stroke();

        // Center groove on Link 2
        ctx.strokeStyle = active ? PALETTE.accent : PALETTE.armJoint;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.lineCap = "butt";

        // Servo Elbow Joint with LED status ring
        ctx.fillStyle = PALETTE.armJoint;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = active
          ? phaseRef.current === "snubbed"
            ? PALETTE.deny
            : phaseRef.current === "payout"
              ? PALETTE.ok
              : PALETTE.warn
          : PALETTE.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.stroke();

        // Shoulder Joint
        ctx.fillStyle = PALETTE.armJoint;
        ctx.beginPath();
        ctx.arc(ax, ay, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "9px var(--font-geist-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = active ? PALETTE.accent : PALETTE.ink3;
        ctx.fillText(arm === "left" ? "ROBOT ARM L" : "ROBOT ARM R", ax, ay - 14);

        // Articulated Gripper Jaws
        const gripOpen = (1 - v.grip) * 7 + 2;
        ctx.strokeStyle = active ? PALETTE.ink : PALETTE.metal;
        ctx.lineWidth = 2.5;

        // Left jaw
        ctx.beginPath();
        ctx.moveTo(gx - gripOpen - 2, gy - 6);
        ctx.lineTo(gx - gripOpen, gy);
        ctx.lineTo(gx - gripOpen - 2, gy + 6);
        ctx.stroke();

        // Right jaw
        ctx.beginPath();
        ctx.moveTo(gx + gripOpen + 2, gy - 6);
        ctx.lineTo(gx + gripOpen, gy);
        ctx.lineTo(gx + gripOpen + 2, gy + 6);
        ctx.stroke();

        // Gripper base palm
        ctx.fillStyle = PALETTE.armJoint;
        ctx.beginPath();
        ctx.arc(gx, gy, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. THE BOLLARD & PHYSICAL SAFETY TETHER
      const bx = X(0);
      const by = Y(TABLE.maxY) + 32;
      const armNow = armRef.current;
      const ph = phaseRef.current;

      const ropeColor =
        ph === "snubbed"
          ? PALETTE.ropeSnubbed
          : ph === "held"
            ? PALETTE.ropeHeld
            : ph === "payout"
              ? PALETTE.ropePayout
              : PALETTE.ropeBraided;

      // Heavy Marine / Safety Bollard Body
      // Base flange
      ctx.fillStyle = PALETTE.bollardSteel;
      roundedRect(ctx, bx - 14, by - 14, 28, 28, 5);
      ctx.fill();
      ctx.strokeStyle = PALETTE.bollardRim;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Flange bolts
      ctx.fillStyle = PALETTE.ink3;
      for (const ox of [-9, 9]) {
        for (const oy of [-9, 9]) {
          ctx.beginPath();
          ctx.arc(bx + ox, by + oy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Central cylindrical post
      const postGrad = ctx.createLinearGradient(bx - 8, by, bx + 8, by);
      postGrad.addColorStop(0, PALETTE.bollardSteel);
      postGrad.addColorStop(0.5, PALETTE.bollardCap);
      postGrad.addColorStop(1, PALETTE.bollardSteel);
      ctx.fillStyle = postGrad;
      roundedRect(ctx, bx - 8, by - 24, 16, 26, 3);
      ctx.fill();

      // Cross cleat horns
      ctx.fillStyle = PALETTE.bollardCap;
      roundedRect(ctx, bx - 16, by - 16, 32, 6, 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.bollardRim;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Optical Safety Status Beacon on Bollard
      const beaconColor =
        ph === "snubbed"
          ? PALETTE.deny
          : ph === "held"
            ? PALETTE.warn
            : ph === "payout"
              ? PALETTE.ok
              : PALETTE.accent;

      // Soft glow around beacon
      const beaconGlow = ctx.createRadialGradient(bx, by - 26, 1, bx, by - 26, 14);
      beaconGlow.addColorStop(0, beaconColor);
      beaconGlow.addColorStop(1, "transparent");
      ctx.fillStyle = beaconGlow;
      ctx.beginPath();
      ctx.arc(bx, by - 26, 14, 0, Math.PI * 2);
      ctx.fill();

      // Beacon dome
      ctx.fillStyle = beaconColor;
      ctx.beginPath();
      ctx.arc(bx, by - 26, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "9px var(--font-geist-mono), monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = beaconColor;
      ctx.fillText(
        ph === "idle"
          ? "SAFETY BOLLARD · ARMED"
          : ph === "held"
            ? "TENSION HELD · EVALUATING"
            : ph === "snubbed"
              ? "SNUBBED · POLICY DENIAL"
              : "PAYOUT · ACTION RELEASED",
        bx,
        by + 26
      );

      // The Safety Tether (Braided Rope): Bollard -> Active Arm Gripper
      if (armNow && ph !== "idle") {
        const v = sim.arms[armNow].visual;
        const gx = X(v.pos.x);
        const gy = Y(v.pos.y);

        ctx.strokeStyle = ropeColor;
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(bx, by - 20);

        if (ph === "held" || ph === "snubbed") {
          // 3 snubbing turns wrapped tightly around the post drum
          ctx.bezierCurveTo(bx + 18, by - 22, bx + 18, by - 12, bx, by - 12);
          ctx.bezierCurveTo(bx - 18, by - 10, bx - 18, by + 2, bx, by + 2);
          ctx.bezierCurveTo(bx + 16, by + 4, bx + 16, by + 12, bx, by + 12);

          // Taut tension line to arm with slight catenary vibration
          const vib = ph === "snubbed" ? Math.sin(now / 40) * 3 : 0;
          ctx.quadraticCurveTo((bx + gx) / 2 + vib, (by + gy) / 2 + 15, gx, gy + 4);
        } else {
          // Smooth payout curve flowing freely to the active gripper
          ctx.quadraticCurveTo((bx + gx) / 2, (by + gy) / 2 + 20, gx, gy + 4);
        }
        ctx.stroke();

        // Braided secondary highlight line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
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
