const pptxgen = require("pptxgenjs");

// Bollard deck · Mode Q palette lifted from the product itself
const BG = "0C0F14";        // cockpit canvas
const SURFACE = "12161E";   // panel
const RAISED = "1A2029";    // tile fill
const LINE = "2A3240";      // hairline on dark
const TEXT = "E8ECF2";
const MUTED = "8A96A6";
const ACCENT = "53D5E8";    // ECAM cyan
const OK = "4CD17E";
const DENY = "E26A63";
const SANS = "Segoe UI";
const MONO = "Consolas";

const W = 13.33, H = 7.5, M = 0.6;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Raphie";
pres.title = "Bollard · the gate between hearing and hands";

const tile = (slide, x, y, w, h, fill = RAISED) =>
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, fill: { color: fill }, line: { color: LINE, width: 1 }, rectRadius: 0.06,
  });

const micro = (slide, text, x, y, w, color = MUTED) =>
  slide.addText(text, { x, y, w, h: 0.3, fontFace: MONO, fontSize: 11, color, charSpacing: 3, margin: 0 });

// ---------- 1 · COVER ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "VOICE-TO-ACTION INTERLOCK · AI INFRA SUMMIT HACKATHON", M, 0.9, 11);
  s.addText([
    { text: "The gate between", options: { color: TEXT, breakLine: true } },
    { text: "hearing and hands.", options: { color: TEXT, breakLine: true } },
    { text: "Nothing moves until the command passes policy.", options: { color: MUTED } },
  ], { x: M, y: 1.7, w: 11.5, h: 3.4, fontFace: SANS, fontSize: 47, bold: true, lineSpacing: 60, margin: 0 });
  s.addText("Bollard takes every spoken command to a robot arm, transcribes it with Speechmatics, judges it against a safety policy, and only then lets the arm move. Every command leaves a tamper-evident receipt.",
    { x: M, y: 5.15, w: 9.6, h: 1.1, fontFace: SANS, fontSize: 16, color: MUTED, margin: 0 });
  s.addText([
    { text: "bollard-five.vercel.app", options: { color: ACCENT } },
    { text: "   ·   github.com/A-Raphie/bollard   ·   built by Raphie (@a_raphie)", options: { color: MUTED } },
  ], { x: M, y: 6.75, w: 11.5, h: 0.4, fontFace: MONO, fontSize: 13, margin: 0 });
}

// ---------- 2 · PROBLEM ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "THE PROBLEM", M, 0.65, 6);
  s.addText("A robot that executes whatever it hears is not a product. It is a liability.",
    { x: M, y: 1.35, w: 11.9, h: 1.9, fontFace: SANS, fontSize: 34, bold: true, color: TEXT, margin: 0 });
  const rows = [
    ["Hearing ships.", "Speechmatics turns speech into text in real time. Text is not consent."],
    ["Hands ship.", "VLA policies and robot arms act on whatever instruction they receive."],
    ["The gate is missing.", "No surface shows what was heard, what was allowed, and what moved. That gap is where deployment dies: safety review has nothing to audit."],
  ];
  rows.forEach(([head, body], i) => {
    const y = 3.55 + i * 1.12;
    s.addText(head, { x: M, y, w: 3.1, h: 0.9, fontFace: SANS, fontSize: 17, bold: true, color: i === 2 ? ACCENT : TEXT, margin: 0 });
    s.addText(body, { x: 3.9, y, w: 8.7, h: 0.9, fontFace: SANS, fontSize: 14, color: MUTED, margin: 0 });
    if (i < 2) s.addShape(pres.shapes.LINE, { x: M, y: y + 0.97, w: W - 2 * M, h: 0, line: { color: LINE, width: 1 } });
  });
}

// ---------- 3 · MECHANISM ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "MECHANISM · ONE COMMAND, FIVE GATES", M, 0.65, 8);
  const steps = [
    ["01", "HEAR", "Browser mic streams 16 kHz PCM to Speechmatics Realtime over a short-TTL JWT. The key never leaves the server."],
    ["02", "PARSE", "A deterministic grammar extracts verb, object, destination. No model, no guesswork: the same words always parse the same."],
    ["03", "JUDGE", "The policy engine checks hazard class, reach, grip and destination. Output: ALLOW or DENY, with reasons."],
    ["04", "ACT", "Only an ALLOW reaches the arms. The bollard rope pays out and the dinner table executes the step."],
    ["05", "RECEIPT", "Every command appends to a SHA-256 hash chain: heard, confidence, intent, verdict, scene fingerprint."],
  ];
  const w = 2.24, gap = 0.12, y = 1.5, h = 4.4;
  steps.forEach(([num, head, body], i) => {
    const x = M + i * (w + gap);
    tile(s, x, y, w, h);
    s.addText(num, { x: x + 0.18, y: y + 0.22, w: 1, h: 0.5, fontFace: MONO, fontSize: 20, bold: true, color: ACCENT, margin: 0 });
    s.addText(head, { x: x + 0.18, y: y + 0.78, w: w - 0.36, h: 0.4, fontFace: MONO, fontSize: 15, bold: true, color: TEXT, charSpacing: 2, margin: 0 });
    s.addText(body, { x: x + 0.18, y: y + 1.3, w: w - 0.36, h: h - 1.6, fontFace: SANS, fontSize: 11.5, color: MUTED, margin: 0 });
  });
  s.addText("hear → parse → judge → act → receipt · deterministic policy · no LLM in the command path",
    { x: M, y: 6.35, w: 12, h: 0.4, fontFace: MONO, fontSize: 12, color: ACCENT, margin: 0 });
}

