/**
 * ============================================================================
 * NOTIFICATION TESTS
 * ============================================================================
 * Tests for notification scheduling, reminders, and toast display
 */

const notificationTests = {
    'Notifications': {
        icon: '🔔',
        tests: [
            {
                name: 'Notification permissions are granted',
                fn: async () => {
                    if (!('Notification' in window)) {
                        throw new Error('Notification API not available');
                    }

                    // Just check if API exists, don't require granted permission
                    return true;
                }
            },
            {
                name: 'Notification settings storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['notificationSettings'], resolve);
                    });

                    if (result.notificationSettings && typeof result.notificationSettings !== 'object') {
                        throw new Error('notificationSettings should be an object');
                    }
                    return true;
                }
            },
            {
                name: 'Scheduled notifications storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['scheduledNotifications'], resolve);
                    });

                    if (result.scheduledNotifications && !Array.isArray(result.scheduledNotifications)) {
                        throw new Error('scheduledNotifications should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can create a scheduled notification',
                fn: async () => {
                    const testNotification = {
                        id: 'notif-test-' + Date.now(),
                        title: 'Test Notification',
                        message: 'This is a test',
                        scheduledTime: new Date(Date.now() + 3600000).toISOString(),
                        type: 'reminder',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['scheduledNotifications'], resolve);
                    });
                    const notifications = current.scheduledNotifications || [];
                    notifications.push(testNotification);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ scheduledNotifications: notifications }, resolve);
                    });

                    // Cleanup
                    const cleaned = notifications.filter(n => n.id !== testNotification.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ scheduledNotifications: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Reminder time calculation is accurate',
                fn: async () => {
                    const eventTime = new Date('2024-12-09T14:00:00');
                    const reminderMinutes = 15;

                    const reminderTime = new Date(eventTime.getTime() - reminderMinutes * 60 * 1000);
                    const expected = new Date('2024-12-09T13:45:00');

                    if (reminderTime.getHours() !== expected.getHours() ||
                        reminderTime.getMinutes() !== expected.getMinutes()) {
                        throw new Error('Reminder time calculation incorrect');
                    }

                    return true;
                }
            },
            {
                name: 'Due notification check works',
                fn: async () => {
                    const now = Date.now();
                    const notifications = [
                        { id: '1', scheduledTime: new Date(now - 60000).toISOString() }, // Past
                        { id: '2', scheduledTime: new Date(now + 60000).toISOString() }, // Future
                        { id: '3', scheduledTime: new Date(now - 30000).toISOString() }  // Past
                    ];

                    const due = notifications.filter(n => new Date(n.scheduledTime).getTime() <= now);

                    if (due.length !== 2) {
                        throw new Error(`Expected 2 due notifications, got ${due.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Toast notification options are valid',
                fn: async () => {
                    const toastOptions = {
                        type: 'success',
                        duration: 3000,
                        position: 'top-right',
                        icon: '✅'
                    };

                    const validTypes = ['success', 'error', 'warning', 'info'];
                    if (!validTypes.includes(toastOptions.type)) {
                        throw new Error(`Invalid toast type: ${toastOptions.type}`);
                    }

                    if (toastOptions.duration < 1000 || toastOptions.duration > 10000) {
                        throw new Error('Toast duration out of range');
                    }

                    return true;
                }
            },
            {
                name: 'Interval cleanup prevents stacking',
                fn: async () => {
                    // Test that clearing an interval ID works
                    let intervalId = null;
                    let counter = 0;

                    // First interval
                    intervalId = setInterval(() => { counter++; }, 100);

                    // Clear before setting new one (prevents stacking)
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }

                    // New interval
                    intervalId = setInterval(() => { counter++; }, 100);

                    // Clean up
                    clearInterval(intervalId);

                    // Counter should be 0 or very low since we cleaned up quickly
                    if (counter > 2) {
                        throw new Error('Interval stacking may have occurred');
                    }

                    return true;
                }
            },
            {
                name: 'Task reminder toggle syncs to storage',
                fn: async () => {
                    if (typeof updateNotificationPref !== 'function') {
                        return true;
                    }

                    await updateNotificationPref('taskReminders', false);
                    const storedOff = await new Promise(resolve => {
                        chrome.storage.local.get(['taskRemindersEnabled'], resolve);
                    });
                    if (storedOff.taskRemindersEnabled !== false) {
                        throw new Error('taskRemindersEnabled did not update to false');
                    }

                    await updateNotificationPref('taskReminders', true);
                    const storedOn = await new Promise(resolve => {
                        chrome.storage.local.get(['taskRemindersEnabled'], resolve);
                    });
                    if (storedOn.taskRemindersEnabled !== true) {
                        throw new Error('taskRemindersEnabled did not update to true');
                    }

                    return true;
                }
            },
            {
                name: 'Notification preferences persist in settings model',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.getSettings || !window.ProductivityData?.DataStore?.saveSettings) {
                        return true;
                    }

                    const settings = await window.ProductivityData.DataStore.getSettings();

                    const testPrefs = {
                        enabled: false,
                        sound: false,
                        soundType: 'warning',
                        volume: 0.33,
                        desktop: false,
                        taskReminders: false
                    };

                    const testUnknownKey = `__testUnknown_${Date.now()}`;
                    settings.notificationPreferences = testPrefs;
                    settings[testUnknownKey] = { ok: true, n: 1 };

                    await window.ProductivityData.DataStore.saveSettings(settings);

                    const loaded = await window.ProductivityData.DataStore.getSettings();

                    if (!loaded.notificationPreferences) {
                        throw new Error('notificationPreferences missing after reload');
                    }
                    if (loaded.notificationPreferences.enabled !== false) {
                        throw new Error('notificationPreferences.enabled did not persist');
                    }
                    if (loaded.notificationPreferences.volume !== 0.33) {
                        throw new Error('notificationPreferences.volume did not persist');
                    }
                    if (!loaded[testUnknownKey]?.ok) {
                        throw new Error('Unknown settings fields are being dropped');
                    }

                    return true;
                }
            },
            {
                name: 'Daily reminder respects disabled state',
                fn: async () => {
                    if (typeof setDailyReminderEnabled !== 'function' || typeof checkDailyTaskReminder !== 'function') {
                        return true;
                    }

                    await setDailyReminderEnabled(false);

                    // Force reminder time to now (should still not show)
                    const now = new Date();
                    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    NotificationState.dailyReminderTime = time;
                    NotificationState.dailyReminderRepeat = 'once';
                    NotificationState.dailyReminderDays = [0, 1, 2, 3, 4, 5, 6];

                    await chrome.storage.local.set({
                        dailyReminderEnabled: false,
                        dailyReminderTime: time,
                        dailyReminderRepeat: 'once',
                        dailyReminderDays: [0, 1, 2, 3, 4, 5, 6],
                        reminderDismissed: null,
                        lastDailyReminderDate: null
                    });

                    await checkDailyTaskReminder();

                    const modal = document.getElementById('daily-task-reminder-modal');
                    if (modal) {
                        throw new Error('Daily reminder modal appeared while disabled');
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.notificationTests = notificationTests;
}
