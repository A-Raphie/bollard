// Tamper-evident receipt chain. Every command appends a receipt whose hash covers
// the full record + the previous hash. Verify recomputes the whole chain.

import type { Intent, Receipt, Verdict } from "./types";
import { GENESIS_HASH } from "./types";

/** Stable JSON: object keys sorted recursively so the hash is order-proof. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ReceiptInput {
  heard: string;
  confidence: number | null;
  source: "voice" | "typed";
  intent: Intent | null;
  parseFailed: boolean;
  verdict: Verdict | null;
  executedAction: string | null;
  sceneAfter: string;
}

export async function appendReceipt(chain: Receipt[], input: ReceiptInput): Promise<Receipt> {
  const prev = chain[chain.length - 1];
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  const serial = (prev?.serial ?? 0) + 1;
  const ts = new Date().toISOString();
  const base = {
    serial,
    ts,
    heard: input.heard,
    confidence: input.confidence,
    source: input.source,
    intent: input.parseFailed ? null : input.intent,
    verdictCode: input.parseFailed ? "PARSE_FAILED" : input.verdict?.code ?? "PARSE_FAILED",
    verdictAllowed: input.verdict?.allowed ?? false,
    reasons: input.parseFailed ? ["Command could not be parsed into a table action."] : input.verdict?.reasons ?? [],
    careNotes: input.verdict?.careNotes ?? [],
    executedAction: input.executedAction,
    sceneAfter: input.sceneAfter,
    prevHash,
  };
  const hash = await sha256(stable(base));
  return { ...base, verdictAllowed: base.verdictAllowed, hash } as Receipt;
}

export interface ChainCheck {
  valid: boolean;
  checked: number;
  brokenAt: number | null; // serial of first bad link
}

export async function verifyChain(chain: Receipt[]): Promise<ChainCheck> {
  let prevHash = GENESIS_HASH;
  for (const r of chain) {
    const base = {
      serial: r.serial,
      ts: r.ts,
      heard: r.heard,
      confidence: r.confidence,
      source: r.source,
      intent: r.intent,
      verdictCode: r.verdictCode,
      verdictAllowed: r.verdictAllowed,
      reasons: r.reasons,
      careNotes: r.careNotes,
      executedAction: r.executedAction,
      sceneAfter: r.sceneAfter,
      prevHash,
    };
    const hash = await sha256(stable(base));
    if (hash !== r.hash || r.prevHash !== prevHash) {
      return { valid: false, checked: r.serial, brokenAt: r.serial };
    }
    prevHash = r.hash;
  }
  return { valid: true, checked: chain.length, brokenAt: null };
}

export function chainToJson(chain: Receipt[]): string {
  return stable({ chain, algorithm: "sha256", genesis: GENESIS_HASH });
}
