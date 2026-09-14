// Browser Speechmatics Realtime session: mic → 16 kHz mono PCM → RT WebSocket.
// JWT comes from /api/token; the API key never reaches the client.

import { RealtimeClient } from "@speechmatics/real-time-client";
import { DICTIONARY_BOOST } from "./intent";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

export interface VoiceCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string, confidence: number | null) => void;
  onState?: (state: VoiceState, detail?: string) => void;
  onLevel?: (rms: number) => void;
  onSilence?: () => void; // fired once when 5s pass with no audible input
}

const SILENCE_RMS = 0.01;    // below this the input counts as silent
const SILENCE_NOTIFY_MS = 5000;
const SILENCE_STOP_MS = 15000;

function floatToS16(input: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out.buffer;
}

/** Linear-interpolation resample of a mono float buffer to 16 kHz. */
function resampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === 16000) return input;
  const ratio = inRate / 16000;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s0 = input[i0] ?? 0;
    const s1 = input[i0 + 1] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

export class VoiceSession {
  private client = new RealtimeClient();
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private state: VoiceState = "idle";
  private cbs: VoiceCallbacks = {};
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private lastSoundAt = 0;
  private silenceNotified = false;
  private frame = 0;
  private audioBusy = false;
  private stopping = false;
  private captureProbe: ReturnType<typeof setTimeout> | null = null;

  private setState(s: VoiceState, detail?: string) {
    this.state = s;
    this.cbs.onState?.(s, detail);
  }

  get running(): boolean {
    return this.state === "listening" || this.state === "connecting";
  }

