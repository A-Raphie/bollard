import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bollard-five.vercel.app"),
  title: "Bollard — the gate between hearing and hands",
  description:
    "Every spoken command to a robot arm is transcribed by Speechmatics, checked against a policy, and only then executed — with a tamper-evident receipt of what was heard, allowed, and moved.",
  openGraph: {
    title: "Bollard — the gate between hearing and hands",
    description:
      "Speechmatics transcribes the command. A deterministic policy judges it. Only then does the arm move — and every command leaves a tamper-evident receipt.",
    url: "/",
    siteName: "Bollard",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bollard — the gate between hearing and hands",
    description:
      "Speechmatics transcribes the command. Policy judges it. Then the arm moves. Every command leaves a receipt.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0f14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
