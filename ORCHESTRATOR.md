# Bollard — Hackathon Orchestrator Ledger
Event: AI Infra Summit Hackathon (lablab.ai × Kisaco) · Deadline: Sep 16, 2026 7:30 PM WAST · Current stage: 3 Build · Updated: Sep 14

## Registration state
- lablab: REGISTERED ("Waiting for approval") on his account via IAB. Screening form pending — HIS data only (legal name, LinkedIn, age, background, travel=No).
- Team creation: gated behind lablab approval — retry after he fills the form. Team name will be Bollard (1-person).

## Sweeps
| Stage | Entered | Exited | Notes |
|---|---|---|---|
| 0 Calibrate | Sep 14 | Sep 14 | go/no-go: SKIP recommended, his GO received → Interlock/Bollard lane. Playbook read. |
| 1 Idea | Sep 14 | Sep 14 | idea-hack gates run in go/no-go package; ≤48h → compressed validation, autopsy 🔍 skipped (idea-hack gates 9–11 embedded) |
| 2 Plan+design | Sep 14 | — | naming done (Bollard); spec-lite this repo; design tokens before any component CSS |

## Skill ledger
| Skill | Stage | State | Note |
|---|---|---|---|
| hackathon-orchestrator | 0 | ✅ | this ledger |
| see-whats-going-on | 0 | ✅ | event page read rendered in IAB (fetch tools blind on lablab) |
| hackathon-idea-hack | 1 | ✅ | 3 candidates, gates run, Interlock won; Benchproof flagged off-brief |
| forensic-playbook | 0 | ✅ | primitive-fit × podium-density scored LOW — volume shot only |
| naming | 2 | ✅ | Bollard — nautical cluster (Curb/Ballast/Lading/Purser), hook test won; Interlock/Ward finalists; tm/nt search 🔍 skipped (timebox) |
| great-work | 0 | 🔍 | his explicit GO overrides capacity concern; verdict recorded |
| idea-autopsy / before-you-build / talk-to-users | 1 | 🔍 | ≤48h compression rule; idea-hack gates suffice |
| spec | 2 | ✅ | docs/PRD.md spec-lite |
| design-direction / semantic-tokens / winsznx-ui / ui-craft | 2–3 | ⏸ | BEFORE any component CSS; winsznx Style Genome pick due — no builder-look reuse |
| component-harvest | 3 | ⏸ | query-before-create at UI build |
| hackathon-design | 2 | ⏸ | signature move = bollard rope visual + receipt chain verify |
| agents-md | 2 | ⏸ | write repo AGENTS.md (scaffold created a default — replace) |
| ui-ux-audit / baseline-ui / fixing-metadata / frontend-lighthouse | 4 | ⏸ | after screens |
| mock-hunter | 4 | ⏸ ◆ | pre-demo: every visible value REAL vs MOCK |
| ship-rehearsal | 3–5 | ✅ | Phase 3 CLI-QA harness (`scripts/qa-cli.ts`, `bun run qa`) 25/25 assertions passed clean; regression net in package.json |
| claims-verify | 5 | ⏸ | every claim vs deployed build before submit |
| demo-script → vo-first → demo-video | 6 | ⏸ | VO = his audio only; footage banked early per milestone |
| demo-final-gate | 6 | ⏸ | post-mux check |
| submission | 6 | ⏸ ◆ | staged dump + his GO; separate video-publish gate |
| readme / x-post | 6 | ⏸ | package |
| post-hackathon | 7 | ⏸ | keep-alive through judging |
| lemmaly/invariant-guard/mathguard | 3 | 🔍 | no heavy algorithmic loops; hash chain is stdlib |
| wallet-connect-fix | 3 | 🔍 | not web3 |

## Architecture constraints (locked)
- Hosting: Vercel free (static + ONE serverless function /api/token). No persistent processes. No other hosts.
- Speechmatics: browser connects wss://global.rt.speechmatics.com/v2?jwt=… — JWT minted server-side (SPEECHMATICS_API_KEY env), ttl 60s. Browser never sees the key.
- Deterministic policy engine — NO LLM in the command path (auditable-safety selling point; honesty-table row).
- Receipt chain: SHA-256 hash-chained, verifyable in-app (Web Crypto), persisted per-session localStorage.

## Stage gate
- [ ] Exit sweep done (all ⏳/⏸ revisited)
- [ ] ◆ skills that ran: each had applicability + explicit go
- [ ] Next stage's entry sweep queued
