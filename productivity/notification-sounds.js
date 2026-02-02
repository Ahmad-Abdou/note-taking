/**
 * Notification Sound System (procedural, commercial-safe)
 * Generates clean UI chimes via Web Audio API (no audio files).
 */

let audioContext = null;

// Make UI sounds feel less "fast" and more like modern productivity apps.
// These scale note spacing and duration without changing pitch.
const SOUND_TIMING = {
    default: { time: 1.20, dur: 1.05 },
    reminder: { time: 1.20, dur: 1.05 },
    success: { time: 1.20, dur: 1.05 },
    warning: { time: 1.20, dur: 1.05 },
    focusStart: { time: 1.25, dur: 1.10 },
    focusEnd: { time: 1.25, dur: 1.10 },
    break: { time: 1.20, dur: 1.05 },
    achievement: { time: 1.20, dur: 1.05 },
    streak: { time: 1.20, dur: 1.05 },
    // Keep these relatively snappy so they don't feel laggy.
    ping: { time: 1.05, dur: 1.00 },
    message: { time: 1.05, dur: 1.00 },
    ding: { time: 1.10, dur: 1.00 },
    chime: { time: 1.20, dur: 1.05 }
};

function getTiming(type) {
    return SOUND_TIMING[type] || SOUND_TIMING.default;
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Always try to resume if suspended
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    return audioContext;
}

// Auto-initialize audio context on any user interaction
let audioInitialized = false;
function setupAudioInit() {
    if (audioInitialized) return;
    const initOnInteraction = () => {
        initAudioContext();
        audioInitialized = true;
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('keydown', initOnInteraction);
        document.removeEventListener('touchstart', initOnInteraction);
    };
    document.addEventListener('click', initOnInteraction, { once: true, passive: true });
    document.addEventListener('keydown', initOnInteraction, { once: true, passive: true });
    document.addEventListener('touchstart', initOnInteraction, { once: true, passive: true });
}

// Initialize on load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAudioInit);
    } else {
        setupAudioInit();
    }
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

let reverbForContext = null;
let cachedReverb = null;

function createImpulseResponse(ctx, seconds = 0.75, decay = 3.2) {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            const t = i / length;
            const env = Math.pow(1 - t, decay);
            // Slight channel variation for stereo width.
            const noise = (Math.random() * 2 - 1) * (channel === 0 ? 1 : 0.92);
            data[i] = noise * env;
        }
    }
    return impulse;
}

function getReverbNode(ctx) {
    if (reverbForContext !== ctx || !cachedReverb) {
        reverbForContext = ctx;
        cachedReverb = ctx.createConvolver();
        cachedReverb.buffer = createImpulseResponse(ctx);
    }
    return cachedReverb;
}

function createMasterChain(ctx) {
    const input = ctx.createGain();
    input.gain.value = 1;

    const dry = ctx.createGain();
    dry.gain.value = 1;

    const wet = ctx.createGain();
    wet.gain.value = 0.12;

    const wetLP = ctx.createBiquadFilter();
    wetLP.type = 'lowpass';
    wetLP.frequency.setValueAtTime(5200, ctx.currentTime);
    wetLP.Q.setValueAtTime(0.7, ctx.currentTime);

    const mix = ctx.createGain();
    mix.gain.value = 1;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, ctx.currentTime);
    compressor.knee.setValueAtTime(24, ctx.currentTime);
    compressor.ratio.setValueAtTime(3.2, ctx.currentTime);
    compressor.attack.setValueAtTime(0.004, ctx.currentTime);
    compressor.release.setValueAtTime(0.20, ctx.currentTime);

    // Dry/wet reverb mix.
    input.connect(dry);
    dry.connect(mix);

    const convolver = getReverbNode(ctx);
    input.connect(convolver);
    convolver.connect(wetLP);
    wetLP.connect(wet);
    wet.connect(mix);

    mix.connect(compressor);
    compressor.connect(ctx.destination);

    return input;
}

function playChimeVoice(ctx, master, startTime, frequency, duration, volume) {
    const baseFreq = Math.max(80, frequency);
    const dur = Math.max(0.18, duration);
    const vol = clamp01(volume);

    const attack = 0.015;
    const settle = Math.min(0.22, dur * 0.40);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(vol, startTime + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.28), startTime + settle);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(90, startTime);
    hp.Q.setValueAtTime(0.7, startTime);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, startTime);
    lp.Q.setValueAtTime(0.8, startTime);

    const mix = ctx.createGain();
    mix.gain.value = 1;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, startTime);
    osc1.detune.setValueAtTime(-3, startTime);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(1.0, startTime);
    osc1.connect(g1);
    g1.connect(mix);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 2, startTime);
    osc2.detune.setValueAtTime(2, startTime);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22, startTime);
    osc2.connect(g2);
    g2.connect(mix);

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(baseFreq * 3, startTime);
    osc3.detune.setValueAtTime(-1, startTime);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.12, startTime);
    osc3.connect(g3);
    g3.connect(mix);

    // Subtle sparkle transient.
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(baseFreq * 6, startTime);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(vol * 0.06, startTime);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(0.12, dur * 0.35));
    shimmer.connect(shimmerGain);
    shimmerGain.connect(mix);

    mix.connect(env);
    env.connect(hp);
    hp.connect(lp);
    lp.connect(master);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);
    shimmer.start(startTime);

    const stopAt = startTime + dur + 0.35;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    osc3.stop(stopAt);
    shimmer.stop(stopAt);
}

