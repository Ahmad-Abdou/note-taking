/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - DISTRACTION BLOCKER MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Distraction Blocker with:
 * - Site blocking during focus sessions
 * - Preset category blocking (Social, Video, News, Games, Shopping)
 * - Custom URL blocking
 * - Schedule-based blocking
 * - Whitelist support
 * - Block page customization
 * - Focus mode auto-blocking
 * - Block statistics tracking
 * - Temporary unlock with password
 * - Motivation quotes on block page
 */

// ============================================================================
// BLOCKER STATE
// ============================================================================
const BlockerState = {
    isEnabled: false,
    blockedSites: [],
    whitelist: [],
    schedules: [],
    blockStats: {
        totalBlocks: 0,
        todayBlocks: 0,
        savedMinutes: 0
    },
    focusModeActive: false,
    temporaryUnlocks: {}
};

// Preset categories with comprehensive site lists
const PRESET_CATEGORIES = [
    {
        id: 'social',
        name: 'Social Media',
        icon: 'fa-share-nodes',
        color: '#3b82f6',
        sites: [
            'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
            'tiktok.com', 'snapchat.com', 'linkedin.com', 'pinterest.com',
            'tumblr.com', 'discord.com', 'telegram.org', 'whatsapp.com',
            'messenger.com', 'threads.net'
        ]
    },
    {
        id: 'video',
        name: 'Video Streaming',
        icon: 'fa-video',
        color: '#ef4444',
        sites: [
            'youtube.com', 'netflix.com', 'twitch.tv', 'hulu.com',
            'disneyplus.com', 'primevideo.com', 'hbomax.com', 'peacocktv.com',
            'crunchyroll.com', 'vimeo.com', 'dailymotion.com', 'rumble.com'
        ]
    },
    {
        id: 'news',
        name: 'News & Forums',
        icon: 'fa-newspaper',
        color: '#f59e0b',
        sites: [
            'reddit.com', 'news.ycombinator.com', 'cnn.com', 'bbc.com',
            'buzzfeed.com', 'huffpost.com', 'foxnews.com', 'nytimes.com',
            'washingtonpost.com', 'theguardian.com', 'vice.com', '9gag.com',
            'imgur.com', 'quora.com'
        ]
    },
    {
        id: 'games',
        name: 'Gaming',
        icon: 'fa-gamepad',
        color: '#8b5cf6',
        sites: [
            'steam.com', 'steampowered.com', 'epicgames.com', 'roblox.com',
            'miniclip.com', 'kongregate.com', 'poki.com', 'crazygames.com',
            'itch.io', 'armor games.com', 'addictinggames.com', 'chess.com',
            'lichess.org'
        ]
    },
    {
        id: 'shopping',
        name: 'Shopping',
        icon: 'fa-shopping-cart',
        color: '#10b981',
        sites: [
            'amazon.com', 'ebay.com', 'aliexpress.com', 'etsy.com',
            'walmart.com', 'target.com', 'bestbuy.com', 'newegg.com',
            'wish.com', 'shopify.com', 'wayfair.com', 'overstock.com'
        ]
    },
    {
        id: 'adult',
        name: 'Adult Content',
        icon: 'fa-ban',
        color: '#dc2626',
        sites: [] // Sites added but not shown for safety
    }
];

// Motivational quotes for block page
const MOTIVATION_QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "Your future self will thank you.", author: "Unknown" },
    { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Small daily improvements lead to staggering long-term results.", author: "Robin Sharma" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" }
];

// ============================================================================
// BLOCKER INITIALIZATION
// ============================================================================
async function loadBlockerPage() {
    try {
        // Load blocked sites
        BlockerState.blockedSites = await ProductivityData.DataStore.getBlockedSites();

        // Remove duplicates from loaded sites
        await removeDuplicateSites();

        // Load settings
        const settings = await ProductivityData.DataStore.getSettings();

        // Also check chrome.storage.local as fallback (for persistence across refreshes)
        const localStored = await chrome.storage.local.get(['blockerEnabled']);
        BlockerState.isEnabled = settings.blockerEnabled || localStored.blockerEnabled || false;
        BlockerState.whitelist = settings.blockerWhitelist || [];
        BlockerState.schedules = settings.blockerSchedules || [];

        // Load stats
        await loadBlockStats();

        // Update UI
        updateBlockerUI();
        renderBlockedSites();
        renderPresetCategories();
        renderSchedules();
        renderBlockStats();

        // Setup listeners
        setupBlockerListeners();

        // Sync with background script
        syncBlockerWithBackground();

    } catch (error) {
        console.error('Failed to load blocker page:', error);
        showToast('error', 'Error', 'Failed to load blocker settings.');
    }
}

// Remove duplicate sites from the block list
async function removeDuplicateSites() {
    const normalizeUrl = (u) => u.replace(/^www\./, '').toLowerCase();
    const seen = new Map();
    const duplicates = [];

    BlockerState.blockedSites.forEach(site => {
        const normalized = normalizeUrl(site.url);
        if (seen.has(normalized)) {
            duplicates.push(site.id);
        } else {
            seen.set(normalized, site);
        }
    });

    // Remove duplicates
    if (duplicates.length > 0) {
        for (const id of duplicates) {
            await ProductivityData.DataStore.deleteBlockedSite(id);
        }
        BlockerState.blockedSites = BlockerState.blockedSites.filter(s => !duplicates.includes(s.id));
    }
}

