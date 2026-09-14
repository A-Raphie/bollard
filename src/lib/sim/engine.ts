// Table-top simulation engine: deterministic plan execution. Same scene + same
// commands = same final state and same timings (demo determinism).
// Pure TS — the canvas renderer in the app reads its state each frame.

import {
  ARM_ANCHOR, ARM_REACH, ZONES, cloneScene, distance, type SceneState,
} from "../scene";
import type { ArmId, Intent, Verdict } from "../types";
import type { ArmRuntimeState } from "../policy";

interface PlanStep {
  kind: "move" | "grip" | "release";
  arm: ArmId;
  dur: number;              // seconds
  from: { x: number; y: number };
  to: { x: number; y: number };
  objectId?: string;
  destMeta?: { x: number; y: number; onTable: boolean; label: string };
}

export interface ArmVisual {
  holding: string | null;
  pos: { x: number; y: number };   // gripper position
  grip: number;                    // 0 open … 1 closed
  home: { x: number; y: number };
}

const SPEED = 0.5;        // m/s travel
const CARRY_SPEED = 0.38; // slower while holding
const FRAGILE_FACTOR = 1.5;

export class TableSim {
  scene: SceneState;
  arms: Record<ArmId, ArmRuntimeState & { visual: ArmVisual }> = {
    left: { holding: null, visual: { holding: null, pos: { ...ARM_ANCHOR.left }, grip: 0, home: { ...ARM_ANCHOR.left } } },
    right: { holding: null, visual: { holding: null, pos: { ...ARM_ANCHOR.right }, grip: 0, home: { ...ARM_ANCHOR.right } } },
  };
  private plan: PlanStep[] = [];
  private idx = 0;
  private t = 0;
  private lastTickAt = performance.now();
  onSettled: (() => void) | null = null; // fired when the plan finishes

  /**
   * Advance by wall-clock time. Called from rAF (smooth when visible) AND from a
   * low-frequency catch-up interval (occluded/background windows pause rAF, and
   * commands must still settle into receipts when nobody is watching).
   */
  advance(): boolean {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    return this.tick(dt);
  }

  constructor(scene?: SceneState) {
    this.scene = scene ? cloneScene(scene) : { objects: {} };
  }

  get busy(): boolean {
    return this.idx < this.plan.length;
  }

  /** Compile an allowed intent into a plan. Returns an executedAction line, or null when nothing to do. */
  enqueue(sceneAtVerdict: SceneState, intent: Intent, verdict: Verdict): string | null {
    if (!verdict.allowed || !intent.objectId || !verdict.arm) return null;
    const arm = verdict.arm;
    const objId = intent.objectId;
    const obj = sceneAtVerdict.objects[objId];
    if (!obj) return null;
    const v = this.arms[arm].visual;

    const steps: PlanStep[] = [];
    const travel = (to: { x: number; y: number }, speed: number) =>
      Math.max(0.45, distance(v.pos.x, v.pos.y, to.x, to.y) / speed);

    const isFragile = /glass|cup|tumbler/i.test(intent.raw);

    if (intent.verb !== "wave" && intent.verb !== "throw") {
      steps.push({ kind: "move", arm, dur: travel(obj, SPEED), from: { ...v.pos }, to: { x: obj.x, y: obj.y } });
      steps.push({ kind: "grip", arm, dur: 0.28, from: { ...v.pos }, to: { ...v.pos }, objectId: objId });
    }

    let destMeta: PlanStep["destMeta"];
    if (intent.verb !== "pick") {
      const d = intent.destination;
      let target: { x: number; y: number; label: string; onTable: boolean } | null = null;
      if (d?.kind === "zone") {
        if (d.zone === "off-table") target = { x: 0, y: -0.85, label: "off-table removal", onTable: false };
        else {
          const z = ZONES[d.zone];
          target = { x: z.x, y: z.y, label: z.label, onTable: true };
        }
      } else if (d?.kind === "relative") {
        // anchor already validated by policy; recompute its position from the live scene
        const anchor = this.scene.objects[d.anchorId ?? ""] ?? Object.values(this.scene.objects).find(
          (o) => o.onTable && distance(o.x, o.y, obj.x, obj.y) < 0.3,
        );
        if (anchor) {
          const offs: Record<string, [number, number]> = {
            left: [-0.16, 0], right: [0.16, 0], front: [0, 0.16], behind: [0, -0.16], near: [0.13, 0.09],
          };
          const [ox, oy] = offs[d.relation ?? "near"];
          target = { x: anchor.x + ox, y: anchor.y + oy, label: "placement", onTable: true };
        }
      }
      if (target && steps.length > 0) {
        destMeta = { x: target.x, y: target.y, onTable: target.onTable, label: target.label };
        const dur = travel(target, CARRY_SPEED) * (isFragile ? FRAGILE_FACTOR : 1);
        steps.push({ kind: "move", arm, dur, from: { ...v.pos }, to: { x: target.x, y: target.y }, objectId: objId, destMeta });
        steps.push({ kind: "release", arm, dur: 0.28, from: { x: target.x, y: target.y }, to: { x: target.x, y: target.y }, objectId: objId, destMeta });
        steps.push({ kind: "move", arm, dur: travel(v.home, SPEED), from: { x: target.x, y: target.y }, to: { ...v.home } });
      } else if (steps.length > 0) {
        // pure pick-up: retreat home holding it
        steps.push({ kind: "move", arm, dur: travel(v.home, CARRY_SPEED), from: { ...v.pos }, to: { ...v.home }, objectId: objId });
      }
    }

    this.plan = steps;
    this.idx = 0;
    this.t = 0;
    return steps.length > 0 ? `${arm} arm → ${objId.replace(/_\d$/, "")}${destMeta ? ` → ${destMeta.label}` : " (held)"}` : null;
  }

