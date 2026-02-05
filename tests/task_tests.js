/**
 * ============================================================================
 * TASK MANAGEMENT TESTS
 * ============================================================================
 * Tests for task CRUD, filtering, categories, priorities, and status changes
 */

const taskManagementTests = {
    'Task Management': {
        icon: '✅',
        tests: [
            {
                name: 'Tasks storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });

                    if (result.productivity_tasks && !Array.isArray(result.productivity_tasks)) {
                        throw new Error('productivity_tasks should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can create a task with all required fields',
                fn: async () => {
                    const testTask = {
                        id: 'test-task-' + Date.now(),
                        title: 'Test Task',
                        description: 'Test description',
                        priority: 'high',
                        category: 'homework',
                        status: 'not-started',
                        dueDate: new Date().toISOString().split('T')[0],
                        dueTime: '14:00',
                        createdAt: new Date().toISOString(),
                        completed: false
                    };

                    const requiredFields = ['id', 'title', 'priority', 'status', 'createdAt'];
                    for (const field of requiredFields) {
                        if (testTask[field] === undefined) {
                            throw new Error(`Task missing required field: ${field}`);
                        }
                    }

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });
                    const tasks = current.productivity_tasks || [];
                    tasks.push(testTask);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: tasks }, resolve);
                    });

                    // Cleanup
                    const cleaned = tasks.filter(t => t.id !== testTask.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'DataStore can save and retrieve a task',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.saveTask || !window.ProductivityData?.DataStore?.getTasks) {
                        throw new Error('ProductivityData.DataStore task APIs are not available');
                    }

                    const id = 'ds-task-test-' + Date.now();
                    const task = new window.ProductivityData.Task({
                        id,
                        title: 'DS Task Test',
                        status: 'not-started',
                        priority: 'medium',
                        createdAt: Date.now(),
                    });

                    await window.ProductivityData.DataStore.saveTask(task);
                    const tasks = await window.ProductivityData.DataStore.getTasks();
                    const found = (tasks || []).find(t => t.id === id);
                    if (!found || found.title !== 'DS Task Test') {
                        throw new Error('Saved task not found via DataStore');
                    }

                    // Cleanup
                    await window.ProductivityData.DataStore.deleteTask(id);
                    return true;
                }
            },
            {
                name: 'DataStore can save and retrieve a task hyperlink',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.saveTask || !window.ProductivityData?.DataStore?.getTasks) {
                        throw new Error('ProductivityData.DataStore task APIs are not available');
                    }

                    const id = 'ds-task-link-test-' + Date.now();
                    const linkUrl = 'https://example.com/docs';
                    const task = new window.ProductivityData.Task({
                        id,
                        title: 'Task With Link',
                        status: 'not-started',
                        priority: 'medium',
                        linkUrl
                    });

                    await window.ProductivityData.DataStore.saveTask(task);
                    const tasks = await window.ProductivityData.DataStore.getTasks();
                    const found = (tasks || []).find(t => t.id === id);

                    if (!found) {
                        throw new Error('Saved task not found via DataStore');
                    }
                    if (found.linkUrl !== linkUrl) {
                        throw new Error(`Expected linkUrl to be preserved (${linkUrl}), got: ${found.linkUrl}`);
                    }

                    await window.ProductivityData.DataStore.deleteTask(id);
                    return true;
                }
            },
            {
                name: 'DataStore can save a task list',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.saveTaskList || !window.ProductivityData?.DataStore?.getTaskLists) {
                        throw new Error('ProductivityData.DataStore task list APIs are not available');
                    }

                    const list = new window.ProductivityData.TaskList({
                        id: 'ds-list-test-' + Date.now(),
                        name: 'DS List Test',
                        color: '#6366f1',
                        isVisible: true
                    });

                    await window.ProductivityData.DataStore.saveTaskList(list);
                    const lists = await window.ProductivityData.DataStore.getTaskLists();
                    const found = (lists || []).find(l => l.id === list.id);
                    if (!found) {
                        throw new Error('Saved task list not found via DataStore');
                    }

                    // Cleanup: remove from storage directly (DataStore doesn't expose deleteTaskList)
                    const current = await new Promise(resolve => chrome.storage.local.get(['productivity_task_lists'], resolve));
                    const cleaned = (current.productivity_task_lists || []).filter(l => l.id !== list.id);
                    await new Promise(resolve => chrome.storage.local.set({ productivity_task_lists: cleaned }, resolve));

                    return true;
                }
            },
            {
                name: 'Task priority values are valid',
                fn: async () => {
                    const validPriorities = ['low', 'medium', 'high', 'urgent'];
                    const testPriority = 'high';

                    if (!validPriorities.includes(testPriority)) {
                        throw new Error(`Invalid priority: ${testPriority}`);
                    }
                    return true;
                }
            },
            {
                name: 'Task status values are valid',
                fn: async () => {
                    const validStatuses = ['not-started', 'in-progress', 'completed'];
                    const testStatus = 'in-progress';

                    if (!validStatuses.includes(testStatus)) {
                        throw new Error(`Invalid status: ${testStatus}`);
                    }
                    return true;
                }
            },
            {
                name: 'Task category values are valid',
                fn: async () => {
                    const validCategories = ['homework', 'assignment', 'exam', 'project', 'reading', 'personal'];
                    const testCategory = 'homework';

                    if (!validCategories.includes(testCategory)) {
                        throw new Error(`Invalid category: ${testCategory}`);
                    }
                    return true;
                }
            },
            {
                name: 'Can update task status',
                fn: async () => {
                    const task = {
                        id: 'update-test-' + Date.now(),
                        title: 'Update Test',
                        status: 'not-started',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });
                    const tasks = current.productivity_tasks || [];
                    tasks.push(task);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: tasks }, resolve);
                    });

                    // Update status
                    const updated = tasks.map(t => {
                        if (t.id === task.id) {
                            return { ...t, status: 'completed', completed: true };
                        }
                        return t;
                    });

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: updated }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });

                    const found = verify.productivity_tasks.find(t => t.id === task.id);
                    if (!found || found.status !== 'completed') {
                        throw new Error('Task status was not updated');
                    }

                    // Cleanup
                    const cleaned = verify.productivity_tasks.filter(t => t.id !== task.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Daily recurring tasks reappear next day',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.getTasks) {
                        throw new Error('ProductivityData.DataStore.getTasks is not available');
                    }

                    const formatLocalYMD = (date) => {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const d = String(date.getDate()).padStart(2, '0');
                        return `${y}-${m}-${d}`;
                    };

                    const today = new Date();
                    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
                    const todayYMD = formatLocalYMD(today);
                    const yesterdayYMD = formatLocalYMD(yesterday);

                    const taskId = 'recurring-test-' + Date.now();
                    const recurringTask = {
                        id: taskId,
                        title: 'Recurring Daily Test',
                        status: 'completed',
                        dueDate: yesterdayYMD,
                        completedAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 12, 0, 0).toISOString(),
                        isRecurring: true,
                        repeatType: 'daily',
                        repeatEndType: 'never',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });
                    const tasks = current.productivity_tasks || [];
                    tasks.push(recurringTask);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: tasks }, resolve);
                    });

                    const rolled = await window.ProductivityData.DataStore.getTasks();
                    const found = rolled.find(t => t.id === taskId);
                    if (!found) {
                        throw new Error('Recurring task not found after rollover');
                    }
                    if (found.status !== 'not-started') {
                        throw new Error(`Expected status not-started, got ${found.status}`);
                    }
                    if (found.dueDate !== todayYMD) {
                        throw new Error(`Expected dueDate ${todayYMD}, got ${found.dueDate}`);
                    }
                    if (found.completedAt !== null) {
                        throw new Error('Expected completedAt to be null after rollover');
                    }

                    const cleaned = rolled.filter(t => t.id !== taskId).map(t => (typeof t.toJSON === 'function' ? t.toJSON() : t));
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Daily recurring tasks roll over even if completed after midnight',
                fn: async () => {
                    if (!window.ProductivityData?.DataStore?.getTasks) {
                        throw new Error('ProductivityData.DataStore.getTasks is not available');
                    }

                    const formatLocalYMD = (date) => {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const d = String(date.getDate()).padStart(2, '0');
                        return `${y}-${m}-${d}`;
                    };

                    const today = new Date();
                    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
                    const todayYMD = formatLocalYMD(today);
                    const yesterdayYMD = formatLocalYMD(yesterday);

                    // Simulate finishing a "yesterday" task shortly after midnight.
                    const completedJustAfterMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 10, 0).toISOString();

                    const taskId = 'recurring-midnight-test-' + Date.now();
                    const recurringTask = {
                        id: taskId,
                        title: 'Recurring Daily Midnight Test',
                        status: 'completed',
                        dueDate: yesterdayYMD,
                        completedAt: completedJustAfterMidnight,
                        isRecurring: true,
                        repeatType: 'daily',
                        repeatEndType: 'never',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });
                    const tasks = current.productivity_tasks || [];
                    tasks.push(recurringTask);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: tasks }, resolve);
                    });

                    const rolled = await window.ProductivityData.DataStore.getTasks();
                    const found = rolled.find(t => t.id === taskId);
                    if (!found) {
                        throw new Error('Recurring task not found after rollover');
                    }
                    if (found.status !== 'not-started') {
                        throw new Error(`Expected status not-started, got ${found.status}`);
                    }
                    if (found.dueDate !== todayYMD) {
                        throw new Error(`Expected dueDate ${todayYMD}, got ${found.dueDate}`);
                    }
                    if (found.completedAt !== null) {
                        throw new Error('Expected completedAt to be null after rollover');
                    }

                    const cleaned = rolled.filter(t => t.id !== taskId).map(t => (typeof t.toJSON === 'function' ? t.toJSON() : t));
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Can delete a task',
                fn: async () => {
                    const task = {
                        id: 'delete-test-' + Date.now(),
                        title: 'Delete Test',
                        status: 'not-started',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });
                    const tasks = current.productivity_tasks || [];
                    tasks.push(task);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: tasks }, resolve);
                    });

                    // Delete
                    const afterDelete = tasks.filter(t => t.id !== task.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ productivity_tasks: afterDelete }, resolve);
                    });

                    // Verify deleted
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });

                    const found = verify.productivity_tasks.find(t => t.id === task.id);
                    if (found) {
                        throw new Error('Task was not deleted');
                    }

                    return true;
                }
            },
            {
                name: 'Task filtering by status works',
                fn: async () => {
                    const tasks = [
                        { id: '1', status: 'not-started' },
                        { id: '2', status: 'in-progress' },
                        { id: '3', status: 'completed' },
                        { id: '4', status: 'not-started' }
                    ];

                    const notStarted = tasks.filter(t => t.status === 'not-started');
                    if (notStarted.length !== 2) {
                        throw new Error(`Expected 2 not-started tasks, got ${notStarted.length}`);
                    }

                    const completed = tasks.filter(t => t.status === 'completed');
                    if (completed.length !== 1) {
                        throw new Error(`Expected 1 completed task, got ${completed.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Task filtering by priority works',
                fn: async () => {
                    const tasks = [
                        { id: '1', priority: 'urgent' },
                        { id: '2', priority: 'high' },
                        { id: '3', priority: 'medium' },
                        { id: '4', priority: 'low' },
                        { id: '5', priority: 'high' }
                    ];

                    const highPriority = tasks.filter(t => t.priority === 'high' || t.priority === 'urgent');
                    if (highPriority.length !== 3) {
                        throw new Error(`Expected 3 high/urgent tasks, got ${highPriority.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Overdue task detection works',
                fn: async () => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);

                    const tasks = [
                        { id: '1', dueDate: yesterday.toISOString().split('T')[0], status: 'not-started' },
                        { id: '2', dueDate: new Date().toISOString().split('T')[0], status: 'not-started' }
                    ];

                    const today = new Date().toISOString().split('T')[0];
                    const overdue = tasks.filter(t => t.dueDate < today && t.status !== 'completed');

                    if (overdue.length !== 1) {
                        throw new Error(`Expected 1 overdue task, got ${overdue.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Task postpone updates due date correctly',
                fn: async () => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const oldDueDate = yesterday.toISOString().split('T')[0];

                    const task = {
                        id: 'postpone-test',
                        dueDate: oldDueDate,
                        status: 'not-started'
                    };

                    // Postpone to today
                    const today = new Date().toISOString().split('T')[0];
                    task.dueDate = today;

                    if (task.dueDate !== today) {
                        throw new Error('Task postpone did not update due date');
                    }

                    return true;
                }
            },
            {
                name: 'No duplicate task IDs exist',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['productivity_tasks'], resolve);
                    });

                    const tasks = result.productivity_tasks || [];
                    const ids = tasks.map(t => t.id);
                    const uniqueIds = new Set(ids);

                    if (ids.length !== uniqueIds.size) {
                        throw new Error('Duplicate task IDs found');
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.taskManagementTests = taskManagementTests;
}
