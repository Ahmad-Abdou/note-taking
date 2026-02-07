/**
 * Notification Sound System (professional audio files)
 * Loads WhatsApp-style notification sounds from audio files.
 * Replaces procedural Web Audio API generation with pre-recorded sounds.
 */

class NotificationSounds {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = {}; // Cache for decoded audio
        this.basePath = this.getBasePath();
        this._missingLogged = new Set();
        this._unknownLogged = new Set();
        this._fileLoadingDisabled = false;
        this.soundTypes = [
            'default', 'reminder', 'success', 'warning',
            'focusStart', 'focusEnd', 'break', 'achievement',
            'streak', 'ping', 'message', 'ding', 'chime'
        ];
    }

    getBasePath() {
        // Detect environment: browser extension vs desktop app
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            // Browser extension - use chrome.runtime.getURL for proper path resolution
            return chrome.runtime.getURL('productivity/sounds/');
        } else {
            // Desktop app (Electron) or local file
            return './sounds/';
        }
    }

    async init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async loadSound(type) {
        // Return cached buffer if available
        if (this.audioBuffers[type]) {
            return this.audioBuffers[type];
        }

        // Ensure we have an AudioContext for decoding/fallback generation
        if (!this.audioContext) {
            await this.init();
        }

        if (this._fileLoadingDisabled) {
            const fallback = this.createFallbackBuffer(type);
            this.audioBuffers[type] = fallback;
            return fallback;
        }

        try {
            // Prefer WAV (generated in-repo) to avoid missing mp3/ogg.
            let url;
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                url = chrome.runtime.getURL(`productivity/sounds/${type}.wav`);
            } else {
                url = `${this.basePath}${type}.wav`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                this._fileLoadingDisabled = true;
                throw new Error('WAV not found');
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Cache the decoded buffer
            this.audioBuffers[type] = audioBuffer;
            return audioBuffer;
        } catch (error) {
            this._fileLoadingDisabled = true;
            if (!this._missingLogged.has(type)) {
                this._missingLogged.add(type);
                console.warn(`Notification sound files missing for '${type}'. Using fallback tone.`);
            }
            const fallback = this.createFallbackBuffer(type);
            this.audioBuffers[type] = fallback;
            return fallback;
        }
    }

    createFallbackBuffer(type) {
        const sr = this.audioContext?.sampleRate || 44100;

        // Melodic multi-note patterns with bell-like harmonics (freq Hz, start sec, decay sec)
        const patterns = {
            default:     [{ f: 659, s: 0, d: 0.5 }, { f: 784, s: 0.15, d: 0.55 }],
            reminder:    [{ f: 880, s: 0, d: 0.3 }, { f: 659, s: 0.18, d: 0.3 }, { f: 880, s: 0.38, d: 0.45 }],
            success:     [{ f: 523, s: 0, d: 0.5 }, { f: 659, s: 0.12, d: 0.5 }, { f: 784, s: 0.24, d: 0.55 }, { f: 1047, s: 0.38, d: 0.65 }],
            warning:     [{ f: 294, s: 0, d: 0.25 }, { f: 466, s: 0.2, d: 0.35 }],
            focusStart:  [{ f: 392, s: 0, d: 0.4 }, { f: 494, s: 0.15, d: 0.45 }, { f: 587, s: 0.3, d: 0.6 }],
            focusEnd:    [{ f: 587, s: 0, d: 0.45 }, { f: 494, s: 0.18, d: 0.45 }, { f: 392, s: 0.36, d: 0.65 }],
            break:       [{ f: 349, s: 0, d: 0.55 }, { f: 440, s: 0.25, d: 0.65 }],
            achievement: [{ f: 523, s: 0, d: 0.35 }, { f: 659, s: 0.1, d: 0.35 }, { f: 784, s: 0.2, d: 0.4 }, { f: 1047, s: 0.32, d: 0.5 }, { f: 1319, s: 0.45, d: 0.7 }],
            streak:      [{ f: 880, s: 0, d: 0.3 }, { f: 1109, s: 0.12, d: 0.45 }],
            ping:        [{ f: 1319, s: 0, d: 0.35 }],
            message:     [{ f: 784, s: 0, d: 0.3 }, { f: 659, s: 0.15, d: 0.4 }],
            ding:        [{ f: 1047, s: 0, d: 0.45 }],
            chime:       [{ f: 659, s: 0, d: 0.5 }, { f: 831, s: 0.14, d: 0.5 }, { f: 988, s: 0.28, d: 0.6 }]
        };

        const seq = patterns[type] || patterns.default;
        const totalDur = Math.max(...seq.map(p => p.s + p.d)) + 0.15;
        const length = Math.max(1, Math.floor(totalDur * sr));
        const buffer = this.audioContext.createBuffer(1, length, sr);
        const data = buffer.getChannelData(0);

        // Bell-like synthesis: fundamental + harmonics with exponential decay
        for (const p of seq) {
            const startSample = Math.floor(p.s * sr);
            const noteLen = Math.floor((p.d + 0.1) * sr);
            const harmonics = [
                { ratio: 1.0, amp: 1.0, decayMul: 1.0 },
                { ratio: 2.0, amp: 0.4, decayMul: 0.7 },
                { ratio: 3.0, amp: 0.15, decayMul: 0.45 },
                { ratio: 4.16, amp: 0.08, decayMul: 0.3 },
            ];
            for (let i = 0; i < noteLen && (startSample + i) < data.length; i++) {
                const t = i / sr;
                const attackEnv = 1 - Math.exp(-t * 60);
                let sample = 0;
                for (const h of harmonics) {
                    const env = Math.exp(-t / (p.d * h.decayMul));
                    sample += Math.sin(2 * Math.PI * p.f * h.ratio * t) * h.amp * env;
                }
                data[startSample + i] += sample * attackEnv * 0.22;
            }
        }

        // Normalize
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
        }
        if (peak > 0) {
            const scale = 0.75 / peak;
            for (let i = 0; i < data.length; i++) data[i] *= scale;
        }

        // Soft clip
        for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i]);

        return buffer;
    }

    async play(type = 'default', volume = 0.7) {
        try {
            await this.init();

            // Common aliases from UI/toast layers.
            const aliases = {
                info: 'default',
                error: 'warning',
                focus: 'focusStart',
                breakStart: 'break',
                breakEnd: 'break'
            };
            if (aliases[type]) type = aliases[type];

            // Validate and normalize type
            if (!this.soundTypes.includes(type)) {
                if (!this._unknownLogged.has(type)) {
                    this._unknownLogged.add(type);
                    console.warn(`Unknown sound type: ${type}, using default`);
                }
                type = 'default';
            }

            // Load sound (from cache or fetch)
            const audioBuffer = await this.loadSound(type);
            if (!audioBuffer) {
                console.warn(`Sound not available: ${type}`);
                return false;
            }

            // Create source and gain node
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = Math.max(0, Math.min(1, volume));

            // Connect and play
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);
            return true;
        } catch (error) {
            console.error('Failed to play notification sound:', error);
            return false;
        }
    }

    // Preload all sounds for instant playback
    async preloadAll() {
        const promises = this.soundTypes.map(type => this.loadSound(type));
        await Promise.allSettled(promises);
    }

    // Test all sounds sequentially with gaps
    async testAll() {
        for (const type of this.soundTypes) {
            console.log(`Testing sound: ${type}`);
            await this.play(type, 0.5);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    // Individual sound methods (backward compatibility)
    ding(volume = 0.7) { return this.play('ding', volume); }
    chime(volume = 0.7) { return this.play('chime', volume); }
    success(volume = 0.7) { return this.play('success', volume); }
    ping(volume = 0.7) { return this.play('ping', volume); }
    reminder(volume = 0.7) { return this.play('reminder', volume); }
    break(volume = 0.7) { return this.play('break', volume); }
    focusStart(volume = 0.7) { return this.play('focusStart', volume); }
    focusEnd(volume = 0.7) { return this.play('focusEnd', volume); }
    achievement(volume = 0.7) { return this.play('achievement', volume); }
    streak(volume = 0.7) { return this.play('streak', volume); }
    warning(volume = 0.7) { return this.play('warning', volume); }
    message(volume = 0.7) { return this.play('message', volume); }
}

// Create singleton instance
const notificationSounds = new NotificationSounds();

// Auto-initialize audio context on first user interaction
let audioInitialized = false;
function setupAudioInit() {
    if (audioInitialized) return;
    const initOnInteraction = () => {
        notificationSounds.init().catch(console.error);
        audioInitialized = true;
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('keydown', initOnInteraction);
    };
    document.addEventListener('click', initOnInteraction, { once: true, passive: true });
    document.addEventListener('keydown', initOnInteraction, { once: true, passive: true });
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAudioInit);
    } else {
        setupAudioInit();
    }
}

// Export for global access (backward compatibility with existing code)
window.NotificationSounds = {
    play: (type, volume) => notificationSounds.play(type, volume),
    init: () => notificationSounds.init(),
    testAll: () => notificationSounds.testAll(),
    preloadAll: () => notificationSounds.preloadAll(),
    types: notificationSounds.soundTypes,

    // Individual sound methods
    ding: (volume) => notificationSounds.ding(volume),
    chime: (volume) => notificationSounds.chime(volume),
    success: (volume) => notificationSounds.success(volume),
    ping: (volume) => notificationSounds.ping(volume),
    reminder: (volume) => notificationSounds.reminder(volume),
    break: (volume) => notificationSounds.break(volume),
    focusStart: (volume) => notificationSounds.focusStart(volume),
    focusEnd: (volume) => notificationSounds.focusEnd(volume),
    achievement: (volume) => notificationSounds.achievement(volume),
    streak: (volume) => notificationSounds.streak(volume),
    warning: (volume) => notificationSounds.warning(volume),
    message: (volume) => notificationSounds.message(volume)
};
