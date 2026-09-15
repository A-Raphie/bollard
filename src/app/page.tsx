import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CockpitPreview } from "@/components/cockpit-preview";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SiteHeader active="instrument" />

      <main className="flex flex-col items-center">
        {/* HERO */}
        <section className="flex w-full max-w-6xl flex-col items-start gap-6 px-6 pb-14 pt-16 md:pt-20 md:pb-16">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="annunciator flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-ink-2">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-action" />
              VOICE-TO-ACTION INTERLOCK
            </span>
            <span className="font-mono text-[11px] text-ink-3">AI INFRA SUMMIT HACKATHON</span>
          </div>

          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl text-ink">
            The gate between{" "}
            <span className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              hearing and hands.
            </span>
            <span className="mt-3 block text-2xl font-normal leading-snug text-ink-3 sm:text-3xl md:text-4xl">
              Nothing moves until the command passes policy.
            </span>
          </h1>

          <p className="max-w-[62ch] text-pretty text-base leading-relaxed text-ink-2 sm:text-lg">
            Bollard takes every spoken command to a robot arm, transcribes it with Speechmatics Realtime at 16 kHz, judges it against a deterministic safety policy, and only then lets the arm move. Each command leaves a tamper-evident receipt.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/app"
              className="btn btn-primary group px-6 py-3 text-base shadow-[0_0_24px_rgba(83,213,232,0.25)]"
            >
              <span>Open the cockpit</span>
              <svg
                className="ml-2.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="#receipts"
              className="btn btn-ghost group px-5 py-3 text-base text-ink-2 hover:text-ink"
            >
              <svg
                className="mr-2 h-4 w-4 text-ink-3 transition-colors group-hover:text-ink"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>See receipts</span>
            </Link>
            <div className="hidden items-center gap-2 pl-3 text-xs font-mono text-ink-3 sm:flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
              <span>Deterministic · Zero LLMs in loop</span>
            </div>
          </div>
        </section>

        {/* WORKBENCH PREVIEW */}
        <section className="flex w-full max-w-6xl flex-col items-center gap-3 px-6 pb-20">
          <div className="panel w-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-raised/40 px-4 py-2 text-[11px] font-mono text-ink-3">
              <div className="flex items-center gap-2">
                <span className="live-dot inline-block h-2 w-2 rounded-full bg-ok" />
                <span className="font-semibold text-ink">KINEMATIC SIMULATION WORKBENCH</span>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <span>ARMS: DUAL 3-DOF</span>
                <span>GATE: DETERMINISTIC V1</span>
                <span className="rounded border border-action/30 bg-action-subtle px-1.5 py-0.5 text-[10px] text-action">
                  INTERACTIVE ENGINE
                </span>
              </div>
            </div>
            <div className="p-2">
              <CockpitPreview />
            </div>
          </div>
          <p className="font-mono text-[11px] text-ink-3">
            live physical simulation · two robot arms, one physical safety bollard, thirteen interactive table objects
          </p>
        </section>

        {/* MECHANISM */}
        <section className="w-full border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
            <div className="flex items-center justify-between">
              <h2 className="micro">Three-Stage Pipeline</h2>
              <span className="font-mono text-[11px] text-ink-3">ZERO NON-DETERMINISTIC LATENCY</span>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="panel flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="number font-mono text-xs font-bold text-action">01 / HEAR</span>
                    <span className="annunciator px-2 py-0.5 text-[10px] text-ink-3">STT CLOUD</span>
                  </div>
                  <h3 className="text-lg font-semibold text-ink">Realtime Stream</h3>
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    Speechmatics Realtime streams your audio at 16 kHz mono. Partials arrive while you speak with sub-700ms transcription latency.
                  </p>
                </div>
                <div className="mt-6 border-t border-line pt-3 font-mono text-[10px] text-ink-3">
                  WebSocket · PCM s16le · Dictionary boost
                </div>
              </div>

              <div className="panel flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="number font-mono text-xs font-bold text-warn">02 / JUDGE</span>
                    <span className="annunciator px-2 py-0.5 text-[10px] text-ink-3">NO LLM</span>
                  </div>
                  <h3 className="text-lg font-semibold text-ink">Policy Interlock</h3>
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    A deterministic grammar parses intents; the policy engine checks thermal hazards, table edge drops, kinematic reach, and grip limits.
                  </p>
                </div>
                <div className="mt-6 border-t border-line pt-3 font-mono text-[10px] text-ink-3">
                  Deterministic rules · 7 safety codes · 0ms drift
                </div>
              </div>

              <div className="panel flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="number font-mono text-xs font-bold text-ok">03 / ACT & AUDIT</span>
                    <span className="annunciator px-2 py-0.5 text-[10px] text-ink-3">SHA-256</span>
                  </div>
                  <h3 className="text-lg font-semibold text-ink">Action & Receipt</h3>
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    Allowed commands execute servo-interpolated arm movements. Every command appends a tamper-evident SHA-256 cryptographic receipt.
                  </p>
                </div>
                <div className="mt-6 border-t border-line pt-3 font-mono text-[10px] text-ink-3">
                  Web Crypto · State fingerprint · Zero tampering
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SAFETY BOUNDARY (ALLOWED VS REFUSED) */}
        <section className="w-full border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
            <div className="flex items-center justify-between">
              <h2 className="micro">Policy Boundaries</h2>
              <span className="font-mono text-[11px] text-ink-3">EXPLICIT INTERLOCK MATRIX</span>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Allowed */}
              <div className="panel flex flex-col gap-4 border-ok/20 bg-ok-bg/5 p-6">
                <div className="flex items-center justify-between border-b border-ok/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-ok" />
                    <h3 className="text-base font-semibold text-ink">Safety Cleared Actions</h3>
                  </div>
                  <span className="annunciator border-ok/30 bg-ok-bg px-2 py-0.5 text-[10px] text-ok">
                    PASS
                  </span>
                </div>
                <ul className="flex flex-col gap-3 font-mono text-[13px] leading-relaxed text-ink-2">
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-ok">✓</span>
                    <span>Place, pick up, or slide safe tableware: plates, bowls, cutlery, napkins</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-ok">✓</span>
                    <span>Glassware handling with dynamic care notes: soft grip & velocity damping</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-ok">✓</span>
                    <span>Named dual-arm dispatch: explicit routing with &ldquo;left arm&rdquo; / &ldquo;right arm&rdquo;</span>
                  </li>
                </ul>
              </div>

              {/* Refused */}
              <div className="panel flex flex-col gap-4 border-deny/20 bg-deny-bg/5 p-6">
                <div className="flex items-center justify-between border-b border-deny/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-deny" />
                    <h3 className="text-base font-semibold text-ink">Hazard Interlocks</h3>
                  </div>
                  <span className="annunciator border-deny/30 bg-deny-bg px-2 py-0.5 text-[10px] text-deny">
                    REFUSED
                  </span>
                </div>
                <ul className="flex flex-col gap-3 font-mono text-[13px] leading-relaxed text-ink-2">
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-deny">✕</span>
                    <span>Thermal hazards: hot saucepan (60°C+ on burner), lit candle flames</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-deny">✕</span>
                    <span>Kinematic violations: table edge drops, occupied zones, out-of-reach coordinates</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-deny">✕</span>
                    <span>Race conditions: any voice input arriving while robot arms are mid-trajectory</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* RECEIPTS */}
        <section id="receipts" className="w-full border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20">
            <div className="flex flex-col gap-2">
              <h2 className="micro">Cryptographic Receipts</h2>
              <p className="max-w-[62ch] text-balance text-2xl font-semibold text-ink sm:text-3xl">
                Every command appends a link to a SHA-256 ledger.
              </p>
              <p className="max-w-[62ch] text-pretty text-base leading-relaxed text-ink-2">
                What was heard, transcription confidence, parsed intent, safety verdict with specific reasons, and post-state scene fingerprint. One click re-hashes the entire chain to prove zero tampering.
              </p>
            </div>

            <div className="panel w-full max-w-3xl overflow-hidden border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line bg-raised/40 px-4 py-2.5 font-mono text-[11px] text-ink-3">
                <span className="font-semibold text-ink">LEDGER PREVIEW · AUDIT PROOF</span>
                <span className="number text-ok">GENESIS INTACT · SHA-256</span>
              </div>
              <div className="space-y-2 p-4 font-mono text-[12px] leading-relaxed text-ink-2">
                <div className="rounded border border-line bg-raised/50 p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-ink">#001 · &ldquo;place a plate on the left placemat&rdquo;</span>
                    <span className="annunciator border-ok bg-ok-bg px-1.5 py-0.5 text-[9px] text-ok">ALLOW</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">
                    Policy pass: plate → the left placemat via left arm · scene@-0.42,0.08
                  </p>
                  <p className="mt-1 break-all text-[10px] text-action">
                    block: 8e60687e41527497d023f03b5b1e1b3c99a80e15264b3c4f74d0e9a7e289c091
                  </p>
                </div>

                <div className="rounded border border-line bg-raised/50 p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-ink">#002 · &ldquo;move the pan to the center&rdquo;</span>
                    <span className="annunciator border-deny bg-deny-bg px-1.5 py-0.5 text-[9px] text-deny">HAZARD_HOT</span>
                  </div>
                  <p className="mt-1 text-[11px] text-warn">
                    Interlock: The saucepan is hot (60°C+ on the hotplate). Manual handling only.
                  </p>
                  <p className="mt-1 break-all text-[10px] text-action">
                    block: 1ecb33fe92ab84d51f280b19d45e07663e264560a80e0e01449c3b1239c94f08
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/app"
                className="btn btn-primary group px-6 py-3 text-base shadow-[0_0_24px_rgba(83,213,232,0.25)]"
              >
                <span>Judge it yourself in the cockpit</span>
                <svg
                  className="ml-2.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-[13px] text-ink-3">
          <p>
            Bollard · built by{" "}
            <a
              href="https://x.com/a_raphie"
              target="_blank"
              rel="noreferrer"
              className="text-ink-2 underline underline-offset-4 transition-colors hover:text-action"
            >
              Raphie
            </a>{" "}
            for AI Infra Summit Hackathon · Intel online track + Speechmatics bonus
          </p>
          <p className="font-mono text-[11px] text-ink-3/80">
            posture: simulation is policy-driven animation, not a trained VLA · STT runs on Speechmatics cloud · no LLM in the command path
          </p>
        </div>
      </footer>
    </div>
  );
}