  /** Advance the plan. Returns true when a plan just settled this tick. */
  tick(dt: number): boolean {
    if (!this.busy) return false;
    let settled = false;
    this.t += dt;
    while (this.busy && this.t >= this.plan[this.idx].dur) {
      this.t -= this.plan[this.idx].dur;
      this.finishStep(this.plan[this.idx]);
      this.idx += 1;
      if (!this.busy) {
        settled = true;
        if (this.onSettled) this.onSettled();
      }
    }
    if (this.busy) {
      const step = this.plan[this.idx];
      const k = Math.min(1, this.t / step.dur);
      const v = this.arms[step.arm].visual;
      v.pos.x = step.from.x + (step.to.x - step.from.x) * k;
      v.pos.y = step.from.y + (step.to.y - step.from.y) * k;
      if (step.kind === "grip") v.grip = k;
      if (step.kind === "release") v.grip = 1 - k;
      if (step.objectId && (step.kind === "move" || step.kind === "release") && this.arms[step.arm].holding === step.objectId) {
        const o = this.scene.objects[step.objectId];
        if (o) {
          o.x = v.pos.x;
          o.y = v.pos.y;
        }
      }
    }
    return settled;
  }

  private finishStep(step: PlanStep): void {
    const v = this.arms[step.arm].visual;
    v.pos = { ...step.to };
    if (step.kind === "grip" && step.objectId) {
      v.grip = 1;
      v.holding = step.objectId;
      this.arms[step.arm].holding = step.objectId;
      const o = this.scene.objects[step.objectId];
      if (o) o.heldBy = step.arm;
    }
    if (step.kind === "release" && step.objectId) {
      v.grip = 0;
      v.holding = null;
      this.arms[step.arm].holding = null;
      const o = this.scene.objects[step.objectId];
      if (o && step.destMeta) {
        o.heldBy = null;
        o.onTable = step.destMeta.onTable;
        o.x = step.destMeta.x;
        o.y = step.destMeta.y;
      }
    }
  }

  /** Either arm can reach this point (renderer helper). */
  reachable(x: number, y: number): boolean {
    return (
      distance(ARM_ANCHOR.left.x, ARM_ANCHOR.left.y, x, y) <= ARM_REACH ||
      distance(ARM_ANCHOR.right.x, ARM_ANCHOR.right.y, x, y) <= ARM_REACH
    );
  }
}
