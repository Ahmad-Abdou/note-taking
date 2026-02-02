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

        try {
            // Try MP3 first, fallback to OGG
            let response;
            let url;

            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    // Browser extension - use chrome.runtime.getURL
                    url = chrome.runtime.getURL(`productivity/sounds/${type}.mp3`);
                } else {
                    url = `${this.basePath}${type}.mp3`;
                }
                response = await fetch(url);

                if (!response.ok) {
                    throw new Error('MP3 not found');
                }
            } catch (e) {
                // Fallback to OGG
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    url = chrome.runtime.getURL(`productivity/sounds/${type}.ogg`);
                } else {
                    url = `${this.basePath}${type}.ogg`;
                }
                response = await fetch(url);
            }

            if (!response.ok) {
                throw new Error(`Failed to load sound: ${type}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Cache the decoded buffer
            this.audioBuffers[type] = audioBuffer;
            return audioBuffer;
        } catch (error) {
            console.error(`Error loading sound ${type}:`, error);
            return null;
        }
    }

    async play(type = 'default', volume = 0.7) {
        try {
            await this.init();

            // Validate and normalize type
            if (!this.soundTypes.includes(type)) {
                console.warn(`Unknown sound type: ${type}, using default`);
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
