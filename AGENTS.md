<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Bollard — agent behavior layer

Event: AI Infra Summit Hackathon (lablab.ai). Deadline Sep 16 2026 7:30 PM WAST. Solo: Raphie + agents.
Judged surface: lablab submission needs repo + live URL + video + slides + cover. Full ledger: ORCHESTRATOR.md. Spec: docs/PRD.md.

## Hard rules
- Hosting: Vercel free ONLY (static + the one /api/token function). Never add a persistent-process dependency.
- `SPEECHMATICS_API_KEY` lives server-side only. Browser gets short-TTL JWTs via /api/token.
- No LLM in the command path (hear → parse → judge → act → receipt is deterministic). Don't add model calls to it.
- UI: semantic tokens first, zero raw hex in components. Design system per winsznx/ui-craft before styling screens.
- Every UI claim must be exercised against the running build (claims-verify). No mock values on screen — real or labeled simulation.
- bun, never npm (Arborist crash on this Mac). Commits small and frequent; push to origin after each green milestone.

## Map
- src/app/page.tsx — front door. src/app/app/ — cockpit (mic, transcript, policy verdict, canvas sim, receipts).
- src/app/api/token/route.ts — JWT mint. lib/ — intent grammar, policy engine, receipts (hash chain), sim engine (pure TS, no React).
- Docs that own decisions: docs/PRD.md (scope + cuts), ORCHESTRATOR.md (skill ledger + stage).
