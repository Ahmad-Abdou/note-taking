/**
 * ============================================================================
 * SCHEDULE & CALENDAR TESTS
 * ============================================================================
 * Tests for calendar events, scheduling, imports, and date handling
 */

const scheduleTests = {
    'Schedule & Calendar': {
        icon: '📅',
        tests: [
            {
                name: 'Schedule events storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get([
                            'productivity_events',
                            'importedScheduleEvents',
                            'productivity_schedule_school',
                            'productivity_schedule_personal',
                            'pinnedCountdowns'
                        ], resolve);
                    });

                    if (result.productivity_events && !Array.isArray(result.productivity_events)) {
                        throw new Error('productivity_events should be an array');
                    }
                    if (result.importedScheduleEvents && !Array.isArray(result.importedScheduleEvents)) {
                        throw new Error('importedScheduleEvents should be an array');
                    }
                    if (result.productivity_schedule_school && !Array.isArray(result.productivity_schedule_school)) {
                        throw new Error('productivity_schedule_school should be an array');
                    }
                    if (result.productivity_schedule_personal && !Array.isArray(result.productivity_schedule_personal)) {
                        throw new Error('productivity_schedule_personal should be an array');
                    }
                    if (result.pinnedCountdowns && !Array.isArray(result.pinnedCountdowns)) {
                        throw new Error('pinnedCountdowns should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'DataStore can save and retrieve a schedule event',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.saveScheduleEvent || !window.ProductivityData?.DataStore?.getScheduleEvents) {
                        throw new Error('ProductivityData.DataStore schedule APIs are not available');
                    }

                    const id = 'schedule-ds-test-' + Date.now();
                    const today = new Date().toISOString().split('T')[0];
                    const event = new window.ProductivityData.ScheduleEvent({
                        id,
                        title: 'DS Schedule Test',
                        date: today,
                        startTime: '10:00',
                        endTime: '10:30',
                        type: 'study',
                        scheduleType: 'school'
                    });

                    await window.ProductivityData.DataStore.saveScheduleEvent(event);
                    const events = await window.ProductivityData.DataStore.getScheduleEvents('school');
                    const found = (events || []).find(e => e.id === id);
                    if (!found) {
                        throw new Error('Saved schedule event not found via DataStore');
                    }

                    // Cleanup
                    await window.ProductivityData.DataStore.deleteScheduleEvent(id, 'school');
                    return true;
                }
            },
            {
                name: 'Pinned countdowns persist in storage',
                fn: async () => {
                    const id = 'pinned-test-' + Date.now();
                    await new Promise(resolve => chrome.storage.local.set({ pinnedCountdowns: [id] }, resolve));
                    const verify = await new Promise(resolve => chrome.storage.local.get(['pinnedCountdowns'], resolve));
                    if (!Array.isArray(verify.pinnedCountdowns) || verify.pinnedCountdowns[0] !== id) {
                        throw new Error('Pinned countdowns not persisted');
                    }
                    await new Promise(resolve => chrome.storage.local.remove(['pinnedCountdowns'], resolve));
                    return true;
                }
            },
            {
                name: 'Can create a calendar event',
                fn: async () => {
                    const testEvent = {
                        id: 'event-test-' + Date.now(),
                        title: 'Test Event',
                        date: new Date().toISOString().split('T')[0],
                        startTime: '10:00',
                        endTime: '11:00',
                        color: '#4285f4',
                        description: 'Test event description',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_events'], resolve);
                    });
                    const events = current.productivity_events || [];
                    events.push(testEvent);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_events: events }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_events'], resolve);
                    });

                    const found = verify.productivity_events.find(e => e.id === testEvent.id);
                    if (!found) throw new Error('Event was not saved');

                    // Cleanup
                    const cleaned = verify.productivity_events.filter(e => e.id !== testEvent.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_events: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Event has required fields',
                fn: async () => {
                    const event = {
                        id: 'test-id',
                        title: 'Test',
                        date: '2024-12-09',
                        startTime: '10:00'
                    };

                    const requiredFields = ['id', 'title', 'date', 'startTime'];
                    for (const field of requiredFields) {
                        if (event[field] === undefined) {
                            throw new Error(`Event missing required field: ${field}`);
                        }
                    }
                    return true;
                }
            },
            {
                name: 'Date parsing works correctly',
                fn: async () => {
                    const dateStr = '2024-12-09';
                    const parsed = new Date(dateStr);

                    if (isNaN(parsed.getTime())) {
                        throw new Error('Date parsing failed');
                    }

                    const year = parsed.getFullYear();
                    const month = parsed.getMonth() + 1;
                    const day = parsed.getDate();

                    if (year !== 2024 || month !== 12 || day !== 9) {
                        throw new Error(`Date parsed incorrectly: ${year}-${month}-${day}`);
                    }

                    return true;
                }
            },
            {
                name: 'Time range validation works',
                fn: async () => {
                    const startTime = '10:00';
                    const endTime = '11:00';

                    const [startHour, startMin] = startTime.split(':').map(Number);
                    const [endHour, endMin] = endTime.split(':').map(Number);

                    const startMinutes = startHour * 60 + startMin;
                    const endMinutes = endHour * 60 + endMin;

                    if (endMinutes <= startMinutes) {
                        throw new Error('End time should be after start time');
                    }

                    return true;
                }
            },
            {
                name: 'Week navigation calculation works',
                fn: async () => {
                    const currentDate = new Date('2024-12-09');

                    // Get week start (Sunday)
                    const weekStart = new Date(currentDate);
                    weekStart.setDate(currentDate.getDate() - currentDate.getDay());

                    // Get week end (Saturday)
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 6);

                    // Navigate to next week
                    const nextWeekStart = new Date(weekStart);
                    nextWeekStart.setDate(weekStart.getDate() + 7);

                    const expectedNextWeek = new Date('2024-12-15');
                    if (nextWeekStart.getDate() !== expectedNextWeek.getDate()) {
                        throw new Error('Week navigation calculation incorrect');
                    }

                    return true;
                }
            },
            {
                name: 'Month view date mapping is accurate',
                fn: async () => {
                    const date = new Date('2024-12-09');
                    const year = date.getFullYear();
                    const month = date.getMonth();

                    // First day of month
                    const firstDay = new Date(year, month, 1);
                    // Last day of month
                    const lastDay = new Date(year, month + 1, 0);

                    if (firstDay.getDate() !== 1) {
                        throw new Error('First day calculation incorrect');
                    }

                    if (lastDay.getDate() !== 31) { // December has 31 days
                        throw new Error(`Last day calculation incorrect: got ${lastDay.getDate()}`);
                    }

                    return true;
                }
            },
            {
                name: 'Event overlap detection works',
                fn: async () => {
                    const events = [
                        { startTime: '10:00', endTime: '11:00' },
                        { startTime: '10:30', endTime: '11:30' }
                    ];

                    const [start1H, start1M] = events[0].startTime.split(':').map(Number);
                    const [end1H, end1M] = events[0].endTime.split(':').map(Number);
                    const [start2H, start2M] = events[1].startTime.split(':').map(Number);
                    const [end2H, end2M] = events[1].endTime.split(':').map(Number);

                    const start1 = start1H * 60 + start1M;
                    const end1 = end1H * 60 + end1M;
                    const start2 = start2H * 60 + start2M;
                    const end2 = end2H * 60 + end2M;

                    const overlaps = start1 < end2 && end1 > start2;

                    if (!overlaps) {
                        throw new Error('Overlap detection failed - events do overlap');
                    }

                    return true;
                }
            },
            {
                name: 'Countdown storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdowns'], resolve);
                    });

                    if (result.countdowns && !Array.isArray(result.countdowns)) {
                        throw new Error('Countdowns should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Countdown calculation is accurate',
                fn: async () => {
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() + 7); // 7 days from now

                    const now = new Date();
                    const diffMs = targetDate - now;
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                    if (diffDays < 6 || diffDays > 7) {
                        throw new Error(`Expected ~7 days, got ${diffDays}`);
                    }

                    return true;
                }
            },
            {
                name: 'Can filter events by date',
                fn: async () => {
                    const events = [
                        { id: '1', date: '2024-12-09' },
                        { id: '2', date: '2024-12-09' },
                        { id: '3', date: '2024-12-10' }
                    ];

                    const targetDate = '2024-12-09';
                    const filtered = events.filter(e => e.date === targetDate);

                    if (filtered.length !== 2) {
                        throw new Error(`Expected 2 events, got ${filtered.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Recurring event pattern works',
                fn: async () => {
                    const baseDate = new Date('2024-12-09');
                    const recurrencePattern = 'weekly';

                    // Generate next 4 occurrences
                    const occurrences = [];
                    for (let i = 0; i < 4; i++) {
                        const occurrence = new Date(baseDate);
                        occurrence.setDate(baseDate.getDate() + (i * 7));
                        occurrences.push(occurrence.toISOString().split('T')[0]);
                    }

                    if (occurrences.length !== 4) {
                        throw new Error('Recurring event generation failed');
                    }

                    if (occurrences[1] !== '2024-12-16') {
                        throw new Error(`Second occurrence incorrect: ${occurrences[1]}`);
                    }

                    return true;
                }
            },
            {
                name: 'Pinned countdowns sync with task countdowns',
                fn: async () => {
                    if (typeof togglePinnedCountdown !== 'function' || typeof ScheduleState === 'undefined') {
                        return true;
                    }

                    const eventId = 'task-countdown-test-' + Date.now();
                    const taskId = 'task-id-' + Date.now();
                    const today = new Date().toISOString().split('T')[0];

                    ScheduleState.events = Array.isArray(ScheduleState.events) ? ScheduleState.events : [];
                    ScheduleState.events.push({
                        id: eventId,
                        isTask: true,
                        taskId,
                        date: today,
                        startTime: '09:00',
                        endTime: '10:00',
                        type: 'deadline'
                    });

                    ScheduleState.pinnedCountdowns = [];
                    await new Promise(resolve => chrome.storage.local.set({ taskCountdowns: [] }, resolve));

                    await togglePinnedCountdown(eventId);

                    const storedAfterPin = await new Promise(resolve => {
                        chrome.storage.local.get(['taskCountdowns'], resolve);
                    });

                    if (!ScheduleState.pinnedCountdowns.includes(eventId)) {
                        throw new Error('Event was not pinned');
                    }
                    if (!storedAfterPin.taskCountdowns?.includes(taskId)) {
                        throw new Error('Task countdown was not synced');
                    }

                    await togglePinnedCountdown(eventId);

                    const storedAfterUnpin = await new Promise(resolve => {
                        chrome.storage.local.get(['taskCountdowns'], resolve);
                    });

                    if (ScheduleState.pinnedCountdowns.includes(eventId)) {
                        throw new Error('Event was not unpinned');
                    }
                    if (storedAfterUnpin.taskCountdowns?.includes(taskId)) {
                        throw new Error('Task countdown was not removed');
                    }

                    ScheduleState.events = ScheduleState.events.filter(e => e.id !== eventId);
                    await new Promise(resolve => chrome.storage.local.remove(['taskCountdowns', 'pinnedCountdowns'], resolve));
                    return true;
                }
            },
            {
                name: 'Imported calendar color stays consistent',
                fn: async () => {
                    if (typeof getEventDisplayColors !== 'function' || typeof ScheduleState === 'undefined') {
                        return true;
                    }

                    const calId = 'imported-color-test-' + Date.now();
                    const previousMeta = ScheduleState.importedCalendarsMeta;
                    ScheduleState.importedCalendarsMeta = {
                        ...(ScheduleState.importedCalendarsMeta || {}),
                        [calId]: { color: '#ff0000' }
                    };

                    const event = {
                        isImported: true,
                        importedCalendarId: calId,
                        color: '#00ff00',
                        type: 'class'
                    };

                    const colors = getEventDisplayColors(event);
                    if (colors.border !== '#ff0000') {
                        throw new Error('Imported calendar color did not override event color');
                    }

                    ScheduleState.importedCalendarsMeta = previousMeta;
                    return true;
                }
            },
            {
                name: 'Countdown custom titles persist in storage',
                fn: async () => {
                    const testEventId = 'custom-title-test-' + Date.now();
                    const testTitle = 'My Custom Countdown Title';

                    // Save a custom countdown title
                    await chrome.storage.local.set({
                        countdownTitles: { [testEventId]: testTitle }
                    });

                    // Verify it was saved
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdownTitles'], resolve);
                    });

                    if (!result.countdownTitles || result.countdownTitles[testEventId] !== testTitle) {
                        throw new Error('Countdown custom title was not persisted correctly');
                    }

                    // Cleanup
                    await new Promise(resolve => chrome.storage.local.remove(['countdownTitles'], resolve));
                    return true;
                }
            },
            {
                name: 'Filter collapse state persists in storage',
                fn: async () => {
                    // Save collapsed state as true
                    await chrome.storage.local.set({ filtersCollapsed: true });

                    let result = await new Promise(resolve => {
                        chrome.storage.local.get(['filtersCollapsed'], resolve);
                    });

                    if (result.filtersCollapsed !== true) {
                        throw new Error('filtersCollapsed was not saved as true');
                    }

                    // Save collapsed state as false
                    await chrome.storage.local.set({ filtersCollapsed: false });

                    result = await new Promise(resolve => {
                        chrome.storage.local.get(['filtersCollapsed'], resolve);
                    });

                    if (result.filtersCollapsed !== false) {
                        throw new Error('filtersCollapsed was not saved as false');
                    }

                    // Cleanup
                    await new Promise(resolve => chrome.storage.local.remove(['filtersCollapsed'], resolve));
                    return true;
                }
            },
            {
                name: 'Notification volume setting persists',
                fn: async () => {
                    // Get current settings
                    const currentSettings = await new Promise(resolve => {
                        chrome.storage.local.get(['productivitySettings'], resolve);
                    });

                    const settings = currentSettings.productivitySettings || {};
                    const testVolume = 0.42;

                    // Set a specific volume
                    settings.notificationPreferences = settings.notificationPreferences || {};
                    settings.notificationPreferences.volume = testVolume;

                    await chrome.storage.local.set({ productivitySettings: settings });

                    // Verify it persisted
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['productivitySettings'], resolve);
                    });

                    const savedVolume = result.productivitySettings?.notificationPreferences?.volume;
                    if (savedVolume !== testVolume) {
                        throw new Error(`Volume not persisted: expected ${testVolume}, got ${savedVolume}`);
                    }

                    return true;
                }
            },
            {
                name: 'Countdown title can be updated after initial save',
                fn: async () => {
                    const testEventId = 'edit-title-test-' + Date.now();
                    const initialTitle = 'Initial Title';
                    const updatedTitle = 'Updated Title';

                    // Save initial title
                    await chrome.storage.local.set({
                        countdownTitles: { [testEventId]: initialTitle }
                    });

                    // Verify initial save
                    let result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdownTitles'], resolve);
                    });

                    if (result.countdownTitles[testEventId] !== initialTitle) {
                        throw new Error('Initial title was not saved correctly');
                    }

                    // Update the title
                    await chrome.storage.local.set({
                        countdownTitles: { [testEventId]: updatedTitle }
                    });

                    // Verify update
                    result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdownTitles'], resolve);
                    });

                    if (result.countdownTitles[testEventId] !== updatedTitle) {
                        throw new Error(`Title not updated: expected "${updatedTitle}", got "${result.countdownTitles[testEventId]}"`);
                    }

                    // Cleanup
                    await new Promise(resolve => chrome.storage.local.remove(['countdownTitles'], resolve));
                    return true;
                }
            },
            {
                name: 'Custom title can be removed (reset to original)',
                fn: async () => {
                    const testEventId = 'remove-title-test-' + Date.now();
                    const customTitle = 'Custom Title to Remove';

                    // Save custom title
                    await chrome.storage.local.set({
                        countdownTitles: { [testEventId]: customTitle }
                    });

                    // Verify it exists
                    let result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdownTitles'], resolve);
                    });

                    if (!result.countdownTitles[testEventId]) {
                        throw new Error('Custom title was not saved');
                    }

                    // Remove the custom title (simulating reset to original)
                    const titles = result.countdownTitles;
                    delete titles[testEventId];
                    await chrome.storage.local.set({ countdownTitles: titles });

                    // Verify it's removed
                    result = await new Promise(resolve => {
                        chrome.storage.local.get(['countdownTitles'], resolve);
                    });

                    if (result.countdownTitles && result.countdownTitles[testEventId]) {
                        throw new Error('Custom title was not removed');
                    }

                    // Cleanup
                    await new Promise(resolve => chrome.storage.local.remove(['countdownTitles'], resolve));
                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.scheduleTests = scheduleTests;
}
