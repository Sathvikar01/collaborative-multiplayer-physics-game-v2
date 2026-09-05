/* Procedural WebAudio sound effects + a light music loop. No asset files needed. */

export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  musicOn = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private lastPlay = new Map<string, number>();
  private nextBeat = 0;
  private beatIdx = 0;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambientSources: AudioScheduledSourceNode[] = [];
  private ambientLfos: OscillatorNode[] = [];
  private ambienceStarted = false;
  private muted = false;
  private delayedTimers = new Set<ReturnType<typeof setTimeout>>();

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "closed") {
        this.ctx = null;
        this.master = null;
        this.sfx = null;
        this.music = null;
        this.noiseBuf = null;
        this.compressor = null;
        this.limiter = null;
        this.reverb = null;
        this.reverbSend = null;
        this.reverbReturn = null;
        this.ambience = null;
        this.ambientSources = [];
        this.ambientLfos = [];
        this.ambienceStarted = false;
        this.musicOn = false;
        if (this.musicTimer) clearInterval(this.musicTimer);
        this.musicTimer = null;
      } else {
        this.startAmbience();
        if (this.ctx.state === "suspended") void this.ctx.resume();
        return;
      }
    }
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;

    // Keep the public master node as a gain, then tame the occasional stack of
    // impact transients before it reaches the speakers.
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.master.connect(this.compressor).connect(this.limiter).connect(this.ctx.destination);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.28;
    this.music.connect(this.master);

    // A short synthetic room makes dry procedural sounds feel like they occupy
    // the same physical space. The impulse is generated once and shared.
    this.reverb = this.ctx.createConvolver();
    const reverbLength = Math.floor(this.ctx.sampleRate * 0.7);
    const impulse = this.ctx.createBuffer(2, reverbLength, this.ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const impulseData = impulse.getChannelData(channel);
      for (let i = 0; i < reverbLength; i++) {
        const decay = Math.pow(1 - i / reverbLength, 2.4);
        impulseData[i] = (Math.random() * 2 - 1) * decay * 0.7;
      }
    }
    this.reverb.buffer = impulse;
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.14;
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.2;
    this.sfx.connect(this.reverbSend);
    this.music.connect(this.reverbSend);
    this.reverbSend.connect(this.reverb).connect(this.reverbReturn).connect(this.master);

    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0.72;
    this.ambience.connect(this.master);

    // Four seconds gives the looping ambience enough variation without keeping
    // a large buffer around. A zeroed seam avoids a click at the loop boundary.
    const len = this.ctx.sampleRate * 4;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    d[0] = 0;
    d[len - 1] = 0;
    this.startAmbience();
  }

  private startAmbience() {
    if (this.ambienceStarted || !this.ctx || !this.ambience || !this.noiseBuf) return;
    this.ambienceStarted = true;
    const ctx = this.ctx;

    // Low room tone: barely audible, but prevents silences from feeling like a
    // disconnected browser tab.
    const room = ctx.createBufferSource();
    room.buffer = this.noiseBuf;
    room.loop = true;
    room.playbackRate.value = 0.38;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 180;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.022;
    room.connect(roomFilter).connect(roomGain).connect(this.ambience);
    room.start();
    this.ambientSources.push(room);

    // A slow, filtered bed reads as wind without becoming a constant hiss.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    wind.playbackRate.value = 0.55;
    const windHighpass = ctx.createBiquadFilter();
    windHighpass.type = "highpass";
    windHighpass.frequency.value = 110;
    const windBand = ctx.createBiquadFilter();
    windBand.type = "bandpass";
    windBand.frequency.value = 520;
    windBand.Q.value = 0.55;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.026;
    wind.connect(windHighpass).connect(windBand).connect(windGain).connect(this.ambience);
    wind.start();
    this.ambientSources.push(wind);
    const windLfo = ctx.createOscillator();
    windLfo.type = "sine";
    windLfo.frequency.value = 0.065;
    const windDepth = ctx.createGain();
    windDepth.gain.value = 260;
    windLfo.connect(windDepth).connect(windBand.frequency);
    windLfo.start();
    this.ambientLfos.push(windLfo);

    // Water is brighter and more irregular than the wind layer. The separate
    // band keeps it recognizable while staying quiet under gameplay sounds.
    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuf;
    water.loop = true;
    water.playbackRate.value = 1.15;
    const waterHighpass = ctx.createBiquadFilter();
    waterHighpass.type = "highpass";
    waterHighpass.frequency.value = 160;
    const waterLowpass = ctx.createBiquadFilter();
    waterLowpass.type = "lowpass";
    waterLowpass.frequency.value = 1450;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.018;
    water.connect(waterHighpass).connect(waterLowpass).connect(waterGain).connect(this.ambience);
    water.start();
    this.ambientSources.push(water);
  }

  private stopAmbience() {
    if (!this.ambienceStarted) return;
    this.ambienceStarted = false;
    for (const source of this.ambientSources) {
      try {
        source.stop();
      } catch {
        // A source can already be stopped by the browser during context close.
      }
      source.disconnect();
    }
    for (const lfo of this.ambientLfos) {
      try {
        lfo.stop();
      } catch {
        // See the source cleanup above.
      }
      lfo.disconnect();
    }
    this.ambientSources = [];
    this.ambientLfos = [];
  }

  /** Release the context and any delayed celebratory notes when the game unmounts. */
  dispose() {
    this.stopMusic();
    this.stopAmbience();
    for (const timer of this.delayedTimers) clearTimeout(timer);
    this.delayedTimers.clear();
    const context = this.ctx;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.noiseBuf = null;
    this.compressor = null;
    this.limiter = null;
    this.reverb = null;
    this.reverbSend = null;
    this.reverbReturn = null;
    this.ambience = null;
    this.musicOn = false;
    if (context && context.state !== "closed") void context.close();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.018);
    }
  }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? -1e9;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.delayedTimers.delete(timer);
      fn();
    }, ms);
    this.delayedTimers.add(timer);
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; attack?: number; dest?: AudioNode } = {}) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = opts.type ?? "sine";
    o.detune.value = (Math.random() - 0.5) * 5;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const g = this.ctx.createGain();
    const attack = Math.min(opts.attack ?? 0.005, dur * 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + Math.max(0.001, attack));
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur * 0.5), Math.max(0.008, dur * 0.18));
    o.connect(g).connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { vol?: number; lp?: number; hp?: number; slideLp?: number; attack?: number } = {}) {
    if (!this.ctx || !this.sfx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(opts.lp ?? 1200, t);
    if (opts.slideLp) lp.frequency.exponentialRampToValueAtTime(opts.slideLp, t + dur);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.hp ?? 80;
    const g = this.ctx.createGain();
    const attack = Math.min(opts.attack ?? 0.008, dur * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + Math.max(0.001, attack));
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur * 0.35), Math.max(0.012, dur * 0.22));
    s.connect(lp).connect(hp).connect(g).connect(this.sfx);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  step() {
    if (!this.throttle("step", 90)) return;
    this.noise(0.09, { vol: 0.1, lp: 900, hp: 150, attack: 0.003 });
    this.noise(0.028, { vol: 0.045, lp: 3200, hp: 900, attack: 0.001 });
    this.tone(90 + Math.random() * 30, 0.1, { type: "sine", vol: 0.11, slide: 0.48 });
  }
  thud(intensity = 1) {
    if (!this.throttle("thud", 70)) return;
    const v = Math.max(0, Math.min(1, intensity));
    // A soft sub body, a mid-frequency knock, and a short surface transient
    // read more like an object hitting the world than a single synth note.
    this.noise(0.18, { vol: 0.2 * v, lp: 500, hp: 38 });
    this.tone(58 + Math.random() * 8, 0.28, { type: "sine", vol: 0.28 * v, slide: 0.34 });
    this.tone(112, 0.09, { type: "triangle", vol: 0.1 * v, slide: 0.55, attack: 0.002 });
    this.noise(0.035, { vol: 0.075 * v, lp: 2800, hp: 650, attack: 0.001 });
  }
  grab() {
    this.tone(250, 0.07, { type: "square", vol: 0.045, slide: 1.55, attack: 0.002 });
    this.noise(0.045, { vol: 0.055, lp: 2500, hp: 900, attack: 0.001 });
  }
  release() {
    this.tone(340, 0.09, { type: "square", vol: 0.04, slide: 0.62, attack: 0.002 });
    this.noise(0.025, { vol: 0.035, lp: 3400, hp: 1300, attack: 0.001 });
  }
  whoosh() {
    this.noise(0.3, { vol: 0.2, lp: 400, slideLp: 3500, hp: 180 });
    this.tone(95, 0.28, { type: "sine", vol: 0.035, slide: 1.8 });
  }
  jump() {
    this.tone(190, 0.27, { type: "triangle", vol: 0.13, slide: 2.25 });
    this.noise(0.12, { vol: 0.09, lp: 1500, hp: 180 });
  }
  kick() {
    this.noise(0.12, { vol: 0.15, lp: 700, slideLp: 200, hp: 55 });
    this.tone(72, 0.12, { type: "sine", vol: 0.1, slide: 0.42, attack: 0.002 });
  }
  fall() {
    this.tone(300, 0.5, { type: "sawtooth", vol: 0.06, slide: 0.25 });
    this.noise(0.3, { vol: 0.17, lp: 600, hp: 60 });
  }
  getup() {
    this.tone(200, 0.25, { type: "triangle", vol: 0.09, slide: 1.8 });
  }
  quack() {
    if (!this.throttle("quack", 150)) return;
    const f = 230 + Math.random() * 28;

    // A quick nasal voice, falling formant, and tiny beak transient make a
    // recognizable duck call without letting the deliberately goofy sound
    // become harsh or tiring during repeated multiplayer reactions.
    this.tone(f, 0.16, { type: "triangle", vol: 0.1, slide: 0.64, attack: 0.002 });
    this.tone(f * 1.72, 0.12, { type: "square", vol: 0.035, slide: 0.55, attack: 0.001 });
    this.noise(0.13, { vol: 0.055, lp: 1750, hp: 430, slideLp: 760, attack: 0.002 });
    this.noise(0.022, { vol: 0.026, lp: 4800, hp: 1900, attack: 0.001 });
  }
  shout() {
    // Kept as an alias so existing call sites get the new character sound.
    this.quack();
  }
  splash() {
    this.noise(0.6, { vol: 0.25, lp: 1800, slideLp: 300, hp: 100 });
    this.noise(0.18, { vol: 0.13, lp: 5000, slideLp: 1200, hp: 1200, attack: 0.002 });
    this.tone(150, 0.42, { type: "sine", vol: 0.12, slide: 0.28 });
  }
  crack() {
    this.noise(0.25, { vol: 0.26, lp: 4000, slideLp: 800, hp: 400 });
    this.noise(0.045, { vol: 0.12, lp: 6500, hp: 2200, attack: 0.001 });
    this.tone(900, 0.1, { type: "square", vol: 0.07, slide: 0.3, attack: 0.001 });
  }
  checkpoint() {
    this.tone(660, 0.12, { type: "triangle", vol: 0.15 });
    this.later(() => this.tone(880, 0.2, { type: "triangle", vol: 0.15 }), 90);
  }
  score() {
    [523, 659, 784, 1046].forEach((f, i) => this.later(() => this.tone(f, 0.18, { type: "triangle", vol: 0.14 }), i * 70));
  }
  beep(final = false) {
    this.tone(final ? 880 : 440, final ? 0.5 : 0.15, { type: "square", vol: 0.12 });
  }
  fanfare() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((f, i) => this.later(() => this.tone(f, i === notes.length - 1 ? 0.7 : 0.18, { type: "square", vol: 0.1 }), i * 110));
    this.later(() => this.noise(1.6, { vol: 0.15, lp: 3000, hp: 800 }), 300);
  }
  climb() {
    this.noise(0.1, { vol: 0.1, lp: 1500, hp: 300 });
  }

  // ---- music loop ----
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.music?.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.025);
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beatIdx = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 100);
  }
  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.music && this.ctx) this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.025);
  }
  private scheduleMusic() {
    if (!this.ctx || !this.music) return;
    const bpm = 128;
    const beat = 60 / bpm / 2; // eighth notes
    const bass = [110, 110, 138.6, 138.6, 164.8, 164.8, 146.8, 146.8];
    const arp = [440, 554, 659, 554, 659, 830, 659, 554, 493, 587, 740, 587, 740, 880, 740, 587];
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      const t = this.nextBeat;
      const i = this.beatIdx;
      const bar = Math.floor(i / 8) % 4;
      // bass every 2 eighths
      if (i % 2 === 0) {
        const f = bass[(bar * 2 + Math.floor((i % 8) / 4)) % bass.length];
        this.schedTone(f, t, beat * 1.6, "triangle", 0.5);
      }
      // arp
      const af = arp[(bar * 4 + (i % 16)) % arp.length];
      this.schedTone(af, t, beat * 0.8, "square", 0.08);
      // hat
      if (i % 2 === 1) this.schedNoise(t, 0.04, 0.06);
      // kick
      if (i % 4 === 0) this.schedTone(60, t, 0.15, "sine", 0.6, 0.3);
      this.nextBeat += beat;
      this.beatIdx++;
    }
  }
  private schedTone(f: number, t: number, dur: number, type: OscillatorType, vol: number, slide = 1) {
    if (!this.ctx || !this.music) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private schedNoise(t: number, dur: number, vol: number) {
    if (!this.ctx || !this.music || !this.noiseBuf) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp).connect(g).connect(this.music);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
}
