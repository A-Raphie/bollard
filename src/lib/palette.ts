// Canvas mirror of the globals.css token palette (canvas drawing can't read CSS vars).
// KEEP IN SYNC with src/app/globals.css — single source of truth lives there.

export const PALETTE = {
  canvas: "#0c0f14",
  surface: "#12161e",
  raised: "#171d27",
  line: "rgba(232,236,242,0.10)",
  lineStrong: "rgba(232,236,242,0.22)",
  ink: "#e8ecf2",
  ink2: "#9aa6b6",
  ink3: "#667384",
  accent: "#53d5e8",
  accentSubtle: "rgba(83,213,232,0.12)",
  ok: "#4cd17e",
  okBg: "rgba(76,209,126,0.12)",
  warn: "#e5b144",
  warnBg: "rgba(229,177,68,0.12)",
  deny: "#e26a63",
  denyBg: "rgba(226,106,99,0.12)",
  neutral: "#8b98a9",
  tableFill: "#1c2330",
  placematFill: "#232b3a",
  bladeFill: "#c7d0dc",
} as const;
