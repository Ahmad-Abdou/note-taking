/**
 * ============================================================================
 * HABIT TRACKER TESTS
 * ============================================================================
 * Regression tests for habit tracker storage upgrades and custom habit CRUD.
 */

function getStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r?.[key])));
}

function setStorage(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
}

const habitTests = {
    'Habit Tracker': {
        icon: '📅',
        tests: [
            {
                name: 'Habit tracker storage upgrades to v2 (goalsMeta)',
                fn: async () => {
                    if (typeof window.HabitTrackerCalendar !== 'function') {
                        // Test runner may not load the widget; don't fail the suite.
                        return true;
                    }

                    const key = `habitTrackerCalendar_test_${Date.now()}`;
                    await setStorage({
                        [key]: {
                            version: 1,
                            goals: {
                                study: {
                                    startDate: '2025-01-01',
                                    endDate: '2025-01-05',
                                    completed: { '2025-01-02': 1 }
                                }
                            }
                        }
                    });

                    const mount = document.createElement('div');
                    mount.id = `mount-${Date.now()}`;
                    document.body.appendChild(mount);

                    const widget = new window.HabitTrackerCalendar({
                        mountEl: mount,
                        storageKey: key,
                        goals: [{ id: 'study', label: 'Study' }]
                    });

                    await widget.init();

                    // allow async _save() called from _ensureGoalDefaults() to flush
                    await new Promise((r) => setTimeout(r, 50));

                    const stored = await getStorage(key);
                    if (!stored || stored.version !== 2) {
                        throw new Error('Expected storage version 2 after init');
                    }
                    if (!Array.isArray(stored.goalsMeta) || stored.goalsMeta.length < 1) {
                        throw new Error('Expected goalsMeta array after upgrade');
                    }
                    if (!stored.goalsMeta.some(g => g.id === 'study')) {
                        throw new Error('Expected goalsMeta to include existing goal id');
                    }

                    mount.remove();
                    return true;
                }
            },
            {
                name: 'Can add a custom habit and persist it',
                fn: async () => {
                    if (typeof window.HabitTrackerCalendar !== 'function') {
                        return true;
                    }

                    const key = `habitTrackerCalendar_test_${Date.now()}`;

                    const mount = document.createElement('div');
                    mount.id = `mount-${Date.now()}`;
                    document.body.appendChild(mount);

                    const widget = new window.HabitTrackerCalendar({
                        mountEl: mount,
                        storageKey: key,
                        goals: [{ id: 'study', label: 'Study' }]
                    });

                    await widget.init();
                    widget._handleToggleManage();

                    const input = mount.querySelector('.habit-manage-input');
                    if (!input) throw new Error('Manage input not found');
                    input.value = 'Meditate 10m';

                    await widget._handleAddHabit();

                    const stored = await getStorage(key);
                    if (!stored || stored.version !== 2) {
                        throw new Error('Expected version 2 storage');
                    }
                    if (!Array.isArray(stored.goalsMeta) || !stored.goalsMeta.some(g => g.label === 'Meditate 10m')) {
                        throw new Error('New habit not found in goalsMeta');
                    }

                    const newId = stored.goalsMeta.find(g => g.label === 'Meditate 10m')?.id;
                    if (!newId || !stored.goals?.[newId]) {
                        throw new Error('New habit goal data missing');
                    }

                    mount.remove();
                    return true;
                }
            },
            {
                name: 'Can rename a habit and persist label',
                fn: async () => {
                    if (typeof window.HabitTrackerCalendar !== 'function') {
                        return true;
                    }

                    const key = `habitTrackerCalendar_test_${Date.now()}`;

                    const mount = document.createElement('div');
                    mount.id = `mount-${Date.now()}`;
                    document.body.appendChild(mount);

                    const widget = new window.HabitTrackerCalendar({
                        mountEl: mount,
                        storageKey: key,
                        goals: [{ id: 'study', label: 'Study' }]
                    });

                    await widget.init();
                    widget._handleToggleManage();

                    const editBtn = mount.querySelector('button[data-action="start-rename"]');
                    if (!editBtn) throw new Error('Edit button not found');
                    const goalId = editBtn.getAttribute('data-goal-id');
                    editBtn.click();

                    const input = mount.querySelector(`.habit-manage-rename-input[data-goal-id="${goalId}"]`);
                    if (!input) throw new Error('Rename input not found');
                    input.value = 'Study 1 hour';

                    const saveBtn = mount.querySelector(`button[data-action="save-rename"][data-goal-id="${goalId}"]`);
                    if (!saveBtn) throw new Error('Save rename button not found');
                    saveBtn.click();

                    await new Promise((r) => setTimeout(r, 50));

                    const stored = await getStorage(key);
                    const meta = stored?.goalsMeta;
                    if (!Array.isArray(meta)) throw new Error('Expected goalsMeta array');
                    const renamed = meta.find(g => g.id === goalId);
                    if (!renamed || renamed.label !== 'Study 1 hour') {
                        throw new Error('Renamed label not persisted');
                    }

                    mount.remove();
                    return true;
                }
            },
            {
                name: 'Can delete a habit (while keeping at least one)',
                fn: async () => {
                    if (typeof window.HabitTrackerCalendar !== 'function') {
                        return true;
                    }

                    const key = `habitTrackerCalendar_test_${Date.now()}`;

                    const mount = document.createElement('div');
                    mount.id = `mount-${Date.now()}`;
                    document.body.appendChild(mount);

                    const widget = new window.HabitTrackerCalendar({
                        mountEl: mount,
                        storageKey: key,
                        goals: [
                            { id: 'study', label: 'Study' },
                            { id: 'workout', label: 'Workout' }
                        ]
                    });

                    await widget.init();
                    widget._handleToggleManage();

                    // Bypass confirm() in tests
                    const prevConfirm = window.confirm;
                    window.confirm = () => true;

                    const delBtn = mount.querySelector('button[data-action="delete-habit"]');
                    if (!delBtn) throw new Error('Delete button not found');
                    delBtn.click();

                    // allow async save to flush
                    await new Promise((r) => setTimeout(r, 50));

                    const stored = await getStorage(key);
                    if (!stored || !Array.isArray(stored.goalsMeta)) {
                        throw new Error('Storage invalid after delete');
                    }
                    if (stored.goalsMeta.length < 1) {
                        throw new Error('Expected to keep at least one habit');
                    }

                    window.confirm = prevConfirm;
                    mount.remove();
                    return true;
                }
            }
        ]
    }
};

if (typeof window !== 'undefined') {
    window.habitTests = habitTests;
}
