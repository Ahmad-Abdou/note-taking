/* eslint-disable no-console */

// Generates simple mono 16-bit PCM WAV files for the notification sound system.
// This avoids missing-asset errors in dev builds and keeps extension + desktop in sync.

const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();

const outputDirs = [
  path.join(workspaceRoot, 'productivity', 'sounds'),
  path.join(workspaceRoot, 'productivity-desktop', 'renderer', 'sounds')
];

const sampleRate = 44100;

// Match NotificationSounds.soundTypes in productivity/notification-sounds.js
const patterns = {
  default: [{ f: 880, d: 0.06 }],
  reminder: [{ f: 660, d: 0.08 }, { f: 660, d: 0.08 }],
  success: [{ f: 880, d: 0.07 }, { f: 1175, d: 0.09 }],
  warning: [{ f: 440, d: 0.09 }, { f: 392, d: 0.1 }],
  focusStart: [{ f: 523, d: 0.1 }, { f: 784, d: 0.1 }],
  focusEnd: [{ f: 784, d: 0.1 }, { f: 523, d: 0.1 }],
  break: [{ f: 330, d: 0.12 }],
  achievement: [{ f: 659, d: 0.08 }, { f: 784, d: 0.08 }, { f: 988, d: 0.1 }],
  streak: [{ f: 740, d: 0.08 }, { f: 932, d: 0.1 }],
  ping: [{ f: 988, d: 0.06 }],
  message: [{ f: 880, d: 0.06 }],
  ding: [{ f: 1046, d: 0.09 }],
  chime: [{ f: 784, d: 0.08 }, { f: 1046, d: 0.1 }]
};

const soundTypes = Object.keys(patterns);

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
  buffer.writeUInt32LE(16, 16); // PCM header size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < floatSamples.length; i++) {
    buffer.writeInt16LE(floatToInt16(floatSamples[i]), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function synth(type) {
  const seq = patterns[type] || patterns.default;
  const gapSeconds = 0.015;

  const totalSeconds =
    seq.reduce((sum, p) => sum + p.d, 0) + gapSeconds * (seq.length - 1) + 0.05;

  const length = Math.max(1, Math.floor(totalSeconds * sampleRate));
  const out = new Float32Array(length);

  let cursor = 0;
  for (const p of seq) {
    const segLen = Math.floor(p.d * sampleRate);
    const attack = Math.floor(segLen * 0.12);
    const release = Math.floor(segLen * 0.25);
    const sustainLen = Math.max(0, segLen - attack - release);

    for (let i = 0; i < segLen && cursor + i < out.length; i++) {
      const t = i / sampleRate;
      const phase = 2 * Math.PI * p.f * t;

      let env = 1;
      if (i < attack) env = i / Math.max(1, attack);
      else if (i < attack + sustainLen) env = 1;
      else {
        const r = (i - attack - sustainLen) / Math.max(1, release);
        env = 1 - r;
      }

      out[cursor + i] += Math.sin(phase) * env * 0.35;
    }

    cursor += segLen + Math.floor(gapSeconds * sampleRate);
  }

  for (let i = 0; i < out.length; i++) {
    out[i] = Math.tanh(out[i]);
  }

  return Array.from(out);
}

for (const dir of outputDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

for (const type of soundTypes) {
  const samples = synth(type);
  for (const dir of outputDirs) {
    writeWavPCM16Mono(path.join(dir, `${type}.wav`), samples);
  }
}

console.log('Generated WAV sounds:', soundTypes.join(', '));