async function loadBlockStats() {
    const today = new Date().toISOString().split('T')[0];

    try {
        const stored = await chrome.storage.local.get(['blockStats', `blockStats_${today}`]);
        BlockerState.blockStats = stored.blockStats || { totalBlocks: 0, savedMinutes: 0 };
        BlockerState.blockStats.todayBlocks = stored[`blockStats_${today}`]?.blocks || 0;
    } catch (e) {
        // Debug removed
    }
}

async function saveBlockStats() {
    const today = new Date().toISOString().split('T')[0];

    try {
        await chrome.storage.local.set({
            blockStats: {
                totalBlocks: BlockerState.blockStats.totalBlocks,
                savedMinutes: BlockerState.blockStats.savedMinutes
            },
            [`blockStats_${today}`]: {
                blocks: BlockerState.blockStats.todayBlocks
            }
        });
    } catch (e) {
        // Debug removed
    }
}

function setupBlockerListeners() {
    // Toggle blocker button - matches HTML id="toggle-blocker-btn"
    document.getElementById('toggle-blocker-btn')?.addEventListener('click', () => {
        toggleBlocker(!BlockerState.isEnabled);
    });

    // Add site button - matches HTML id="add-blocked-site-btn"
    document.getElementById('add-blocked-site-btn')?.addEventListener('click', openAddSiteModal);

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sites = btn.dataset.sites?.split(',') || [];
            const allBlocked = sites.every(site =>
                BlockerState.blockedSites.some(bs => bs.url.includes(site.trim()) && bs.isEnabled)
            );

            if (allBlocked) {
                // Unblock all sites in this preset
                sites.forEach(site => {
                    const blocked = BlockerState.blockedSites.find(bs => bs.url.includes(site.trim()));
                    if (blocked) {
                        removeSite(blocked.id);
                    }
                });
                btn.classList.remove('blocked', 'partial');
            } else {
                // Block all sites in this preset
                sites.forEach(site => {
                    if (site.trim()) {
                        addSiteToBlockList(site.trim());
                    }
                });
                btn.classList.add('blocked');
                btn.classList.remove('partial');
            }

            // Update all preset button states
            updatePresetButtonStates();
        });
    });

    // Update preset button states initially
    updatePresetButtonStates();

    // Auto-block during focus checkbox
    document.getElementById('auto-block-focus')?.addEventListener('change', (e) => {
        saveBlockerSetting('autoBlockOnFocus', e.target.checked);
    });

    // Auto-block during schedule checkbox
    document.getElementById('auto-block-schedule')?.addEventListener('change', (e) => {
        saveBlockerSetting('autoBlockOnSchedule', e.target.checked);
        document.querySelector('.schedule-times')?.classList.toggle('hidden', !e.target.checked);
    });

    // Time range inputs
    document.getElementById('block-start-time')?.addEventListener('change', (e) => {
        saveBlockerSetting('blockStartTime', e.target.value);
    });

    document.getElementById('block-end-time')?.addEventListener('change', (e) => {
        saveBlockerSetting('blockEndTime', e.target.value);
    });

    // Event delegation for blocked sites list
    document.getElementById('blocked-sites-list')?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const siteId = target.dataset.siteId;

        switch (action) {
            case 'toggle-site':
                toggleSite(siteId);
                break;
            case 'remove-site':
                removeSite(siteId);
                break;
        }
    });
}

async function syncBlockerWithBackground() {
    try {
        await chrome.runtime.sendMessage({
            type: 'BLOCKER_SYNC',
            enabled: BlockerState.isEnabled,
            blockedSites: BlockerState.blockedSites.filter(s => s.isEnabled),
            whitelist: BlockerState.whitelist,
            schedules: BlockerState.schedules
        });
    } catch (e) {
        // Sync failed silently - background service worker may not be ready
    }
}

// Update preset button visual states based on blocked sites
function updatePresetButtonStates() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const sites = btn.dataset.sites?.split(',') || [];
        const blockedCount = sites.filter(site =>
            BlockerState.blockedSites.some(bs => bs.url.includes(site.trim()) && bs.isEnabled)
        ).length;

        btn.classList.remove('blocked', 'partial');

        if (blockedCount === sites.length && sites.length > 0) {
            btn.classList.add('blocked');
        } else if (blockedCount > 0) {
            btn.classList.add('partial');
        }
    });
}

// ============================================================================
// TOGGLE BLOCKER AND SAVE SETTINGS
// ============================================================================
async function toggleBlocker(enabled) {
    BlockerState.isEnabled = enabled;

    // Save to storage
    try {
        const settings = await ProductivityData.DataStore.getSettings();
        settings.blockerEnabled = enabled;
        await ProductivityData.DataStore.saveSettings(settings);

        // Also save to chrome.storage.local for background script
        await chrome.storage.local.set({ blockerEnabled: enabled });

        // Update UI
        updateBlockerUI();

        // Sync with background
        syncBlockerWithBackground();

        showToast(
            enabled ? 'success' : 'info',
            enabled ? 'Blocker Activated' : 'Blocker Deactivated',
            enabled ? 'Distraction blocking is now active.' : 'Distraction blocking has been turned off.'
        );
    } catch (e) {
        console.error('Failed to toggle blocker:', e);
        showToast('error', 'Error', 'Failed to update blocker state.');
    }
}

