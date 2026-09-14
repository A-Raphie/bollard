"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { TableCanvas, type CanvasPulse, type RopePhase } from "@/components/table-canvas";
import { TableSim } from "@/lib/sim/engine";
import { initialScene, sceneFingerprint } from "@/lib/scene";
import { parseCommand } from "@/lib/intent";
import { judge, type ArmRuntimeState } from "@/lib/policy";
import { appendReceipt, chainToJson, verifyChain, type ChainCheck, type ReceiptInput } from "@/lib/receipts";
import { VoiceSession, type VoiceState } from "@/lib/voice";
import type { Intent, Receipt, Verdict } from "@/lib/types";

const CHAIN_KEY = "bollard:chain:v1";

interface VerdictView {
  heard: string;
  source: "voice" | "typed";
  confidence: number | null;
  allowed: boolean;
  code: string;
  reasons: string[];
  careNotes: string[];
  actionLine: string | null;
}

interface PendingSettle {
  heard: string;
  source: "voice" | "typed";
  confidence: number | null;
  intent: Intent;
  verdict: Verdict;
  actionLine: string;
}

export default function CockpitPage() {
  const simRef = useRef<TableSim | null>(null);
  const voiceRef = useRef<VoiceSession | null>(null);
  const pulsesRef = useRef<CanvasPulse[]>([]);
  const pendingRef = useRef<PendingSettle | null>(null);
  const busyRef = useRef(false);
  const chainRef = useRef<Receipt[]>([]);

  const [phase, setPhase] = useState<RopePhase>("idle");
  const [activeArm, setActiveArm] = useState<"left" | "right" | null>(null);
  const [partial, setPartial] = useState("");
  const [finals, setFinals] = useState<Array<{ text: string; conf: number | null; ts: string }>>([]);
  const [verdictView, setVerdictView] = useState<VerdictView | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [chainCheck, setChainCheck] = useState<ChainCheck | null>(null);
  const [typed, setTyped] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceDetail, setVoiceDetail] = useState<string | undefined>();
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(12).fill(0));
  const [silenceHint, setSilenceHint] = useState(false);
  const [allowPulse, setAllowPulse] = useState(false);

  // boot the sim once
  useEffect(() => {
    if (!simRef.current) simRef.current = new TableSim(initialScene());
    const sim = simRef.current;
    if (import.meta.env.DEV) (window as unknown as { __bollardSim?: TableSim }).__bollardSim = sim;
    sim.onSettled = () => {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) {
        void appendAndSave({
          heard: p.heard,
          source: p.source,
          confidence: p.confidence,
          intent: p.intent,
          parseFailed: false,
          verdict: p.verdict,
          executedAction: p.actionLine,
          sceneAfter: sceneFingerprint(sim.scene),
        });
      }
      setPhase("idle");
      setActiveArm(null);
    };
    try {
      const raw = localStorage.getItem(CHAIN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Receipt[];
        chainRef.current = parsed;
        setReceipts(parsed);
      }
    } catch {
      // corrupted chain: start clean
    }
    return () => {
      void voiceRef.current?.stop();
    };
  }, []);

  // catch-up driver: occluded/background windows pause rAF, so a low-frequency
  // interval keeps the sim settling (and receipts appending) when nobody watches
  useEffect(() => {
    const iv = setInterval(() => {
      simRef.current?.advance();
    }, 300);
    return () => clearInterval(iv);
  }, []);

  const appendAndSave = useCallback(async (input: ReceiptInput) => {
    const receipt = await appendReceipt(chainRef.current, input);
    chainRef.current = [...chainRef.current, receipt];
    setReceipts(chainRef.current);
    try {
      localStorage.setItem(CHAIN_KEY, JSON.stringify(chainRef.current));
    } catch {
      // storage full: chain lives in memory
    }
  }, []);

  const runCommand = useCallback(
    async (heard: string, source: "voice" | "typed", confidence: number | null) => {
      const sim = simRef.current;
      if (!sim || busyRef.current || sim.busy) {
        if (sim && (busyRef.current || sim.busy)) {
          setVerdictView({
            heard,
            source,
            confidence,
            allowed: false,
            code: "BUSY",
            reasons: ["The line is mid-action. Bollard refuses new commands until the arm settles."],
            careNotes: [],
            actionLine: null,
          });
          setTimeout(() => setVerdictView(null), 1600);
        }
        return;
      }
      busyRef.current = true;
      setPhase("held");
      setVerdictView({
        heard,
        source,
        confidence,
        allowed: false,
        code: "EVALUATING",
        reasons: ["Policy engine reading the command…"],
        careNotes: [],
        actionLine: null,
      });

      const { intent, unknownObjectNoun } = parseCommand(heard, sim.scene);
      const arms: Record<"left" | "right", ArmRuntimeState> = {
        left: { holding: sim.arms.left.holding },
        right: { holding: sim.arms.right.holding },
      };
      const verdict = judge(sim.scene, arms, intent, unknownObjectNoun);
      setActiveArm(verdict.arm);

      // hold the line visibly: the bollard snubs the rope while the policy reads
      await new Promise((r) => setTimeout(r, 700));

      const base = { heard, source, confidence, intent, parseFailed: !intent, verdict };
      if (verdict.allowed && intent) {
        const actionLine = sim.enqueue(sim.scene, intent, verdict);
        pendingRef.current = { heard, source, confidence, intent, verdict, actionLine: actionLine ?? "" };
        setPhase("payout");
        setVerdictView({
          heard, source, confidence, allowed: true, code: "ALLOW",
          reasons: verdict.reasons, careNotes: verdict.careNotes, actionLine,
        });
        setAllowPulse(true);
        setTimeout(() => setAllowPulse(false), 950);
      } else {
        setPhase("snubbed");
        setVerdictView({
          heard, source, confidence, allowed: false, code: verdict.code,
          reasons: verdict.reasons, careNotes: [], actionLine: null,
        });
        await appendAndSave({ ...base, executedAction: null, sceneAfter: sceneFingerprint(sim.scene) });
        setTimeout(() => {
          setPhase("idle");
          setActiveArm(null);
          busyRef.current = false;
        }, 1100);
        return;
      }
      busyRef.current = false;
    },
    [appendAndSave],
  );

  const startVoice = useCallback(async () => {
    if (!voiceRef.current) voiceRef.current = new VoiceSession();
    const v = voiceRef.current;
    if (v.running) {
      await v.stop();
      return;
    }
    await v.start({
      onPartial: setPartial,
      onFinal: (text, conf) => {
        setPartial("");
        setSilenceHint(false);
        setFinals((prev) => [{ text, conf, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
        // push-to-talk: one press = one command; close the line so room noise
        // never becomes a command and no audio streams while idle
        void voiceRef.current?.stop();
        setVoiceState("idle");
        void runCommand(text, "voice", conf);
      },
      onState: (s, detail) => {
        setVoiceState(s);
        setVoiceDetail(detail);
        if (s !== "listening") setSilenceHint(false);
      },
      onLevel: (rms) => {
        setLevel(rms);
        setLevels((prev) => [...prev.slice(1), rms]);
        if (rms > 0.02) setSilenceHint(false);
      },
      onSilence: () => setSilenceHint(true),
    });
  }, [runCommand]);

  const submitTyped = useCallback(() => {
    const t = typed.trim();
    if (!t || busyRef.current) return;
    setTyped("");
    void runCommand(t, "typed", null);
  }, [typed, runCommand]);

  const doVerify = useCallback(async () => {
    setChainCheck(await verifyChain(receipts));
  }, [receipts]);

  const doExport = useCallback(() => {
    void navigator.clipboard.writeText(chainToJson(receipts));
  }, [receipts]);

  const doReset = useCallback(() => {
    chainRef.current = [];
    setReceipts([]);
    setChainCheck(null);
    setVerdictView(null);
    setFinals([]);
    try {
      localStorage.removeItem(CHAIN_KEY);
    } catch {
      // ignore
    }
    if (simRef.current) simRef.current.scene = initialScene();
  }, []);

  const micLabel =
    voiceState === "listening" ? "MIC LIVE" : voiceState === "connecting" ? "CONNECTING" : voiceState === "error" ? "MIC FAULT" : "MIC OFF";

  const hearing = voiceState === "listening";
  const tileTone = hearing
    ? "border-warn bg-warn-bg text-warn"
    : !verdictView
      ? "text-ink-2"
      : verdictView.code === "EVALUATING" || verdictView.code === "BUSY"
        ? "border-warn bg-warn-bg text-warn"
        : verdictView.allowed
          ? "border-ok bg-ok-bg text-ok"
          : "border-deny bg-deny-bg text-deny";
  const tileWord = hearing
    ? "HEARING"
    : verdictView
      ? verdictView.allowed
        ? "ALLOW"
        : verdictView.code === "EVALUATING" || verdictView.code === "BUSY"
          ? "HOLD"
          : "DENY"
      : "IDLE";
  const tileMain = hearing
    ? partial || "Speak a command…"
    : verdictView
      ? `“${verdictView.heard}”`
      : "Say a command to arm the line.";
  const tileSub = hearing
    ? silenceHint
      ? "No audio is reaching the microphone. Check the input device."
      : "Live transcript lands here as you speak · press the button to stop"
    : verdictView
      ? (verdictView.actionLine ?? verdictView.reasons.join(" ")) + (verdictView.careNotes.length > 0 ? ` · ${verdictView.careNotes.join(" · ")}` : "")
      : "policy v1";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="cockpit" />
      <main className="grid flex-1 grid-cols-[300px_1fr_350px] gap-3 overflow-hidden p-3 max-[1100px]:grid-cols-1">
        {/* VOICE — SRC 1 / SRC 2 */}
        <section className="panel flex min-h-0 flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="micro">Voice in</span>
            <span className="annunciator px-2 py-0.5 text-[10px] text-ink-2">SRC 1</span>
          </div>
          <button
            onClick={startVoice}
            className={`btn ${voiceState === "listening" ? "btn-ghost border-deny text-deny mic-pulse" : "btn-primary"}`}
          >
            {voiceState === "listening" ? "Listening · press to stop" : "Say one command · open mic"}
          </button>
          <div className="flex items-center justify-between">
            <span className={`annunciator px-2 py-1 text-[11px] ${voiceState === "listening" ? "border-ok text-ok" : voiceState === "error" ? "border-deny text-deny" : "text-ink-2"}`}>
              {micLabel}
            </span>
            <span className="number font-mono text-[11px] text-ink-3">
              {finals[0]?.conf != null ? `conf ${(finals[0].conf * 100).toFixed(0)}%` : voiceState === "listening" ? "listening" : ""}
            </span>
          </div>
          <div className="flex h-6 items-end gap-1" aria-hidden>
            {levels.map((lv, i) => (
              <div
                key={i}
                className={`w-full rounded-sm transition-[height] duration-100 ${voiceState === "listening" ? "bg-action" : "bg-raised"}`}
                style={{ height: `${Math.max(10, Math.min(100, lv * 320))}%` }}
              />
            ))}
          </div>
          {silenceHint && voiceState === "listening" && (
            <p className="rounded-input border border-warn bg-warn-bg p-2 font-mono text-[11px] text-warn">
              No audio is reaching the microphone. Check the input device.
            </p>
          )}
          {voiceState === "error" && (
            <p className="rounded-input border border-deny bg-deny-bg p-2 font-mono text-[11px] text-deny">
              {voiceDetail ?? "Microphone unavailable"}
            </p>
          )}
          <div className="min-h-8 font-mono text-[12px] text-ink-3 italic">{partial || "…"}</div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line pt-2">
            {finals.length === 0 && (
              <p className="text-[12px] text-ink-3">Final transcripts land here. Try: “place a plate on the left placemat”.</p>
            )}
            {finals.map((f, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 py-1">
                <span className="font-mono text-[12px] text-ink-2">{f.text}</span>
                <span className="number font-mono text-[10px] text-ink-3">{f.ts}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="micro">Typed command</span>
              <span className="annunciator px-2 py-0.5 text-[10px] text-ink-2">SRC 2</span>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 px-2 text-[12px]"
                placeholder="place a plate on the left placemat"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitTyped()}
              />
              <button className="btn btn-ghost px-3 text-[12px]" onClick={submitTyped} disabled={!typed.trim()}>
                Send
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">Same pipeline, no audio. One press of these runs it:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {["place a plate on the left placemat", "throw the glass off the table", "move the pan to the center"].map((c) => (
                <button
                  key={c}
                  className="annunciator px-2 py-1 text-[10px] text-ink-2 transition-colors hover:border-action hover:text-action"
                  onClick={() => {
                    if (busyRef.current || simRef.current?.busy) return;
                    void runCommand(c, "typed", null);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* VERDICT + TABLE */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className={`annunciator flex items-center gap-4 px-4 py-3 ${allowPulse ? “allow-pulse” : “”} ${tileTone}`}>
            <span className=”text-xl font-bold tracking-[0.18em]”>{tileWord}</span>
            <div className=”min-w-0 flex-1 text-ink”>
              <p className=”line-clamp-2 font-mono text-[13px] md:truncate”>{tileMain}</p>
              <p className=”line-clamp-2 text-[12px] text-ink-2”>{tileSub}</p>
            </div>
            <span className=”micro hidden md:block”>
              {hearing ? “SRC 1” : verdictView?.source === “typed” ? “SRC 2” : verdictView ? “SRC 1” : “POLICY V1”}
            </span>
          </div>
          <div className="panel min-h-0 flex-1 overflow-hidden p-2">
            <TableCanvas simRef={simRef} phase={phase} activeArm={activeArm} pulses={pulsesRef} />
          </div>
        </section>

        {/* RECEIPTS */}
        <section className="panel flex min-h-0 flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="micro">Receipt chain · sha-256</span>
            <span className="number font-mono text-[11px] text-ink-2">{receipts.length} entries</span>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1 px-2 py-1.5 text-[11px]" onClick={doVerify}>
              Verify chain
            </button>
            <button className="btn btn-ghost flex-1 px-2 py-1.5 text-[11px]" onClick={doExport}>
              Export JSON
            </button>
            <button className="btn btn-ghost px-2 py-1.5 text-[11px] text-ink-3" onClick={doReset}>
              Reset
            </button>
          </div>
          {chainCheck && (
            <p className={`annunciator px-2 py-1.5 text-[11px] ${chainCheck.valid ? "border-ok bg-ok-bg text-ok" : "border-deny bg-deny-bg text-deny"}`}>
              {chainCheck.valid
                ? `VALID · ${chainCheck.checked} links re-hashed, genesis intact`
                : `BROKEN at serial ${chainCheck.brokenAt}`}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-line pt-2">
            {receipts.length === 0 && (
              <p className="text-[12px] text-ink-3">
                Every command appends a hash-linked receipt: what was heard, what was allowed, what moved.
              </p>
            )}
            {[...receipts].reverse().map((r) => (
              <details key={r.serial} className="group border-b border-line py-1.5">
                <summary className="flex cursor-pointer items-baseline justify-between gap-2 list-none">
                  <span className="flex items-baseline gap-2">
                    <span className="number font-mono text-[10px] text-ink-3">#{String(r.serial).padStart(3, "0")}</span>
                    <span className={`annunciator px-1.5 py-0.5 text-[9px] ${r.verdictAllowed ? "border-ok text-ok" : "border-deny text-deny"}`}>
                      {r.verdictAllowed ? "ALLOW" : r.verdictCode}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-2">{r.heard}</span>
                  </span>
                  <span className="number font-mono text-[9px] text-ink-3">{r.hash.slice(0, 8)}</span>
                </summary>
                <div className="mt-1.5 space-y-1 pl-1 font-mono text-[10px] text-ink-3">
                  <p>heard: {r.heard}</p>
                  <p>source: {r.source}{r.confidence != null ? ` · conf ${(r.confidence * 100).toFixed(0)}%` : ""}</p>
                  {r.reasons.map((rr, i) => <p key={i}>reason: {rr}</p>)}
                  {r.executedAction && <p>action: {r.executedAction}</p>}
                  <p className="break-all">scene: {r.sceneAfter}</p>
                  <p className="break-all">prev: {r.prevHash}</p>
                  <p className="break-all">hash: {r.hash}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
