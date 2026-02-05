/**
 * Challenges System
 * Manages user challenges with daily/weekly/custom duration tracking
 */

// ============================================================================
// CHALLENGE STATE
// ============================================================================

const ChallengeState = {
    challenges: [],
    filter: 'all'
};

// ============================================================================
// INITIALIZATION
// ============================================================================

async function loadChallengesPage() {
    try {
        ChallengeState.challenges = await ProductivityData.DataStore.getChallenges?.() || [];
        setupChallengeListeners();
        renderChallenges();
        updateChallengeStats();
    } catch (error) {
        console.error('Failed to load challenges:', error);
        showToast?.('error', 'Error', 'Failed to load challenges');
    }
}

function setupChallengeListeners() {
    // Create challenge button
    document.getElementById('create-challenge-btn')?.addEventListener('click', () => {
        openChallengeModal();
    });

    // Category filter buttons
    document.querySelectorAll('.challenge-categories .category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.challenge-categories .category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ChallengeState.filter = btn.dataset.filter;
            renderChallenges();
        });
    });
}

// ============================================================================
// RENDERING
// ============================================================================

function renderChallenges() {
    const grid = document.getElementById('challenges-grid');
    if (!grid) return;

    let challenges = [...ChallengeState.challenges];

    // Apply filter
    if (ChallengeState.filter !== 'all') {
        if (ChallengeState.filter === 'active') {
            challenges = challenges.filter(c => c.status === 'active');
        } else if (ChallengeState.filter === 'completed') {
            challenges = challenges.filter(c => c.status === 'completed');
        } else if (ChallengeState.filter === 'daily') {
            challenges = challenges.filter(c => c.type === 'daily');
        } else if (ChallengeState.filter === 'weekly') {
            challenges = challenges.filter(c => c.type === 'weekly');
        }
    }

    if (challenges.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trophy"></i>
                <h3>No challenges yet</h3>
                <p>Create your first challenge to start tracking progress!</p>
                <button class="btn-primary" onclick="openChallengeModal()">
                    <i class="fas fa-plus"></i> Create Challenge
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = challenges.map(challenge => renderChallengeCard(challenge)).join('');

    // Add event listeners for challenge actions
    grid.querySelectorAll('.challenge-card').forEach(card => {
        const id = card.dataset.challengeId;

        card.querySelector('.progress-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            recordChallengeProgress(id);
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChallenge(id);
        });
    });
}

function renderChallengeCard(challenge) {
    const progress = Math.min(100, Math.round((challenge.currentProgress / challenge.targetProgress) * 100));
    const isCompleted = challenge.status === 'completed';
    const typeIcon = challenge.type === 'daily' ? 'fa-calendar-day' :
        challenge.type === 'weekly' ? 'fa-calendar-week' : 'fa-calendar-alt';

    const streakBadge = challenge.currentStreak > 0 ?
        `<span class="streak-badge"><i class="fas fa-fire"></i> ${challenge.currentStreak}</span>` : '';

    return `
        <div class="challenge-card ${isCompleted ? 'completed' : ''}" data-challenge-id="${challenge.id}">
            <div class="challenge-header">
                <div class="challenge-type">
                    <i class="fas ${typeIcon}"></i>
                    <span>${challenge.type}</span>
                </div>
                ${streakBadge}
                <button class="btn-icon tiny delete-btn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="challenge-body">
                <h3 class="challenge-title">${escapeHtml(challenge.title)}</h3>
                <p class="challenge-description">${escapeHtml(challenge.description || '')}</p>
                <div class="challenge-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${challenge.currentProgress} / ${challenge.targetProgress}</span>
                </div>
            </div>
            <div class="challenge-footer">
                ${!isCompleted ?
            `<button class="btn-secondary progress-btn">
                        <i class="fas fa-plus"></i> Log Progress
                    </button>` :
            `<span class="completed-badge"><i class="fas fa-check-circle"></i> Completed!</span>`
        }
            </div>
        </div>
    `;
}

