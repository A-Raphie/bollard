# Bollard — PRD (spec-lite)

**One-liner.** For teams putting voice on robot arms, Bollard is the gate between hearing and hands: every spoken command is transcribed by Speechmatics, checked against a policy, and only then executed on the dinner-table sim — with a tamper-evident receipt of what was heard, what was allowed, and what moved.

**Tracks.** Intel online — Bimanual VLA Manipulation with Multi-Modal Reasoning (dinner-table challenge option, simulation-first) + Speechmatics Best-Use bonus award (stacks).

## Why this wins
- The field ships hearing (Speechmatics) and hands (VLA/arms). Nobody ships the gate between them — safety/authorization is the missing layer, and it reads as Business Value (enterprise robotics deployment stops at exactly this problem).
- Originality: allow/deny verdicts with reasons, live on camera, are visibly different from 15 "arm moves on command" demos.
- Presentation: receipt chain + verify button = a judge-checkable artifact (his verification-instrument signature).
- Honest: deterministic grammar + policy engine, NO LLM in the command path — auditable by design; disclosure table states it.

## The pipeline (one command's life)
1. **Hear** — browser mic → Speechmatics Realtime (`wss://global.rt.speechmatics.com/v2?jwt=` — JWT minted by `/api/token`, key never leaves the server). Partials <500ms shown live; Final (~0.7–2s) is the verdict trigger.
2. **Parse** — deterministic intent grammar: `{verb, object, target}` against the scene's object registry + Custom Dictionary boosting table terms.
3. **Judge** — policy engine: verb allowlist, object safety classes (hazard: hot pan; fragile: glass near edge; restricted: knife), destination rules. Output: ALLOW / DENY + human-readable reasons.
4. **Act** — if ALLOW, the sim executes: arm picks/moves/places along arcs; two arms (left/right) for bimanual handoffs.
5. **Receipt** — hash-chained entry: `{serial, ts, heard, confidence, intent, verdict, reasons, action, sceneAfter, prevHash, hash}`. Verify button recomputes the chain (Web Crypto SHA-256).

## Screens
1. `/` front door — winsznx grammar (brand-left, one provenance pill, hero → lede → CTAs → proof panel with framed app shot). One primary CTA: "Open the cockpit" → /app.
2. `/app` cockpit — one viewport target: left = mic + live transcript + typed-command fallback (deterministic demo path, same pipeline); center = dinner-table canvas sim (bollard graphic holds the rope while a command is pending); right = receipt feed + chain verify. History link in panel header, not a new page.
3. `/verify` (thin) — paste/export a receipt chain, verify standalone. Only if time allows.

## Judging map
- Application of Technology — Speechmatics RT is the trigger (Custom Dictionary boosts table vocabulary); OpenVINO honest-gap noted (no on-device model in v1).
- Presentation — 90-second judge path: open /app → press mic → say "place the plate to the left of the candle" → watch ALLOW + arm move → say "throw the glass off the table" → watch DENY + reason → hit Verify chain → VALID.
- Business Value — voice-to-action deployment blocker: certification/audit needs exactly this artifact.
- Originality — the interlock layer as the product, not garnish.

## Honesty disclosures (README + submission)
- Sim is policy-driven animation, not a trained VLA policy.
- No LLM in the command path; intent grammar is deterministic.
- STT = Speechmatics SaaS (cloud), not on-device; OpenVINO not integrated in v1.
- Typed fallback shares the identical pipeline minus audio.

## Scope cuts (if time runs out)
- Cut /verify standalone page → in-app verify only.
- Cut bimanual handoff → single arm (keep left/right labels).
- Cut Custom Dictionary tuning → ship default vocabulary list.
- Slides: 6–8 pages max, deck from README content.

## Non-goals
- Real hardware, camera vision, cloud state, user accounts, i18n.