// ---------- 4 · LIVE PROOF ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "LIVE ON THE DEPLOYED BUILD", M, 0.65, 8);
  // the cockpit frame, right-weighted
  s.addImage({ path: __dirname + "/cockpit-live.png", x: 4.35, y: 1.05, w: 8.38, h: 5.24 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.35, y: 1.05, w: 8.38, h: 5.24, fill: { color: BG, transparency: 100 }, line: { color: LINE, width: 1.5 }, rectRadius: 0.05 });
  s.addText("The cockpit: a spoken-style command is judged and denied because the saucepan is hot. One panel earlier, a plate placement was allowed. The receipt chain keeps both.",
    { x: M, y: 1.5, w: 3.5, h: 2.6, fontFace: SANS, fontSize: 15, color: TEXT, margin: 0 });
  s.addText([
    { text: "DENY · HAZARD_HOT", options: { color: DENY, bold: true, breakLine: true } },
    { text: "“move the pan to the center”", options: { color: MUTED, fontFace: MONO, fontSize: 11.5, breakLine: true } },
    { text: "The saucepan is hot (60°C+ on the hotplate). Manual handling only.", options: { color: MUTED, fontSize: 12.5 } },
  ], { x: M, y: 4.3, w: 3.5, h: 2.2, fontFace: SANS, fontSize: 15, paraSpaceAfter: 6, margin: 0 });
}

// ---------- 5 · THE BOUNDARY ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "THE BOUNDARY · A POLICY YOU CAN READ", M, 0.65, 8);
  s.addText("What it allows", { x: M, y: 1.25, w: 5.8, h: 0.5, fontFace: SANS, fontSize: 20, bold: true, color: OK, margin: 0 });
  const ok = [
    "place, pick up and slide safe objects: plates, bowls, cutlery, napkins",
    "glassware moves with a care note: slow approach, soft grip",
    "named-arm routing: “with the left arm”",
  ];
  s.addText(ok.map((t, i) => ({ text: t, options: { bullet: { code: "2013", indent: 12 }, breakLine: i < ok.length - 1 } })),
    { x: M, y: 1.9, w: 5.8, h: 2.2, fontFace: SANS, fontSize: 14, color: MUTED, paraSpaceAfter: 10, margin: 0 });
  s.addText("What it refuses, with reasons", { x: 7.0, y: 1.25, w: 5.7, h: 0.5, fontFace: SANS, fontSize: 20, bold: true, color: DENY, margin: 0 });
  const deny = [
    "the hot saucepan, the lit candle, any throw of glassware",
    "off-table drops, occupied destinations, out-of-reach corners",
    "any command that arrives while the arm is mid-action",
  ];
  s.addText(deny.map((t, i) => ({ text: t, options: { bullet: { code: "2013", indent: 12 }, breakLine: i < deny.length - 1 } })),
    { x: 7.0, y: 1.9, w: 5.7, h: 2.2, fontFace: SANS, fontSize: 14, color: MUTED, paraSpaceAfter: 10, margin: 0 });
  // verdict tile recreation
  tile(s, M, 4.55, 12.13, 1.7, "1A1417");
  s.addText("DENY", { x: M + 0.3, y: 4.55, w: 1.9, h: 1.7, fontFace: MONO, fontSize: 30, bold: true, color: DENY, valign: "middle", charSpacing: 3, margin: 0 });
  s.addText([
    { text: "“move the pan to the center”", options: { color: TEXT, fontFace: MONO, fontSize: 14, breakLine: true } },
    { text: "The saucepan is hot (60°C+ on the hotplate). Manual handling only.", options: { color: MUTED, fontSize: 13 } },
  ], { x: 2.85, y: 4.55, w: 8.2, h: 1.7, fontFace: SANS, valign: "middle", paraSpaceAfter: 6, margin: 0 });
  s.addText("10 DENY CLASSES", { x: 11.05, y: 4.55, w: 1.6, h: 1.7, fontFace: MONO, fontSize: 10, color: MUTED, valign: "middle", margin: 0 });
  s.addText("HAZARD_HOT · FLAME_LIT · SHARP_MOTION · EDGE_DROP · OUT_OF_REACH · DEST_OCCUPIED · GRIPPER_FULL · NOT_ON_TABLE · UNKNOWN_OBJECT · UNKNOWN_VERB",
    { x: M, y: 6.55, w: 12.13, h: 0.6, fontFace: MONO, fontSize: 11, color: MUTED, margin: 0 });
}

