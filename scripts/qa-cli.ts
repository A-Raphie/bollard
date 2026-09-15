#!/usr/bin/env bun
/**
 * Bollard CLI-QA Harness (Ship-Rehearsal Phase 3)
 *
 * Wraps the application's core deterministic logic into a scriptable CLI.
 * Runs commands through the exact same pipeline as the UI:
 *   Hear/Input -> parseMicCommand/parseCommand -> judge -> TableSim -> appendReceipt -> verifyChain
 */

import { parseCommand, parseMicCommand } from "../src/lib/intent";
import { judge, type ArmRuntimeState } from "../src/lib/policy";
import { TableSim } from "../src/lib/sim/engine";
import { initialScene, sceneFingerprint } from "../src/lib/scene";
import { appendReceipt, verifyChain } from "../src/lib/receipts";
import type { Receipt } from "../src/lib/types";

export interface PipelineResult {
  input: string;
  source: "typed" | "voice";
  isMicControl: boolean;
  micAction?: "open" | "close";
  allowed: boolean;
  verdictCode: string;
  reasons: string[];
  executedAction: string | null;
  receipt: Receipt;
  chainValid: boolean;
}

export class BollardHarness {
  sim: TableSim;
  chain: Receipt[] = [];
  micOpen: boolean = false;

  constructor() {
    this.sim = new TableSim(initialScene());
  }

  async run(text: string, source: "typed" | "voice" = "typed"): Promise<PipelineResult> {
    const raw = text.trim();

    // 1. Mic command check
    const micAction = parseMicCommand(raw);
    if (micAction) {
      this.micOpen = micAction === "open";
      const actionLine = micAction === "open" ? "Microphone opened on command" : "Microphone closed on command";
      const receipt = await appendReceipt(this.chain, {
        heard: raw,
        source,
        confidence: source === "voice" ? 0.98 : null,
        intent: null,
        parseFailed: false,
        verdict: {
          allowed: true,
          code: "MIC_CONTROL",
          reasons: [micAction === "open" ? "Microphone opened on command." : "Microphone closed on command."],
          careNotes: [],
          arm: null,
        },
        executedAction: actionLine,
        sceneAfter: sceneFingerprint(this.sim.scene),
      });
      this.chain.push(receipt);
      const check = await verifyChain(this.chain);
      return {
        input: raw,
        source,
        isMicControl: true,
        micAction,
        allowed: true,
        verdictCode: "MIC_CONTROL",
        reasons: [actionLine],
        executedAction: actionLine,
        receipt,
        chainValid: check.valid,
      };
    }

    // 2. Parse command
    const { intent, unknownObjectNoun } = parseCommand(raw, this.sim.scene);
    const arms: Record<"left" | "right", ArmRuntimeState> = {
      left: { holding: this.sim.arms.left.holding },
      right: { holding: this.sim.arms.right.holding },
    };

    // 3. Policy judgment
    const verdict = judge(this.sim.scene, arms, intent, unknownObjectNoun);

    // 4. Execution in Sim
    let executedAction: string | null = null;
    if (verdict.allowed && intent) {
      executedAction = this.sim.enqueue(this.sim.scene, intent, verdict);
      // Advance sim to settle plan
      while (this.sim.busy) {
        this.sim.advance();
      }
    }

    // 5. Append Receipt
    const receipt = await appendReceipt(this.chain, {
      heard: raw,
      source,
      confidence: source === "voice" ? 0.95 : null,
      intent,
      parseFailed: !intent,
      verdict,
      executedAction,
      sceneAfter: sceneFingerprint(this.sim.scene),
    });
    this.chain.push(receipt);

    // 6. Verify Chain
    const check = await verifyChain(this.chain);

    return {
      input: raw,
      source,
      isMicControl: false,
      allowed: verdict.allowed,
      verdictCode: verdict.code,
      reasons: verdict.reasons,
      executedAction,
      receipt,
      chainValid: check.valid,
    };
  }

  async verify(): Promise<{ valid: boolean; checked: number; brokenAt: number | null }> {
    return await verifyChain(this.chain);
  }
}

