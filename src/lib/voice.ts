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

const SILENCE_RMS = 0.0008;   // calibrated threshold for speech vs ambient silence
const SILENCE_NOTIFY_MS = 8000;

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
  private client: RealtimeClient | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
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
  private transcriptBuffer = "";
  private transcriptTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConf: number | null = null;
  private audioQueue: ArrayBuffer[] = [];

  private setState(s: VoiceState, detail?: string) {
    this.state = s;
    this.cbs.onState?.(s, detail);
  }

  get running(): boolean {
    return this.state === "listening" || this.state === "connecting";
  }

  private flushTranscript() {
    if (this.transcriptTimer) {
      clearTimeout(this.transcriptTimer);
      this.transcriptTimer = null;
    }
    const text = this.transcriptBuffer.trim();
    this.transcriptBuffer = "";
    if (text) {
      this.cbs.onFinal?.(text, this.lastConf);
    }
  }

  async start(cbs: VoiceCallbacks): Promise<void> {
    if (this.running) return;
    this.cbs = cbs;
    this.setState("connecting", "ACQUIRING MIC…");
    this.transcriptBuffer = "";
    this.audioQueue = [];
    this.lastConf = null;
    this.frame = 0;
    if (this.transcriptTimer) {
      clearTimeout(this.transcriptTimer);
      this.transcriptTimer = null;
    }

    // 1. Acquire mic (try simple unconstrained stream first, then fallback to noise-suppressed)
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
      if (this.stopping) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }

      this.ctx.onstatechange = () => {
        if ((this.state === "listening" || this.state === "connecting") && this.ctx?.state === "suspended") {
          void this.ctx.resume().catch(() => {});
        }
      };

      // Anchor source node to instance and window to prevent V8 GC sweep
      this.source = this.ctx.createMediaStreamSource(this.stream);
      if (typeof window !== "undefined") {
        (window as unknown as { __bollardSource?: MediaStreamAudioSourceNode }).__bollardSource = this.source;
        (window as unknown as { __bollardCtx?: AudioContext }).__bollardCtx = this.ctx;
      }

      this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
      this.lastSoundAt = performance.now();
      this.silenceNotified = false;

      this.processor.onaudioprocess = (e) => {
        if (this.stopping) return;
        this.handleAudio(e);
      };

      this.sink = this.ctx.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.ctx.destination);
    } catch (e) {
      await this.stop();
      this.setState("error", e instanceof Error ? e.message : "Microphone access denied");
      return;
    }

    // 2. Obtain JWT from server with 7s timeout
    this.setState("connecting", "AUTHENTICATING…");
    let jwt: string;
    try {
      const ctrl = new AbortController();
      const tokenTimeout = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch("/api/token", { method: "POST", signal: ctrl.signal });
      clearTimeout(tokenTimeout);
      const data = (await res.json()) as { jwt?: string; error?: string };
      if (!res.ok || !data.jwt) throw new Error(data.error ?? "Token endpoint failed");
      jwt = data.jwt;
    } catch (e) {
      await this.stop();
      this.setState("error", e instanceof Error ? e.message : "Token endpoint failed");
      return;
    }

    // 3. Connect Speechmatics RealtimeClient (defaults to eu2 matching token audience)
    this.setState("connecting", "CONNECTING WEBSOCKET…");
    this.client = new RealtimeClient();

    this.client.addEventListener("receiveMessage", (evt) => {
      const d = evt.data;
      const meta = "metadata" in d ? (d.metadata as { transcript?: string; confidence?: number } | undefined) : undefined;
      if (d.message === "RecognitionStarted") {
        this.setState("listening");
        // Flush any audio buffered while the socket was handshaking
        if (this.client && this.audioQueue.length > 0) {
          for (const chunk of this.audioQueue) {
            try {
              this.client.sendAudio(chunk);
            } catch {
              break;
            }
          }
          this.audioQueue = [];
        }
      } else if (d.message === "AddPartialTranscript") {
        if (meta?.transcript) {
          const live = (this.transcriptBuffer ? this.transcriptBuffer + " " : "") + meta.transcript;
          this.cbs.onPartial?.(live);
        }
      } else if (d.message === "AddTranscript") {
        if (meta?.transcript) {
          this.transcriptBuffer = (this.transcriptBuffer ? this.transcriptBuffer + " " : "") + meta.transcript.trim();
          if ("results" in d && Array.isArray(d.results)) {
            const confs: number[] = [];
            for (const r of d.results as Array<{ alternatives?: Array<{ confidence?: number }> }>) {
              const c = r.alternatives?.[0]?.confidence;
              if (typeof c === "number") confs.push(c);
            }
            if (confs.length > 0) {
              this.lastConf = confs.reduce((a, b) => a + b, 0) / confs.length;
            }
          }
          if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
          this.transcriptTimer = setTimeout(() => this.flushTranscript(), 650);
        }
      } else if (d.message === "EndOfUtterance") {
        this.flushTranscript();
      } else if (d.message === "Warning") {
        // non-fatal: keep listening
      } else if (d.message === "Error") {
        this.setState("error", "reason" in d ? String((d as { reason?: string }).reason ?? "Recognition error") : "Recognition error");
      }
    });

    try {
      const startPromise = this.client.start(jwt, {
        transcription_config: {
          language: "en",
          max_delay: 0.7,
          enable_partials: true,
          additional_vocab: DICTIONARY_BOOST,
          conversation_config: { end_of_utterance_silence_trigger: 0.8 },
        },
        audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
      });
      const startTimeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("WebSocket connection timed out (8s). Check network or firewall.")), 8000)
      );
      await Promise.race([startPromise, startTimeout]);

      if (this.captureProbe) clearTimeout(this.captureProbe);
      this.captureProbe = setTimeout(() => {
        void this.probeCapture();
      }, 4000);

      this.watchdog = setTimeout(() => {
        void this.stop();
      }, 180_000);
    } catch (e) {
      await this.stop();
      this.setState("error", e instanceof Error ? e.message : "Could not start speech recognition");
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
      const ctxState = String(this.ctx.state);
      if (ctxState !== "running") {
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

  private handleAudio(e: AudioProcessingEvent): void {
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

    if (this.frame++ % 2 === 0) this.cbs.onLevel?.(rms);

    // If still connecting, buffer PCM chunks so words spoken right after clicking are not lost
    if (this.state === "connecting") {
      if (this.audioQueue.length < 30) {
        const pcm = floatToS16(resampleTo16k(raw, this.ctx?.sampleRate ?? 48000));
        this.audioQueue.push(pcm);
      }
      return;
    }

    // Strictly DO NOT send audio to Speechmatics until state is "listening" (RecognitionStarted received)
    if (this.state !== "listening" || !this.client) return;

    const pcm = floatToS16(resampleTo16k(raw, this.ctx?.sampleRate ?? 48000));
    try {
      this.client.sendAudio(pcm);
    } catch {
      // socket closing or closed
    }
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
    if (this.transcriptTimer) {
      clearTimeout(this.transcriptTimer);
      this.transcriptTimer = null;
    }
    this.transcriptBuffer = "";
    this.audioQueue = [];
    if (this.client) {
      try {
        this.client.stopRecognition({ noTimeout: true });
      } catch {
        // already closed
      }
      this.client = null;
    }
    this.processor?.disconnect();
    this.sink?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    if (typeof window !== "undefined") {
      delete (window as unknown as { __bollardSource?: MediaStreamAudioSourceNode }).__bollardSource;
      delete (window as unknown as { __bollardCtx?: AudioContext }).__bollardCtx;
    }
    this.processor = null;
    this.sink = null;
    this.source = null;
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