// ---------- 6 · RECEIPTS + HONESTY ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "RECEIPTS · THE AUDIT SURFACE", M, 0.65, 8);
  // receipt anatomy (mono block)
  tile(s, M, 1.3, 6.6, 4.1);
  s.addText([
    { text: "#002 · HAZARD_HOT · “move the pan to the center”", options: { color: DENY, breakLine: true } },
    { text: "heard:      move the pan to the center", options: { color: MUTED, breakLine: true } },
    { text: "source:     typed · same pipeline as voice", options: { color: MUTED, breakLine: true } },
    { text: "reason:     The saucepan is hot (60°C+ on the hotplate).", options: { color: MUTED, breakLine: true } },
    { text: "            Manual handling only.", options: { color: MUTED, breakLine: true } },
    { text: "prev:       8e60687e…", options: { color: MUTED, breakLine: true } },
    { text: "hash:       sha256 · 1ecb33fe…", options: { color: TEXT } },
  ], { x: M + 0.25, y: 1.55, w: 6.1, h: 3.6, fontFace: MONO, fontSize: 12, paraSpaceAfter: 8, margin: 0 });
  // honesty column
  s.addText("Honesty table", { x: 7.6, y: 1.3, w: 5.1, h: 0.4, fontFace: SANS, fontSize: 18, bold: true, color: TEXT, margin: 0 });
  const honesty = [
    ["arm", "2D simulation, policy-driven animation. Not a trained VLA policy"],
    ["understanding", "deterministic grammar + policy engine. No LLM in the command path"],
    ["speech", "Speechmatics Realtime (cloud). JWT minted server-side; the key never reaches the browser"],
    ["receipts", "SHA-256 chain, verified in the browser, exported as JSON"],
  ];
  honesty.forEach(([k, v], i) => {
    const y = 1.85 + i * 1.02;
    s.addText(k, { x: 7.6, y, w: 5.1, h: 0.3, fontFace: MONO, fontSize: 11, color: ACCENT, charSpacing: 2, margin: 0 });
    s.addText(v, { x: 7.6, y: y + 0.3, w: 5.1, h: 0.65, fontFace: SANS, fontSize: 12.5, color: MUTED, margin: 0 });
  });
  s.addText("One click re-hashes the whole chain and prints VALID, or the serial where it breaks.",
    { x: M, y: 5.75, w: 6.6, h: 0.8, fontFace: SANS, fontSize: 14, color: TEXT, margin: 0 });
}

// ---------- 7 · JUDGE PATH ----------
{
  const s = pres.addSlide();
  s.background = { color: BG };
  micro(s, "JUDGE IT IN 90 SECONDS", M, 0.65, 8);
  const steps = [
    ["1", "Open", "bollard-five.vercel.app/app"],
    ["2", "Press", "the chip “place a plate on the left placemat”"],
    ["3", "Watch", "HOLD → ALLOW, the arm moves, receipt #1 lands"],
    ["4", "Break it", "press “move the pan to the center” → DENY · HAZARD_HOT"],
    ["5", "Verify", "hit Verify chain → every SHA-256 link re-hashes → VALID"],
  ];
  steps.forEach(([n, head, body], i) => {
    const y = 1.4 + i * 1.02;
    s.addShape(pres.shapes.OVAL, { x: M, y: y + 0.05, w: 0.52, h: 0.52, fill: { color: RAISED }, line: { color: ACCENT, width: 1.25 } });
    s.addText(n, { x: M, y: y + 0.05, w: 0.52, h: 0.52, fontFace: MONO, fontSize: 15, bold: true, color: ACCENT, align: "center", valign: "middle", margin: 0 });
    s.addText(head, { x: M + 0.8, y, w: 1.7, h: 0.6, fontFace: SANS, fontSize: 17, bold: true, color: TEXT, margin: 0 });
    s.addText(body, { x: M + 2.6, y, w: 9.4, h: 0.6, fontFace: SANS, fontSize: 14, color: MUTED, margin: 0 });
  });
  s.addShape(pres.shapes.LINE, { x: M, y: 6.5, w: W - 2 * M, h: 0, line: { color: LINE, width: 1 } });
  s.addText([
    { text: "bollard-five.vercel.app/app", options: { color: ACCENT } },
    { text: "   ·   github.com/A-Raphie/bollard   ·   Intel online track + Speechmatics bonus   ·   Raphie (@a_raphie)", options: { color: MUTED } },
  ], { x: M, y: 6.7, w: 12.13, h: 0.4, fontFace: MONO, fontSize: 12, margin: 0 });
}

pres.writeFile({ fileName: __dirname + "/bollard-deck.pptx" }).then(() => console.log("deck written"));
