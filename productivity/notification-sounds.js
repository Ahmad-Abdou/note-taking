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

        // Ensure we have an AudioContext for fallback generation
        if (!this.audioContext) {
            await this.init();
        }

        try {
            if (this._fileLoadingDisabled) {
                const fallback = this.createFallbackBuffer(type);
                this.audioBuffers[type] = fallback;
                return fallback;
            }

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
            // If audio files are missing (common in dev builds), fall back to a simple generated tone.
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
        const sr = this.audioContext.sampleRate || 44100;

        // Small patterns per type (frequency in Hz, duration in seconds)
        const patterns = {
            success: [{ f: 880, d: 0.07 }, { f: 1175, d: 0.09 }],
            warning: [{ f: 440, d: 0.09 }, { f: 392, d: 0.10 }],
            reminder: [{ f: 660, d: 0.08 }, { f: 660, d: 0.08 }],
            focusStart: [{ f: 523, d: 0.10 }, { f: 784, d: 0.10 }],
            focusEnd: [{ f: 784, d: 0.10 }, { f: 523, d: 0.10 }],
            break: [{ f: 330, d: 0.12 }],
            achievement: [{ f: 659, d: 0.08 }, { f: 784, d: 0.08 }, { f: 988, d: 0.10 }],
            streak: [{ f: 740, d: 0.08 }, { f: 932, d: 0.10 }],
            ping: [{ f: 988, d: 0.06 }],
            message: [{ f: 880, d: 0.06 }],
            ding: [{ f: 1046, d: 0.09 }],
            chime: [{ f: 784, d: 0.08 }, { f: 1046, d: 0.10 }],
            default: [{ f: 880, d: 0.06 }]
        };

        const seq = patterns[type] || patterns.default;
        const totalDur = seq.reduce((sum, p) => sum + p.d, 0) + 0.05;
        const length = Math.max(1, Math.floor(totalDur * sr));
        const buffer = this.audioContext.createBuffer(1, length, sr);
        const data = buffer.getChannelData(0);

        // Simple ADSR-ish envelope per segment
        let cursor = 0;
        for (const p of seq) {
            const segLen = Math.floor(p.d * sr);
            const attack = Math.floor(segLen * 0.12);
            const release = Math.floor(segLen * 0.25);
            const sustainLen = Math.max(0, segLen - attack - release);

            for (let i = 0; i < segLen && (cursor + i) < data.length; i++) {
                const t = i / sr;
                const phase = 2 * Math.PI * p.f * t;
                let env = 1;
                if (i < attack) env = i / Math.max(1, attack);
                else if (i < attack + sustainLen) env = 1;
                else {
                    const r = (i - attack - sustainLen) / Math.max(1, release);
                    env = 1 - r;
                }
                data[cursor + i] += Math.sin(phase) * env * 0.25;
            }
            cursor += segLen + Math.floor(0.015 * sr);
        }

        // Soft clip
        for (let i = 0; i < data.length; i++) {
            const x = data[i];
            data[i] = Math.tanh(x);
        }

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
        await this.init();
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
