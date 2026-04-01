/**
 * ============================================================================
 * DATA MODEL & CHALLENGES TESTS
 * ============================================================================
 * Tests for data model field names, backward compatibility, ChallengeManager
 * storage, and the unified AccountabilityCheckin / CommitmentStats models.
 */

const dataModelTests = {
    'Data Models': {
        icon: '🗂️',
        tests: [
            // ── AccountabilityCheckin ──────────────────────────────────
            {
                name: 'AccountabilityCheckin uses moodRating field',
                fn: async () => {
                    if (!window.ProductivityData?.AccountabilityCheckin) {
                        throw new Error('AccountabilityCheckin class not available');
                    }
                    const c = new window.ProductivityData.AccountabilityCheckin({ moodRating: 5 });
                    if (c.moodRating !== 5) {
                        throw new Error(`Expected moodRating 5, got ${c.moodRating}`);
                    }
                    return true;
                }
            },
            {
                name: 'AccountabilityCheckin uses commitmentForTomorrow field',
                fn: async () => {
                    if (!window.ProductivityData?.AccountabilityCheckin) {
                        throw new Error('AccountabilityCheckin class not available');
                    }
                    const c = new window.ProductivityData.AccountabilityCheckin({
                        commitmentForTomorrow: 'Study hard'
                    });
                    if (c.commitmentForTomorrow !== 'Study hard') {
                        throw new Error(`Expected 'Study hard', got '${c.commitmentForTomorrow}'`);
                    }
                    return true;
                }
            },
            {
                name: 'AccountabilityCheckin falls back from old field names',
                fn: async () => {
                    if (!window.ProductivityData?.AccountabilityCheckin) {
                        throw new Error('AccountabilityCheckin class not available');
                    }
                    // Simulate old stored data that used 'mood' and 'tomorrowCommitment'
                    const c = new window.ProductivityData.AccountabilityCheckin({
                        mood: 3,
                        tomorrowCommitment: 'Read a book'
                    });
                    // Should pick up via fallback
                    if (c.moodRating !== 3) {
                        throw new Error(`Fallback mood failed: expected 3, got ${c.moodRating}`);
                    }
                    if (c.commitmentForTomorrow !== 'Read a book') {
                        throw new Error(`Fallback commit failed: expected 'Read a book', got '${c.commitmentForTomorrow}'`);
                    }
                    return true;
                }
            },

            // ── CommitmentStats ────────────────────────────────────────
            {
                name: 'CommitmentStats has totalGoalsCreated/Completed/Abandoned',
                fn: async () => {
                    if (!window.ProductivityData?.CommitmentStats) {
                        throw new Error('CommitmentStats class not available');
                    }
                    const s = new window.ProductivityData.CommitmentStats({
                        totalGoalsCreated: 10,
                        totalGoalsCompleted: 7,
                        totalGoalsAbandoned: 2
                    });
                    if (s.totalGoalsCreated !== 10) throw new Error(`totalGoalsCreated: ${s.totalGoalsCreated}`);
                    if (s.totalGoalsCompleted !== 7) throw new Error(`totalGoalsCompleted: ${s.totalGoalsCompleted}`);
                    if (s.totalGoalsAbandoned !== 2) throw new Error(`totalGoalsAbandoned: ${s.totalGoalsAbandoned}`);
                    return true;
                }
            },
            {
                name: 'CommitmentStats falls back from old field names',
                fn: async () => {
                    if (!window.ProductivityData?.CommitmentStats) {
                        throw new Error('CommitmentStats class not available');
                    }
                    const s = new window.ProductivityData.CommitmentStats({
                        goalsCreated: 5,
                        goalsCompleted: 3,
                        goalsAbandoned: 1
                    });
                    if (s.totalGoalsCreated !== 5) throw new Error(`Fallback goalsCreated: ${s.totalGoalsCreated}`);
                    if (s.totalGoalsCompleted !== 3) throw new Error(`Fallback goalsCompleted: ${s.totalGoalsCompleted}`);
                    if (s.totalGoalsAbandoned !== 1) throw new Error(`Fallback goalsAbandoned: ${s.totalGoalsAbandoned}`);
                    return true;
                }
            },
            {
                name: 'CommitmentStats has totalXPLostToDecay and lastActivityDate',
                fn: async () => {
                    if (!window.ProductivityData?.CommitmentStats) {
                        throw new Error('CommitmentStats class not available');
                    }
                    const s = new window.ProductivityData.CommitmentStats({
                        totalXPLostToDecay: 42,
                        lastActivityDate: '2025-06-01'
                    });
                    if (s.totalXPLostToDecay !== 42) throw new Error(`totalXPLostToDecay: ${s.totalXPLostToDecay}`);
                    if (s.lastActivityDate !== '2025-06-01') throw new Error(`lastActivityDate: ${s.lastActivityDate}`);
                    return true;
                }
            },

            // ── UserSettings accountability fields ────────────────────
            {
                name: 'UserSettings includes accountability settings',
                fn: async () => {
                    if (!window.ProductivityData?.UserSettings) {
                        throw new Error('UserSettings class not available');
                    }
                    const s = new window.ProductivityData.UserSettings({});
                    const required = [
                        'dailyCheckinEnabled', 'dailyCheckinTime',
                        'xpDecayEnabled', 'xpDecayDailyPercent',
                        'defaultStakeAmount'
                    ];
                    for (const field of required) {
                        if (!(field in s)) {
                            throw new Error(`UserSettings missing field: ${field}`);
                        }
                    }
                    return true;
                }
            },

            // ── incrementGoalStat ─────────────────────────────────────
            {
                name: 'incrementGoalStat accepts amount parameter',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.incrementGoalStat) {
                        throw new Error('incrementGoalStat not available');
                    }
                    // Seed stats
                    const key = window.ProductivityData?.STORAGE_KEYS?.COMMITMENT_STATS || 'productivity_commitment_stats';
                    await new Promise(r => chrome.storage.local.set({
                        [key]: { totalGoalsCreated: 0, totalGoalsCompleted: 0, totalGoalsAbandoned: 0 }
                    }, r));

                    await window.ProductivityData.DataStore.incrementGoalStat('totalGoalsCreated', 5);
                    const stats = await window.ProductivityData.DataStore.getCommitmentStats();
                    if (stats.totalGoalsCreated !== 5) {
                        throw new Error(`Expected 5, got ${stats.totalGoalsCreated}`);
                    }

                    // Cleanup
                    await new Promise(r => chrome.storage.local.remove([key], r));
                    return true;
                }
            },

            // ── Challenges storage key ────────────────────────────────
            {
                name: 'CHALLENGES storage key exists',
                fn: async () => {
                    if (!window.ProductivityData?.STORAGE_KEYS) {
                        throw new Error('STORAGE_KEYS not available');
                    }
                    if (!window.ProductivityData.STORAGE_KEYS.CHALLENGES) {
                        throw new Error('CHALLENGES key not found in STORAGE_KEYS');
                    }
                    return true;
                }
            },
            {
                name: 'getChallenges / saveChallenges CRUD works',
                fn: async () => {
                    const ds = window.ProductivityData?.DataStore;
                    if (!ds?.getChallenges || !ds?.saveChallenges) {
                        throw new Error('getChallenges/saveChallenges not available');
                    }

                    // Write
                    const challenges = [{ id: 'test-c-1', metric: 'tasks', target: 10 }];
                    await ds.saveChallenges(challenges);

                    // Read
                    const loaded = await ds.getChallenges();
                    if (!Array.isArray(loaded) || loaded.length !== 1) {
                        throw new Error(`Expected 1 challenge, got ${loaded?.length}`);
                    }
                    if (loaded[0].id !== 'test-c-1') {
                        throw new Error(`Wrong ID: ${loaded[0].id}`);
                    }

                    // Cleanup
                    await ds.saveChallenges([]);
                    return true;
                }
            },

            // ── ChallengeManager ──────────────────────────────────────
            {
                name: 'ChallengeManager singleton loads without error',
                fn: async () => {
                    if (!window.ChallengeManager) {
                        throw new Error('ChallengeManager not on window');
                    }
                    await window.ChallengeManager.ensureLoaded();
                    return true;
                }
            },
            {
                name: 'ChallengeManager.create adds a challenge',
                fn: async () => {
                    if (!window.ChallengeManager) {
                        throw new Error('ChallengeManager not on window');
                    }
                    await window.ChallengeManager.ensureLoaded();

                    // Clear
                    const ds = window.ProductivityData?.DataStore;
                    if (ds?.saveChallenges) await ds.saveChallenges([]);
                    window.ChallengeManager._challenges = [];

                    const c = await window.ChallengeManager.create({
                        metric: 'tasks',
                        targetCount: 5,
                        type: 'custom'
                    });

                    if (!c || !c.id) throw new Error('Challenge not created');
                    if (c.metric !== 'tasks') throw new Error(`Metric: ${c.metric}`);
                    if (c.targetProgress !== 5) throw new Error(`Target: ${c.targetProgress}`);

                    // Cleanup
                    await window.ChallengeManager.delete(c.id);
                    return true;
                }
            },
            {
                name: 'ChallengeManager.recordProgress increments daily progress',
                fn: async () => {
                    if (!window.ChallengeManager) {
                        throw new Error('ChallengeManager not on window');
                    }
                    await window.ChallengeManager.ensureLoaded();

                    const ds = window.ProductivityData?.DataStore;
                    if (ds?.saveChallenges) await ds.saveChallenges([]);
                    window.ChallengeManager._challenges = [];

                    const c = await window.ChallengeManager.create({
                        metric: 'focus_sessions',
                        targetCount: 10,
                        type: 'custom'
                    });

                    await window.ChallengeManager.recordProgress('focus_sessions', 3);
                    const challenges = await (ds?.getChallenges?.() || Promise.resolve([]));
                    const updated = challenges.find(ch => ch.id === c.id);

                    if (!updated) throw new Error('Challenge not found after recordProgress');

                    const progress = Number(updated.currentProgress) || 0;
                    if (progress < 3) {
                        throw new Error(`Expected progress >= 3, got ${progress}`);
                    }

                    // Cleanup
                    await window.ChallengeManager.delete(c.id);
                    return true;
                }
            },
            {
                name: 'ChallengeManager.delete removes a challenge',
                fn: async () => {
                    if (!window.ChallengeManager) {
                        throw new Error('ChallengeManager not on window');
                    }
                    await window.ChallengeManager.ensureLoaded();

                    const ds = window.ProductivityData?.DataStore;
                    if (ds?.saveChallenges) await ds.saveChallenges([]);
                    window.ChallengeManager._challenges = [];

                    const c = await window.ChallengeManager.create({
                        metric: 'habits',
                        targetCount: 20,
                        type: 'custom'
                    });

                    await window.ChallengeManager.delete(c.id);
                    const remaining = await (ds?.getChallenges?.() || Promise.resolve([]));
                    const found = remaining.find(ch => ch.id === c.id);
                    if (found) throw new Error('Challenge still exists after delete');

                    return true;
                }
            },

            // ── getInvestedTime ───────────────────────────────────────
            {
                name: 'Goal.getInvestedTime returns object with hours and milestones',
                fn: async () => {
                    const Goal = window.ProductivityData?.Goal;
                    if (!Goal) {
                        throw new Error('Goal class not available');
                    }

                    const goal = new Goal({
                        hoursInvested: 4.5,
                        milestones: [
                            { title: 'M1', isCompleted: true },
                            { title: 'M2', isCompleted: false }
                        ]
                    });

                    const result = goal.getInvestedTime();
                    if (typeof result !== 'object') {
                        throw new Error(`Expected object, got ${typeof result}`);
                    }
                    if (!('hours' in result)) throw new Error('Missing hours field');
                    if (!('milestonesCompleted' in result)) throw new Error('Missing milestonesCompleted');
                    if (!('totalMilestones' in result)) throw new Error('Missing totalMilestones');
                    return true;
                }
            }
        ]
    }
};

// Export for test_suite.js merge
if (typeof window !== 'undefined') {
    window.dataModelTests = dataModelTests;
}
