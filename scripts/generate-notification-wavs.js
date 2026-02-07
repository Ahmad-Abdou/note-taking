/* eslint-disable no-console */

// Generates pleasant, melodic notification WAV files (TickTick-inspired but unique).
// Uses rich multi-harmonic synthesis with proper ADSR envelopes and reverb-like tails.
// Outputs to both extension and desktop sound folders.

const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();

const outputDirs = [
  path.join(workspaceRoot, 'productivity', 'sounds'),
  path.join(workspaceRoot, 'productivity-desktop', 'renderer', 'sounds')
];

const SR = 44100;

// ── Helpers ──────────────────────────────────────────────────────────────────

function floatToInt16(x) {
  const v = Math.max(-1, Math.min(1, x));
  return v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
}

function writeWavPCM16Mono(filePath, floatSamples) {
  const dataBytes = floatSamples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < floatSamples.length; i++) {
    buffer.writeInt16LE(floatToInt16(floatSamples[i]), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

/** ADSR envelope (all times in seconds) */
function adsr(t, a, d, sLvl, sDur, r, totalDur) {
  if (t < 0) return 0;
  if (t < a) return t / a;                                  // attack
  t -= a;
  if (t < d) return 1 - (1 - sLvl) * (t / d);              // decay
  t -= d;
  if (t < sDur) return sLvl;                                // sustain
  t -= sDur;
  if (t < r) return sLvl * (1 - t / r);                     // release
  return 0;
}

/** Bell/chime tone: fundamental + inharmonic partials with individual decay */
function bellTone(t, freq, amp, decay) {
  const partials = [
    { ratio: 1.0, amp: 1.0, decay: 1.0 },
    { ratio: 2.0, amp: 0.45, decay: 0.8 },
    { ratio: 3.0, amp: 0.18, decay: 0.55 },
    { ratio: 4.16, amp: 0.12, decay: 0.4 },    // slightly inharmonic — bell character
    { ratio: 5.43, amp: 0.06, decay: 0.3 },
    { ratio: 6.8, amp: 0.03, decay: 0.2 },
  ];
  let v = 0;
  for (const p of partials) {
    const env = Math.exp(-t / (decay * p.decay));
    v += Math.sin(2 * Math.PI * freq * p.ratio * t) * p.amp * env;
  }
  return v * amp;
}

/** Marimba-like tone: warm with fast attack, medium decay */
function marimbaTone(t, freq, amp, decay) {
  const env = Math.exp(-t / decay);
  const attackEnv = 1 - Math.exp(-t * 80); // fast percussive attack
  return (
    Math.sin(2 * Math.PI * freq * t) * 0.6 +
    Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 * Math.exp(-t / (decay * 0.5)) +
    Math.sin(2 * Math.PI * freq * 3 * t) * 0.08 * Math.exp(-t / (decay * 0.3)) +
    Math.sin(2 * Math.PI * freq * 4 * t) * 0.04 * Math.exp(-t / (decay * 0.15))
  ) * env * attackEnv * amp;
}

/** Celesta/glockenspiel: bright, shimmery */
function celestaTone(t, freq, amp, decay) {
  const env = Math.exp(-t / decay);
  const brightness = Math.exp(-t / (decay * 0.3));
  return (
    Math.sin(2 * Math.PI * freq * t) * 0.5 +
    Math.sin(2 * Math.PI * freq * 2 * t) * 0.3 * brightness +
    Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.12 * brightness +
    Math.sin(2 * Math.PI * freq * 5.02 * t) * 0.05 * Math.exp(-t / (decay * 0.15))
  ) * env * amp;
}

/** Soft pad tone for gentle backgrounds */
function padTone(t, freq, amp, attack, decay) {
  const env = (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
  return (
    Math.sin(2 * Math.PI * freq * t) * 0.5 +
    Math.sin(2 * Math.PI * freq * 2.005 * t) * 0.2 +  // slight detune for warmth
    Math.sin(2 * Math.PI * freq * 0.998 * t) * 0.15
  ) * env * amp;
}

/** Simple reverb simulation via multi-tap delay */
function addReverb(samples, mix = 0.2, decayFactor = 0.4) {
  const out = new Float32Array(samples.length);
  const taps = [
    { delay: Math.floor(0.023 * SR), gain: 0.6 },
    { delay: Math.floor(0.041 * SR), gain: 0.45 },
    { delay: Math.floor(0.067 * SR), gain: 0.3 },
    { delay: Math.floor(0.098 * SR), gain: 0.2 },
    { delay: Math.floor(0.131 * SR), gain: 0.12 },
  ];
  for (let i = 0; i < samples.length; i++) {
    let wet = 0;
    for (const tap of taps) {
      const idx = i - tap.delay;
      if (idx >= 0) wet += out[idx] * tap.gain * decayFactor;
    }
    out[i] = samples[i] + wet * mix;
  }
  return out;
}

/** Normalize peak to target amplitude */
function normalize(samples, target = 0.85) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const scale = target / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  }
  return samples;
}

/** Musical note frequencies (A4 = 440) */
const NOTE = {};
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
for (let octave = 3; octave <= 7; octave++) {
  for (let i = 0; i < 12; i++) {
    const midi = (octave + 1) * 12 + i;
    NOTE[`${noteNames[i]}${octave}`] = 440 * Math.pow(2, (midi - 69) / 12);
  }
}

// ── Sound Definitions ────────────────────────────────────────────────────────
// Durations auto-calculated: last note start + 3.5× decay + reverb tail.
// This ensures the full decay rings out naturally with no cutoff.

/** Calculate buffer length from notes so decay tails never get cut */
function calcDuration(notes, reverbTail = 0.25) {
  let maxEnd = 0;
  for (const n of notes) {
    // 3.5 time constants ≈ 97% decay — sounds fully natural
    const noteEnd = n.start + n.decay * 3.5;
    if (noteEnd > maxEnd) maxEnd = noteEnd;
  }
  return maxEnd + reverbTail;
}

const sounds = {};

// DEFAULT — gentle two-note bell chime (rising minor 3rd)
sounds.default = () => {
  const notes = [
    { freq: NOTE['E5'], start: 0, decay: 0.5 },
    { freq: NOTE['G5'], start: 0.15, decay: 0.55 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += bellTone(nt, n.freq, 0.35, n.decay);
    }
  }
  return addReverb(normalize(out), 0.25);
};

// REMINDER — xylophone-like double tap with gentle emphasis
sounds.reminder = () => {
  const notes = [
    { freq: NOTE['A5'], start: 0, decay: 0.3 },
    { freq: NOTE['E5'], start: 0.18, decay: 0.3 },
    { freq: NOTE['A5'], start: 0.38, decay: 0.45 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += marimbaTone(nt, n.freq, 0.35, n.decay);
    }
  }
  return addReverb(normalize(out), 0.2);
};

// SUCCESS — bright ascending arpeggio (C-E-G-C), triumphant feel
sounds.success = () => {
  const notes = [
    { freq: NOTE['C5'], start: 0, decay: 0.5 },
    { freq: NOTE['E5'], start: 0.12, decay: 0.5 },
    { freq: NOTE['G5'], start: 0.24, decay: 0.55 },
    { freq: NOTE['C6'], start: 0.38, decay: 0.65 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += celestaTone(nt, n.freq, 0.3, n.decay);
    }
  }
  return addReverb(normalize(out), 0.25);
};

// WARNING — two low-mid tones with gentle urgency (D-Bb)
sounds.warning = () => {
  const notes = [
    { freq: NOTE['D4'], start: 0, decay: 0.25 },
    { freq: NOTE['A#4'], start: 0.2, decay: 0.35 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += marimbaTone(nt, n.freq, 0.4, n.decay);
    }
  }
  return addReverb(normalize(out), 0.15);
};

// FOCUS START — uplifting rising chime (G-B-D), energizing
sounds.focusStart = () => {
  const notes = [
    { freq: NOTE['G4'], start: 0, decay: 0.4 },
    { freq: NOTE['B4'], start: 0.15, decay: 0.45 },
    { freq: NOTE['D5'], start: 0.3, decay: 0.6 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += bellTone(nt, n.freq, 0.32, n.decay);
    }
  }
  return addReverb(normalize(out), 0.25);
};

// FOCUS END — calm descending resolution (D-B-G), settling
sounds.focusEnd = () => {
  const notes = [
    { freq: NOTE['D5'], start: 0, decay: 0.45 },
    { freq: NOTE['B4'], start: 0.18, decay: 0.45 },
    { freq: NOTE['G4'], start: 0.36, decay: 0.65 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += bellTone(nt, n.freq, 0.3, n.decay);
    }
  }
  return addReverb(normalize(out), 0.3);
};

// BREAK — warm, relaxing two-note chime (F-A), soothing
sounds.break = () => {
  const notes = [
    { freq: NOTE['F4'], start: 0, decay: 0.55 },
    { freq: NOTE['A4'], start: 0.25, decay: 0.65 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) {
        // Warm pad-like tone for relaxation
        out[i] += padTone(nt, n.freq, 0.35, 0.08, n.decay);
        out[i] += bellTone(nt, n.freq, 0.15, n.decay * 0.7);
      }
    }
  }
  return addReverb(normalize(out), 0.3);
};