async function saveBlockerSetting(key, value) {
    try {
        const settings = await ProductivityData.DataStore.getSettings();
        settings[key] = value;
        await ProductivityData.DataStore.saveSettings(settings);

        // Also save to chrome.storage.local
        await chrome.storage.local.set({ [key]: value });

        syncBlockerWithBackground();
    } catch (e) {
        console.error('Failed to save blocker setting:', e);
    }
}

// ============================================================================
// UI UPDATES
// ============================================================================
function updateBlockerUI() {
    // Update status indicator
    const statusEl = document.getElementById('blocker-status');
    if (statusEl) {
        if (BlockerState.isEnabled) {
            statusEl.classList.add('active');
            statusEl.innerHTML = `
                <i class="fas fa-shield-alt"></i>
                <span>Blocker Active</span>
            `;
        } else {
            statusEl.classList.remove('active');
            statusEl.innerHTML = `
                <i class="fas fa-shield-alt"></i>
                <span>Blocker Inactive</span>
            `;
        }
    }

    // Update toggle button
    const toggleBtn = document.getElementById('toggle-blocker-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = BlockerState.isEnabled
            ? '<i class="fas fa-power-off"></i> Deactivate Blocker'
            : '<i class="fas fa-power-off"></i> Activate Blocker';
        toggleBtn.classList.toggle('btn-danger', BlockerState.isEnabled);
        toggleBtn.classList.toggle('btn-primary', !BlockerState.isEnabled);
    }
}

// Open modal to add new site
function openAddSiteModal() {
    const url = prompt('Enter website URL to block (e.g., facebook.com):');
    if (url && url.trim()) {
        addSiteToBlockList(url.trim());
    }
}

// Add a site to the block list
async function addSiteToBlockList(url) {
    // Clean URL
    url = cleanUrl(url);

    if (!url) return;

    // Normalize URL for comparison (remove www. prefix)
    const normalizeUrl = (u) => u.replace(/^www\./, '').toLowerCase();
    const normalizedUrl = normalizeUrl(url);

    // Check if already exists (including with/without www.)
    const alreadyExists = BlockerState.blockedSites.some(s => {
        const existingNormalized = normalizeUrl(s.url);
        return existingNormalized === normalizedUrl;
    });

    if (alreadyExists) {
        // Silently skip duplicates when batch adding from presets
        return;
    }

    const site = new ProductivityData.BlockedSite({
        url,
        category: 'custom',
        isEnabled: true
    });

    await ProductivityData.DataStore.saveBlockedSite(site);
    BlockerState.blockedSites.push(site);

    // Update UI
    renderBlockedSites();
    updateBlockerUI();
    syncBlockerWithBackground();
}

function renderBlockStats() {
    const container = document.getElementById('block-stats');
    if (!container) return;

    container.innerHTML = `
        <div class="block-stat">
            <i class="fas fa-shield-alt"></i>
            <div class="stat-content">
                <span class="stat-value">${BlockerState.blockedSites.length}</span>
                <span class="stat-label">Sites Blocked</span>
            </div>
        </div>
        <div class="block-stat">
            <i class="fas fa-hand-paper"></i>
            <div class="stat-content">
                <span class="stat-value">${BlockerState.blockStats.todayBlocks}</span>
                <span class="stat-label">Blocked Today</span>
            </div>
        </div>
        <div class="block-stat">
            <i class="fas fa-clock"></i>
            <div class="stat-content">
                <span class="stat-value">${BlockerState.blockStats.savedMinutes}</span>
                <span class="stat-label">Minutes Saved</span>
            </div>
        </div>
        <div class="block-stat">
            <i class="fas fa-fire"></i>
            <div class="stat-content">
                <span class="stat-value">${BlockerState.blockStats.totalBlocks}</span>
                <span class="stat-label">Total Blocks</span>
            </div>
        </div>
    `;
}