// CLI entrypoint
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "suite";

  const harness = new BollardHarness();

  if (command === "command") {
    const text = args.slice(1).join(" ");
    if (!text) {
      console.error("Error: command text required");
      process.exit(1);
    }
    const res = await harness.run(text);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.chainValid ? 0 : 1);
  }

  if (command === "suite" || command === "test") {
    console.log("--- Running Bollard CLI-QA Rehearsal Suite ---\n");
    let passed = 0;
    let failed = 0;

    const assert = (name: string, condition: boolean, details?: string) => {
      if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
      } else {
        console.error(`  ✗ ${name} — ${details ?? "Assertion failed"}`);
        failed++;
      }
    };

    // Test Set 1: Mic Commands
    console.log("[1] Open Mic & Mic Control Commands");
    const r1 = await harness.run("open mic");
    assert("open mic recognized as MIC_CONTROL", r1.isMicControl && r1.micAction === "open");
    assert("mic marked open in harness", harness.micOpen === true);
    assert("chain valid after open mic", r1.chainValid);

    const r1b = await harness.run("open the mic");
    assert("open the mic recognized", r1b.isMicControl && r1b.micAction === "open");

    const r1c = await harness.run("start mic");
    assert("start mic recognized", r1c.isMicControl && r1c.micAction === "open");

    const r1d = await harness.run("close mic");
    assert("close mic recognized", r1d.isMicControl && r1d.micAction === "close");
    assert("mic marked closed in harness", harness.micOpen === false);

    const r1e = await harness.run("mute");
    assert("mute recognized as close", r1e.isMicControl && r1e.micAction === "close");

    // Test Set 2: Table Allowed Commands
    console.log("\n[2] Allowed Table Commands (Happy Path)");
    const r2 = await harness.run("place a plate on the left placemat");
    assert("place plate allowed", r2.allowed && r2.verdictCode === "OK");
    assert("arm action produced", r2.executedAction !== null && r2.executedAction.includes("plate"));
    assert("chain integrity holds", r2.chainValid);

    const r2b = await harness.run("move the napkin to the tray");
    assert("move napkin to tray allowed", r2b.allowed && r2b.verdictCode === "OK");

    // Test Set 3: Safety Policy Denials (The Bollard Invariant)
    console.log("\n[3] Safety Policy Denials (The Safety Invariant)");
    const rOccupied = await harness.run("place the bowl on the left placemat");
    assert("destination collision denied as DEST_OCCUPIED", !rOccupied.allowed && rOccupied.verdictCode === "DEST_OCCUPIED");
    const r3 = await harness.run("throw the glass off the table");
    assert("throw glass denied as EDGE_DROP", !r3.allowed && r3.verdictCode === "EDGE_DROP");
    assert("no action executed on denial", r3.executedAction === null);

    const r4 = await harness.run("move the pan to the center");
    assert("hot saucepan denied as HAZARD_HOT", !r4.allowed && r4.verdictCode === "HAZARD_HOT");

    const r5 = await harness.run("wave the knife at the teapot");
    assert("sharp motion denied as SHARP_MOTION", !r5.allowed && r5.verdictCode === "SHARP_MOTION");

    const r6 = await harness.run("pick up the candle");
    assert("lit candle denied as FLAME_LIT", !r6.allowed && r6.verdictCode === "FLAME_LIT");

    // Test Set 4: Adversarial & Edge Cases
    console.log("\n[4] Adversarial Inputs & Fuzzing");
    const rEmpty = await harness.run("");
    assert("empty string handled safely as UNKNOWN_VERB", !rEmpty.allowed && rEmpty.verdictCode === "UNKNOWN_VERB");

    const rUnknownObj = await harness.run("place a chainsaw on the table");
    assert("unknown object handled safely", !rUnknownObj.allowed && rUnknownObj.verdictCode === "UNKNOWN_OBJECT");

    const rGibberish = await harness.run("qwertyuiop asdfghjkl zxcvbnm 12345");
    assert("gibberish handled safely", !rGibberish.allowed && rGibberish.verdictCode === "UNKNOWN_VERB");

    const rHuge = await harness.run("place the plate " + "to the left ".repeat(50));
    assert("huge repeating input does not crash", typeof rHuge.allowed === "boolean");

    const rSpecial = await harness.run("!@#$%^&*()_+~`|}{[]:;?><,./");
    assert("special characters handled safely", !rSpecial.allowed);

    // Test Set 5: Receipt Chain Verification & Tamper Detection
    console.log("\n[5] Cryptographic Receipt Chain & Anti-Tamper Verification");
    const initialCheck = await harness.verify();
    assert(`all ${harness.chain.length} receipts verified valid`, initialCheck.valid && initialCheck.checked === harness.chain.length);

    // Tamper test: mutate a receipt's heard field in memory
    const tamperedReceipt = { ...harness.chain[2], heard: "I tampered with this command" };
    const tamperedChain = [...harness.chain];
    tamperedChain[2] = tamperedReceipt;
    const tamperedCheck = await verifyChain(tamperedChain);
    assert("tamper detected by verifyChain", !tamperedCheck.valid && tamperedCheck.brokenAt === tamperedReceipt.serial);

    console.log(`\n========================================`);
    console.log(`Total assertions: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`========================================\n`);

    if (failed > 0) {
      console.error("QA Rehearsal FAILED.");
      process.exit(1);
    } else {
      console.log("All QA Rehearsal checks PASSED clean.");
      process.exit(0);
    }
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal QA Error:", err);
  process.exit(1);
});
