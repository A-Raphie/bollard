import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CockpitPreview } from "@/components/cockpit-preview";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="instrument" />

      <main className="flex flex-col items-center">
        {/* hero */}
        <section className="flex w-full max-w-6xl flex-col items-start gap-6 px-6 pb-20 pt-24">
          <p className="micro">Voice-to-action interlock · AI Infra Summit Hackathon</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
            The gate between hearing and hands.
            <span className="block text-ink-3">Nothing moves until the command passes policy.</span>
          </h1>
          <p className="max-w-[58ch] text-lg leading-8 text-ink-2">
            Bollard takes every spoken command to a robot arm, transcribes it with Speechmatics, judges it against a safety policy, and only then lets the arm move. Each command leaves a tamper-evident receipt.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/app" className="btn btn-primary px-6">
              Open the cockpit
            </Link>
            <Link href="/#receipts" className="btn btn-ghost px-5 text-ink-2">
              See the receipts
            </Link>
          </div>
          <p className="font-mono text-xs text-ink-3">
            hear → parse → judge → act → receipt · deterministic policy · no LLM in the command path
          </p>
        </section>

        {/* the instrument, framed: live idle state of the real renderer */}
        <section className="flex w-full max-w-6xl flex-col items-center gap-3 px-6 pb-24">
          <div className="panel w-full overflow-hidden p-2">
            <CockpitPreview />
          </div>
          <p className="font-mono text-[11px] text-ink-3">
            the cockpit, live idle state · two arms, one bollard, thirteen table objects
          </p>
        </section>

        {/* mechanism */}
        <section className="w-full border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-24">
            <h2 className="micro">Mechanism</h2>
            <div className="grid gap-10 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <span className="number font-mono text-sm text-action">01</span>
                <h3 className="text-lg font-semibold">Hear</h3>
                <p className="text-[15px] leading-7 text-ink-2">
                  Speechmatics Realtime streams your mic at 16 kHz. Partials land in under 500 ms; the final transcript triggers judgment.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="number font-mono text-sm text-action">02</span>
                <h3 className="text-lg font-semibold">Judge</h3>
                <p className="text-[15px] leading-7 text-ink-2">
                  A deterministic grammar extracts the intent; the policy engine checks hazards, reach, grip and destination. Allow or deny, with reasons.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="number font-mono text-sm text-action">03</span>
                <h3 className="text-lg font-semibold">Act, then receipt</h3>
                <p className="text-[15px] leading-7 text-ink-2">
                  Allowed commands animate the arm on the dinner table. Every command appends a SHA-256 hash-chained receipt of what was heard, allowed, and moved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* boundary */}
        <section className="w-full border-t border-line">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-24 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 className="micro">What Bollard allows</h2>
              <ul className="flex flex-col gap-2 text-[15px] leading-7 text-ink-2">
                <li>· place, pick up and slide safe objects: plates, bowls, cutlery, napkins</li>
                <li>· glassware with a care note: slow approach, soft grip</li>
                <li>· named-arm routing when you say “with the left arm”</li>
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <h2 className="micro">What it refuses, with reasons</h2>
              <ul className="flex flex-col gap-2 text-[15px] leading-7 text-ink-2">
                <li>· the hot saucepan, the lit candle, any throw of glassware</li>
                <li>· destinations off the table edge, occupied spots, out-of-reach corners</li>
                <li>· any command that arrives while the arm is mid-action</li>
              </ul>
            </div>
          </div>
        </section>

        {/* receipts */}
        <section id="receipts" className="w-full border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-24">
            <h2 className="micro">Receipts · two examples</h2>
            <p className="max-w-[62ch] text-lg leading-8 text-ink-2">
              Every command appends a receipt to a SHA-256 hash chain: the words heard, the transcription confidence, the parsed intent, the verdict with reasons, the scene fingerprint after. One click re-hashes the whole chain and says whether it holds.
            </p>
            <div className="annunciator w-full max-w-2xl overflow-x-auto p-4 font-mono text-[11px] leading-6 text-ink-2">
              <p>#001 · ALLOW · “place a plate on the left placemat”</p>
              <p className="text-ink-3">heard → parse → judge → act → scene@-0.42,0.08 · sha 205575a5…</p>
              <p>#002 · EDGE_DROP · “throw the glass off the table”</p>
              <p className="text-ink-3">Throwing the glass would shatter it. Denied. · sha 91fec2…</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/app" className="btn btn-primary px-6">
                Judge it yourself
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-[13px] text-ink-3">
          <p>
            built by <a href="https://x.com/a_raphie" className="text-ink-2 underline underline-offset-4 hover:text-ink">Raphie</a> · AI Infra Summit Hackathon, Intel online track + Speechmatics bonus
          </p>
          <p className="font-mono text-[11px]">
            posture: simulation is policy-driven animation, not a trained VLA · STT runs on Speechmatics cloud · no LLM in the command path
          </p>
        </div>
      </footer>
    </div>
  );
}