function renderBlockedSites(filter = '') {
    const container = document.getElementById('blocked-sites-list');
    if (!container) return;

    let sites = BlockerState.blockedSites;

    // Apply filter
    if (filter) {
        const lowerFilter = filter.toLowerCase();
        sites = sites.filter(s =>
            s.url.toLowerCase().includes(lowerFilter) ||
            (s.category && s.category.toLowerCase().includes(lowerFilter))
        );
    }

    if (sites.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shield-alt"></i>
                <h4>${filter ? 'No matches found' : 'No Sites Blocked Yet'}</h4>
                <p>${filter ? 'Try a different search term.' : 'Add distracting sites using the presets above or click Add Site.'}</p>
            </div>
        `;
        return;
    }

    // Simple list rendering (no grouping for simplicity)
    container.innerHTML = sites.map(site => `
        <li class="blocked-site-item ${site.isEnabled ? '' : 'disabled'}" data-id="${site.id}">
            <div class="site-favicon">
                <i class="fas fa-globe"></i>
            </div>
            <span class="site-url">${escapeHtml(site.url)}</span>
            <button class="remove-site" data-action="remove-site" data-site-id="${site.id}" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </li>
    `).join('');

    // Update preset button states
    updatePresetButtonStates();
}

function getCategoryName(categoryId) {
    const category = PRESET_CATEGORIES.find(c => c.id === categoryId);
    if (category) return category.name;
    return categoryId === 'custom' ? 'Custom Sites' : categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
}

function filterBlockedSites(filter) {
    renderBlockedSites(filter);
}

function renderPresetCategories() {
    const container = document.getElementById('preset-categories');
    if (!container) return;

    container.innerHTML = PRESET_CATEGORIES.filter(c => c.sites.length > 0).map(cat => {
        const blockedCount = cat.sites.filter(s =>
            BlockerState.blockedSites.some(bs => bs.url.includes(s) && bs.isEnabled)
        ).length;
        const isFullyBlocked = blockedCount === cat.sites.length;
        const isPartiallyBlocked = blockedCount > 0 && !isFullyBlocked;

        return `
            <div class="category-card ${isFullyBlocked ? 'blocked' : ''} ${isPartiallyBlocked ? 'partial' : ''}"
                 style="--category-color: ${cat.color}">
                <div class="category-header">
                    <div class="category-icon" style="background: ${cat.color}20; color: ${cat.color}">
                        <i class="fas ${cat.icon}"></i>
                    </div>
                    <div class="category-info">
                        <h4>${cat.name}</h4>
                        <p class="category-count">${blockedCount}/${cat.sites.length} blocked</p>
                    </div>
                </div>
                <div class="category-progress">
                    <div class="category-progress-bar" style="width: ${(blockedCount / cat.sites.length) * 100}%; background: ${cat.color}"></div>
                </div>
                <div class="category-actions">
                    <button class="btn-small ${isFullyBlocked ? 'btn-secondary' : 'btn-primary'}" 
                            data-action="toggle-category" data-category-id="${cat.id}"
                            style="${!isFullyBlocked ? `background: ${cat.color}` : ''}">
                        <i class="fas ${isFullyBlocked ? 'fa-unlock' : 'fa-lock'}"></i>
                        ${isFullyBlocked ? 'Unblock All' : 'Block All'}
                    </button>
                    <button class="btn-small btn-ghost" data-action="view-category" data-category-id="${cat.id}" title="View Sites">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Setup category listeners
    setupCategoryListeners();
}

function setupCategoryListeners() {
    document.querySelectorAll('[data-action="toggle-category"]').forEach(el => {
        el.addEventListener('click', () => {
            toggleCategory(el.dataset.categoryId);
        });
    });

    document.querySelectorAll('[data-action="view-category"]').forEach(el => {
        el.addEventListener('click', () => {
            viewCategory(el.dataset.categoryId);
        });
    });
}

function renderSchedules() {
    const container = document.getElementById('block-schedules');
    if (!container) return;

    if (BlockerState.schedules.length === 0) {
        container.innerHTML = `
            <div class="empty-schedules">
                <i class="fas fa-calendar-alt"></i>
                <p>No schedules set. Create a schedule to automatically block sites.</p>
                <button class="btn-secondary" data-action="add-schedule">
                    <i class="fas fa-plus"></i> Add Schedule
                </button>
            </div>
        `;
        setupBlockerScheduleListeners();
        return;
    }

    container.innerHTML = `
        <div class="schedules-list">
            ${BlockerState.schedules.map((schedule, index) => `
                <div class="schedule-item ${schedule.isActive ? 'active' : ''}">
                    <div class="schedule-info">
                        <span class="schedule-name">${escapeHtml(schedule.name)}</span>
                        <span class="schedule-time">
                            ${schedule.startTime} - ${schedule.endTime}
                        </span>
                        <span class="schedule-days">
                            ${schedule.days.map(d => d.slice(0, 3)).join(', ')}
                        </span>
                    </div>
                    <div class="schedule-actions">
                        <button class="btn-icon ${schedule.isActive ? 'active' : ''}" 
                                data-action="toggle-schedule" data-index="${index}" title="Toggle">
                            <i class="fas fa-toggle-${schedule.isActive ? 'on' : 'off'}"></i>
                        </button>
                        <button class="btn-icon" data-action="edit-schedule" data-index="${index}" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon danger" data-action="delete-schedule" data-index="${index}" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="btn-secondary add-schedule-btn" data-action="add-schedule">
            <i class="fas fa-plus"></i> Add Schedule
        </button>
    `;

    setupBlockerScheduleListeners();
}

function setupBlockerScheduleListeners() {
    document.querySelectorAll('[data-action="add-schedule"]').forEach(el => {
        el.addEventListener('click', openScheduleModal);
    });

    document.querySelectorAll('[data-action="toggle-schedule"]').forEach(el => {
        el.addEventListener('click', () => {
            toggleSchedule(parseInt(el.dataset.index));
        });
    });

    document.querySelectorAll('[data-action="edit-schedule"]').forEach(el => {
        el.addEventListener('click', () => {
            editSchedule(parseInt(el.dataset.index));
        });
    });

    document.querySelectorAll('[data-action="delete-schedule"]').forEach(el => {
        el.addEventListener('click', () => {
            deleteSchedule(parseInt(el.dataset.index));
        });
    });
}

// ============================================================================
// SITE MANAGEMENT
// ============================================================================
async function addBlockedSite() {
    const urlInput = document.getElementById('new-site-url');
    const reasonInput = document.getElementById('new-site-reason');

    if (!urlInput) return;

    let url = urlInput.value.trim();
    if (!url) {
        showToast('error', 'Error', 'Please enter a URL');
        return;
    }

    // Clean URL
    url = cleanUrl(url);

    // Check if already exists
    if (BlockerState.blockedSites.some(s => s.url === url)) {
        showToast('warning', 'Already Blocked', 'This site is already in your block list.');
        return;
    }

    const site = new ProductivityData.BlockedSite({
        url,
        category: 'custom',
        reason: reasonInput?.value?.trim() || '',
        isEnabled: true
    });

    await ProductivityData.DataStore.saveBlockedSite(site);
    BlockerState.blockedSites.push(site);

    // Clear inputs
    urlInput.value = '';
    if (reasonInput) reasonInput.value = '';

    // Update UI
    renderBlockedSites();
    renderPresetCategories();
    updateBlockerUI();
    syncBlockerWithBackground();

    showToast('success', 'Site Blocked', `${url} has been added to your block list.`);
}

function cleanUrl(url) {
    return url
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\/.*$/, '')
        .toLowerCase()
        .trim();
}

async function toggleSite(id) {
    const site = BlockerState.blockedSites.find(s => s.id === id);
    if (!site) return;

    site.isEnabled = !site.isEnabled;
    await ProductivityData.DataStore.saveBlockedSite(site);

    renderBlockedSites();
    updateBlockerUI();
    syncBlockerWithBackground();
}

async function editSite(id) {
    const site = BlockerState.blockedSites.find(s => s.id === id);
    if (!site) return;

    const newUrl = prompt('Edit URL:', site.url);
    if (newUrl === null) return;

    const cleanedUrl = cleanUrl(newUrl);
    if (cleanedUrl && cleanedUrl !== site.url) {
        site.url = cleanedUrl;
        await ProductivityData.DataStore.saveBlockedSite(site);
        renderBlockedSites();
        syncBlockerWithBackground();
    }
}

async function removeSite(id) {
    await ProductivityData.DataStore.deleteBlockedSite(id);
    BlockerState.blockedSites = BlockerState.blockedSites.filter(s => s.id !== id);

    renderBlockedSites();
    renderPresetCategories();
    updateBlockerUI();
    syncBlockerWithBackground();

    showToast('info', 'Site Removed', 'The site has been removed from your block list.');
}

async function toggleCategory(categoryId) {
    const category = PRESET_CATEGORIES.find(c => c.id === categoryId);
    if (!category) return;

    const normalizeUrl = (u) => u.replace(/^www\./, '').toLowerCase();

    const allBlocked = category.sites.every(s =>
        BlockerState.blockedSites.some(bs => normalizeUrl(bs.url) === normalizeUrl(s) && bs.isEnabled)
    );

    if (allBlocked) {
        // Unblock all in category
        for (const siteUrl of category.sites) {
            const blocked = BlockerState.blockedSites.find(bs => normalizeUrl(bs.url) === normalizeUrl(siteUrl));
            if (blocked) {
                await ProductivityData.DataStore.deleteBlockedSite(blocked.id);
            }
        }
        BlockerState.blockedSites = BlockerState.blockedSites.filter(bs =>
            !category.sites.some(s => normalizeUrl(bs.url) === normalizeUrl(s))
        );
        showToast('info', 'Category Unblocked', `All ${category.name} sites are now accessible.`);
    } else {
        // Block all in category - check for duplicates before adding
        for (const siteUrl of category.sites) {
            const alreadyExists = BlockerState.blockedSites.some(bs => normalizeUrl(bs.url) === normalizeUrl(siteUrl));
            if (!alreadyExists) {
                const site = new ProductivityData.BlockedSite({
                    url: siteUrl,
                    category: categoryId,
                    isEnabled: true
                });
                await ProductivityData.DataStore.saveBlockedSite(site);
                BlockerState.blockedSites.push(site);
            }
        }
        showToast('success', 'Category Blocked', `All ${category.name} sites are now blocked.`);
    }

    renderBlockedSites();
    renderPresetCategories();
    updateBlockerUI();
    syncBlockerWithBackground();
}

function viewCategory(categoryId) {
    const category = PRESET_CATEGORIES.find(c => c.id === categoryId);
    if (!category) return;

    // Show modal with category sites
    const modal = document.getElementById('category-view-modal') || createCategoryViewModal();

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-category-view"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas ${category.icon}"></i> ${category.name}</h3>
                <button class="btn-icon" data-action="close-category-view">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="category-sites-list">
                    ${category.sites.map(site => {
        const isBlocked = BlockerState.blockedSites.some(bs => bs.url.includes(site) && bs.isEnabled);
        return `
                            <div class="category-site-item ${isBlocked ? 'blocked' : ''}">
                                <img src="https://www.google.com/s2/favicons?domain=${site}&sz=32" 
                                     alt="" class="site-favicon">
                                <span class="site-url">${site}</span>
                                <button class="btn-small ${isBlocked ? 'btn-secondary' : 'btn-primary'}"
                                        data-action="toggle-category-site" data-category-id="${categoryId}" data-site="${site}">
                                    ${isBlocked ? 'Unblock' : 'Block'}
                                </button>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');

    // Setup category view listeners
    modal.querySelectorAll('[data-action="close-category-view"]').forEach(el => {
        el.addEventListener('click', closeCategoryView);
    });

    modal.querySelectorAll('[data-action="toggle-category-site"]').forEach(el => {
        el.addEventListener('click', () => {
            toggleCategorySite(el.dataset.categoryId, el.dataset.site);
        });
    });
}

function createCategoryViewModal() {
    const modal = document.createElement('div');
    modal.id = 'category-view-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeCategoryView() {
    const modal = document.getElementById('category-view-modal');
    if (modal) modal.classList.remove('active');
}

async function toggleCategorySite(categoryId, siteUrl) {
    const existing = BlockerState.blockedSites.find(bs => bs.url.includes(siteUrl));

    if (existing && existing.isEnabled) {
        await ProductivityData.DataStore.deleteBlockedSite(existing.id);
        BlockerState.blockedSites = BlockerState.blockedSites.filter(s => s.id !== existing.id);
    } else if (existing) {
        existing.isEnabled = true;
        await ProductivityData.DataStore.saveBlockedSite(existing);
    } else {
        const site = new ProductivityData.BlockedSite({
            url: siteUrl,
            category: categoryId,
            isEnabled: true
        });
        await ProductivityData.DataStore.saveBlockedSite(site);
        BlockerState.blockedSites.push(site);
    }

    // Refresh category view
    viewCategory(categoryId);
    renderBlockedSites();
    renderPresetCategories();
    syncBlockerWithBackground();
}

// ============================================================================
// SCHEDULE MANAGEMENT
// ============================================================================
function openScheduleModal(scheduleIndex = null) {
    const isEditing = scheduleIndex !== null;
    const schedule = isEditing ? BlockerState.schedules[scheduleIndex] : null;

    const modal = document.getElementById('schedule-modal') || createScheduleModal();

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-schedule-modal"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>${isEditing ? 'Edit Schedule' : 'Create Block Schedule'}</h3>
                <button class="btn-icon" data-action="close-schedule-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="schedule-form" data-schedule-index="${scheduleIndex}">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="schedule-name">Schedule Name</label>
                        <input type="text" id="schedule-name" required 
                               value="${schedule?.name || ''}"
                               placeholder="e.g., Study Time, Work Hours">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="schedule-start">Start Time</label>
                            <input type="time" id="schedule-start" required 
                                   value="${schedule?.startTime || '09:00'}">
                        </div>
                        <div class="form-group">
                            <label for="schedule-end">End Time</label>
                            <input type="time" id="schedule-end" required 
                                   value="${schedule?.endTime || '17:00'}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Days of Week</label>
                        <div class="days-selector">
                            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
                                <label class="day-checkbox">
                                    <input type="checkbox" name="days" value="${day}" 
                                           ${!schedule || schedule.days?.includes(day) ? 'checked' : ''}>
                                    <span>${day}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" data-action="close-schedule-modal">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <i class="fas fa-save"></i> ${isEditing ? 'Update' : 'Create'} Schedule
                    </button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');

    // Setup event listeners (CSP compliant)
    modal.querySelectorAll('[data-action="close-schedule-modal"]').forEach(el => {
        el.addEventListener('click', closeScheduleModal);
    });

    document.getElementById('schedule-form')?.addEventListener('submit', (e) => {
        const idx = e.target.dataset.scheduleIndex;
        saveSchedule(e, idx === 'null' ? null : parseInt(idx));
    });
}

function createScheduleModal() {
    const modal = document.createElement('div');
    modal.id = 'schedule-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    if (modal) modal.classList.remove('active');
}

async function saveSchedule(e, index) {
    e.preventDefault();

    const name = document.getElementById('schedule-name').value.trim();
    const startTime = document.getElementById('schedule-start').value;
    const endTime = document.getElementById('schedule-end').value;
    const dayCheckboxes = document.querySelectorAll('input[name="days"]:checked');
    const days = Array.from(dayCheckboxes).map(cb => cb.value);

    if (days.length === 0) {
        showToast('error', 'Error', 'Please select at least one day.');
        return;
    }

    const schedule = {
        name,
        startTime,
        endTime,
        days,
        isActive: true
    };

    if (index !== null) {
        BlockerState.schedules[index] = schedule;
    } else {
        BlockerState.schedules.push(schedule);
    }

    await saveBlockerSetting('blockerSchedules', BlockerState.schedules);

    closeScheduleModal();
    renderSchedules();
    syncBlockerWithBackground();

    showToast('success', 'Schedule Saved', `"${name}" has been ${index !== null ? 'updated' : 'created'}.`);
}

async function toggleSchedule(index) {
    BlockerState.schedules[index].isActive = !BlockerState.schedules[index].isActive;
    await saveBlockerSetting('blockerSchedules', BlockerState.schedules);
    renderSchedules();
    syncBlockerWithBackground();
}

function editSchedule(index) {
    openScheduleModal(index);
}

async function deleteSchedule(index) {
    const ok = await confirmDialog('Delete this schedule?', {
        title: 'Delete Schedule',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    BlockerState.schedules.splice(index, 1);
    await saveBlockerSetting('blockerSchedules', BlockerState.schedules);
    renderSchedules();
    syncBlockerWithBackground();

    showToast('info', 'Schedule Deleted', 'The schedule has been removed.');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
async function saveBlockerSetting(key, value) {
    const settings = await ProductivityData.DataStore.getSettings();
    settings[key] = value;
    await ProductivityData.DataStore.saveSettings(settings);
}

// escapeHtml is now provided by utils.js

function getRandomQuote() {
    return MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
}

// Track block for statistics
async function recordBlock(url) {
    BlockerState.blockStats.totalBlocks++;
    BlockerState.blockStats.todayBlocks++;
    BlockerState.blockStats.savedMinutes += 5; // Estimate 5 min saved per block
    await saveBlockStats();
    renderBlockStats();
}

// ============================================================================
// WEBSITE TIME LIMITS INTEGRATION
// ============================================================================

let editingTimeLimitId = null;
let timeLimitsRefreshInterval = null;

async function initTimeLimits() {
    // Initialize time tracker if available
    if (window.TimeTracker) {
        await window.TimeTracker.init();
        await renderTimeLimits();
        setupTimeLimitListeners();

        // Auto-refresh every 30 seconds to show updated usage
        if (timeLimitsRefreshInterval) {
            clearInterval(timeLimitsRefreshInterval);
        }
        timeLimitsRefreshInterval = setInterval(async () => {
            // Only refresh if on the blocker page
            const blockerPage = document.getElementById('page-blocker');
            if (blockerPage && blockerPage.classList.contains('active')) {
                await renderTimeLimits();
            }
        }, 30000); // 30 seconds

        console.log('[TimeLimits] Auto-refresh started');
    }
}


function setupTimeLimitListeners() {
    // Add time limit button
    document.getElementById('add-time-limit-btn')?.addEventListener('click', openTimeLimitModal);

    // Save time limit button
    document.getElementById('save-time-limit-btn')?.addEventListener('click', saveTimeLimit);

    // Close modal buttons
    document.querySelectorAll('[data-action="close-time-limit"]').forEach(btn => {
        btn.addEventListener('click', closeTimeLimitModal);
    });

    // Time preset buttons
    document.querySelectorAll('.time-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const minutes = parseInt(btn.dataset.minutes);
            document.getElementById('time-limit-minutes').value = minutes;

            // Update active state
            document.querySelectorAll('.time-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Event delegation for time limit list actions
    document.getElementById('time-limits-list')?.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const limitId = target.dataset.limitId;

        switch (action) {
            case 'edit-time-limit':
                editTimeLimit(limitId);
                break;
            case 'remove-time-limit':
                await removeTimeLimit(limitId);
                break;
            case 'toggle-time-limit':
                await toggleTimeLimitEnabled(limitId, e.target.checked);
                break;
        }
    });
}

function openTimeLimitModal(editId = null) {
    const modal = document.getElementById('time-limit-modal');
    if (!modal) return;

    const title = document.getElementById('time-limit-modal-title');
    const domainInput = document.getElementById('time-limit-domain');
    const minutesInput = document.getElementById('time-limit-minutes');

    if (editId && typeof editId === 'string') {
        // Edit mode
        editingTimeLimitId = editId;
        const limits = window.TimeTracker.getAllTimeLimits();
        const limit = limits.find(l => l.id === editId);

        if (limit) {
            title.innerHTML = '<i class="fas fa-edit"></i> Edit Time Limit';
            domainInput.value = limit.domain;
            minutesInput.value = limit.dailyLimitMinutes;
            domainInput.disabled = true; // Don't allow changing domain when editing
        }
    } else {
        // Add mode
        editingTimeLimitId = null;
        title.innerHTML = '<i class="fas fa-stopwatch"></i> Add Time Limit';
        domainInput.value = '';
        minutesInput.value = 60;
        domainInput.disabled = false;
    }

    // Update preset button state
    document.querySelectorAll('.time-preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.minutes) === parseInt(minutesInput.value));
    });

    modal.classList.add('active');
}

function closeTimeLimitModal() {
    const modal = document.getElementById('time-limit-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    editingTimeLimitId = null;
}

async function saveTimeLimit() {
    const domainInput = document.getElementById('time-limit-domain');
    const minutesInput = document.getElementById('time-limit-minutes');

    const domain = domainInput.value.trim();
    const minutes = parseInt(minutesInput.value);

    if (!domain) {
        showToast('error', 'Error', 'Please enter a website domain.');
        return;
    }

    if (!minutes || minutes < 1 || minutes > 1440) {
        showToast('error', 'Error', 'Please enter a valid time limit (1-1440 minutes).');
        return;
    }

    if (editingTimeLimitId) {
        await window.TimeTracker.updateTimeLimit(editingTimeLimitId, minutes);
        showToast('success', 'Updated', `Time limit for ${domain} updated to ${minutes} minutes.`);
    } else {
        await window.TimeTracker.addTimeLimit(domain, minutes);
        showToast('success', 'Added', `Time limit of ${minutes} minutes set for ${domain}.`);
    }

    closeTimeLimitModal();
    renderTimeLimits();
}

function editTimeLimit(id) {
    openTimeLimitModal(id);
}

async function removeTimeLimit(id) {
    const limits = window.TimeTracker.getAllTimeLimits();
    const limit = limits.find(l => l.id === id);

    const ok = await confirmDialog(`Remove time limit for ${limit?.domain || 'this site'}?`, {
        title: 'Remove Time Limit',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        danger: true
    });
    if (ok) {
        await window.TimeTracker.removeTimeLimit(id);
        renderTimeLimits();
        showToast('info', 'Removed', 'Time limit removed.');
    }
}

async function toggleTimeLimitEnabled(id, enabled) {
    await window.TimeTracker.toggleTimeLimit(id, enabled);
    renderTimeLimits();
}

async function renderTimeLimits() {
    const container = document.getElementById('time-limits-list');
    const emptyState = document.getElementById('time-limits-empty');
    if (!container || !window.TimeTracker) return;

    const stats = await window.TimeTracker.getUsageStats();

    if (stats.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        // Remove any existing items but keep empty state
        container.querySelectorAll('.time-limit-item').forEach(el => el.remove());
        return;
    }


    if (emptyState) emptyState.style.display = 'none';

    // Format time remaining as countdown
    function formatCountdown(minutes) {
        if (minutes <= 0) return '0:00';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hrs > 0) {
            return `${hrs}h ${mins}m`;
        }
        return `${mins}m`;
    }

    // Clear and rebuild
    container.innerHTML = stats.map(stat => {
        const statusClass = stat.isBlocked ? 'blocked' : (stat.percentageUsed > 80 ? 'warning' : '');
        const remainingClass = stat.timeRemainingMinutes <= 5 ? 'danger' : (stat.timeRemainingMinutes <= 15 ? 'warning' : '');
        const countdownDisplay = formatCountdown(stat.timeRemainingMinutes);

        return `
            <div class="time-limit-item ${statusClass}" data-id="${stat.id}">
                <div class="time-limit-row">
                    <div class="time-limit-info">
                        <div class="time-limit-domain">
                            <i class="fas fa-globe domain-icon"></i>
                            <span class="domain-name">${escapeHtml(stat.domain)}</span>
                        </div>
                        <div class="time-limit-usage">
                            <span class="usage-text">${stat.timeSpentMinutes} / ${stat.dailyLimitMinutes} min used</span>
                        </div>
                    </div>
                    <div class="time-limit-countdown ${remainingClass}">
                        ${stat.isBlocked
                ? '<div class="countdown-blocked"><i class="fas fa-ban"></i><span>Blocked</span></div>'
                : `<div class="countdown-display">
                                <i class="fas fa-hourglass-half"></i>
                                <span class="countdown-value">${countdownDisplay}</span>
                                <span class="countdown-label">remaining</span>
                              </div>`
            }
                    </div>
                    <div class="time-limit-actions">
                        <button class="action-btn edit" data-action="edit-time-limit" data-limit-id="${stat.id}" title="Edit limit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn remove" data-action="remove-time-limit" data-limit-id="${stat.id}" title="Remove limit">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="time-limit-progress">
                    <div class="time-progress-bar">
                        <div class="time-progress-fill" style="width: ${Math.min(100, stat.percentageUsed)}%"></div>
                    </div>
                </div>
                ${stat.isBlocked
                ? '<div class="time-limit-footer blocked"><i class="fas fa-clock"></i> Resets at midnight</div>'
                : `<div class="time-limit-footer"><i class="fas fa-check-circle"></i> Active</div>`
            }
            </div>
        `;
    }).join('');
}


// Extend the loadBlockerPage to also initialize time limits
const originalLoadBlockerPage = loadBlockerPage;
async function loadBlockerPageWithTimeLimits() {
    await originalLoadBlockerPage();
    await initTimeLimits();
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.loadBlockerPage = loadBlockerPageWithTimeLimits;
window.loadBlocker = loadBlockerPageWithTimeLimits; // Alias for app.js compatibility
window.toggleBlocker = toggleBlocker;
window.addBlockedSite = addBlockedSite;
window.addSiteToBlockList = addSiteToBlockList;
window.openAddSiteModal = openAddSiteModal;
window.toggleSite = toggleSite;
window.editSite = editSite;
window.removeSite = removeSite;
window.toggleCategory = toggleCategory;
window.viewCategory = viewCategory;
window.closeCategoryView = closeCategoryView;
window.toggleCategorySite = toggleCategorySite;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.saveSchedule = saveSchedule;
window.toggleSchedule = toggleSchedule;
window.editSchedule = editSchedule;
window.deleteSchedule = deleteSchedule;
window.recordBlock = recordBlock;
window.getRandomQuote = getRandomQuote;
window.updatePresetButtonStates = updatePresetButtonStates;
window.syncBlockerWithBackground = syncBlockerWithBackground;

// Time limits exports
window.openTimeLimitModal = openTimeLimitModal;
window.closeTimeLimitModal = closeTimeLimitModal;
window.saveTimeLimit = saveTimeLimit;
window.renderTimeLimits = renderTimeLimits;
window.initTimeLimits = initTimeLimits;

// Blocker module loaded

