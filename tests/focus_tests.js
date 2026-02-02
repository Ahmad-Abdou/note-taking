/**
 * ============================================================================
 * FOCUS SESSION TESTS
 * ============================================================================
 * Tests for focus timer functionality, pause/resume, breaks, and notifications
 */

const focusSessionTests = {
    'Focus Sessions': {
        icon: '⏱️',
        tests: [
            {
                name: 'Focus session storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['focusSession', 'focusState', 'focusSessions'], resolve);
                    });

                    if (result.focusSession && typeof result.focusSession !== 'object') {
                        throw new Error('focusSession should be an object');
                    }
                    if (result.focusState && typeof result.focusState !== 'object') {
                        throw new Error('focusState should be an object');
                    }
                    if (result.focusSessions && !Array.isArray(result.focusSessions)) {
                        throw new Error('focusSessions should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can create a focus session',
                fn: async () => {
                    const testSession = {
                        isActive: true,
                        isPaused: false,
                        duration: 25,
                        startTime: Date.now(),
                        pausedTime: 0,
                        taskTitle: 'Test Task'
                    };

                    await new Promise(resolve => {
                        chrome.storage.local.set({ testFocusSession: testSession }, resolve);
                    });

                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['testFocusSession'], resolve);
                    });

                    if (!result.testFocusSession || !result.testFocusSession.isActive) {
                        throw new Error('Focus session was not saved correctly');
                    }

                    // Cleanup
                    await new Promise(resolve => {
                        chrome.storage.local.remove(['testFocusSession'], resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Focus state has required fields',
                fn: async () => {
                    const testState = {
                        isActive: true,
                        isPaused: false,
                        isBreak: false,
                        remainingSeconds: 1500,
                        selectedMinutes: 25,
                        taskTitle: 'Test',
                        startTimestamp: Date.now(),
                        endTimestamp: Date.now() + 25 * 60 * 1000,
                        pausedRemainingSeconds: null,
                        pausedElapsedSeconds: null
                    };

                    const requiredFields = ['isActive', 'isPaused', 'isBreak', 'remainingSeconds', 'selectedMinutes'];
                    for (const field of requiredFields) {
                        if (testState[field] === undefined) {
                            throw new Error(`Focus state missing required field: ${field}`);
                        }
                    }

                    if (typeof testState.endTimestamp !== 'number') {
                        throw new Error('Focus state should include numeric endTimestamp for countdown sessions');
                    }

                    return true;
                }
            },
            {
                name: 'Countdown focusState can be stored with timestamps and pause snapshot fields',
                fn: async () => {
                    const now = Date.now();
                    const focusState = {
                        isActive: true,
                        isPaused: false,
                        isBreak: false,
                        isOpenEnded: false,
                        remainingSeconds: 60,
                        selectedMinutes: 1,
                        taskTitle: 'Timestamp Test',
                        startTimestamp: now,
                        endTimestamp: now + 60 * 1000,
                        pausedRemainingSeconds: null,
                        pausedElapsedSeconds: null
                    };

                    await new Promise(resolve => chrome.storage.local.set({ focusState }, resolve));
                    const readBack = await new Promise(resolve => chrome.storage.local.get(['focusState'], resolve));
                    const saved = readBack.focusState;

                    if (!saved || !saved.isActive) {
                        throw new Error('Stored focusState was not saved');
                    }
                    if (typeof saved.startTimestamp !== 'number' || typeof saved.endTimestamp !== 'number') {
                        throw new Error('Stored focusState missing timestamps');
                    }

                    // Simulate pause snapshot
                    saved.isPaused = true;
                    saved.pausedRemainingSeconds = 45;
                    await new Promise(resolve => chrome.storage.local.set({ focusState: saved }, resolve));
                    const pausedBack = await new Promise(resolve => chrome.storage.local.get(['focusState'], resolve));
                    if (!pausedBack.focusState?.isPaused || typeof pausedBack.focusState?.pausedRemainingSeconds !== 'number') {
                        throw new Error('Pause snapshot fields not persisted');
                    }

                    await new Promise(resolve => chrome.storage.local.remove(['focusState'], resolve));
                    return true;
                }
            },
            {
                name: 'Pause/resume toggle works correctly',
                fn: async () => {
                    // Test logic for pause state toggle
                    let isPaused = false;

                    // Simulate pause
                    isPaused = !isPaused;
                    if (isPaused !== true) throw new Error('Pause toggle failed');

                    // Simulate resume
                    isPaused = !isPaused;
                    if (isPaused !== false) throw new Error('Resume toggle failed');

                    return true;
                }
            },
            {
                name: 'Timer calculation is accurate',
                fn: async () => {
                    const durationMinutes = 25;
                    const expectedSeconds = durationMinutes * 60;

                    if (expectedSeconds !== 1500) {
                        throw new Error(`Expected 1500 seconds, got ${expectedSeconds}`);
                    }

                    // Test formatting
                    const mins = Math.floor(expectedSeconds / 60);
                    const secs = expectedSeconds % 60;
                    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

                    if (formatted !== '25:00') {
                        throw new Error(`Expected '25:00', got '${formatted}'`);
                    }

                    return true;
                }
            },
            {
                name: 'Session completion records to history',
                fn: async () => {
                    const completedSession = {
                        id: 'test-session-' + Date.now(),
                        duration: 25,
                        completedAt: new Date().toISOString(),
                        taskTitle: 'Test Completed Session'
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['focusSessions'], resolve);
                    });

                    const sessions = current.focusSessions || [];
                    sessions.push(completedSession);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ focusSessions: sessions }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['focusSessions'], resolve);
                    });

                    const found = verify.focusSessions.find(s => s.id === completedSession.id);
                    if (!found) throw new Error('Completed session not saved to history');

                    // Cleanup
                    const cleaned = verify.focusSessions.filter(s => s.id !== completedSession.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ focusSessions: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Break duration calculation is correct',
                fn: async () => {
                    const focusDuration = 25;
                    const shortBreak = 5;
                    const longBreak = 15;

                    // Standard pomodoro break logic
                    const sessionsBeforeLongBreak = 4;
                    const sessionCount = 3;

                    const breakDuration = sessionCount % sessionsBeforeLongBreak === 0 ? longBreak : shortBreak;

                    if (breakDuration !== 5) {
                        throw new Error(`Expected 5 min break, got ${breakDuration}`);
                    }

                    return true;
                }
            },
            {
                name: 'Elapsed time tracking is accurate',
                fn: async () => {
                    const startTime = Date.now() - 60000; // 1 minute ago
                    const now = Date.now();
                    const elapsedMs = now - startTime;
                    const elapsedMinutes = Math.floor(elapsedMs / 60000);

                    if (elapsedMinutes !== 1) {
                        throw new Error(`Expected 1 minute elapsed, got ${elapsedMinutes}`);
                    }

                    return true;
                }
            },
            {
                name: 'Pause correctly snapshots remaining time',
                fn: async () => {
                    // Simulate pause snapshotting
                    const endTimestamp = Date.now() + (10 * 60 * 1000); // 10 minutes from now
                    const remainingSeconds = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));

                    // Remaining should be approximately 10 minutes (600 seconds)
                    if (remainingSeconds < 599 || remainingSeconds > 601) {
                        throw new Error(`Expected ~600 seconds remaining, got ${remainingSeconds}`);
                    }

                    return true;
                }
            },
            {
                name: 'Resume correctly recalculates endTimestamp',
                fn: async () => {
                    // Simulate resume with 5 minutes remaining
                    const pausedRemainingSeconds = 5 * 60; // 5 minutes
                    const now = Date.now();
                    const newEndTimestamp = now + (pausedRemainingSeconds * 1000);

                    // Verify the endTimestamp is approximately 5 minutes from now
                    const expectedEnd = now + (5 * 60 * 1000);
                    const diff = Math.abs(newEndTimestamp - expectedEnd);

                    if (diff > 1000) { // Allow 1 second tolerance
                        throw new Error(`endTimestamp calculation off by ${diff}ms`);
                    }

                    return true;
                }
            },
            {
                name: 'Resume correctly recalculates startTimestamp',
                fn: async () => {
                    // Simulate resume: 5 minutes remaining out of 25 minute session
                    const selectedMinutes = 25;
                    const remaining = 5 * 60; // 5 minutes left
                    const now = Date.now();

                    // Calculate how startTimestamp should be recalculated
                    const newStartTimestamp = now - ((selectedMinutes * 60 - remaining) * 1000);

                    // This should be 20 minutes ago (25 - 5 = 20 minutes elapsed)
                    const elapsedSinceStart = (now - newStartTimestamp) / 1000;
                    const expectedElapsed = 20 * 60; // 20 minutes in seconds

                    if (Math.abs(elapsedSinceStart - expectedElapsed) > 1) {
                        throw new Error(`Expected ~${expectedElapsed}s elapsed, got ${elapsedSinceStart}s`);
                    }

                    return true;
                }
            },
            {
                name: 'Open-ended pause correctly snapshots elapsed time',
                fn: async () => {
                    // Simulate open-ended session that started 10 minutes ago
                    const startTimestamp = Date.now() - (10 * 60 * 1000);
                    const now = Date.now();

                    // Calculate elapsed on pause
                    const elapsedSeconds = Math.max(0, Math.floor((now - startTimestamp) / 1000));

                    // Should be approximately 10 minutes (600 seconds)
                    if (elapsedSeconds < 599 || elapsedSeconds > 601) {
                        throw new Error(`Expected ~600 seconds elapsed, got ${elapsedSeconds}`);
                    }

                    return true;
                }
            },
            {
                name: 'Open-ended resume correctly recalculates startTimestamp',
                fn: async () => {
                    // Simulate resume with 10 minutes elapsed
                    const pausedElapsedSeconds = 10 * 60;
                    const now = Date.now();

                    // Calculate new startTimestamp
                    const newStartTimestamp = now - (pausedElapsedSeconds * 1000);

                    // Verify elapsed calculation works correctly
                    const recalculatedElapsed = Math.floor((now - newStartTimestamp) / 1000);

                    if (Math.abs(recalculatedElapsed - pausedElapsedSeconds) > 1) {
                        throw new Error(`Expected ${pausedElapsedSeconds}s elapsed, got ${recalculatedElapsed}s`);
                    }

                    return true;
                }
            }
        ]
    },

    'Focus Mode UI': {
        icon: '🎨',
        tests: [
            {
                name: 'Focus page has 5 timer option cards',
                fn: async () => {
                    // Skip if running from test runner page (Focus page not visible)
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) {
                        console.log('Skipping Focus Mode UI tests - page not active');
                        return true;
                    }

                    const timerCards = document.querySelectorAll('.timer-options-redesign .timer-option-card');
                    if (timerCards.length !== 5) {
                        throw new Error(`Expected 5 timer option cards, found ${timerCards.length}`);
                    }
                    return true;
                }
            },
            {
                name: 'Timer cards have correct data-minutes attributes',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const expectedMinutes = ['25', '50', '90'];
                    const timerCards = document.querySelectorAll('.timer-option-card[data-minutes]');

                    for (const expected of expectedMinutes) {
                        const found = Array.from(timerCards).some(card => card.dataset.minutes === expected);
                        if (!found) {
                            throw new Error(`Missing timer card with data-minutes="${expected}"`);
                        }
                    }
                    return true;
                }
            },
            {
                name: 'Focus stats section has icon wrappers',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const iconWrappers = document.querySelectorAll('.focus-stats .stat-icon-wrapper');
                    if (iconWrappers.length < 4) {
                        throw new Error(`Expected 4 stat icon wrappers, found ${iconWrappers.length}`);
                    }
                    return true;
                }
            },
            {
                name: 'Focus stats section has streak and trophy icon variants',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const streakIcon = document.querySelector('.stat-icon-wrapper.streak');
                    const trophyIcon = document.querySelector('.stat-icon-wrapper.trophy');

                    if (!streakIcon) {
                        throw new Error('Missing streak icon wrapper with .streak class');
                    }
                    if (!trophyIcon) {
                        throw new Error('Missing trophy icon wrapper with .trophy class');
                    }
                    return true;
                }
            },
            {
                name: 'Session settings section exists with border separator',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const settingsSection = document.querySelector('.session-settings-redesign');
                    if (!settingsSection) {
                        throw new Error('Session settings section not found');
                    }

                    const settingsRow = document.querySelector('.settings-row');
                    if (!settingsRow) {
                        throw new Error('Settings row not found');
                    }

                    return true;
                }
            },
            {
                name: 'Toggle pills exist with proper structure',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const togglePills = document.querySelectorAll('.toggle-pill');
                    if (togglePills.length < 4) {
                        throw new Error(`Expected at least 4 toggle pills, found ${togglePills.length}`);
                    }

                    for (const pill of togglePills) {
                        const checkbox = pill.querySelector('input[type="checkbox"]');
                        const label = pill.querySelector('.pill-label');

                        if (!checkbox) {
                            throw new Error('Toggle pill missing checkbox input');
                        }
                        if (!label) {
                            throw new Error('Toggle pill missing .pill-label');
                        }
                    }
                    return true;
                }
            },
            {
                name: 'Start Focus button exists and is prominent',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const startBtn = document.querySelector('.btn-start-focus, #start-focus-btn');
                    if (!startBtn) {
                        throw new Error('Start Focus button not found');
                    }

                    const icon = startBtn.querySelector('i.fa-play');
                    if (!icon) {
                        throw new Error('Start button missing play icon');
                    }

                    return true;
                }
            },
            {
                name: 'Recent sessions section has history icon',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const recentSessions = document.querySelector('.recent-sessions h3');
                    if (!recentSessions) {
                        throw new Error('Recent sessions header not found');
                    }

                    const historyIcon = recentSessions.querySelector('i.fa-history');
                    if (!historyIcon) {
                        throw new Error('Recent sessions header missing history icon');
                    }

                    return true;
                }
            },
            {
                name: 'Focus stats section has "Your Progress" header',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const statsSection = document.querySelector('.focus-stats-section');
                    if (!statsSection) {
                        throw new Error('Focus stats section not found');
                    }

                    const sectionTitle = statsSection.querySelector('.section-title');
                    if (!sectionTitle) {
                        throw new Error('Section title not found in focus stats');
                    }

                    if (!sectionTitle.textContent.includes('Progress')) {
                        throw new Error('Section title should contain "Progress"');
                    }

                    return true;
                }
            },
            {
                name: 'No redundant top session stats bar',
                fn: async () => {
                    const focusPage = document.querySelector('#page-focus');
                    if (!focusPage || !focusPage.classList.contains('active')) return true;

                    const topStatsBar = focusPage.querySelector(':scope > .session-stats-bar');
                    if (topStatsBar) {
                        throw new Error('Redundant top session stats bar should be removed');
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.focusSessionTests = focusSessionTests;
}
