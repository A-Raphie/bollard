"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { TableCanvas, type CanvasPulse, type RopePhase } from "@/components/table-canvas";
import { TableSim } from "@/lib/sim/engine";
import { initialScene, sceneFingerprint } from "@/lib/scene";
import { parseCommand, parseMicCommand } from "@/lib/intent";
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
  const startVoiceRef = useRef<(() => Promise<void>) | null>(null);
  const runCommandRef = useRef<((heard: string, source: "voice" | "typed", confidence: number | null) => Promise<void>) | null>(null);

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
  const [recSeconds, setRecSeconds] = useState(0);
  const [allowPulse, setAllowPulse] = useState(false);

  // the recording clock: proof on sight that the line is live
  useEffect(() => {
    if (voiceState !== "listening") return;
    setRecSeconds(0);
    const iv = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [voiceState]);

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

      // Handle mic control commands first (e.g. "open mic", "close mic")
      const micAction = parseMicCommand(heard);
      if (micAction) {
        if (micAction === "open") {
          if (!voiceRef.current?.running) {
            void startVoiceRef.current?.();
          }
          setVerdictView({
            heard,
            source,
            confidence,
            allowed: true,
            code: "MIC_CONTROL",
            reasons: ["Microphone opened on command. Listening for table actions…"],
            careNotes: [],
            actionLine: "Microphone live — speak commands",
          });
          setAllowPulse(true);
          setTimeout(() => setAllowPulse(false), 950);
          if (sim) {
            await appendAndSave({
              heard,
              source,
              confidence,
              intent: null,
              parseFailed: false,
              verdict: {
                allowed: true,
                code: "MIC_CONTROL",
                reasons: ["Microphone opened on command."],
                careNotes: [],
                arm: null,
              },
              executedAction: "Microphone opened on command",
              sceneAfter: sceneFingerprint(sim.scene),
            });
          }
          return;
        } else if (micAction === "close") {
          if (voiceRef.current?.running) {
            void voiceRef.current.stop();
            setVoiceState("idle");
          }
          setVerdictView({
            heard,
            source,
            confidence,
            allowed: true,
            code: "MIC_CONTROL",
            reasons: ["Microphone closed on command."],
            careNotes: [],
            actionLine: "Microphone deactivated",
          });
          if (sim) {
            await appendAndSave({
              heard,
              source,
              confidence,
              intent: null,
              parseFailed: false,
              verdict: {
                allowed: true,
                code: "MIC_CONTROL",
                reasons: ["Microphone closed on command."],
                careNotes: [],
                arm: null,
              },
              executedAction: "Microphone closed on command",
              sceneAfter: sceneFingerprint(sim.scene),
            });
          }
          return;
        }
      }

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
  runCommandRef.current = runCommand;

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
        // Open mic mode: keep the line listening so consecutive commands
        // execute without requiring repeated manual clicks. The line can be
        // closed anytime via the button or typing/saying 'close mic'.
        void runCommandRef.current?.(text, "voice", conf);
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
  }, []);
  startVoiceRef.current = startVoice;

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
    voiceState === "listening"
      ? "MIC LIVE"
      : voiceState === "connecting"
        ? "CONNECTING"
        : voiceState === "error"
          ? "MIC FAULT"
          : "MIC OFF";

  // Dynamic annunciator state logic: verdicts remain prominently visible
  // even while the microphone continues listening for subsequent commands
  const isSpeakingNow = partial.trim().length > 0;

  let tileWord = "STANDBY";
  let tileTone = "border-line text-ink-2 bg-surface";
  let tileMain: ReactNode = "Safety policy active · speak or type a command to arm the line";
  let tileSub: ReactNode = "hear → parse → judge → act → receipt · deterministic safety gate";

  if (isSpeakingNow) {
    tileWord = "HEARING";
    tileTone = "border-action bg-action-subtle text-action";
    tileMain = `“${partial}”`;
    tileSub = (
      <span className="flex items-center gap-2 font-mono text-[11px] text-action">
        <span className="mic-pulse inline-block h-2 w-2 rounded-full bg-action" />
        Streaming Speechmatics Realtime @ 16 kHz mono…
      </span>
    );
  } else if (verdictView) {
    if (verdictView.code === "EVALUATING" || verdictView.code === "BUSY") {
      tileWord = "HOLD";
      tileTone = "border-warn bg-warn-bg text-warn";
      tileMain = `“${verdictView.heard}”`;
      tileSub = verdictView.reasons.join(" ");
    } else if (verdictView.allowed) {
      tileWord = "ALLOW";
      tileTone = "border-ok bg-ok-bg text-ok";
      tileMain = `“${verdictView.heard}”`;
      tileSub =
        (verdictView.actionLine ?? verdictView.reasons.join(" ")) +
        (verdictView.careNotes.length > 0 ? ` · ${verdictView.careNotes.join(" · ")}` : "");
    } else {
      tileWord = verdictView.code || "DENY";
      tileTone = "border-deny bg-deny-bg text-deny";
      tileMain = `“${verdictView.heard}”`;
      tileSub = verdictView.reasons.join(" ");
    }
  } else if (voiceState === "listening") {
    tileWord = "MONITORING";
    tileTone = "border-line-strong bg-raised text-ink";
    tileMain = "Microphone live · listening for dinner-table commands…";
    tileSub = (
      <span className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
        <span className="mic-pulse inline-block h-2 w-2 rounded-full bg-deny" />
        REC {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")} · line open, speak commands naturally
      </span>
    );
  } else if (voiceState === "connecting") {
    tileWord = "CONNECTING";
    tileTone = "border-warn bg-warn-bg text-warn";
    tileMain = "Connecting to Speechmatics realtime WebSocket…";
    tileSub = "Warming up audio capture pipeline";
  } else if (voiceState === "error") {
    tileWord = "MIC FAULT";
    tileTone = "border-deny bg-deny-bg text-deny";
    tileMain = voiceDetail ?? "Microphone capture unavailable";
    tileSub = "Check permissions or use typed command channel (SRC 2)";
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="cockpit" />
      <main className="grid flex-1 grid-cols-[320px_1fr_360px] gap-3 overflow-hidden p-3 max-[1100px]:grid-cols-1">
        {/* VOICE & COMMAND INPUT (SRC 1 / SRC 2) */}
        <section className="panel flex min-h-0 flex-col gap-3 p-3.5">
          {/* Channel Header */}
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-action" />
              <span className="micro font-bold text-ink">Comms Input</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="annunciator px-2 py-0.5 text-[10px] text-ink-3">SRC 1 · RT-STT</span>
            </div>
          </div>

          {/* Tactical Mic Control Button */}
          <button
            onClick={startVoice}
            className={`btn flex items-center justify-center gap-2.5 px-4 font-mono text-[12px] tracking-wider transition-all duration-150 ${
              voiceState === "listening"
                ? "border border-deny bg-deny-bg text-deny shadow-[0_0_12px_rgba(226,106,99,0.25)]"
                : voiceState === "connecting"
                  ? "border border-warn bg-warn-bg text-warn"
                  : "btn-ghost border-line-strong hover:border-action hover:text-action"
            }`}
          >
            {voiceState === "listening" ? (
              <>
                <span className="mic-pulse h-2.5 w-2.5 rounded-full bg-deny" />
                <span>MIC LIVE · PRESS TO MUTE</span>
                <span className="number font-mono text-[10px] opacity-80">
                  {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
                </span>
              </>
            ) : voiceState === "connecting" ? (
              <>
                <span className="inline-block h-2 w-2 animate-spin rounded-full border border-warn border-t-transparent" />
                <span>{voiceDetail || "CONNECTING…"}</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span>OPEN MIC · LIVE VOICE</span>
              </>
            )}
          </button>

          {/* VU Meter & Telemetry */}
          <div className="rounded-input border border-line bg-raised p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-mono text-ink-3">SIGNAL LEVEL</span>
              <span className="number font-mono text-[10px] text-ink-3">
                {finals[0]?.conf != null ? `CONF ${(finals[0].conf * 100).toFixed(0)}%` : voiceState === "listening" ? "ACTIVE" : "STANDBY"}
              </span>
            </div>
            {/* 16-bar VU meter */}
            <div className="flex h-5 items-end gap-1" aria-hidden>
              {levels.map((lv, i) => {
                const heightPct = Math.max(8, Math.min(100, lv * 380));
                const isHigh = heightPct > 70;
                return (
                  <div
                    key={i}
                    className={`w-full rounded-sm transition-[height] duration-75 ${
                      voiceState === "listening"
                        ? isHigh
                          ? "bg-deny"
                          : "bg-action"
                        : "bg-surface"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] font-mono text-ink-3">
              <span>-36 dB</span>
              <span>-18 dB</span>
              <span>-6 dB</span>
              <span>0 dB</span>
            </div>
          </div>

          {/* Alerts & Notifications */}
          {silenceHint && voiceState === "listening" && (
            <p className="rounded-input border border-warn bg-warn-bg p-2 font-mono text-[11px] text-warn">
              No audio signal detected on microphone. Check selected input device.
            </p>
          )}
          {voiceState === "error" && (
            <p className="rounded-input border border-deny bg-deny-bg p-2 font-mono text-[11px] text-deny">
              {voiceDetail ?? "Microphone device fault"}
            </p>
          )}

          {/* Live Streaming Transcript Monitor */}
          <div className="flex flex-col gap-1">
            <span className="micro text-[10px]">Streaming Monitor</span>
            <div className="min-h-11 rounded-input border border-line bg-surface p-2 font-mono text-[12px] text-ink">
              {partial ? (
                <span className="text-action">
                  {partial}
                  <span className="animate-pulse">_</span>
                </span>
              ) : (
                <span className="text-ink-3 italic">
                  {voiceState === "listening" ? "Listening… speak a command" : "Mic idle"}
                </span>
              )}
            </div>
          </div>

          {/* Transcript History Feed */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-line pt-2.5">
            <span className="micro mb-1.5 text-[10px]">Utterance History</span>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
              {finals.length === 0 && (
                <p className="py-2 text-[11px] text-ink-3">
                  Spoken utterances will appear here with transcription timestamps.
                </p>
              )}
              {finals.map((f, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded bg-surface p-1.5 border border-line">
                  <span className="font-mono text-[11px] text-ink-2 leading-relaxed">“{f.text}”</span>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="number font-mono text-[9px] text-ink-3">{f.ts}</span>
                    {f.conf != null && (
                      <span className="number font-mono text-[9px] text-action">{(f.conf * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TYPED COMMAND (SRC 2) */}
          <div className="border-t border-line pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="micro text-[10px]">Typed Channel</span>
              <span className="annunciator px-2 py-0.5 text-[10px] text-ink-3">SRC 2 · DETERMINISTIC</span>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 px-2.5 text-[12px]"
                placeholder="e.g. place a plate on the left placemat"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitTyped()}
              />
              <button
                className="btn btn-ghost px-3 text-[12px] font-mono hover:border-action hover:text-action"
                onClick={submitTyped}
                disabled={!typed.trim()}
              >
                Send
              </button>
            </div>

            {/* Tactical Quick Action Chips */}
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-ink-3 uppercase">Allowed Actions</span>
                <span className="text-[9px] font-mono text-ok">PASS</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  "place a plate on the left placemat",
                  "move the napkin to the tray",
                  "open mic",
                ].map((c) => (
                  <button
                    key={c}
                    className="annunciator px-2 py-1 text-[10px] text-ink-2 transition-colors hover:border-ok hover:text-ok hover:bg-ok-bg"
                    onClick={() => {
                      if (busyRef.current || simRef.current?.busy) return;
                      void runCommand(c, "typed", null);
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="pt-1 flex items-center justify-between">
                <span className="text-[10px] font-mono text-ink-3 uppercase">Hazard Tests</span>
                <span className="text-[9px] font-mono text-deny">REFUSED</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  "throw the glass off the table",
                  "move the pan to the center",
                  "grab the lit candle",
                ].map((c) => (
                  <button
                    key={c}
                    className="annunciator px-2 py-1 text-[10px] text-ink-2 transition-colors hover:border-deny hover:text-deny hover:bg-deny-bg"
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
          </div>
        </section>

        {/* VERDICT INSTRUMENT + TABLE CANVAS */}
        <section className="flex min-h-0 flex-col gap-3">
          {/* Avionics Annunciator Instrument */}
          <div className={`annunciator flex items-center gap-4 px-4 py-3 transition-colors duration-150 ${allowPulse ? "allow-pulse" : ""} ${tileTone}`}>
            <div className="flex flex-col items-center justify-center shrink-0 min-w-28">
              <span className="text-xl font-bold tracking-[0.16em]">{tileWord}</span>
              <span className="text-[9px] font-mono opacity-70">
                {isSpeakingNow ? "LIVE SPEECH" : verdictView ? (verdictView.allowed ? "SAFETY PASS" : "INTERVENE") : "MONITOR"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-mono text-[13px] font-semibold text-ink leading-snug">{tileMain}</p>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-2 leading-snug">{tileSub}</div>
            </div>
            <div className="flex flex-col items-end shrink-0 text-right">
              <span className="annunciator px-2 py-0.5 text-[9px] text-ink-3">
                {isSpeakingNow ? "SRC 1" : verdictView?.source === "typed" ? "SRC 2" : verdictView ? "SRC 1" : "GATE V1"}
              </span>
              <span className="mt-1 text-[9px] font-mono text-ink-3">DETERMINISTIC</span>
            </div>
          </div>

          {/* Workbench Canvas */}
          <div className="panel min-h-0 flex-1 overflow-hidden p-2">
            <TableCanvas simRef={simRef} phase={phase} activeArm={activeArm} pulses={pulsesRef} />
          </div>
        </section>

        {/* CRYPTOGRAPHIC AUDIT CHAIN (RECEIPTS) */}
        <section className="panel flex min-h-0 flex-col gap-2.5 p-3.5">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="micro font-bold text-ink">Audit Chain</span>
            </div>
            <span className="number font-mono text-[11px] text-ink-3">{receipts.length} entries · SHA-256</span>
          </div>

          <div className="flex gap-2">
            <button
              className="btn btn-ghost flex-1 px-2.5 py-1.5 font-mono text-[11px] hover:border-action hover:text-action"
              onClick={doVerify}
            >
              Verify Chain
            </button>
            <button
              className="btn btn-ghost flex-1 px-2.5 py-1.5 font-mono text-[11px] hover:border-action hover:text-action"
              onClick={doExport}
            >
              Export JSON
            </button>
            <button
              className="btn btn-ghost px-2.5 py-1.5 font-mono text-[11px] text-ink-3 hover:text-deny hover:border-deny"
              onClick={doReset}
            >
              Reset
            </button>
          </div>

          {chainCheck && (
            <p className={`annunciator px-2.5 py-1.5 text-[11px] font-mono ${chainCheck.valid ? "border-ok bg-ok-bg text-ok" : "border-deny bg-deny-bg text-deny"}`}>
              {chainCheck.valid
                ? `VALID · ${chainCheck.checked} links re-hashed, genesis intact`
                : `TAMPER DETECTED at serial ${chainCheck.brokenAt}`}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-line pt-2 space-y-1.5">
            {receipts.length === 0 && (
              <p className="py-3 text-[12px] text-ink-3 leading-relaxed">
                Every command appends a tamper-evident SHA-256 receipt: what was spoken, policy verdict, arm motion, and post-state fingerprint.
              </p>
            )}
            {[...receipts].reverse().map((r) => (
              <details key={r.serial} className="group rounded border border-line bg-surface p-2 transition-colors">
                <summary className="flex cursor-pointer items-baseline justify-between gap-2 list-none">
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="number font-mono text-[10px] text-ink-3 shrink-0">#{String(r.serial).padStart(3, "0")}</span>
                    <span
                      className={`annunciator px-1.5 py-0.5 text-[9px] shrink-0 ${
                        r.verdictAllowed ? "border-ok text-ok bg-ok-bg" : "border-deny text-deny bg-deny-bg"
                      }`}
                    >
                      {r.verdictAllowed ? "ALLOW" : r.verdictCode}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-2">“{r.heard}”</span>
                  </span>
                  <span className="number font-mono text-[9px] text-ink-3 shrink-0">{r.hash.slice(0, 8)}…</span>
                </summary>
                <div className="mt-2 space-y-1 pl-1 font-mono text-[10px] text-ink-3 border-t border-line pt-1.5">
                  <p className="text-ink-2">Command: “{r.heard}”</p>
                  <p>Channel: {r.source}{r.confidence != null ? ` · conf ${(r.confidence * 100).toFixed(0)}%` : ""}</p>
                  {r.reasons.map((rr, i) => (
                    <p key={i} className="text-warn">Reason: {rr}</p>
                  ))}
                  {r.executedAction && <p className="text-ok">Executed: {r.executedAction}</p>}
                  <p className="break-all opacity-80">Scene hash: {r.sceneAfter}</p>
                  <p className="break-all opacity-80">Prev hash: {r.prevHash}</p>
                  <p className="break-all text-action">Block hash: {r.hash}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
