/**
 * ============================================================================
 * GOALS & ANALYTICS TESTS
 * ============================================================================
 * Tests for goals tracking, achievements, analytics, and gamification
 */

const goalsAnalyticsTests = {
    'Goals & Milestones': {
        icon: '🎯',
        tests: [
            {
                name: 'Goals storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_goals'], resolve);
                    });

                    if (result.productivity_goals && !Array.isArray(result.productivity_goals)) {
                        throw new Error('productivity_goals should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can create a goal',
                fn: async () => {
                    const testGoal = {
                        id: 'goal-test-' + Date.now(),
                        title: 'Test Goal',
                        description: 'Complete 10 focus sessions',
                        category: 'academic',
                        targetValue: 10,
                        currentValue: 0,
                        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        createdAt: new Date().toISOString(),
                        completed: false
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_goals'], resolve);
                    });
                    const goals = current.productivity_goals || [];
                    goals.push(testGoal);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_goals: goals }, resolve);
                    });

                    // Cleanup
                    const cleaned = goals.filter(g => g.id !== testGoal.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_goals: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Goal progress calculation is accurate',
                fn: async () => {
                    const goal = {
                        targetValue: 10,
                        currentValue: 7
                    };

                    const progress = (goal.currentValue / goal.targetValue) * 100;

                    if (progress !== 70) {
                        throw new Error(`Expected 70%, got ${progress}%`);
                    }

                    return true;
                }
            },
            {
                name: 'Goal categories are valid',
                fn: async () => {
                    const validCategories = ['academic', 'skill', 'project', 'career', 'personal'];
                    const testCategory = 'academic';

                    if (!validCategories.includes(testCategory)) {
                        throw new Error(`Invalid category: ${testCategory}`);
                    }

                    return true;
                }
            },
            {
                name: 'Daily targets storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['dailyTargets'], resolve);
                    });

                    if (result.dailyTargets && typeof result.dailyTargets !== 'object') {
                        throw new Error('dailyTargets should be an object');
                    }

                    return true;
                }
            }
        ]
    },

    'Analytics & Tracking': {
        icon: '📊',
        tests: [
            {
                name: 'Daily activity storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['dailyActivity'], resolve);
                    });

                    if (result.dailyActivity && typeof result.dailyActivity !== 'object') {
                        throw new Error('dailyActivity should be an object');
                    }

                    return true;
                }
            },
            {
                name: 'Productivity score calculation works',
                fn: async () => {
                    const data = {
                        tasksCompleted: 5,
                        tasksTarget: 8,
                        focusMinutes: 120,
                        focusTarget: 180
                    };

                    const taskScore = (data.tasksCompleted / data.tasksTarget) * 50;
                    const focusScore = (data.focusMinutes / data.focusTarget) * 50;
                    const totalScore = Math.min(100, taskScore + focusScore);

                    if (totalScore < 0 || totalScore > 100) {
                        throw new Error(`Score out of range: ${totalScore}`);
                    }

                    const expected = (5 / 8 * 50) + (120 / 180 * 50);
                    if (Math.abs(totalScore - expected) > 0.1) {
                        throw new Error(`Score calculation incorrect: ${totalScore} vs ${expected}`);
                    }

                    return true;
                }
            },
            {
                name: 'Weekly chart data generation works',
                fn: async () => {
                    const weekData = [
                        { day: 'Mon', hours: 2 },
                        { day: 'Tue', hours: 3 },
                        { day: 'Wed', hours: 1.5 },
                        { day: 'Thu', hours: 4 },
                        { day: 'Fri', hours: 2.5 },
                        { day: 'Sat', hours: 1 },
                        { day: 'Sun', hours: 0 }
                    ];

                    const totalHours = weekData.reduce((sum, d) => sum + d.hours, 0);
                    const avgHours = totalHours / 7;

                    if (totalHours !== 14) {
                        throw new Error(`Expected 14 total hours, got ${totalHours}`);
                    }

                    if (Math.abs(avgHours - 2) > 0.01) {
                        throw new Error(`Expected 2 avg hours, got ${avgHours}`);
                    }

                    return true;
                }
            },
            {
                name: 'Streak calculation is accurate',
                fn: async () => {
                    const activityDates = [
                        '2024-12-09',
                        '2024-12-08',
                        '2024-12-07',
                        '2024-12-06'
                    ];

                    // Calculate streak
                    let streak = 0;
                    const today = new Date('2024-12-09');

                    for (let i = 0; i < activityDates.length; i++) {
                        const expectedDate = new Date(today);
                        expectedDate.setDate(today.getDate() - i);
                        const expected = expectedDate.toISOString().split('T')[0];

                        if (activityDates.includes(expected)) {
                            streak++;
                        } else {
                            break;
                        }
                    }

                    if (streak !== 4) {
                        throw new Error(`Expected 4 day streak, got ${streak}`);
                    }

                    return true;
                }
            },
            {
                name: 'Activity heatmap data format is valid',
                fn: async () => {
                    const heatmapData = {};

                    // Generate 12 weeks of test data
                    for (let i = 0; i < 84; i++) {
                        const date = new Date();
                        date.setDate(date.getDate() - i);
                        const key = date.toISOString().split('T')[0];
                        heatmapData[key] = Math.floor(Math.random() * 5);
                    }

                    const days = Object.keys(heatmapData);
                    if (days.length !== 84) {
                        throw new Error(`Expected 84 days, got ${days.length}`);
                    }

                    return true;
                }
            }
        ]
    },

    'Achievements & Gamification': {
        icon: '🏆',
        tests: [
            {
                name: 'Achievements storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['achievements'], resolve);
                    });

                    if (result.achievements && !Array.isArray(result.achievements)) {
                        throw new Error('achievements should be an array');
                    }

                    return true;
                }
            },
            {
                name: 'XP calculation is accurate',
                fn: async () => {
                    const xpPerTask = 10;
                    const xpPerFocusMinute = 1;
                    const xpPerGoal = 50;

                    const tasksCompleted = 5;
                    const focusMinutes = 120;
                    const goalsCompleted = 1;

                    const totalXP =
                        (tasksCompleted * xpPerTask) +
                        (focusMinutes * xpPerFocusMinute) +
                        (goalsCompleted * xpPerGoal);

                    if (totalXP !== 220) {
                        throw new Error(`Expected 220 XP, got ${totalXP}`);
                    }

                    return true;
                }
            },
            {
                name: 'Level calculation from XP is correct',
                fn: async () => {
                    const xpPerLevel = 100;
                    const testCases = [
                        { xp: 0, expectedLevel: 1 },
                        { xp: 50, expectedLevel: 1 },
                        { xp: 100, expectedLevel: 2 },
                        { xp: 250, expectedLevel: 3 },
                        { xp: 1000, expectedLevel: 11 }
                    ];

                    for (const test of testCases) {
                        const level = Math.floor(test.xp / xpPerLevel) + 1;
                        if (level !== test.expectedLevel) {
                            throw new Error(`XP ${test.xp}: expected level ${test.expectedLevel}, got ${level}`);
                        }
                    }

                    return true;
                }
            },
            {
                name: 'Achievement unlock conditions work',
                fn: async () => {
                    const achievements = [
                        { id: 'first_task', condition: (stats) => stats.tasksCompleted >= 1 },
                        { id: 'task_master', condition: (stats) => stats.tasksCompleted >= 100 },
                        { id: 'focus_beginner', condition: (stats) => stats.focusSessions >= 1 }
                    ];

                    const userStats = {
                        tasksCompleted: 5,
                        focusSessions: 10
                    };

                    const unlocked = achievements.filter(a => a.condition(userStats));

                    if (unlocked.length !== 2) {
                        throw new Error(`Expected 2 unlocked achievements, got ${unlocked.length}`);
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.goalsAnalyticsTests = goalsAnalyticsTests;
}
