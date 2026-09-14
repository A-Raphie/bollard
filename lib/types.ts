// Shared types for the Bollard pipeline: hear → parse → judge → act → receipt.

export type ArmId = "left" | "right";

export type SafetyClass = "safe" | "fragile" | "sharp" | "hot" | "flame" | "decor";

export interface SceneObject {
  id: string;
  label: string;          // canonical display name, e.g. "plate"
  synonyms: string[];     // words the grammar maps to this object
  safety: SafetyClass;
  stack?: string[];       // ids stacked under this one (bottom first); top of stack is graspable
}

export type ObjectState = {
  x: number;
  y: number;
  heldBy: ArmId | null;
  onTable: boolean;       // false = removed to tray / off-table
  lit?: boolean;          // candle
  hot?: boolean;          // saucepan
};

export type VerdictCode =
  | "OK"
  | "UNKNOWN_OBJECT"
  | "UNKNOWN_VERB"
  | "HAZARD_HOT"
  | "FLAME_LIT"
  | "SHARP_MOTION"
  | "EDGE_DROP"
  | "OUT_OF_REACH"
  | "DEST_OCCUPIED"
  | "GRIPPER_FULL"
  | "NOT_ON_TABLE";

export type Relation = "left" | "right" | "front" | "behind" | "near";
export type ZoneId = "center" | "left-placemat" | "right-placemat" | "tray" | "off-table";

export type Destination =
  | { kind: "relative"; anchorId: string; relation: Relation }
  | { kind: "zone"; zone: ZoneId };

export interface Intent {
  verb: "place" | "pick" | "remove" | "slide" | "wave" | "throw" | "unknown";
  objectId: string | null;
  destination: Destination | null;
  arm: ArmId | null;      // explicit "with the left arm" else null → auto
  raw: string;
}

export interface Verdict {
  allowed: boolean;
  code: VerdictCode;
  reasons: string[];
  careNotes: string[];    // e.g. "glass is fragile — slow move"
  arm: ArmId | null;
}

export interface Receipt {
  serial: number;
  ts: string;             // ISO
  heard: string;          // transcript used
  confidence: number | null; // Speechmatics confidence, null for typed input
  source: "voice" | "typed";
  intent: Intent | null;  // null if parse failed
  verdictCode: VerdictCode | "PARSE_FAILED";
  verdictAllowed: boolean;
  reasons: string[];
  careNotes: string[];
  executedAction: string | null; // human line, e.g. "left arm placed plate on the left placemat"
  sceneAfter: string;     // compact scene fingerprint
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = "bollard-genesis-0000000000000000000000000000";
