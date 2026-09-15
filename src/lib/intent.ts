// Deterministic intent grammar: transcript → Intent. No model in the loop — every
// parse is reproducible from the words alone. That is the safety argument.

import type { Destination, Intent, Relation } from "./types";
import { resolveObject, type SceneState } from "./scene";

const VERB_LEXICON: Array<{ verb: Intent["verb"]; words: string[] }> = [
  { verb: "place", words: ["place", "put", "set", "move", "position", "lay", "drop", "pass", "shift", "transfer", "bring", "give", "hand", "send"] },
  { verb: "pick", words: ["pick up", "pick", "grab", "hold", "take", "touch", "get", "lift", "carry"] },
  { verb: "remove", words: ["remove", "clear", "take off", "strip", "clean", "trash", "stow", "store", "discard"] },
  { verb: "slide", words: ["slide", "push", "nudge", "glide", "drag"] },
  { verb: "wave", words: ["wave", "swing", "brandish", "flourish", "point", "shake"] },
  { verb: "throw", words: ["throw", "toss", "fling", "chuck", "lob", "knock", "drop off", "shatter", "break", "smash"] },
];

export interface ParseResult {
  intent: Intent | null;
  unknownObjectNoun: string | null;
}

export function parseCommand(transcript: string, scene: SceneState): ParseResult {
  const raw = transcript.trim();
  const t = raw.toLowerCase().replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();

  // verb: first matching lexicon word wins (order of appearance in the sentence)
  let verb: Intent["verb"] = "unknown";
  let verbIdx = Infinity;
  for (const entry of VERB_LEXICON) {
    for (const w of entry.words) {
      const i = t.indexOf(w);
      if (i !== -1 && i < verbIdx) {
        verb = entry.verb;
        verbIdx = i;
      }
    }
  }

  const arm = /\bleft arm\b|\bleft hand\b/.test(t)
    ? "left"
    : /\bright arm\b|\bright hand\b/.test(t)
      ? "right"
      : null;

  // destination
  const destination = parseDestination(t);

  // object: longest synonym match after the verb; "a/an/the <noun>"
  const afterVerb = verbIdx < Infinity ? t.slice(verbIdx) : t;
  const nounMatch = afterVerb.match(/\b(?:a|an|the|that|this)?\s*([a-z]+)\b/g) ?? [];
  let objectId: string | null = null;
  let unknownNoun: string | null = null;
  for (const m of nounMatch) {
    const noun = m.trim().split(" ").pop() as string;
    if (STOPWORDS.has(noun)) continue;
    if (DEST_WORDS.has(noun)) continue;
    const id = resolveObject(scene, noun);
    if (id) {
      objectId = id;
      break;
    }
    if (!unknownNoun && !REL_WORDS.has(noun)) unknownNoun = noun;
  }

  // If no object found after verb, try searching whole sentence (e.g. "plate move")
  if (!objectId && verbIdx < Infinity) {
    const allNouns = t.match(/\b(?:a|an|the|that|this)?\s*([a-z]+)\b/g) ?? [];
    for (const m of allNouns) {
      const noun = m.trim().split(" ").pop() as string;
      if (STOPWORDS.has(noun) || DEST_WORDS.has(noun)) continue;
      const id = resolveObject(scene, noun);
      if (id) {
        objectId = id;
        break;
      }
    }
  }

  // Natural shorthand: if user says just the object (e.g. "candle", "hot pan", "the plate"),
  // default verb to "pick" so policy can evaluate and either allow or deny with safety reason
  if (verb === "unknown" && objectId) {
    verb = "pick";
  }

  if (verb === "unknown") {
    return { intent: null, unknownObjectNoun: null };
  }
  const intent: Intent = { verb, objectId, destination, arm, raw };
  return { intent, unknownObjectNoun: objectId ? null : unknownNoun };
}

const STOPWORDS = new Set([
  "to", "the", "a", "an", "on", "of", "at", "in", "from", "with", "and", "then",
  "left", "right", "front", "behind", "beside", "next", "near", "off", "over",
  "please", "arm", "hand", "table", "side", "center", "middle", "tray", "placemat",
]);

const DEST_WORDS = new Set(["left", "right", "front", "behind", "beside", "near", "center", "middle", "tray", "placemat", "table", "side"]);
const REL_WORDS = new Set(["left", "right", "front", "behind", "beside", "near"]);

function parseDestination(t: string): Destination | null {
  // "off the table" — always wins when present
  if (/\boff the table\b|\bof the table\b|\boff table\b/.test(t)) {
    return { kind: "zone", zone: "off-table" };
  }
  if (/\b(the )?tray\b/.test(t)) return { kind: "zone", zone: "tray" };
  if (/\bleft placemat\b/.test(t)) return { kind: "zone", zone: "left-placemat" };
  if (/\bright placemat\b/.test(t)) return { kind: "zone", zone: "right-placemat" };
  if (/\b(the )?cent(er|re)\b|\bmiddle\b/.test(t)) return { kind: "zone", zone: "center" };

  const rel = t.match(/\b(left|right|front|behind|beside|near)\b(?:\s+of)?\s+(?:the |a |an )?([a-z]+)/);
  if (rel) {
    const relationMap: Record<string, Relation> = {
      left: "left", right: "right", front: "front", behind: "behind", beside: "near", near: "near",
    };
    return { kind: "relative", relation: relationMap[rel[1]] ?? "near", anchorId: rel[2] }; // anchorId resolved later via resolveObject
  }
  // bare side words: "to the left", "to the right side"
  if (/\bto the left\b|\bon the left\b/.test(t)) return { kind: "zone", zone: "left-placemat" };
  if (/\bto the right\b|\bon the right\b/.test(t)) return { kind: "zone", zone: "right-placemat" };
  return null;
}

export function parseMicCommand(transcript: string): "open" | "close" | null {
  const t = transcript.trim().toLowerCase().replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  if (
    /^(?:open|start|turn on|enable)\s+(?:the\s+)?(?:mic|microphone)$/.test(t) ||
    /^(?:mic|microphone)\s+on$/.test(t) ||
    /^(?:start\s+listening|listen|unmute)$/.test(t)
  ) {
    return "open";
  }
  if (
    /^(?:close|stop|turn off|disable)\s+(?:the\s+)?(?:mic|microphone)$/.test(t) ||
    /^(?:mic|microphone)\s+off$/.test(t) ||
    /^(?:stop\s+listening|mute)$/.test(t)
  ) {
    return "close";
  }
  return null;
}

export const DICTIONARY_BOOST = [
  "placemat", "saucepan", "teapot", "napkin", "candlestick", "tumbler",
  "Bollard", "place the plate", "pick up", "off the table",
  "open mic", "close mic", "open the mic",
];