function updateChallengeStats() {
    const active = ChallengeState.challenges.filter(c => c.status === 'active').length;
    const completed = ChallengeState.challenges.filter(c => c.status === 'completed').length;
    const bestStreak = Math.max(0, ...ChallengeState.challenges.map(c => c.bestStreak || 0));

    const activeEl = document.getElementById('active-challenges-count');
    const completedEl = document.getElementById('completed-challenges-count');
    const streakEl = document.getElementById('best-streak-count');

    if (activeEl) activeEl.textContent = active;
    if (completedEl) completedEl.textContent = completed;
    if (streakEl) streakEl.textContent = bestStreak;
}

// ============================================================================
// CHALLENGE ACTIONS
// ============================================================================

async function recordChallengeProgress(challengeId) {
    const challenge = ChallengeState.challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    challenge.currentProgress = (challenge.currentProgress || 0) + 1;
    challenge.currentStreak = (challenge.currentStreak || 0) + 1;
    challenge.bestStreak = Math.max(challenge.bestStreak || 0, challenge.currentStreak);
    challenge.lastProgressDate = new Date().toISOString().split('T')[0];

    if (challenge.currentProgress >= challenge.targetProgress) {
        challenge.status = 'completed';
        challenge.completedAt = new Date().toISOString();
        showToast?.('success', 'Challenge Complete!', `You completed: ${challenge.title}`);
    }

    await saveChallenges();
    renderChallenges();
    updateChallengeStats();
}

async function deleteChallenge(challengeId) {
    if (!confirm('Delete this challenge?')) return;

    ChallengeState.challenges = ChallengeState.challenges.filter(c => c.id !== challengeId);
    await saveChallenges();
    renderChallenges();
    updateChallengeStats();
    showToast?.('success', 'Deleted', 'Challenge removed');
}

async function saveChallenges() {
    try {
        if (typeof ProductivityData?.DataStore?.saveChallenges === 'function') {
            await ProductivityData.DataStore.saveChallenges(ChallengeState.challenges);
        } else {
            // Fallback to chrome storage
            await chrome.storage.local.set({ challenges: ChallengeState.challenges });
        }
    } catch (error) {
        console.error('Failed to save challenges:', error);
    }
}

// ============================================================================
// CHALLENGE MODAL
// ============================================================================

function openChallengeModal() {
    // Check if modal exists, create if not
    let modal = document.getElementById('challenge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'challenge-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-trophy"></i> Create Challenge</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <form id="challenge-form" class="modal-body">
                    <div class="form-group">
                        <label>Challenge Title</label>
                        <input type="text" id="challenge-title" placeholder="e.g., Complete 5 focus sessions" required>
                    </div>
                    <div class="form-group">
                        <label>Description (optional)</label>
                        <textarea id="challenge-description" placeholder="Describe your challenge..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Type</label>
                            <select id="challenge-type">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Target Count</label>
                            <input type="number" id="challenge-target" value="5" min="1" required>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary close-modal-btn">Cancel</button>
                        <button type="submit" class="btn-primary">Create Challenge</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.add('active');

    // Setup modal event listeners
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    const form = document.getElementById('challenge-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await createChallenge();
        modal.classList.remove('active');
    };
}

async function createChallenge() {
    const title = document.getElementById('challenge-title').value.trim();
    const description = document.getElementById('challenge-description').value.trim();
    const type = document.getElementById('challenge-type').value;
    const target = parseInt(document.getElementById('challenge-target').value) || 5;

    if (!title) return;

    const challenge = {
        id: 'challenge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title,
        description,
        type,
        targetProgress: target,
        currentProgress: 0,
        currentStreak: 0,
        bestStreak: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastProgressDate: null
    };

    ChallengeState.challenges.push(challenge);
    await saveChallenges();
    renderChallenges();
    updateChallengeStats();
    showToast?.('success', 'Challenge Created', `"${title}" is now active!`);

    // Clear form
    document.getElementById('challenge-title').value = '';
    document.getElementById('challenge-description').value = '';
}

// Escape HTML helper
function escapeHtml(text) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(text);
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Export for global access
window.loadChallengesPage = loadChallengesPage;
window.openChallengeModal = openChallengeModal;
