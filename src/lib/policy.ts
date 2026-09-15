// Policy engine: intent + scene → ALLOW / DENY with reasons. Pure, deterministic,
// readable in court. Every denial carries a named code and a human reason.

import {
  ARM_ANCHOR, ARM_REACH, OBJECTS, ZONES, armForPoint, distance, resolveObject,
  type SceneState,
} from "./scene";
import type { Intent, Verdict, VerdictCode } from "./types";

export interface ArmRuntimeState {
  holding: string | null; // object id
}

export function judge(scene: SceneState, arms: Record<"left" | "right", ArmRuntimeState>, intent: Intent | null, unknownNoun: string | null): Verdict {
  if (!intent) {
    return {
      allowed: false,
      code: "UNKNOWN_VERB",
      reasons: ["No recognized table action in that command. Try “place”, “pick up”, “remove”, or “move”."],
      careNotes: [],
      arm: null,
    };
  }

  const deny = (code: VerdictCode, reason: string, arm: Verdict["arm"] = null): Verdict => ({
    allowed: false, code, reasons: [reason], careNotes: [], arm,
  });

  // object resolution
  const objId = intent.objectId ?? (intent.destination?.kind === "relative" ? resolveObject(scene, intent.destination.anchorId ?? "") : null);
  if (!objId) {
    return deny(
      "UNKNOWN_OBJECT",
      unknownNoun
        ? `I don't see any “${unknownNoun}” on this table.`
        : `No object named in the command is on the table.`,
    );
  }
  const obj = OBJECTS.find((o) => o.id === objId);
  const st = scene.objects[objId];
  const label = obj?.label ?? objId;

  if (!st || !st.onTable) {
    return deny("NOT_ON_TABLE", `The ${label} is already off the table.`);
  }

  // verb-specific hard denials (safety invariants apply before geometric reach)
  if (intent.verb === "throw" || intent.verb === "wave") {
    if (obj?.safety === "sharp") {
      return deny("SHARP_MOTION", `The ${label} is a blade. Waving or throwing it is never an allowed motion.`);
    }
    if (intent.verb === "throw") {
      if (obj?.safety === "fragile") return deny("EDGE_DROP", `Throwing the ${label} would shatter it. Denied.`);
      return deny("EDGE_DROP", `Throwing anything off this table is not a table-setting action. Denied.`);
    }
  }

  // hazard classes
  if (obj?.safety === "hot" && st.hot) {
    return deny("HAZARD_HOT", `The ${label} is hot (60°C+ on the hotplate). Manual handling only.`);
  }
  if (obj?.safety === "flame" && st.lit) {
    return deny("FLAME_LIT", `The ${label} is lit. Open flame: no robot handling until it's out.`);
  }

  // arm selection: explicit wins, else nearest to the object
  const arm = intent.arm ?? armForPoint(scene, st.x, st.y);
  if (!arm) {
    return deny("OUT_OF_REACH", `The ${label} is outside both arms' reach.`);
  }

  // gripper occupancy
  if (arms[arm].holding && intent.verb !== "place" && intent.verb !== "remove" && intent.verb !== "slide") {
    return deny("GRIPPER_FULL", `The ${arm} arm is already holding the ${nameOf(scene, arms[arm].holding)}. Place it first.`, arm);
  }

  // destination
  let destPoint: { x: number; y: number; label: string } | null = null;
  const d = intent.destination;
  if (intent.verb === "pick" || intent.verb === "wave") {
    destPoint = null; // grasp in place
  } else if (d?.kind === "zone") {
    if (d.zone === "off-table") {
      if (obj?.safety === "fragile") return deny("EDGE_DROP", `Off-table means a drop for the ${label}. Use the tray instead.`, arm);
      destPoint = { x: 0, y: -0.85, label: "off-table removal" };
    } else {
      const z = ZONES[d.zone];
      destPoint = { x: z.x, y: z.y, label: z.label };
    }
  } else if (d?.kind === "relative") {
    const anchorId = resolveObject(scene, d.anchorId ?? "");
    if (!anchorId) {
      return deny("UNKNOWN_OBJECT", `I can't find the “${d.anchorId}” you want it placed near.`, arm);
    }
    if (anchorId === objId) {
      return deny("DEST_OCCUPIED", `The ${label} can't go next to itself.`, arm);
    }
    const a = scene.objects[anchorId];
    const offs: Record<string, [number, number]> = {
      left: [-0.16, 0], right: [0.16, 0], front: [0, 0.16], behind: [0, -0.16], near: [0.13, 0.09],
    };
    const [ox, oy] = offs[d.relation ?? "near"];
    const anchorLabel = OBJECTS.find((o) => o.id === anchorId)?.label ?? anchorId;
    destPoint = { x: a.x + ox, y: a.y + oy, label: `beside the ${anchorLabel}` };
  } else if (intent.verb === "place" || intent.verb === "remove" || intent.verb === "slide") {
    return deny("UNKNOWN_VERB", `Where should the ${label} go? Add a destination: “to the left placemat”, “next to the bowl”, “to the tray”.`, arm);
  }

  if (destPoint) {
    if (destPoint.x < -0.75 || destPoint.x > 0.75 || destPoint.y < -0.4 || destPoint.y > 0.4) {
      // outside table bounds unless it's the tray / off-table lane
      if (destPoint.label !== "the tray" && destPoint.label !== "off-table removal") {
        return deny("DEST_OCCUPIED", `That destination lands off the table edge. Pick a spot on the table or the tray.`, arm);
      }
    }
    const reachOk = distance(ARM_ANCHOR[arm].x, ARM_ANCHOR[arm].y, destPoint.x, destPoint.y) <= ARM_REACH;
    if (!reachOk) {
      const other = arm === "left" ? "right" : "left";
      const otherOk = distance(ARM_ANCHOR[other].x, ARM_ANCHOR[other].y, destPoint.x, destPoint.y) <= ARM_REACH;
      if (!otherOk) return deny("OUT_OF_REACH", `The destination is outside both arms' reach.`, arm);
      return deny("OUT_OF_REACH", `The destination is out of the ${arm} arm's reach. The ${other} arm could get there; name it explicitly.`, arm);
    }
    const occupant = Object.entries(scene.objects).find(
      ([id, s]) => id !== objId && s.onTable && !s.heldBy && distance(s.x, s.y, destPoint.x, destPoint.y) < 0.07,
    );
    if (occupant) {
      return deny("DEST_OCCUPIED", `That spot is taken by the ${nameOf(scene, occupant[0])}.`, arm);
    }
  }

  // care notes, not denials
  const careNotes: string[] = [];
  if (obj?.safety === "fragile") careNotes.push(`${label} is glass: slow approach, soft grip.`);
  if (obj?.safety === "sharp") careNotes.push(`${label} is a blade: point travels downrange, low carry.`);

  const action = destPoint
    ? `${arm} arm ${intent.verb === "remove" ? "removed" : intent.verb === "slide" ? "slid" : "placed"} the ${label} to ${destPoint.label}`
    : `${arm} arm picked up the ${label}`;

  return { allowed: true, code: "OK", reasons: [`Policy pass: ${label} → ${destPoint ? destPoint.label : "grasp"} via ${arm} arm.`], careNotes, arm };
}

function nameOf(scene: SceneState, id: string | null | undefined): string {
  if (!id) return "something";
  return OBJECTS.find((o) => o.id === id)?.label ?? id;
}
