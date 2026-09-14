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
}

function floatToS16(input: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out.buffer;
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
      // Context at 16 kHz makes the browser resample the mic feed for us.
      this.ctx = new AudioContext({ sampleRate: 16000 });
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
      let frame = 0;
      this.processor.onaudioprocess = (e) => {
        const samples = e.inputBuffer.getChannelData(0);
        if (this.state === "listening") {
          const pcm = floatToS16(samples);
          this.client.sendAudio(pcm);
          if (frame++ % 8 === 0) {
            let sum = 0;
            for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
            this.cbs.onLevel?.(Math.sqrt(sum / samples.length));
          }
        }
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
    } catch (e) {
      await this.stop();
      this.setState("error", e instanceof Error ? e.message : "Could not open the microphone");
    }
  }

  async stop(): Promise<void> {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
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
    this.setState("idle");
  }
}