// ACHIEVEMENT — fanfare-like rising sequence (C-E-G-C high), celebratory
sounds.achievement = () => {
  const notes = [
    { freq: NOTE['C5'], start: 0, decay: 0.35 },
    { freq: NOTE['E5'], start: 0.1, decay: 0.35 },
    { freq: NOTE['G5'], start: 0.2, decay: 0.4 },
    { freq: NOTE['C6'], start: 0.32, decay: 0.5 },
    { freq: NOTE['E6'], start: 0.45, decay: 0.7 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += celestaTone(nt, n.freq, 0.28, n.decay);
    }
  }
  return addReverb(normalize(out), 0.3);
};

// STREAK — quick bright ascending pair, rewarding
sounds.streak = () => {
  const notes = [
    { freq: NOTE['A5'], start: 0, decay: 0.3 },
    { freq: NOTE['C#6'], start: 0.12, decay: 0.45 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += celestaTone(nt, n.freq, 0.35, n.decay);
    }
  }
  return addReverb(normalize(out), 0.2);
};

// PING — single bright bell tap, clean
sounds.ping = () => {
  const notes = [{ freq: NOTE['E6'], start: 0, decay: 0.35 }];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = bellTone(t, notes[0].freq, 0.4, notes[0].decay);
  }
  return addReverb(normalize(out), 0.2);
};

