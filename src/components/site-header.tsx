"use client";

import Link from "next/link";

// The ONE chrome row for every route: brand left, plain-noun nav, one provenance pill right.
export function SiteHeader({ active }: { active: "instrument" | "cockpit" }) {
  const linkCls = (isActive: boolean) =>
    `text-sm transition-colors ${isActive ? "text-ink border-b-2 border-action pb-1" : "text-ink-2 hover:text-ink border-b-2 border-transparent pb-1"}`;
  return (
    <header className="flex items-center justify-between gap-6 border-b border-line px-6 py-3">
      <div className="flex items-baseline gap-6">
        <Link href="/" className="font-mono text-sm font-bold tracking-[0.22em] text-ink">
          BOLLARD
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/" className={linkCls(active === "instrument")}>
            Instrument
          </Link>
          <Link href="/app" className={linkCls(active === "cockpit")}>
            Cockpit
          </Link>
        </nav>
      </div>
      <div className="annunciator flex items-center gap-2 px-3 py-1.5 text-[11px] text-ink-2">
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
        POLICY V1 · NO LLM IN LOOP · STT CLOUD
      </div>
    </header>
  );
}