function playSequence(type, volume = 0.35) {
    const ctx = initAudioContext();
    if (!ctx) {
        console.warn('AudioContext not available');
        return;
    }
    // Ensure context is running
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    const master = createMasterChain(ctx);
    const vol = clamp01(volume);
    const now = ctx.currentTime;
    const timing = getTiming(type);

    const patterns = {
        default: [
            { f: 523.25, t: 0.0, d: 0.55, v: 1.0 },
            { f: 659.25, t: 0.18, d: 0.75, v: 0.85 }
        ],
        reminder: [
            { f: 392.00, t: 0.0, d: 0.60, v: 0.85 },
            { f: 523.25, t: 0.22, d: 0.85, v: 0.75 }
        ],
        success: [
            { f: 523.25, t: 0.0, d: 0.34, v: 0.85 },
            { f: 659.25, t: 0.14, d: 0.36, v: 0.90 },
            { f: 783.99, t: 0.28, d: 0.95, v: 1.0 }
        ],
        warning: [
            { f: 392.00, t: 0.0, d: 0.48, v: 0.90 },
            { f: 311.13, t: 0.22, d: 0.85, v: 0.75 }
        ],
        focusStart: [
            { f: 392.00, t: 0.0, d: 0.70, v: 0.80 },
            { f: 493.88, t: 0.26, d: 0.95, v: 0.70 }
        ],
        focusEnd: [
            { f: 659.25, t: 0.0, d: 0.52, v: 0.80 },
            { f: 523.25, t: 0.22, d: 0.62, v: 0.72 },
            { f: 392.00, t: 0.42, d: 1.05, v: 0.66 }
        ],
        break: [
            { f: 440.00, t: 0.0, d: 0.42, v: 0.75 },
            { f: 523.25, t: 0.16, d: 0.42, v: 0.75 },
            { f: 659.25, t: 0.32, d: 0.92, v: 0.70 }
        ],
        achievement: [
            { f: 659.25, t: 0.0, d: 0.26, v: 0.80 },
            { f: 880.00, t: 0.12, d: 0.32, v: 0.90 },
            { f: 1046.50, t: 0.28, d: 1.10, v: 1.0 }
        ],
        streak: [
            { f: 523.25, t: 0.0, d: 0.26, v: 0.80 },
            { f: 659.25, t: 0.12, d: 0.30, v: 0.80 },
            { f: 783.99, t: 0.24, d: 0.92, v: 0.90 }
        ],
        ping: [
            { f: 1046.50, t: 0.0, d: 0.38, v: 0.70 }
        ],
        message: [
            { f: 783.99, t: 0.0, d: 0.28, v: 0.65 },
            { f: 1046.50, t: 0.14, d: 0.62, v: 0.60 }
        ],
        ding: [
            { f: 659.25, t: 0.0, d: 0.90, v: 0.78 }
        ],
        chime: [
            { f: 523.25, t: 0.0, d: 0.62, v: 0.80 },
            { f: 783.99, t: 0.22, d: 1.02, v: 0.70 }
        ]
    };

    const seq = patterns[type] || patterns.default;
    for (const n of seq) {
        playChimeVoice(ctx, master, now + (n.t * timing.time), n.f, (n.d * timing.dur), vol * n.v);
    }
}

const SOUND_FUNCTIONS = {
    reminder: (v) => playSequence('reminder', v),
    success: (v) => playSequence('success', v),
    focusStart: (v) => playSequence('focusStart', v),
    focusEnd: (v) => playSequence('focusEnd', v),
    warning: (v) => playSequence('warning', v),
    break: (v) => playSequence('break', v),
    achievement: (v) => playSequence('achievement', v),
    streak: (v) => playSequence('streak', v),
    ding: (v) => playSequence('ding', v),
    chime: (v) => playSequence('chime', v),
    ping: (v) => playSequence('ping', v),
    message: (v) => playSequence('message', v),
    default: (v) => playSequence('default', v)
};

function playNotificationSound(type = 'default', volume = 0.35) {
    try {
        const fn = SOUND_FUNCTIONS[type] || SOUND_FUNCTIONS.default;
        fn(volume);
        return true;
    } catch (e) {
        console.error('Failed to play notification sound:', e);
        return false;
    }
}

async function testAllSounds() {
    const types = Object.keys(SOUND_FUNCTIONS);
    for (const type of types) {
        playNotificationSound(type, 0.4);
        await new Promise(resolve => setTimeout(resolve, 1800));
    }
}

window.NotificationSounds = {
    play: playNotificationSound,
    init: initAudioContext,
    testAll: testAllSounds,
    types: Object.keys(SOUND_FUNCTIONS),
    ding: (v = 0.35) => playSequence('ding', v),
    chime: (v = 0.35) => playSequence('chime', v),
    success: (v = 0.35) => playSequence('success', v),
    ping: (v = 0.35) => playSequence('ping', v),
    reminder: (v = 0.35) => playSequence('reminder', v),
    break: (v = 0.35) => playSequence('break', v),
    focusStart: (v = 0.35) => playSequence('focusStart', v),
    focusEnd: (v = 0.35) => playSequence('focusEnd', v),
    achievement: (v = 0.35) => playSequence('achievement', v),
    streak: (v = 0.35) => playSequence('streak', v),
    warning: (v = 0.35) => playSequence('warning', v),
    message: (v = 0.35) => playSequence('message', v)
};