  async start(cbs: VoiceCallbacks): Promise<void> {
    if (this.running) return;
    this.cbs = cbs;
    this.setState("connecting");

    let jwt: string;
    try {
      const res = await fetch("/api/token", { method: "POST" });
      const data = (await res.json()) as { jwt?: string; error?: string };
      if (!res.ok || !data.jwt) throw new Error(data.error ?? "Token endpoint failed");
      jwt = data.jwt;
    } catch (e) {
      this.setState("error", e instanceof Error ? e.message : "Token endpoint failed");
      return;
    }

    this.client.addEventListener("receiveMessage", (evt) => {
      const d = evt.data;
      const meta = "metadata" in d ? (d.metadata as { transcript?: string; confidence?: number } | undefined) : undefined;
      if (d.message === "RecognitionStarted") {
        this.setState("listening");
        // the pipeline must produce at least one audio callback; if it never
        // does, try to resume the context once, then fail loudly
        if (this.captureProbe) clearTimeout(this.captureProbe);
        this.captureProbe = setTimeout(() => {
          void this.probeCapture();
        }, 3500);
      } else if (d.message === "AddPartialTranscript") {
        if (meta?.transcript) this.cbs.onPartial?.(meta.transcript);
      } else if (d.message === "AddTranscript") {
        if (meta?.transcript) this.cbs.onFinal?.(meta.transcript, typeof meta.confidence === "number" ? meta.confidence : null);
      } else if (d.message === "Warning") {
        // non-fatal: keep listening
      } else if (d.message === "Error") {
        this.setState("error", "reason" in d ? String((d as { reason?: string }).reason ?? "Recognition error") : "Recognition error");
      }
    });

    try {
      await this.client.start(jwt, {
        transcription_config: {
          language: "en",
          max_delay: 0.7,
          enable_partials: true,
          additional_vocab: DICTIONARY_BOOST,
        },
        audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
      });

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // native device rate; downsample to 16 kHz in JS (forcing the context rate
      // misbehaves on Safari and some Chromium builds)
      this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          // surfaced by the capture probe below
        }
      }
      // embedded browsers suspend contexts when the pane hides or the tab
      // switches: pull it back automatically while a session is live
      this.ctx.onstatechange = () => {
        if (this.state === "listening" && this.ctx?.state === "suspended") {
          void this.ctx.resume().catch(() => {});
        }
      };
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
      this.lastSoundAt = performance.now();
      this.silenceNotified = false;
      this.frame = 0;
      this.processor.onaudioprocess = (e) => {
        if (this.state !== "listening" || this.audioBusy) return;
        this.audioBusy = true;
        void this.handleAudio(e).finally(() => {
          this.audioBusy = false;
        });
      };
      this.sink = this.ctx.createGain();
      this.sink.gain.value = 0; // silent sink: ScriptProcessor needs a destination to pump
      source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.ctx.destination);
      // never leave a mic streaming unattended
      this.watchdog = setTimeout(() => {
        void this.stop();
      }, 120_000);
      // dev-only: inject an audio file through the exact STT pipeline (IAB test
      // environments hand out silent mic tracks; this proves STT + config E2E)
      if (import.meta.env.DEV) {
        (window as unknown as { __bollardInjectAudio?: (buf: ArrayBuffer) => Promise<string> }).__bollardInjectAudio =
          async (buf: ArrayBuffer) => {
            const res = await fetch("/api/token", { method: "POST" });
            const { jwt } = (await res.json()) as { jwt: string };
            const client = new RealtimeClient();
            const transcript = new Promise<string>((resolve, reject) => {
              let parts: string[] = [];
              let settle: ReturnType<typeof setTimeout> | null = null;
              client.addEventListener("receiveMessage", (evt) => {
                const d = evt.data;
                const meta = "metadata" in d ? (d.metadata as { transcript?: string } | undefined) : undefined;
                if (d.message === "AddTranscript" && meta?.transcript) {
                  parts.push(meta.transcript);
                  if (settle) clearTimeout(settle);
                  settle = setTimeout(() => resolve(parts.join(" ")), 2000);
                } else if (d.message === "Error") reject(new Error("STT error"));
              });
            });
            await client.start(jwt, {
              transcription_config: { language: "en", max_delay: 0.7, enable_partials: false },
              audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
            });
            const pcm = await to16kS16(buf);
            const chunk = 8192;
            for (let i = 0; i < pcm.byteLength; i += chunk) {
              client.sendAudio(pcm.slice(i, i + chunk));
              await new Promise((r) => setTimeout(r, 120));
            }
            client.sendAudio(new ArrayBuffer(8192)); // silence tail to flush the final
            const text = await Promise.race([
              transcript,
              new Promise<string>((_, rej) => setTimeout(() => rej(new Error("STT timeout")), 15000)),
            ]);
            try {
              client.stopRecognition({ noTimeout: true });
            } catch {
              // closed
            }
            return text;
          };
      }
    } catch (e) {
      await this.stop();
      this.setState("error", e instanceof Error ? e.message : "Could not open the microphone");
    }
  }

  /**
   * Embedded browsers suspend audio contexts freely (hidden pane, tab switch).
   * Try to resume; self-heal if the context comes back, error only if the
   * browser refuses to deliver samples at all.
   */
  private async probeCapture(): Promise<void> {
    if (this.state !== "listening" || this.frame > 0) return;
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        // re-checked below
      }
      await new Promise((r) => setTimeout(r, 600));
      if (this.frame > 0) return; // recovered
      if (this.ctx.state !== "running") {
        const message = "The browser suspended audio capture and refused to resume it. Reload the page and press the button again (or use your normal Chrome, whose microphone is not restricted).";
        await this.stop();
        this.setState("error", message);
        return;
      }
    }
    // context runs but delivers nothing: reschedule one more probe cycle
    if (this.captureProbe) clearTimeout(this.captureProbe);
    this.captureProbe = setTimeout(() => {
      void this.probeCapture();
    }, 2500);
  }

  private async handleAudio(e: AudioProcessingEvent): Promise<void> {
    const raw = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
    const rms = Math.sqrt(sum / raw.length);
    const now = performance.now();
    if (rms > SILENCE_RMS) {
      this.lastSoundAt = now;
      this.silenceNotified = false;
    } else if (!this.silenceNotified && now - this.lastSoundAt > SILENCE_NOTIFY_MS) {
      this.silenceNotified = true;
      this.cbs.onSilence?.();
    }
    if (now - this.lastSoundAt > SILENCE_STOP_MS) {
      const message =
        "No audio is reaching the microphone. Check the input device (some embedded browsers hand out a silent mic).";
      await this.stop();
      this.setState("error", message); // set after stop(), which ends in idle
      return;
    }
    if (this.frame++ % 2 === 0) this.cbs.onLevel?.(rms);
    const pcm = floatToS16(resampleTo16k(raw, this.ctx?.sampleRate ?? 48000));
    this.client.sendAudio(pcm);
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (this.captureProbe) {
      clearTimeout(this.captureProbe);
      this.captureProbe = null;
    }
    try {
      this.client.stopRecognition({ noTimeout: true });
    } catch {
      // already closed
    }
    this.processor?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.processor = null;
    this.sink = null;
    this.stream = null;
    this.ctx = null;
    this.stopping = false;
    this.setState("idle");
  }
}

/** Decode any browser-supported audio file and resample to 16 kHz mono s16. */
async function to16kS16(file: ArrayBuffer): Promise<ArrayBuffer> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(file);
  const ch = decoded.getChannelData(0);
  const out = floatToS16(ch);
  await ctx.close();
  return out;
}