// MESSAGE — friendly two-note notification (like a gentle "ding-dong")
sounds.message = () => {
  const notes = [
    { freq: NOTE['G5'], start: 0, decay: 0.3 },
    { freq: NOTE['E5'], start: 0.15, decay: 0.4 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += marimbaTone(nt, n.freq, 0.35, n.decay);
    }
  }
  return addReverb(normalize(out), 0.2);
};

// DING — single resonant bell hit, classic
sounds.ding = () => {
  const notes = [{ freq: NOTE['C6'], start: 0, decay: 0.45 }];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = bellTone(t, notes[0].freq, 0.4, notes[0].decay);
  }
  return addReverb(normalize(out), 0.25);
};

// CHIME — three-note wind chime (E-G#-B), airy and pleasant
sounds.chime = () => {
  const notes = [
    { freq: NOTE['E5'], start: 0, decay: 0.5 },
    { freq: NOTE['G#5'], start: 0.14, decay: 0.5 },
    { freq: NOTE['B5'], start: 0.28, decay: 0.6 },
  ];
  const len = Math.floor(calcDuration(notes) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    for (const n of notes) {
      const nt = t - n.start;
      if (nt >= 0) out[i] += bellTone(nt, n.freq, 0.3, n.decay);
    }
  }
  return addReverb(normalize(out), 0.3);
};

// ── Generate & Write ─────────────────────────────────────────────────────────

const soundTypes = Object.keys(sounds);

for (const dir of outputDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

for (const type of soundTypes) {
  const samples = sounds[type]();
  // Soft-clip for safety
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i]);
  for (const dir of outputDirs) {
    writeWavPCM16Mono(path.join(dir, `${type}.wav`), Array.from(samples));
  }
  const durationMs = Math.round((samples.length / SR) * 1000);
  console.log(`  ${type}.wav  (${durationMs}ms)`);
}

console.log(`\nGenerated ${soundTypes.length} sounds to ${outputDirs.length} directories.`);
