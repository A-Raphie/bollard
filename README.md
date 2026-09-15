# Bollard

The gate between hearing and hands: every spoken command to a robot arm is transcribed by Speechmatics, judged against a safety policy, and only then executed. Every command leaves a tamper-evident receipt.

![The Bollard cockpit mid-verdict](docs/media/hero.png)

**Live:** [trybollard.netlify.app](https://trybollard.netlify.app) · cockpit at [/app](https://trybollard.netlify.app/app)

![track](https://img.shields.io/badge/track-Intel%20online%20%2B%20Speechmatics%20bonus-blue) ![stack](https://img.shields.io/badge/stack-Next.js%2016%20%2B%20Speechmatics%20RT-black) ![license](https://img.shields.io/badge/license-MIT-green)

## Proof, in 30 seconds

Open the [cockpit](https://trybollard.netlify.app/app) and test either via live mic or one-click quick actions (identical pipeline):

| # | Command | What happens | What it proves |
|---|---|---|---|
| 1 | `move plate` | HOLD → ALLOW → Robot arm transfers the plate to the open placemat; receipt appended | Interlock pays out the rope only after policy validates reach, state, and clear trajectory |
| 2 | `grab candle` | INTERVENE · FLAME_LIT · "The candle flame is actively burning. Direct handling refused." | Active hazards immediately trigger hard policy intervention before motion begins |
| 3 | `touch pan` | INTERVENE · HAZARD_HOT · "The saucepan is hot (85°C). Manual handling only." | Thermal and physical hazard sensors gate motor commands |
| 4 | `throw glass` | INTERVENE · EDGE_DROP · "Throwing the glass would shatter it." | Dynamic drop and trajectory boundary enforcement |
| 5 | hit **Verify Chain** | `VALID · n links re-hashed, genesis intact` | The SHA-256 audit receipt chain is cryptographically tamper-evident |

Each receipt binds: spoken utterance · transcription confidence · parsed intent · policy verdict code and reasons · scene state fingerprint · previous hash. **Verify Chain** recomputes every SHA-256 link live in Web Crypto.

## Honesty table

| claim | reality |
|---|---|
| robot arm | 2D kinematic simulation, policy-driven animation. Not a trained VLA policy, not physical hardware |
| command understanding | deterministic grammar + policy engine. No LLM anywhere in the command path |
| speech-to-text | Speechmatics Realtime (cloud SaaS). JWT minted server-side; the API key never reaches the browser |
| on-device inference | none in v1. OpenVINO is not integrated (the onsite Intel track runs OpenVINO; the online brief is simulation-first) |
| voice input | requires `SPEECHMATICS_API_KEY` configured on the server. The typed/quick-action path carries the identical verification pipeline |
| receipts | stored per-browser (localStorage), verifiable in-app, exportable as JSON |
| background noise | client-side noise suppression and confidence floor filter out low-scoring fragments before the policy engine |

## How it works

```mermaid
flow LR
  mic[Browser mic 16kHz PCM] -->|WebSocket + short-TTL JWT| SM[Speechmatics Realtime]
  SM -->|final transcript| P[Intent grammar]
  P --> J[Deterministic policy engine]
  J -->|ALLOW| S[Table sim: arms animate]
  J -->|INTERVENE + reasons| R[Receipt chain]
  S --> R
```

The whole safety argument is one function — readable, deterministic, testable:

```ts
const { intent } = parseCommand(transcript, scene);
const verdict = judge(scene, arms, intent);
if (verdict.allowed) sim.enqueue(scene, intent, verdict);
await appendReceipt(chain, { heard, verdict, sceneAfter: sceneFingerprint(scene) });
```

Denied classes: `HAZARD_HOT` · `FLAME_LIT` · `SHARP_MOTION` · `EDGE_DROP` · `OUT_OF_REACH` · `DEST_OCCUPIED` · `GRIPPER_FULL` · `NOT_ON_TABLE` · `UNKNOWN_OBJECT` · `UNKNOWN_VERB`.

## The app

The cockpit is a unified single-viewport workstation:
- **Comms Input (Left)**: Live microphone feed via Speechmatics Realtime (SRC 1) or typed/quick action buttons (SRC 2).
- **Policy Monitor & Table Sim (Center)**: Real-time status annunciator and 2D dinner table simulation showing atmospheric lighting, thermal zones, tableware layout, and dual robot arms anchored to the safety bollard.
- **Audit Chain (Right)**: Cryptographic SHA-256 hash log of every single action, with client-side verification and JSON export.

## Run locally

```bash
bun install
cp .env.local.example .env.local   # add SPEECHMATICS_API_KEY (portal.speechmatics.com, free tier)
bun dev                            # localhost:3000
```

## Deploy

Deployed on Netlify: static export + serverless function (`/api/token`) that mints short-TTL Speechmatics JWTs. Live deployment: [trybollard.netlify.app](https://trybollard.netlify.app).

## Project structure

```
src/app/page.tsx            front door
src/app/app/page.tsx        cockpit (voice, verdict, receipts)
src/app/api/token/route.ts  Speechmatics JWT mint (server-only)
src/components/table-canvas.tsx  the dinner table + rope renderer
src/lib/intent.ts           deterministic intent grammar
src/lib/policy.ts           policy engine (allow/deny + reasons)
src/lib/receipts.ts         SHA-256 receipt chain + verify
src/lib/sim/engine.ts       deterministic plan execution
src/lib/voice.ts            browser Speechmatics session
```

## Links

- Event: [AI Infra Summit Hackathon on lablab.ai](https://lablab.ai/ai-hackathons/ai-infra-summit-hackathon)
- Track: Intel online - Bimanual VLA Manipulation with Multi-Modal Reasoning (dinner-table challenge option), plus the Speechmatics Best-Use bonus award
- [Speechmatics Realtime API](https://docs.speechmatics.com/speech-to-text/realtime/quickstart.md)

## License

MIT
