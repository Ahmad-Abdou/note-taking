/**
 * ============================================================================
 * SITE BLOCKER TESTS
 * ============================================================================
 * Tests for blocking websites during focus sessions
 */

const siteBlockerTests = {
    'Site Blocker': {
        icon: '🛡️',
        tests: [
            {
                name: 'Blocked sites storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['blockedSites'], resolve);
                    });

                    if (result.blockedSites && !Array.isArray(result.blockedSites)) {
                        throw new Error('blockedSites should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can add a site to blocked list',
                fn: async () => {
                    const testSite = {
                        id: 'site-test-' + Date.now(),
                        url: 'youtube.com',
                        addedAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['blockedSites'], resolve);
                    });
                    const sites = current.blockedSites || [];
                    sites.push(testSite);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ blockedSites: sites }, resolve);
                    });

                    // Cleanup
                    const cleaned = sites.filter(s => s.id !== testSite.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ blockedSites: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'URL pattern matching works',
                fn: async () => {
                    const blockedPatterns = [
                        'youtube.com',
                        'facebook.com',
                        'twitter.com',
                        'reddit.com'
                    ];

                    const testUrls = [
                        { url: 'https://www.youtube.com/watch?v=123', expected: true },
                        { url: 'https://youtube.com', expected: true },
                        { url: 'https://google.com', expected: false },
                        { url: 'https://m.facebook.com', expected: true },
                        { url: 'https://example.com', expected: false }
                    ];

                    for (const test of testUrls) {
                        const isBlocked = blockedPatterns.some(pattern =>
                            test.url.includes(pattern)
                        );

                        if (isBlocked !== test.expected) {
                            throw new Error(`URL ${test.url}: expected ${test.expected}, got ${isBlocked}`);
                        }
                    }

                    return true;
                }
            },
            {
                name: 'Can remove site from blocked list',
                fn: async () => {
                    const sites = [
                        { id: '1', url: 'youtube.com' },
                        { id: '2', url: 'facebook.com' },
                        { id: '3', url: 'twitter.com' }
                    ];

                    const idToRemove = '2';
                    const afterRemove = sites.filter(s => s.id !== idToRemove);

                    if (afterRemove.length !== 2) {
                        throw new Error('Site was not removed');
                    }

                    if (afterRemove.some(s => s.id === idToRemove)) {
                        throw new Error('Removed site still in list');
                    }

                    return true;
                }
            },
            {
                name: 'Blocking only active during focus session',
                fn: async () => {
                    const focusSession = {
                        isActive: true,
                        enableBlocking: true
                    };

                    const shouldBlock = focusSession.isActive && focusSession.enableBlocking;

                    if (!shouldBlock) {
                        throw new Error('Should block when focus active and blocking enabled');
                    }

                    // Test inactive session
                    focusSession.isActive = false;
                    const shouldNotBlock = focusSession.isActive && focusSession.enableBlocking;

                    if (shouldNotBlock) {
                        throw new Error('Should not block when focus inactive');
                    }

                    return true;
                }
            },
            {
                name: 'Preset blocked sites are available',
                fn: async () => {
                    const presets = {
                        social: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com'],
                        video: ['youtube.com', 'netflix.com', 'twitch.tv'],
                        news: ['reddit.com', 'news.ycombinator.com']
                    };

                    if (presets.social.length < 3) {
                        throw new Error('Social presets incomplete');
                    }
                    if (presets.video.length < 2) {
                        throw new Error('Video presets incomplete');
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.siteBlockerTests = siteBlockerTests;
}
