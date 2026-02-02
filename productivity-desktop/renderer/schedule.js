/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - SCHEDULE MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * CACHE BUST: 2025-12-03 21:45:12
 * 
 * Complete Schedule Manager with:
 * - Weekly/Monthly calendar views
 * - Event creation and editing
 * - Recurring events support
 * - Category/type filtering
 * - Drag and drop event management
 * - Time conflict detection
 * - Google Calendar sync preparation
 * - Today's agenda view
 * - Quick event creation
 * - Event reminders
 */

// ============================================================================
// SCHEDULE STATE
// ============================================================================
const ScheduleState = {
    currentView: 'week', // 'week', 'month', 'day', 'agenda'
    currentDate: new Date(),
    weekOffset: 0,
    events: [],
    selectedEvent: null,
    editingEvent: null,
    timeLineInterval: null, // Store interval reference to prevent duplicates
    filters: {
        type: 'all', // 'all', 'class', 'study', 'personal', 'work'
        scheduleType: 'school', // 'school', 'personal', 'combined'
        showCompleted: true,
        // Type visibility filters (like Google Calendar)
        visibleTypes: {
            class: true,
            study: true,
            personal: true,
            work: true,
            meeting: true,
            deadline: true,
            other: true
        },
        showImported: true,
        // Imported calendars visibility (by calendar ID)
        importedCalendars: {}
    },
    // Store imported calendar metadata (name, color)
    importedCalendarsMeta: {},
    draggedEvent: null,
    // Countdown feature: pinned event IDs for countdown tracking
    pinnedCountdowns: [],
    // Custom titles for pinned countdowns (eventId -> customTitle)
    countdownTitles: {},
    // Resize state for drag-to-resize events
    resizeState: {
        isResizing: false,
        eventId: null,
        handle: null, // 'top' or 'bottom'
        startY: 0,
        originalStartTime: null,
        originalEndTime: null
    },
    ui: {
        sidebarTasksExpanded: false,
        filtersCollapsed: true // Filters collapsed by default
    }
};

// Default colors for calendar types (can be customized)
const DEFAULT_TYPE_COLORS = {
    class: '#6366f1',
    study: '#10b981',
    personal: '#f59e0b',
    work: '#8b5cf6',
    meeting: '#ec4899',
    deadline: '#ef4444',
    other: '#64748b'
};

// Custom colors storage (overrides defaults)
let customTypeColors = {};

// Helper to ensure time format is HH:mm
function ensureTimeFormat(time) {
    if (!time) return null;
    // Handle single digit hours like "7:00" -> "07:00"
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    // Return default if format is completely invalid
    return '09:00';
}

// Event type colors (uses custom colors if set)
function getEventColors(type) {
    const customColor = customTypeColors[type];
    if (customColor) {
        return { bg: customColor + '20', border: customColor, label: EVENT_COLORS[type]?.label || type };
    }
    return EVENT_COLORS[type] || EVENT_COLORS.other;
}

const EVENT_COLORS = {
    class: { bg: '#6366f120', border: '#6366f1', label: 'Class' },
    study: { bg: '#10b98120', border: '#10b981', label: 'Study' },
    personal: { bg: '#f59e0b20', border: '#f59e0b', label: 'Personal' },
    work: { bg: '#8b5cf620', border: '#8b5cf6', label: 'Work' },
    meeting: { bg: '#ec489920', border: '#ec4899', label: 'Meeting' },
    deadline: { bg: '#ef444420', border: '#ef4444', label: 'Deadline' },
    other: { bg: '#64748b20', border: '#64748b', label: 'Other' }
};

function getImportedCalendarColor(event) {
    if (!event?.importedCalendarId) return null;
    const meta = ScheduleState.importedCalendarsMeta?.[event.importedCalendarId];
    return meta?.color || null;
}

function getEventDisplayColors(event) {
    const typeColors = getEventColors(event.type);
    const importedColor = getImportedCalendarColor(event);
    const baseColor = importedColor || event.color || typeColors.border;
    const bgColor = (importedColor || event.color) ? `${baseColor}20` : typeColors.bg;
    return { border: baseColor, bg: bgColor, label: typeColors.label };
}

// ============================================================================
// SCHEDULE INITIALIZATION
// ============================================================================
async function loadSchedule() {
    try {

        // Load custom colors and imported calendar metadata from storage
        const stored = await chrome.storage.local.get(['customTypeColors', 'importedCalendarsMeta']);
        customTypeColors = stored.customTypeColors || {};
        ScheduleState.importedCalendarsMeta = stored.importedCalendarsMeta || {};

        // Initialize visibility for imported calendars
        Object.keys(ScheduleState.importedCalendarsMeta).forEach(calId => {
            if (ScheduleState.filters.importedCalendars[calId] === undefined) {
                ScheduleState.filters.importedCalendars[calId] = true;
            }
        });

        // Load pinned countdowns
        await loadPinnedCountdowns();

        // Load events and ensure time format
        const rawEvents = await ProductivityData.DataStore.getScheduleEvents();
        ScheduleState.events = rawEvents.map(event => {
            event.startTime = ensureTimeFormat(event.startTime);
            event.endTime = ensureTimeFormat(event.endTime);
            return event;
        });

        // Load tasks with due dates and convert them to calendar events
        await loadTasksAsEvents();

        try {
            // Render current view
            await renderCurrentView();

            // Render sidebar
            renderTodayAgenda();
            renderUpcomingEvents();
            renderSidebarEvents();
            renderImportedCalendars();
            renderCountdownsSection();

            // Render dynamic filter list
            renderCalendarFilters();

            // Setup event listeners AFTER DOM is ready
            setupScheduleListeners();

            // Setup event resize functionality
            setupEventResize();
        } catch (err) {
            console.error('Error during schedule setup:', err);
        }


    } catch (error) {
        console.error('Failed to load schedule:', error);
        showToast('error', 'Error', 'Failed to load schedule.');
    }
}

// Load tasks with due dates and add them to the calendar as events
async function loadTasksAsEvents() {
    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const taskLists = await ProductivityData.DataStore.getTaskLists();



        // Create a map of list visibility
        const listVisibility = {};
        taskLists.forEach(list => {
            listVisibility[list.id] = list.isVisible;
        });

        // Filter tasks that have dates (startDate OR dueDate) and whose lists are visible
        const tasksWithDates = tasks.filter(t => {
            if (t.status === 'completed') return false;
            // Task needs either startDate or dueDate to appear on calendar
            if (!t.startDate && !t.dueDate) return false;
            // If task has a list, check if that list is visible
            if (t.listId && listVisibility[t.listId] === false) return false;
            return true;
        });


        // Create a map of list colors - use String keys for consistency
        const listColors = {};
        taskLists.forEach(list => {
            listColors[String(list.id)] = list.color;
        });


        // Convert tasks to calendar event format
        const taskEvents = tasksWithDates.map(task => {
            // Use startDate if available, otherwise use dueDate
            const eventDate = task.startDate || task.dueDate;

            // Use startTime if we're using startDate, otherwise use dueTime
            const startTime = task.startDate ? (task.startTime || '09:00') : (task.dueTime || '09:00');

            // Calculate end time:
            // - If both start and due are on the same day, use dueTime as end
            // - Otherwise use estimated duration
            let endTime;
            if (task.startDate && task.dueDate && task.startDate === task.dueDate && task.dueTime) {
                // Same day with explicit due time - use it as end time
                endTime = task.dueTime;
            } else if (task.startDate && task.startTime && task.dueDate && task.dueTime && !task.startDate) {
                // Only due date/time set - show as point event with short duration
                endTime = task.dueTime;
            } else {
                // Use estimated duration
                const estimatedMinutes = task.estimatedMinutes || 30;
                const [startH, startM] = startTime.split(':').map(Number);
                const endMinutes = startH * 60 + startM + estimatedMinutes;
                const endH = Math.floor(endMinutes / 60);
                const endM = endMinutes % 60;
                endTime = `${String(Math.min(endH, 23)).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            }


            // Determine color priority: task custom color > list color > priority color
            // Only use task.color if it's explicitly set (not empty/null/undefined)
            let eventColor = null;

            // First try task's own color (if explicitly set)
            if (task.color && task.color.trim() !== '') {
                eventColor = task.color;
            }
            // Then try list color (use String for consistent key lookup)
            else if (task.listId && listColors[String(task.listId)]) {
                eventColor = listColors[String(task.listId)];
            }
            // Fall back to priority color
            else {
                eventColor = getPriorityColor(task.priority);
            }

            return {
                id: `task-${task.id}`,
                taskId: task.id, // Reference to original task
                title: `📋 ${task.title}`,
                date: eventDate,
                startTime: startTime,
                endTime: endTime,
                type: 'deadline', // Task deadlines
                isTask: true,
                priority: task.priority,
                status: task.status,
                goalId: task.goalId,
                listId: task.listId,
                color: eventColor,
                description: task.description || ''
            };
        });

        // Remove old task events first
        ScheduleState.events = ScheduleState.events.filter(e => !e.isTask);

        // Add task events to the schedule
        taskEvents.forEach(taskEvent => {
            ScheduleState.events.push(taskEvent);
        });


    } catch (e) {
        console.error('Failed to load tasks as events:', e);
    }
}

// Get color based on task priority
function getPriorityColor(priority) {
    const colors = {
        urgent: '#ef4444',
        high: '#f59e0b',
        medium: '#6366f1',
        low: '#10b981'
    };
    return colors[priority] || colors.medium;
}

function setupScheduleListeners() {
    // Guard to prevent duplicate listeners
    if (ScheduleState.listenersInitialized) {
        return;
    }
    ScheduleState.listenersInitialized = true;

    // Check if schedule page exists
    const schedulePage = document.getElementById('page-schedule');

    // Navigation buttons
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    const todayBtn = document.getElementById('today-btn');
    const addEventBtn = document.getElementById('add-event-btn');
    const importBtn = document.getElementById('import-schedule-btn');



    if (prevBtn) {
        prevBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            navigatePrev();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            navigateNext();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            goToToday();
        });
    }

    if (addEventBtn) {
        addEventBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openScheduleEventModal();
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openImportScheduleModal();
        });
    }

    // View toggle buttons
    const viewBtns = document.querySelectorAll('.view-toggle-btn');
    viewBtns.forEach((btn, i) => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            ScheduleState.currentView = this.dataset.view;
            renderCurrentView();
        });
    });

    // Schedule type tabs
    const tabBtns = document.querySelectorAll('.schedule-tabs .tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('.schedule-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            ScheduleState.filters.scheduleType = this.dataset.view || 'school';
            renderCurrentView();
        });
    });

    // Filters section toggle (collapsible)
    const filtersToggle = document.getElementById('filters-toggle');
    if (filtersToggle) {
        filtersToggle.addEventListener('click', function (e) {
            e.preventDefault();
            toggleFiltersSection();
        });
    }

    // Initialize filters collapsed state from storage
    initFiltersState();

    // Calendar type filter checkboxes
    const filterList = document.getElementById('calendar-filter-list');
    if (filterList) {
        filterList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                const type = this.dataset.type;
                if (type) {
                    ScheduleState.filters.visibleTypes[type] = this.checked;
                    renderCurrentView();
                }
            });
        });
    }

    // Show/Hide all types buttons
    document.getElementById('show-all-types')?.addEventListener('click', function () {
        Object.keys(ScheduleState.filters.visibleTypes).forEach(type => {
            ScheduleState.filters.visibleTypes[type] = true;
        });
        filterList?.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        renderCurrentView();
    });

    document.getElementById('hide-all-types')?.addEventListener('click', function () {
        Object.keys(ScheduleState.filters.visibleTypes).forEach(type => {
            ScheduleState.filters.visibleTypes[type] = false;
        });
        filterList?.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        renderCurrentView();
    });

    // Show imported checkbox
    document.getElementById('show-imported')?.addEventListener('change', function () {
        ScheduleState.filters.showImported = this.checked;
        renderCurrentView();
    });

    // Quick add
    document.getElementById('quick-add-event')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            quickAddEvent(this.value);
            this.value = '';
        }
    });

    // Calendar grid event delegation - handles all dynamic calendar elements
    const calendarGrid = document.getElementById('calendar-grid');

    if (calendarGrid) {
        calendarGrid.addEventListener('click', function (e) {

            // Handle focus button clicks on calendar tasks
            const focusBtn = e.target.closest('.btn-focus-task');
            if (focusBtn) {
                e.preventDefault();
                e.stopPropagation();
                const taskId = focusBtn.dataset.taskId;
                if (taskId && typeof window.startFocusOnTask === 'function') {
                    window.startFocusOnTask(taskId);
                } else {
                    showToast('warning', 'Focus Unavailable', 'Start focus from the Tasks page.');
                }
                return;
            }

            // Handle finish & review button clicks on calendar tasks
            const finishReviewBtn = e.target.closest('.btn-finish-review-task');
            if (finishReviewBtn) {
                e.preventDefault();
                e.stopPropagation();
                const taskId = finishReviewBtn.dataset.taskId;
                if (taskId && typeof window.finishAndSendToReview === 'function') {
                    window.finishAndSendToReview(taskId);
                } else {
                    showToast('warning', 'Review Unavailable', 'Finish & Review from the Tasks page.');
                }
                return;
            }

            // Handle calendar event click (week view)
            const calendarEvent = e.target.closest('.calendar-event[data-event-id]');
            if (calendarEvent) {
                e.preventDefault();
                e.stopPropagation();
                viewEvent(calendarEvent.dataset.eventId);
                return;
            }

            // Handle day event click
            const dayEvent = e.target.closest('.day-event[data-event-id]');
            if (dayEvent) {
                e.preventDefault();
                e.stopPropagation();
                viewEvent(dayEvent.dataset.eventId);
                return;
            }

            // Handle hour slot click (week view)
            const hourSlot = e.target.closest('.hour-slot[data-hour]');
            if (hourSlot) {
                e.preventDefault();
                e.stopPropagation();
                const date = hourSlot.dataset.date;
                const hour = hourSlot.dataset.hour;

                openScheduleCreatePicker(date, `${String(hour).padStart(2, '0')}:00`);
                return;
            }

            // Handle day hour slot click
            const dayHourSlot = e.target.closest('.day-hour-slot[data-hour]');
            if (dayHourSlot) {
                e.preventDefault();
                e.stopPropagation();
                const dayColumn = dayHourSlot.closest('.day-events-column');
                const date = dayColumn ? dayColumn.dataset.date : new Date().toISOString().split('T')[0];
                const hour = dayHourSlot.dataset.hour;
                openScheduleCreatePicker(date, `${String(hour).padStart(2, '0')}:00`);
                return;
            }

            // Handle month event dot click
            const monthEventDot = e.target.closest('.month-event-dot[data-event-id]');
            if (monthEventDot) {
                e.preventDefault();
                e.stopPropagation();
                viewEvent(monthEventDot.dataset.eventId);
                return;
            }

            // Handle month day click (not on event dot)
            const monthDay = e.target.closest('.month-day[data-date]');
            if (monthDay && !monthDay.classList.contains('other-month')) {
                e.preventDefault();
                e.stopPropagation();
                openScheduleCreatePicker(monthDay.dataset.date);
                return;
            }

            // Handle agenda event click
            const agendaEvent = e.target.closest('.agenda-event[data-event-id]');
            if (agendaEvent) {
                e.preventDefault();
                e.stopPropagation();
                viewEvent(agendaEvent.dataset.eventId);
                return;
            }
        });

        // ========== DRAG AND DROP FOR TASKS ==========
        let draggedEvent = null;
        let draggedEventId = null;
        let draggedTaskId = null;

        // Drag start - store the dragged event info
        calendarGrid.addEventListener('dragstart', function (e) {
            const eventEl = e.target.closest('.calendar-event[data-draggable-event]');
            if (!eventEl) return;

            draggedEvent = eventEl;
            draggedEventId = eventEl.dataset.eventId;
            draggedTaskId = eventEl.dataset.taskId || null;

            // Set drag data
            e.dataTransfer.setData('text/plain', draggedEventId);
            e.dataTransfer.effectAllowed = 'move';

            // Visual feedback - add dragging class for CSS pointer-events
            setTimeout(() => {
                eventEl.style.opacity = '0.5';
                eventEl.classList.add('dragging');
            }, 0);
        });

        // Drag end - reset visual
        calendarGrid.addEventListener('dragend', function (e) {
            if (draggedEvent) {
                draggedEvent.style.opacity = '1';
                draggedEvent.classList.remove('dragging');
            }
            draggedEvent = null;
            draggedEventId = null;
            draggedTaskId = null;
            // Clean up any snap indicators
            document.querySelectorAll('.drag-snap-indicator').forEach(el => el.remove());
            document.querySelectorAll('.hour-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        // Drag over - allow drop on hour slots with 15-min snap indicator
        calendarGrid.addEventListener('dragover', function (e) {
            const hourSlot = e.target.closest('.hour-slot[data-hour]');
            if (hourSlot && draggedEvent) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                // Remove previous highlights and indicators
                document.querySelectorAll('.hour-slot.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });
                document.querySelectorAll('.drag-snap-indicator').forEach(el => el.remove());

                hourSlot.classList.add('drag-over');

                // Calculate 15-minute snap position
                const slotRect = hourSlot.getBoundingClientRect();
                const relativeY = e.clientY - slotRect.top;
                const slotHeight = slotRect.height || 50;

                // Calculate which 15-minute segment (0, 1, 2, 3)
                const quarterIndex = Math.floor((relativeY / slotHeight) * 4);
                const clampedQuarter = Math.max(0, Math.min(3, quarterIndex));
                const indicatorTop = (clampedQuarter / 4) * slotHeight;

                // Calculate time for display
                const hour = parseInt(hourSlot.dataset.hour);
                const mins = clampedQuarter * 15;
                const timeLabel = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

                // Create snap indicator line
                let indicator = hourSlot.querySelector('.drag-snap-indicator');
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.className = 'drag-snap-indicator';
                    hourSlot.appendChild(indicator);
                }
                indicator.style.top = `${indicatorTop}px`;
                indicator.dataset.time = timeLabel;
            }
        });

        // Drag leave - remove highlight and indicator
        calendarGrid.addEventListener('dragleave', function (e) {
            const hourSlot = e.target.closest('.hour-slot');
            if (hourSlot) {
                // Only remove if actually leaving the slot (not entering a child)
                const rect = hourSlot.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right ||
                    e.clientY < rect.top || e.clientY > rect.bottom) {
                    hourSlot.classList.remove('drag-over');
                    const indicator = hourSlot.querySelector('.drag-snap-indicator');
                    if (indicator) indicator.remove();
                }
            }
        });

        // Drop - update the task/event date and time
        calendarGrid.addEventListener('drop', async function (e) {
            e.preventDefault();

            // Remove all drag-over highlights and snap indicators
            document.querySelectorAll('.hour-slot.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            document.querySelectorAll('.drag-snap-indicator').forEach(el => el.remove());

            const hourSlot = e.target.closest('.hour-slot[data-hour][data-date]');
            if (!hourSlot || !draggedEvent) return;

            const newDate = hourSlot.dataset.date;
            const newHour = parseInt(hourSlot.dataset.hour);

            // Calculate 15-minute snapped time based on position within hour slot
            const slotRect = hourSlot.getBoundingClientRect();
            const relativeY = e.clientY - slotRect.top;
            const slotHeight = slotRect.height || 50; // Each hour slot is 50px

            // Calculate which 15-minute segment within the hour (0, 1, 2, 3 = 00, 15, 30, 45)
            const quarterIndex = Math.floor((relativeY / slotHeight) * 4);
            const clampedQuarter = Math.max(0, Math.min(3, quarterIndex)); // Clamp to 0-3
            const minutes = clampedQuarter * 15;

            const newTime = `${String(newHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            // If it's a task, update the task
            if (draggedTaskId) {
                await updateTaskDateTime(draggedTaskId, newDate, newTime);
            } else {
                // It's a regular event - update the event
                await updateEventDateTime(draggedEventId, newDate, newTime);
            }

            // Refresh the calendar
            await renderCurrentView();
            showToast('success', 'Moved', `Event moved to ${newTime}.`);
        });
    }

    // Document-level delegation for sidebar elements (today agenda, upcoming events)
    document.addEventListener('click', function (e) {
        // Handle today event click
        const todayEvent = e.target.closest('.today-event[data-event-id]');
        if (todayEvent) {
            e.preventDefault();
            e.stopPropagation();
            viewEvent(todayEvent.dataset.eventId);
            return;
        }

        // Handle add today event button
        const addTodayBtn = e.target.closest('.add-today-event-btn');
        if (addTodayBtn) {
            e.preventDefault();
            e.stopPropagation();
            openScheduleCreatePicker(addTodayBtn.dataset.date);
            return;
        }

        // Handle upcoming event click
        const upcomingEvent = e.target.closest('.upcoming-event[data-event-id]');
        if (upcomingEvent) {
            e.preventDefault();
            e.stopPropagation();
            viewEvent(upcomingEvent.dataset.eventId);
            return;
        }
    });
}

// Update task date and time when dragged
async function updateTaskDateTime(taskId, newDate, newTime) {
    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const task = tasks.find(t => t.id === taskId);

        if (!task) {
            console.error('Task not found:', taskId);
            return;
        }

        // Calculate the duration if we have both start and end times
        let duration = 0;
        if (task.startTime && task.dueTime && task.startDate === task.dueDate) {
            const [startH, startM] = task.startTime.split(':').map(Number);
            const [endH, endM] = task.dueTime.split(':').map(Number);
            duration = (endH * 60 + endM) - (startH * 60 + startM);
        }

        // Update start date/time
        task.startDate = newDate;
        task.startTime = newTime;

        // If task had same day start and due, update due time to maintain duration
        if (duration > 0) {
            task.dueDate = newDate;
            const [newH, newM] = newTime.split(':').map(Number);
            const newEndMinutes = (newH * 60 + newM) + duration;
            const endH = Math.floor(newEndMinutes / 60);
            const endM = newEndMinutes % 60;
            task.dueTime = `${String(Math.min(endH, 23)).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        } else if (!task.dueDate) {
            // If no due date was set, set it to the new date
            task.dueDate = newDate;
        }

        // Save the updated task
        await ProductivityData.DataStore.saveTask(task);

        // Reload tasks into calendar
        await loadTasksAsEvents();

    } catch (error) {
        console.error('Failed to update task:', error);
        showToast('error', 'Error', 'Failed to move task.');
    }
}

// Update event date and time when dragged
async function updateEventDateTime(eventId, newDate, newTime) {
    try {
        // Find the event in ScheduleState
        const event = ScheduleState.events.find(e => e.id === eventId);

        if (!event) {
            console.error('Event not found:', eventId);
            return;
        }

        // Calculate duration of the event
        const [startH, startM] = event.startTime.split(':').map(Number);
        const [endH, endM] = event.endTime.split(':').map(Number);
        const duration = (endH * 60 + endM) - (startH * 60 + startM);

        // Update start time and date
        event.date = newDate;
        event.startTime = newTime;

        // Calculate new end time
        const [newH, newM] = newTime.split(':').map(Number);
        const newEndMinutes = (newH * 60 + newM) + duration;
        const newEndH = Math.floor(newEndMinutes / 60);
        const newEndM = newEndMinutes % 60;
        event.endTime = `${String(Math.min(newEndH, 23)).padStart(2, '0')}:${String(newEndM).padStart(2, '0')}`;

        // Save the updated event
        await ProductivityData.DataStore.saveScheduleEvent(event);

    } catch (error) {
        console.error('Failed to update event:', error);
        showToast('error', 'Error', 'Failed to move event.');
    }
}

async function renderCurrentView() {
    switch (ScheduleState.currentView) {
        case 'week':
            await renderWeekView();
            break;
        case 'month':
            await renderMonthView();
            break;
        case 'day':
            await renderDayView();
            break;
        case 'agenda':
            await renderAgendaView();
            break;
        default:
            await renderWeekView();
    }
}

// ============================================================================
// NAVIGATION
// ============================================================================
function navigatePrev() {
    if (ScheduleState.currentView === 'week') {
        ScheduleState.weekOffset--;
    } else if (ScheduleState.currentView === 'month') {
        ScheduleState.currentDate.setMonth(ScheduleState.currentDate.getMonth() - 1);
    } else {
        ScheduleState.currentDate.setDate(ScheduleState.currentDate.getDate() - 1);
    }
    renderCurrentView();
}

function navigateNext() {
    if (ScheduleState.currentView === 'week') {
        ScheduleState.weekOffset++;
    } else if (ScheduleState.currentView === 'month') {
        ScheduleState.currentDate.setMonth(ScheduleState.currentDate.getMonth() + 1);
    } else {
        ScheduleState.currentDate.setDate(ScheduleState.currentDate.getDate() + 1);
    }
    renderCurrentView();
}

function goToToday() {
    ScheduleState.currentDate = new Date();
    ScheduleState.weekOffset = 0;
    renderCurrentView();
}

function getScheduleWeekDates(offset = 0) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek + (offset * 7));

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);

        // Use local YYYY-MM-DD generation to avoid UTC shifts
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    return dates;
}

// ============================================================================
// DATE FORMATTING UTILITY
// ============================================================================
/**
 * Format a date string for display in the countdown section and event views
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date string (e.g., "Today", "Tomorrow", "Dec 15")
 */
function formatEventDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset time parts for comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate.getTime() === today.getTime()) return 'Today';
    if (targetDate.getTime() === tomorrow.getTime()) return 'Tomorrow';

    const daysUntil = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil <= 7) return `In ${daysUntil} days`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// COUNTDOWN FUNCTIONALITY
// ============================================================================
function calculateCountdown(eventDate) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(eventDate);
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const diffMs = target - today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { days: Math.abs(diffDays), isPast: true, text: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago` };
    } else if (diffDays === 0) {
        return { days: 0, isPast: false, text: 'Today' };
    } else if (diffDays === 1) {
        return { days: 1, isPast: false, text: 'Tomorrow' };
    } else {
        return { days: diffDays, isPast: false, text: `${diffDays} day${diffDays !== 1 ? 's' : ''} left` };
    }
}

async function loadPinnedCountdowns() {
    try {
        const result = await chrome.storage.local.get(['pinnedCountdowns', 'countdownTitles', 'filtersCollapsed']);
        ScheduleState.pinnedCountdowns = result.pinnedCountdowns || [];
        ScheduleState.countdownTitles = result.countdownTitles || {};
        ScheduleState.ui.filtersCollapsed = result.filtersCollapsed !== false; // Default to collapsed
    } catch (e) {
        console.error('Failed to load pinned countdowns:', e);
        ScheduleState.pinnedCountdowns = [];
        ScheduleState.countdownTitles = {};
    }
}

async function savePinnedCountdowns() {
    try {
        await chrome.storage.local.set({
            pinnedCountdowns: ScheduleState.pinnedCountdowns,
            countdownTitles: ScheduleState.countdownTitles
        });
    } catch (e) {
        console.error('Failed to save pinned countdowns:', e);
    }
}

// ============================================================================
// COLLAPSIBLE FILTERS SECTION
// ============================================================================

function initFiltersState() {
    const filtersSection = document.getElementById('filters-section');
    const filtersContent = document.getElementById('filters-content');

    if (filtersSection && filtersContent) {
        // Apply stored state
        if (ScheduleState.ui.filtersCollapsed) {
            filtersContent.classList.add('collapsed');
            filtersSection.classList.remove('expanded');
        } else {
            filtersContent.classList.remove('collapsed');
            filtersSection.classList.add('expanded');
        }
    }
}

function toggleFiltersSection() {
    const filtersSection = document.getElementById('filters-section');
    const filtersContent = document.getElementById('filters-content');

    if (!filtersSection || !filtersContent) return;

    ScheduleState.ui.filtersCollapsed = !ScheduleState.ui.filtersCollapsed;

    if (ScheduleState.ui.filtersCollapsed) {
        filtersContent.classList.add('collapsed');
        filtersSection.classList.remove('expanded');
    } else {
        filtersContent.classList.remove('collapsed');
        filtersSection.classList.add('expanded');
    }

    // Persist the state
    chrome.storage.local.set({ filtersCollapsed: ScheduleState.ui.filtersCollapsed });
}

async function togglePinnedCountdown(eventId, skipPrompt = false) {
    const index = ScheduleState.pinnedCountdowns.indexOf(eventId);
    const willPin = index === -1;

    if (willPin) {
        const event = ScheduleState.events.find(e => e.id === eventId);
        const eventTitle = event?.title || 'Event';

        // Prompt for custom title unless skipped
        let customTitle = null;
        if (!skipPrompt) {
            customTitle = prompt('Enter a custom title for this countdown (leave empty to use original):', eventTitle);
            // If user cancels the prompt, abort pinning
            if (customTitle === null) {
                return;
            }
        }

        ScheduleState.pinnedCountdowns.push(eventId);

        // Store custom title if provided and different from original
        if (customTitle && customTitle.trim() && customTitle.trim() !== eventTitle) {
            ScheduleState.countdownTitles[eventId] = customTitle.trim();
        }

        showToast('success', 'Countdown Added', 'You\'ll see a countdown for this event');
    } else {
        ScheduleState.pinnedCountdowns.splice(index, 1);
        // Remove custom title when unpinning
        delete ScheduleState.countdownTitles[eventId];
        showToast('info', 'Countdown Removed', 'Event removed from countdown tracking');
    }

    await savePinnedCountdowns();

    const event = ScheduleState.events.find(e => e.id === eventId);
    if (event?.isTask && event.taskId) {
        try {
            const stored = await chrome.storage.local.get(['taskCountdowns']);
            const taskCountdowns = Array.isArray(stored.taskCountdowns) ? stored.taskCountdowns : [];
            const taskIndex = taskCountdowns.indexOf(event.taskId);

            if (willPin && taskIndex === -1) {
                taskCountdowns.unshift(event.taskId);
            } else if (!willPin && taskIndex >= 0) {
                taskCountdowns.splice(taskIndex, 1);
            }

            await chrome.storage.local.set({ taskCountdowns });
        } catch (e) {
            console.error('Failed to sync task countdowns:', e);
        }
    }

    renderCountdownsSection();
    renderSidebarEvents();
}

async function editCountdownTitle(eventId) {
    const event = ScheduleState.events.find(e => e.id === eventId);
    if (!event) {
        showToast('error', 'Error', 'Event not found');
        return;
    }

    const currentTitle = ScheduleState.countdownTitles[eventId] || event.title;
    const newTitle = prompt('Edit countdown title:', currentTitle);

    // If user cancels the prompt, do nothing
    if (newTitle === null) {
        return;
    }

    // If new title is empty or same as original event title, remove custom title
    if (!newTitle.trim() || newTitle.trim() === event.title) {
        delete ScheduleState.countdownTitles[eventId];
        showToast('info', 'Title Reset', 'Using original event title');
    } else {
        ScheduleState.countdownTitles[eventId] = newTitle.trim();
        showToast('success', 'Title Updated', 'Countdown title has been changed');
    }

    await savePinnedCountdowns();
    renderCountdownsSection();
}

function renderCountdownsSection() {
    const sidebarContainer = document.getElementById('countdowns-list');
    const topBarContainer = document.getElementById('countdown-bar-items');

    // Get pinned events that are in the future
    const today = new Date().toISOString().split('T')[0];
    const pinnedEvents = ScheduleState.events.filter(e =>
        ScheduleState.pinnedCountdowns.includes(e.id) && e.date >= today
    ).sort((a, b) => a.date.localeCompare(b.date));

    // Render the TOP countdown bar (primary display)
    if (topBarContainer) {
        if (pinnedEvents.length === 0) {
            topBarContainer.innerHTML = `
                <p class="countdown-empty-hint">Pin events from the calendar to track countdowns here</p>
            `;
        } else {
            topBarContainer.innerHTML = pinnedEvents.map(event => {
                const countdown = calculateCountdown(event.date);
                const color = getEventDisplayColors(event).border;
                // Use custom title if available, otherwise use original event title
                const displayTitle = ScheduleState.countdownTitles[event.id] || event.title;
                const tooltipTitle = ScheduleState.countdownTitles[event.id]
                    ? `${displayTitle} (${event.title})`
                    : event.title;

                return `
                    <div class="countdown-bar-item" data-event-id="${event.id}" title="${escapeHtml(tooltipTitle)}">
                        <div class="countdown-color-stripe" style="background: ${color}"></div>
                        <div class="countdown-event-title">${escapeHtml(displayTitle)}</div>
                        <div class="countdown-event-date">${formatEventDate(event.date)}</div>
                        <div class="countdown-days ${countdown.days <= 3 ? 'urgent' : ''}">${countdown.days}</div>
                        <div class="countdown-days-label">${countdown.days === 1 ? 'day left' : 'days left'}</div>
                        <div class="countdown-actions">
                            <button class="countdown-edit" data-edit="${event.id}" title="Edit title">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button class="countdown-remove" data-unpin="${event.id}" title="Remove">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers for edit buttons
            topBarContainer.querySelectorAll('.countdown-edit').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    editCountdownTitle(btn.dataset.edit);
                };
            });

            // Add click handlers for remove buttons
            topBarContainer.querySelectorAll('.countdown-remove').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    togglePinnedCountdown(btn.dataset.unpin, true); // Skip prompt when removing
                };
            });

            topBarContainer.querySelectorAll('.countdown-bar-item').forEach(item => {
                item.onclick = () => {
                    const eventId = item.dataset.eventId;
                    if (eventId) viewEvent(eventId);
                };
            });
        }
    }
}

// ============================================================================
// EVENT RESIZE FUNCTIONALITY (TickTick-style)
// ============================================================================
function setupEventResize() {
    // Guard to prevent duplicate listeners
    if (ScheduleState.resizeListenersInitialized) {
        return;
    }
    ScheduleState.resizeListenersInitialized = true;

    const container = document.getElementById('calendar-grid');
    if (!container) return;

    // Mouse down on resize handles
    container.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.resize-handle');
        if (!handle) return;

        e.preventDefault();
        e.stopPropagation();

        const eventEl = handle.closest('.calendar-event');
        if (!eventEl) return;

        const eventId = eventEl.dataset.eventId;
        const event = ScheduleState.events.find(ev => ev.id === eventId);
        if (!event) return;

        ScheduleState.resizeState = {
            isResizing: true,
            eventId: eventId,
            handle: handle.classList.contains('resize-handle-top') ? 'top' : 'bottom',
            startY: e.clientY,
            originalStartTime: event.startTime,
            originalEndTime: event.endTime,
            eventElement: eventEl
        };

        eventEl.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    // Mouse move for resize
    document.addEventListener('mousemove', handleResizeMove);

    // Mouse up to finish resize
    document.addEventListener('mouseup', handleResizeEnd);
}

function handleResizeMove(e) {
    if (!ScheduleState.resizeState.isResizing) return;

    const state = ScheduleState.resizeState;
    const eventEl = state.eventElement;
    if (!eventEl) return;

    const deltaY = e.clientY - state.startY;
    const deltaMinutes = Math.round(deltaY / (50 / 60)); // 50px per hour
    const snappedMinutes = Math.round(deltaMinutes / 15) * 15; // Snap to 15 min

    // Calculate new times
    let newStartTime = state.originalStartTime;
    let newEndTime = state.originalEndTime;

    if (state.handle === 'top') {
        newStartTime = adjustTime(state.originalStartTime, snappedMinutes);
        // Ensure start is before end (minimum 15 min duration)
        const startMins = timeToMinutes(newStartTime);
        const endMins = timeToMinutes(state.originalEndTime);
        if (startMins >= endMins - 15) {
            newStartTime = minutesToTime(endMins - 15);
        }
    } else {
        newEndTime = adjustTime(state.originalEndTime, snappedMinutes);
        // Ensure end is after start (minimum 15 min duration)
        const startMins = timeToMinutes(state.originalStartTime);
        const endMins = timeToMinutes(newEndTime);
        if (endMins <= startMins + 15) {
            newEndTime = minutesToTime(startMins + 15);
        }
    }

    // Clamp to valid hours (0:00 - 23:45)
    newStartTime = clampTime(newStartTime, '00:00', '23:45');
    newEndTime = clampTime(newEndTime, '00:15', '23:59');

    // Visual preview update
    const [startH, startM] = newStartTime.split(':').map(Number);
    const [endH, endM] = newEndTime.split(':').map(Number);
    const startHour = 6; // Calendar starts at 6 AM
    const top = ((startH - startHour) * 60 + startM) * (50 / 60);
    const height = ((endH - startH) * 60 + (endM - startM)) * (50 / 60);

    eventEl.style.top = `${Math.max(0, top)}px`;
    eventEl.style.height = `${Math.max(25, height)}px`;

    // Update time display if visible
    const timeEl = eventEl.querySelector('.event-time');
    if (timeEl) {
        timeEl.textContent = `${newStartTime} - ${newEndTime}`;
    }

    // Store for final save
    state.newStartTime = newStartTime;
    state.newEndTime = newEndTime;
}

async function handleResizeEnd(e) {
    if (!ScheduleState.resizeState.isResizing) return;

    const state = ScheduleState.resizeState;
    const eventEl = state.eventElement;

    if (eventEl) {
        eventEl.classList.remove('resizing');
    }

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save the new times if changed
    if (state.newStartTime || state.newEndTime) {
        const event = ScheduleState.events.find(ev => ev.id === state.eventId);
        if (event) {
            const newStart = state.newStartTime || state.originalStartTime;
            const newEnd = state.newEndTime || state.originalEndTime;

            if (newStart !== event.startTime || newEnd !== event.endTime) {
                event.startTime = newStart;
                event.endTime = newEnd;

                // Save to storage
                if (event.isTask && event.taskId) {
                    // Update task
                    await updateTaskTime(event.taskId, newStart, newEnd);
                } else {
                    // Update event
                    await ProductivityData.DataStore.saveScheduleEvent(event);
                }

                showToast('success', 'Time Updated', `${event.title}: ${newStart} - ${newEnd}`);
            }
        }
    }

    // Reset state
    ScheduleState.resizeState = {
        isResizing: false,
        eventId: null,
        handle: null,
        startY: 0,
        originalStartTime: null,
        originalEndTime: null
    };

    // Refresh view to ensure proper positioning
    renderCurrentView();
}

// Time utility functions for resize
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function adjustTime(timeStr, deltaMinutes) {
    const totalMins = timeToMinutes(timeStr) + deltaMinutes;
    return minutesToTime(Math.max(0, Math.min(totalMins, 23 * 60 + 59)));
}

function clampTime(timeStr, minTime, maxTime) {
    const mins = timeToMinutes(timeStr);
    const minMins = timeToMinutes(minTime);
    const maxMins = timeToMinutes(maxTime);
    return minutesToTime(Math.max(minMins, Math.min(mins, maxMins)));
}

async function updateTaskTime(taskId, startTime, endTime) {
    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.startTime = startTime;
            task.dueTime = endTime;
            // Update estimated minutes based on new duration
            const durationMins = timeToMinutes(endTime) - timeToMinutes(startTime);
            task.estimatedMinutes = durationMins;
            await ProductivityData.DataStore.saveTask(task);
        }
    } catch (e) {
        console.error('Failed to update task time:', e);
    }
}

// ============================================================================
// WEEK VIEW
// ============================================================================
async function renderWeekView() {
    const container = document.getElementById('calendar-grid');
    if (!container) return;

    const weekDates = getScheduleWeekDates(ScheduleState.weekOffset);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().toISOString().split('T')[0];

    // Update week label
    updateWeekLabel(weekDates);

    // Get events for the week
    const weekEvents = getEventsForDateRange(weekDates[0], weekDates[6]);

    // Generate time slots (6 AM to 11 PM)
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);

    container.innerHTML = `
        <div class="calendar-week-view">
            <div class="calendar-header-row">
                <div class="calendar-time-col"></div>
                ${weekDates.map((date, i) => {
        const d = new Date(date);
        const isToday = date === today;
        return `
                        <div class="calendar-day-header ${isToday ? 'today' : ''}" data-date="${date}">
                            <span class="day-name">${dayNames[i]}</span>
                            <span class="day-date ${isToday ? 'today-circle' : ''}">${d.getDate()}</span>
                        </div>
                    `;
    }).join('')}
            </div>
            <div class="calendar-body">
                <div class="calendar-times">
                    ${hours.map(h => `
                        <div class="time-slot">
                            <span>${formatHour(h)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="calendar-days">
                    ${weekDates.map(date => {
        const dayEvents = weekEvents.filter(e => e.date === date);
        const isToday = date === today;
        return `
                            <div class="calendar-day-column ${isToday ? 'today' : ''}" 
                                 data-date="${date}"
                                 data-dropzone="true">
                                ${hours.map(h => `
                                    <div class="hour-slot" data-hour="${h}" data-date="${date}">
                                    </div>
                                `).join('')}
                                ${renderDayEvents(dayEvents, hours[0])}
                                ${isToday ? '<div class="current-time-line" id="current-time-line"></div>' : ''}
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
        </div>
    `;

    // Setup drag and drop
    setupWeekDragDrop();

    // Position current time line - clear existing interval first
    if (ScheduleState.timeLineInterval) {
        clearInterval(ScheduleState.timeLineInterval);
    }
    updateCurrentTimeLine();
    ScheduleState.timeLineInterval = setInterval(updateCurrentTimeLine, 60000);
}

function setupWeekDragDrop() {
    document.querySelectorAll('[data-dropzone="true"]').forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', (e) => {
            handleDrop(e, zone.dataset.date);
        });
    });
}

// Note: Click handlers for hour slots and events are now handled via event delegation in setupScheduleListeners

/**
 * Get ISO week number for a date
 * ISO 8601: Week 1 is the week containing the first Thursday of the year
 * @param {Date} date - The date to get week number for
 * @returns {number} Week number (1-52/53)
 */
function getWeekNumber(date) {
    // Create a copy of the date to avoid modifying the original
    const target = new Date(date.valueOf());

    // ISO week date weeks start on Monday, so correct the day number
    // Get the day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayNr = (target.getDay() + 6) % 7; // Convert to Monday = 0, Sunday = 6

    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday (converted to 6) the last day of the week
    target.setDate(target.getDate() - dayNr + 3);

    // Get first day of year
    const firstThursday = target.valueOf();

    // Set to January 1st
    target.setMonth(0, 1);

    // If January 1st is not a Thursday, adjust to the first Thursday
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }

    // Calculate week number
    const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);

    return weekNum;
}

function updateWeekLabel(weekDates) {
    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        const start = new Date(weekDates[0]);
        const end = new Date(weekDates[6]);
        // Use Thursday (index 4) for ISO week number calculation
        // ISO 8601 defines weeks by which week contains Thursday
        const thursday = new Date(weekDates[4]);
        const weekNum = getWeekNumber(thursday);

        let dateText;
        if (start.getMonth() === end.getMonth()) {
            dateText = `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
        } else {
            dateText = `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} - ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
        }

        weekLabel.innerHTML = `<span class="week-number">W${weekNum}</span> ${dateText}`;
    }
}

function updateCurrentTimeLine() {
    const line = document.getElementById('current-time-line');
    if (!line) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (hours >= 6 && hours <= 23) {
        const top = ((hours - 6) * 60 + minutes) * (50 / 60);
        line.style.top = `${top}px`;
        line.style.display = 'block';
    } else {
        line.style.display = 'none';
    }
}

function renderDayEvents(events, startHour) {
    if (!events.length) return '';

    // Filter by type
    let filteredEvents = events;
    if (ScheduleState.filters.type !== 'all') {
        filteredEvents = events.filter(e => e.type === ScheduleState.filters.type || e.isTask);
    }

    // Group overlapping events
    const positioned = positionOverlappingEvents(filteredEvents);

    return positioned.map(event => {
        const [startH, startM] = event.startTime.split(':').map(Number);
        const [endH, endM] = event.endTime.split(':').map(Number);

        // Position relative to startHour with 50px per hour
        const top = ((startH - startHour) * 60 + startM) * (50 / 60);
        const height = ((endH - startH) * 60 + (endM - startM)) * (50 / 60);


        const colors = getEventDisplayColors(event);
        const eventColor = colors.border;
        const bgColor = colors.bg;


        const width = event.width || 100;
        const left = event.left || 0;

        // Only add gaps for overlapping events (width < 100)
        const hasOverlap = width < 100;
        const gapPx = hasOverlap ? 2 : 4;

        // Special styling for tasks
        const isTask = event.isTask || false;
        const taskClass = isTask ? 'is-task' : '';
        const priorityClass = isTask ? `priority-${event.priority || 'medium'}` : '';
        const statusIcon = isTask ? (event.status === 'in-progress' ? '🔄 ' : '') : '';

        return `
            <div class="calendar-event ${taskClass} ${priorityClass}" 
                 data-event-id="${event.id}"
                 ${isTask ? `data-task-id="${event.taskId}"` : ''}
                 draggable="true"
                 data-draggable-event="true"
                 style="
                    top: ${top}px;
                    height: ${Math.max(height, 25)}px;
                    width: calc(${width}% - ${gapPx * 2}px);
                    left: calc(${left}% + ${gapPx}px);
                    background: ${bgColor};
                    border-left: 3px solid ${eventColor};
                 ">
                <div class="resize-handle resize-handle-top" title="Drag to change start time"></div>
                <div class="event-content">
                    <div class="event-title">${statusIcon}${escapeHtml(event.title)}</div>
                    ${height > 40 ? `<div class="event-time">${event.startTime} - ${event.endTime}</div>` : ''}
                    ${height > 60 && event.location ? `<div class="event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div>` : ''}
                    <div class="event-task-actions">
                        ${isTask ? `<button class="btn-focus-task" data-task-id="${event.taskId}" title="Start Focus Session"><i class="fas fa-play"></i></button>` : ''}
                        ${isTask ? `<button class="btn-finish-review-task" data-task-id="${event.taskId}" title="Finish & Review"><i class="fas fa-graduation-cap"></i></button>` : ''}
                    </div>
                </div>
                <div class="resize-handle resize-handle-bottom" title="Drag to change end time"></div>
            </div>
        `;
    }).join('');
}

function positionOverlappingEvents(events) {
    if (events.length === 0) return events;
    if (events.length === 1) {
        return [{ ...events[0], width: 100, left: 0 }];
    }

    // Sort by start time, then by end time
    events.sort((a, b) => {
        const startDiff = a.startTime.localeCompare(b.startTime);
        if (startDiff !== 0) return startDiff;
        return a.endTime.localeCompare(b.endTime);
    });

    // Check if two events overlap
    function eventsOverlap(e1, e2) {
        const start1 = timeToMinutes(e1.startTime);
        const end1 = timeToMinutes(e1.endTime);
        const start2 = timeToMinutes(e2.startTime);
        const end2 = timeToMinutes(e2.endTime);
        return start1 < end2 && start2 < end1;
    }

    // Group events into clusters of overlapping events
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < events.length; i++) {
        if (assigned.has(i)) continue;

        const cluster = [events[i]];
        assigned.add(i);

        // Find all events that overlap with any event in this cluster
        let changed = true;
        while (changed) {
            changed = false;
            for (let j = 0; j < events.length; j++) {
                if (assigned.has(j)) continue;

                // Check if this event overlaps with any event in the cluster
                for (const clusterEvent of cluster) {
                    if (eventsOverlap(events[j], clusterEvent)) {
                        cluster.push(events[j]);
                        assigned.add(j);
                        changed = true;
                        break;
                    }
                }
            }
        }

        clusters.push(cluster);
    }

    // Position events within each cluster
    const positioned = [];

    for (const cluster of clusters) {
        if (cluster.length === 1) {
            // Single event - full width
            positioned.push({ ...cluster[0], width: 100, left: 0 });
        } else {
            // Multiple overlapping events - arrange in columns
            const columns = [];

            // Sort cluster by start time
            cluster.sort((a, b) => a.startTime.localeCompare(b.startTime));

            for (const event of cluster) {
                const eventStart = timeToMinutes(event.startTime);

                // Find first column where event fits (doesn't overlap with last event in column)
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const lastInColumn = columns[i][columns[i].length - 1];
                    if (timeToMinutes(lastInColumn.endTime) <= eventStart) {
                        columns[i].push(event);
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    columns.push([event]);
                }
            }

            // Calculate positions for this cluster
            const numColumns = columns.length;
            columns.forEach((column, colIndex) => {
                column.forEach(event => {
                    positioned.push({
                        ...event,
                        width: 100 / numColumns,
                        left: (colIndex / numColumns) * 100
                    });
                });
            });
        }
    }

    return positioned;
}

function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// ============================================================================
// MONTH VIEW
// ============================================================================
async function renderMonthView() {
    const container = document.getElementById('calendar-grid');
    if (!container) return;

    const year = ScheduleState.currentDate.getFullYear();
    const month = ScheduleState.currentDate.getMonth();

    // Helper to format date as local YYYY-MM-DD (avoid UTC timezone shifts)
    const formatLocalDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const today = formatLocalDate(new Date());

    // Update label
    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        weekLabel.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Get month's events
    const startDate = formatLocalDate(new Date(year, month, 1 - firstDay));
    const endDate = formatLocalDate(new Date(year, month + 1, 6));
    const monthEvents = getEventsForDateRange(startDate, endDate);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = `
        <div class="calendar-month-view">
            <div class="month-header">
                ${dayNames.map(day => `<div class="month-day-header">${day}</div>`).join('')}
            </div>
            <div class="month-grid">
    `;

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const date = formatLocalDate(new Date(year, month - 1, day));
        html += renderMonthDay(date, day, 'other-month', monthEvents);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = formatLocalDate(new Date(year, month, day));
        const isToday = date === today;
        html += renderMonthDay(date, day, isToday ? 'today' : '', monthEvents);
    }

    // Next month days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const remainingCells = totalCells - firstDay - daysInMonth;
    for (let day = 1; day <= remainingCells; day++) {
        const date = formatLocalDate(new Date(year, month + 1, day));
        html += renderMonthDay(date, day, 'other-month', monthEvents);
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

function renderMonthDay(date, day, className, events) {
    const dayEvents = events.filter(e => e.date === date);
    // Dynamic max display - show more events if we have space
    // Base calculation: ~3 events for normal days, up to 5 for days with few/no other constraints
    const maxDisplay = Math.min(5, Math.max(3, dayEvents.length));
    const showMore = dayEvents.length > maxDisplay;

    return `
        <div class="month-day ${className}" data-date="${date}" data-event-count="${dayEvents.length}">
            <div class="month-day-number">${day}</div>
            <div class="month-day-events ${dayEvents.length === 1 ? 'single-event' : dayEvents.length === 2 ? 'two-events' : ''}">
                ${dayEvents.slice(0, maxDisplay).map((event, index) => {
        const eventColor = getEventDisplayColors(event).border;
        return `
                        <div class="month-event-dot" 
                             style="background: ${eventColor}"
                             title="${escapeHtml(event.title)} - ${event.startTime}"
                             data-event-id="${event.id}">
                            ${escapeHtml(truncate(event.title, dayEvents.length === 1 ? 25 : 15))}
                        </div>
                    `;
    }).join('')}
                ${showMore ? `
                    <div class="month-more-events" data-date="${date}">+${dayEvents.length - maxDisplay} more</div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// DAY VIEW
// ============================================================================
async function renderDayView() {
    const container = document.getElementById('calendar-grid');
    if (!container) return;

    const currentDate = ScheduleState.currentDate;

    // Helper to format date as local YYYY-MM-DD (avoid UTC timezone shifts)
    const formatLocalDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const dateStr = formatLocalDate(currentDate);
    const today = formatLocalDate(new Date());
    const isToday = dateStr === today;

    // Update label
    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        weekLabel.textContent = currentDate.toLocaleDateString('en-US', options);
    }

    // Get events for this day
    const dayEvents = getEventsForDateRange(dateStr, dateStr);

    // Generate time slots (6 AM to 11 PM)
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);

    container.innerHTML = `
        <div class="calendar-day-view">
            <div class="day-header-row">
                <div class="day-time-col"></div>
                <div class="day-header ${isToday ? 'today' : ''}" data-date="${dateStr}">
                    <span class="day-name">${currentDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span class="day-number">${currentDate.getDate()}</span>
                </div>
            </div>
            <div class="day-body">
                <div class="day-time-column">
                    ${hours.map(hour => `
                        <div class="day-time-slot">
                            <span class="time-label">${formatHour(hour)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="day-events-column" data-date="${dateStr}">
                    <div class="day-events-container">
                        ${hours.map(hour => `
                            <div class="day-hour-slot" data-hour="${hour}"></div>
                        `).join('')}
                        ${renderDayViewEvents(dayEvents)}
                    </div>
                </div>
            </div>
        </div>
    `;
}


function renderDayViewEvents(events) {
    // Position overlapping events
    const positioned = positionOverlappingEvents([...events]);

    return positioned.map(event => {
        const startMinutes = timeToMinutes(event.startTime);
        const endMinutes = timeToMinutes(event.endTime);
        const duration = endMinutes - startMinutes;

        // Calculate position (relative to 6 AM)
        const top = ((startMinutes - 360) / 60) * 60; // 60px per hour
        const height = Math.max((duration / 60) * 60, 25); // minimum 25px

        const colors = getEventDisplayColors(event);
        const eventColor = colors.border;
        const bgColor = colors.bg;

        const isTask = event.isTask || false;

        const width = event.width || 100;
        const left = event.left || 0;

        return `
            <div class="day-event" 
                 data-event-id="${event.id}" 
                 ${isTask ? `data-task-id="${event.taskId}"` : ''}
                 style="
                    top: ${top}px;
                    height: ${height}px;
                    width: calc(${width}% - 4px);
                    left: ${left}%;
                    background: ${bgColor};
                    border-left: 3px solid ${eventColor};
                 ">
                <div class="event-content">
                    <div class="event-title">${escapeHtml(event.title)}</div>
                    ${height > 40 ? `<div class="event-time">${event.startTime} - ${event.endTime}</div>` : ''}
                    ${height > 60 && event.location ? `<div class="event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div>` : ''}
                    <div class="event-task-actions">
                        ${isTask ? `<button class="btn-focus-task" data-task-id="${event.taskId}" title="Start Focus Session"><i class="fas fa-play"></i></button>` : ''}
                        ${isTask ? `<button class="btn-finish-review-task" data-task-id="${event.taskId}" title="Finish & Review"><i class="fas fa-graduation-cap"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// AGENDA VIEW
// ============================================================================
async function renderAgendaView() {
    const container = document.getElementById('calendar-grid');
    if (!container) return;

    const today = new Date();
    const dates = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        weekLabel.textContent = 'Upcoming 2 Weeks';
    }

    const events = getEventsForDateRange(dates[0], dates[dates.length - 1]);

    container.innerHTML = `
        <div class="agenda-view">
            ${dates.map(date => {
        const dayEvents = events.filter(e => e.date === date);
        if (dayEvents.length === 0) return '';

        const d = new Date(date);
        const isToday = date === dates[0];

        return `
                    <div class="agenda-day ${isToday ? 'today' : ''}">
                        <div class="agenda-date">
                            <span class="agenda-day-name">${d.toLocaleDateString('en-US', { weekday: 'long' })}</span>
                            <span class="agenda-day-number">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div class="agenda-events">
                            ${dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(event => {
            const colors = getEventDisplayColors(event);
            const eventColor = colors.border;
            const typeLabel = colors.label;
            return `
                                    <div class="agenda-event" data-event-id="${event.id}" style="border-left-color: ${eventColor}">
                                        <div class="agenda-event-time">
                                            <span>${event.startTime}</span>
                                            <span>${event.endTime}</span>
                                        </div>
                                        <div class="agenda-event-content">
                                            <div class="agenda-event-title">${escapeHtml(event.title)}</div>
                                            ${event.location ? `<div class="agenda-event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div>` : ''}
                                        </div>
                                        <div class="agenda-event-type" style="background: ${eventColor}20; color: ${eventColor}">
                                            ${typeLabel}
                                        </div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                `;
    }).join('') || '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No upcoming tasks in the next 2 weeks</p></div>'}
        </div>
    `;
}

// ============================================================================
// SIDEBAR COMPONENTS
// ============================================================================
function renderTodayAgenda() {
    const container = document.getElementById('today-agenda');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const todayEvents = ScheduleState.events
        .filter(e => e.date === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (todayEvents.length === 0) {
        container.innerHTML = `
            <div class="empty-agenda">
                <i class="fas fa-calendar-day"></i>
                <p>No tasks scheduled today</p>
                <button type="button" class="btn-ghost small add-today-event-btn" data-date="${today}">
                    <i class="fas fa-plus"></i> Add Task
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = todayEvents.map(event => {
        const eventColor = getEventDisplayColors(event).border;
        const now = new Date();
        const [startH, startM] = event.startTime.split(':').map(Number);
        const [endH, endM] = event.endTime.split(':').map(Number);
        const isNow = now.getHours() >= startH && now.getHours() < endH;

        return `
            <div class="today-event ${isNow ? 'current' : ''}" data-event-id="${event.id}">
                <div class="today-event-indicator" style="background: ${eventColor}"></div>
                <div class="today-event-time">${event.startTime}</div>
                <div class="today-event-title">${escapeHtml(event.title)}</div>
            </div>
        `;
    }).join('');
}

// Render sidebar "My Events" section with tasks
async function renderSidebarEvents() {
    const container = document.getElementById('my-events-list');
    if (!container) return;

    try {
        // Get tasks
        const tasks = await ProductivityData.DataStore.getTasks();
        const activeTasks = tasks
            .filter(t => t.status !== 'completed')
            .sort((a, b) => {
                const aDate = a.startDate || a.dueDate;
                const bDate = b.startDate || b.dueDate;
                if (aDate && bDate) return aDate.localeCompare(bDate);
                if (aDate) return -1;
                if (bDate) return 1;
                return String(a.title || '').localeCompare(String(b.title || ''));
            });

        if (activeTasks.length === 0) {
            container.innerHTML = '<p class="empty-hint">Your tasks will appear here</p>';
            return;
        }

        let html = '';

        // Render tasks
        if (activeTasks.length > 0) {
            const expanded = !!ScheduleState.ui?.sidebarTasksExpanded;
            const visibleTasks = expanded ? activeTasks : activeTasks.slice(0, 5);

            html += `<div class="sidebar-subgroup"><span class="subgroup-label">Tasks</span>`;
            visibleTasks.forEach(task => {
                const dateDisplay = task.startDate || task.dueDate;
                const dateObj = dateDisplay ? new Date(dateDisplay) : null;
                const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
                html += `
                    <div class="sidebar-event-item" data-task-id="${task.id}">
                        <span class="event-dot" style="background: ${task.color || '#6366f1'}"></span>
                        <span class="event-name">${escapeHtml(task.title)}</span>
                        <span class="event-date">${dateStr}</span>
                    </div>
                `;
            });
            if (activeTasks.length > 5) {
                html += expanded
                    ? `<div class="sidebar-more" data-action="toggle-sidebar-tasks">Show less</div>`
                    : `<div class="sidebar-more" data-action="toggle-sidebar-tasks">+${activeTasks.length - 5} more tasks</div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;

        // Bind expand/collapse toggle once
        if (!container.dataset.sidebarTasksToggleBound) {
            container.dataset.sidebarTasksToggleBound = 'true';
            container.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action === 'toggle-sidebar-tasks') {
                    ScheduleState.ui.sidebarTasksExpanded = !ScheduleState.ui.sidebarTasksExpanded;
                    renderSidebarEvents();
                }
            });
        }
    } catch (e) {
        console.error('Error rendering sidebar events:', e);
        container.innerHTML = '<p class="empty-hint">Error loading tasks</p>';
    }
}

// Render imported calendars section with their names and delete buttons
async function renderImportedCalendars() {
    const container = document.getElementById('imported-calendars-list');
    if (!container) return;

    try {
        const hasImportedCalendars = Object.keys(ScheduleState.importedCalendarsMeta).length > 0;

        let html = `
            <label class="filter-item-mini">
                <input type="checkbox" id="show-imported" ${ScheduleState.filters.showImported !== false ? 'checked' : ''}>
                <span class="filter-dot" style="background: linear-gradient(135deg, #667eea, #764ba2);"></span>
                <span>Show Imported Events</span>
            </label>
        `;

        if (hasImportedCalendars) {
            // Render each imported calendar with delete button
            Object.entries(ScheduleState.importedCalendarsMeta).forEach(([calId, meta]) => {
                const eventCount = ScheduleState.events.filter(e => e.importedCalendarId === calId).length;
                html += `
                    <div class="imported-source-item" data-calendar-id="${calId}">
                        <span class="filter-color" style="background: ${meta.color || '#667eea'}; width: 10px; height: 10px; border-radius: 3px;"></span>
                        <span class="source-name">${escapeHtml(meta.name || 'Imported Calendar')}</span>
                        <span class="source-count">${eventCount}</span>
                        <div class="imported-actions" style="display: flex; gap: 4px; margin-left: auto;">
                            ${meta.sourceUrl ? `
                                <button class="btn-icon-tiny" data-refresh-calendar="${calId}" title="Refresh from source">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                            ` : ''}
                            <button class="btn-icon-tiny btn-danger-hover" data-delete-calendar="${calId}" title="Delete this calendar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            // Fallback: count imported events if no metadata
            const importedEvents = ScheduleState.events.filter(e => e.isImported);
            if (importedEvents.length > 0) {
                html += `
                    <div class="imported-source-item">
                        <i class="fas fa-calendar-alt"></i>
                        <span class="source-name">Imported</span>
                        <span class="source-count">${importedEvents.length}</span>
                        <div class="imported-actions" style="display: flex; gap: 4px; margin-left: auto;">
                            <button class="btn-icon-tiny btn-danger-hover" id="delete-all-imported" title="Delete all imported events">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `<p class="empty-hint">No imported calendars</p>`;
            }
        }

        container.innerHTML = html;

        // Attach event listener for show/hide imported
        container.querySelector('#show-imported')?.addEventListener('change', async (e) => {
            ScheduleState.filters.showImported = e.target.checked;
            await renderCurrentView();
        });

        // Attach delete button handlers
        container.querySelectorAll('[data-delete-calendar]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const calId = btn.dataset.deleteCalendar;
                await deleteImportedCalendar(calId);
            });
        });

        // Attach refresh button handlers
        container.querySelectorAll('[data-refresh-calendar]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const calId = btn.dataset.refreshCalendar;
                await refreshImportedCalendar(calId);
            });
        });

        // Attach delete all imported events handler
        container.querySelector('#delete-all-imported')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await deleteAllImportedEvents();
        });


    } catch (e) {
        console.error('Error rendering imported calendars:', e);
        container.innerHTML = `
            <label class="filter-item-mini">
                <input type="checkbox" id="show-imported" checked>
                <span class="filter-dot" style="background: linear-gradient(135deg, #667eea, #764ba2);"></span>
                <span>Show Imported Events</span>
            </label>
        `;
    }
}
function renderUpcomingEvents() {
    const container = document.getElementById('upcoming-events');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const upcoming = ScheduleState.events
        .filter(e => e.date > today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<p class="no-upcoming">No upcoming events</p>';
        return;
    }

    container.innerHTML = upcoming.map(event => {
        const eventColor = getEventDisplayColors(event).border;
        const date = new Date(event.date);

        return `
            <div class="upcoming-event" data-event-id="${event.id}">
                <div class="upcoming-event-date">
                    <span class="upcoming-month">${date.toLocaleDateString('en-US', { month: 'short' })}</span>
                    <span class="upcoming-day">${date.getDate()}</span>
                </div>
                <div class="upcoming-event-info">
                    <div class="upcoming-event-title">${escapeHtml(event.title)}</div>
                    <div class="upcoming-event-time">${event.startTime} - ${event.endTime}</div>
                </div>
                <div class="upcoming-event-type" style="background: ${eventColor}"></div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// DYNAMIC CALENDAR FILTERS
// ============================================================================
async function renderCalendarFilters() {
    const filterList = document.getElementById('calendar-filter-list');
    if (!filterList) return;

    // Get current custom colors
    const typeColors = { ...DEFAULT_TYPE_COLORS, ...customTypeColors };

    // Render type filters
    let filtersHtml = Object.entries(EVENT_COLORS).map(([type, config]) => `
        <label class="filter-item" data-type="${type}">
            <input type="checkbox" data-type="${type}" ${ScheduleState.filters.visibleTypes[type] !== false ? 'checked' : ''}>
            <span class="filter-color" style="background: ${typeColors[type] || config.border};" data-color-picker="${type}"></span>
            <span class="filter-label">${config.label}</span>
        </label>
    `).join('');

    // Add task lists section
    const taskLists = await ProductivityData.DataStore.getTaskLists();
    if (taskLists.length > 0) {
        filtersHtml += `
            <div class="filter-divider">
                <span>Task List Filters</span>
                <button class="btn-icon-tiny" id="add-task-list-btn" title="Add New List">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;
        filtersHtml += taskLists.map(list => `
            <label class="filter-item task-list-filter" data-list-id="${list.id}">
                <input type="checkbox" data-list-id="${list.id}" ${list.isVisible !== false ? 'checked' : ''}>
                <span class="filter-color" style="background: ${list.color};" data-list-color-picker="${list.id}"></span>
                <span class="filter-label">${escapeHtml(list.name)}</span>
                <button class="filter-delete-btn" data-delete-list="${list.id}" title="Delete list">
                    <i class="fas fa-times"></i>
                </button>
            </label>
        `).join('');
    } else {
        filtersHtml += `
            <div class="filter-divider">
                <span>Task List Filters</span>
                <button class="btn-icon-tiny" id="add-task-list-btn" title="Add New List">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <p class="filter-empty-hint">No task lists yet</p>
        `;
    }

    filterList.innerHTML = filtersHtml;

    // Setup filter checkbox handlers
    filterList.querySelectorAll('input[data-type]').forEach(checkbox => {
        checkbox.onchange = () => {
            const type = checkbox.dataset.type;
            if (type) {
                ScheduleState.filters.visibleTypes[type] = checkbox.checked;
                renderCurrentView();
            }
        };
    });

    // Setup task list visibility handlers
    filterList.querySelectorAll('input[data-list-id]').forEach(checkbox => {
        checkbox.onchange = async () => {
            const listId = checkbox.dataset.listId;
            if (listId) {
                await ProductivityData.DataStore.toggleTaskListVisibility(listId);
                await loadTasksAsEvents();
                renderCurrentView();
            }
        };
    });

    // Setup color picker handlers
    filterList.querySelectorAll('.filter-color[data-color-picker]').forEach(colorSpan => {
        colorSpan.style.cursor = 'pointer';
        colorSpan.title = 'Click to change color';
        colorSpan.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent label from toggling checkbox
            const type = colorSpan.dataset.colorPicker;
            openColorPicker(type, colorSpan);
        };
    });

    // Setup task list color picker handlers
    filterList.querySelectorAll('.filter-color[data-list-color-picker]').forEach(colorSpan => {
        colorSpan.style.cursor = 'pointer';
        colorSpan.title = 'Click to change color';
        colorSpan.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const listId = colorSpan.dataset.listColorPicker;
            openTaskListColorPicker(listId, colorSpan);
        };
    });

    // Setup add task list button
    document.getElementById('add-task-list-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAddTaskListModal();
    });

    // Setup delete task list buttons
    filterList.querySelectorAll('[data-delete-list]').forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const listId = btn.dataset.deleteList;
            const ok = await confirmDialog('Delete this task list? Tasks will be kept but unassigned.', {
                title: 'Delete Task List',
                confirmText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (ok) {
                await ProductivityData.DataStore.deleteTaskList(listId);
                await loadTasksAsEvents();
                renderCalendarFilters();
                renderCurrentView();
                showToast('success', 'List Deleted', 'Task list has been removed.');
            }
        };
    });

    // Render imported calendars section
    renderImportedCalendarsFilter();
}

// Open color picker for task list
function openTaskListColorPicker(listId, anchorEl) {
    const colors = (typeof getFixedColorPalette === 'function')
        ? getFixedColorPalette()
        : ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6', '#f97316'];

    // Remove existing picker
    document.querySelector('.color-picker-popup')?.remove();

    const picker = document.createElement('div');
    picker.className = 'color-picker-popup';
    picker.innerHTML = colors.map(color => `
        <button class="color-option" data-color="${color}" style="background: ${color}"></button>
    `).join('');

    // Position the picker
    const rect = anchorEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top = `${rect.bottom + 5}px`;
    picker.style.left = `${rect.left}px`;
    picker.style.zIndex = '1000';

    document.body.appendChild(picker);

    // Handle color selection
    picker.querySelectorAll('.color-option').forEach(btn => {
        btn.onclick = async () => {
            const newColor = btn.dataset.color;

            // Fetch fresh lists and find the one to update
            const lists = await ProductivityData.DataStore.getTaskLists();
            const listIndex = lists.findIndex(l => String(l.id) === String(listId));


            if (listIndex >= 0) {
                const listToUpdate = lists[listIndex];
                listToUpdate.color = newColor;

                // Save the updated list
                await ProductivityData.DataStore.saveTaskList(listToUpdate);

                // Update the UI element immediately
                anchorEl.style.background = newColor;

                // Verify the save worked
                const verifyLists = await ProductivityData.DataStore.getTaskLists();
                const verifyList = verifyLists.find(l => String(l.id) === String(listId));

                // Reload tasks with new list colors - this rebuilds all task events
                await loadTasksAsEvents();

                // Force re-render the calendar view
                await renderCurrentView();

                // Show confirmation
                showToast('success', 'Color Updated', `List color changed to ${newColor}`);
            }

            picker.remove();
        };
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeHandler(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closeHandler);
            }
        });
    }, 10);
}

function showFixedPalettePopup(anchorEl, currentColor, onPick) {
    const colors = (typeof getFixedColorPalette === 'function')
        ? getFixedColorPalette()
        : ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6', '#f97316'];

    const normalizedCurrent = (typeof normalizePaletteColor === 'function')
        ? normalizePaletteColor(currentColor, colors[0])
        : currentColor;

    document.querySelector('.color-picker-popup')?.remove();

    const picker = document.createElement('div');
    picker.className = 'color-picker-popup';
    picker.innerHTML = colors.map(color => {
        const isSelected = String(color).toLowerCase() === String(normalizedCurrent).toLowerCase();
        const selectedStyle = isSelected ? 'box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(99,102,241,0.8);' : '';
        return `
            <button class="color-option" data-color="${color}" title="${color}" aria-label="Choose ${color}" style="background: ${color}; ${selectedStyle}"></button>
        `;
    }).join('');

    const rect = anchorEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top = `${rect.bottom + 5}px`;
    picker.style.left = `${rect.left}px`;
    picker.style.zIndex = '1000';

    document.body.appendChild(picker);

    picker.querySelectorAll('.color-option').forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const newColor = btn.dataset.color;
            await onPick(newColor);
            picker.remove();
        };
    });

    setTimeout(() => {
        document.addEventListener('click', function closeHandler(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closeHandler);
            }
        });
    }, 10);
}

// Open modal to add new task list
function openAddTaskListModal() {
    if (typeof window.openTaskListModal === 'function') {
        window.openTaskListModal();
    } else {
        // Fallback to simple prompt
        const name = prompt('Enter name for new task list:');
        if (name && name.trim()) {
            const list = new ProductivityData.TaskList({ name: name.trim() });
            ProductivityData.DataStore.saveTaskList(list).then(() => {
                renderCalendarFilters();
                showToast('success', 'List Created', `"${name}" has been created.`);
            });
        }
    }
}

// Refresh function for external calls
async function refreshScheduleFilters() {
    await loadTasksAsEvents();
    await renderCalendarFilters();
    renderCurrentView();
}

function renderImportedCalendarsFilter() {

    const importedContainer = document.getElementById('imported-calendars-list');
    if (!importedContainer) {
        return;
    }

    const hasImportedCalendars = Object.keys(ScheduleState.importedCalendarsMeta).length > 0;

    if (!hasImportedCalendars) {
        importedContainer.innerHTML = `
            <p class="empty-hint">No subscribed calendars yet</p>
        `;
    } else {
        importedContainer.innerHTML = Object.entries(ScheduleState.importedCalendarsMeta).map(([calId, meta]) => `
            <div class="imported-calendar-item" data-calendar-id="${calId}">
                <label class="imported-calendar-label">
                    <input type="checkbox" data-calendar-id="${calId}" ${ScheduleState.filters.importedCalendars[calId] !== false ? 'checked' : ''}>
                    <span class="filter-color" style="background: ${meta.color || '#667eea'};" data-imported-color-picker="${calId}"></span>
                    <span class="imported-calendar-name">${escapeHtml(meta.name || 'Imported Calendar')}</span>
                </label>
                <div class="imported-calendar-actions">
                    ${meta.sourceUrl ? `
                        <button class="imported-action-btn refresh-btn" data-refresh-calendar="${calId}" title="Refresh from source">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    ` : ''}
                    <button class="imported-action-btn delete-btn" data-delete-calendar="${calId}" title="Delete this calendar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Setup imported calendar handlers
    setupImportedCalendarHandlers();
}

function setupImportedCalendarHandlers() {

    // Individual imported calendar checkboxes
    document.querySelectorAll('input[data-calendar-id]').forEach(checkbox => {
        checkbox.onchange = () => {
            const calId = checkbox.dataset.calendarId;
            ScheduleState.filters.importedCalendars[calId] = checkbox.checked;
            renderCurrentView();
        };
    });

    // Color pickers for imported calendars
    document.querySelectorAll('.filter-color[data-imported-color-picker]').forEach(colorSpan => {
        colorSpan.style.cursor = 'pointer';
        colorSpan.title = 'Click to change color';
        colorSpan.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent label from toggling checkbox
            const calId = colorSpan.dataset.importedColorPicker;
            openImportedColorPicker(calId, colorSpan);
        };
    });

    // Delete buttons for imported calendars (updated selector)
    document.querySelectorAll('.imported-action-btn.delete-btn[data-delete-calendar], .filter-delete-btn[data-delete-calendar]').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const calId = btn.dataset.deleteCalendar;
            await deleteImportedCalendar(calId);
        };
    });

    // Refresh buttons for imported calendars with source URLs (updated selector)
    document.querySelectorAll('.imported-action-btn.refresh-btn[data-refresh-calendar], .filter-refresh-btn[data-refresh-calendar]').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const calId = btn.dataset.refreshCalendar;
            await refreshImportedCalendar(calId);
        };
    });
}

function openColorPicker(type, colorSpan) {
    const rawCurrent = customTypeColors[type] || DEFAULT_TYPE_COLORS[type];
    const currentColor = (typeof normalizePaletteColor === 'function')
        ? normalizePaletteColor(rawCurrent, DEFAULT_TYPE_COLORS[type])
        : rawCurrent;

    showFixedPalettePopup(colorSpan, currentColor, async (newColor) => {
        customTypeColors[type] = newColor;
        colorSpan.style.background = newColor;

        if (EVENT_COLORS[type]) {
            EVENT_COLORS[type].bg = newColor + '20';
            EVENT_COLORS[type].border = newColor;
        }

        await chrome.storage.local.set({ customTypeColors });
        renderCurrentView();
    });
}

function openImportedColorPicker(calId, colorSpan) {
    const meta = ScheduleState.importedCalendarsMeta[calId];
    const rawCurrent = meta?.color || '#667eea';
    const currentColor = (typeof normalizePaletteColor === 'function')
        ? normalizePaletteColor(rawCurrent, '#667eea')
        : rawCurrent;

    showFixedPalettePopup(colorSpan, currentColor, async (newColor) => {
        if (ScheduleState.importedCalendarsMeta[calId]) {
            ScheduleState.importedCalendarsMeta[calId].color = newColor;
        }
        colorSpan.style.background = newColor;

        ScheduleState.events.forEach(event => {
            if (event.importedCalendarId === calId) {
                event.color = newColor;
            }
        });

        await chrome.storage.local.set({ importedCalendarsMeta: ScheduleState.importedCalendarsMeta });
        for (const event of ScheduleState.events) {
            if (event.importedCalendarId === calId) {
                await ProductivityData.DataStore.saveScheduleEvent(event);
            }
        }

        renderCurrentView();
    });
}

async function deleteImportedCalendar(calId) {
    const meta = ScheduleState.importedCalendarsMeta[calId];
    const calName = meta?.name || 'this calendar';

    const ok = await confirmDialog(`Delete "${calName}" and all its events?`, {
        title: 'Delete Calendar',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        // Delete all events from this calendar
        const eventsToDelete = ScheduleState.events.filter(e => e.importedCalendarId === calId);
        for (const event of eventsToDelete) {
            await ProductivityData.DataStore.deleteScheduleEvent(event.id);
        }
        ScheduleState.events = ScheduleState.events.filter(e => e.importedCalendarId !== calId);

        // Remove metadata
        delete ScheduleState.importedCalendarsMeta[calId];
        delete ScheduleState.filters.importedCalendars[calId];
        await chrome.storage.local.set({ importedCalendarsMeta: ScheduleState.importedCalendarsMeta });

        // Refresh
        renderCalendarFilters();
        renderImportedCalendars();
        renderCurrentView();
        showToast('success', 'Calendar Deleted', `"${calName}" has been removed.`);
    } catch (error) {
        console.error('Failed to delete calendar:', error);
        showToast('error', 'Delete Failed', 'Could not delete the calendar.');
    }
}

/**
 * Delete all imported events (for orphan events without metadata)
 */
async function deleteAllImportedEvents() {
    const importedEvents = ScheduleState.events.filter(e => e.isImported);

    if (importedEvents.length === 0) {
        showToast('info', 'No Events', 'There are no imported events to delete.');
        return;
    }

    const ok = await confirmDialog(`Delete all ${importedEvents.length} imported events? This cannot be undone.`, {
        title: 'Delete Imported Events',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        // Delete all imported events from storage - try both schedule types
        for (const event of importedEvents) {
            const scheduleType = event.scheduleType || 'school';
            await ProductivityData.DataStore.deleteScheduleEvent(event.id, scheduleType);
            // Also try the other schedule type in case it's stored there
            if (scheduleType === 'school') {
                await ProductivityData.DataStore.deleteScheduleEvent(event.id, 'personal');
            } else {
                await ProductivityData.DataStore.deleteScheduleEvent(event.id, 'school');
            }
        }

        // Remove from state
        ScheduleState.events = ScheduleState.events.filter(e => !e.isImported);

        // Clear any leftover metadata
        ScheduleState.importedCalendarsMeta = {};
        await chrome.storage.local.set({ importedCalendarsMeta: {} });

        // Refresh
        renderCalendarFilters();
        renderImportedCalendars();
        renderCurrentView();
        showToast('success', 'Events Deleted', `All ${importedEvents.length} imported events have been removed.`);
    } catch (error) {
        console.error('Failed to delete imported events:', error);
        showToast('error', 'Delete Failed', 'Could not delete imported events.');
    }
}

/**
 * Refresh an imported calendar from its source URL
 * Re-fetches events and replaces existing ones
 */
async function refreshImportedCalendar(calId) {
    const meta = ScheduleState.importedCalendarsMeta[calId];

    if (!meta || !meta.sourceUrl) {
        showToast('error', 'Cannot Refresh', 'This calendar does not have a source URL.');
        return;
    }

    const calName = meta.name || 'Calendar';

    try {
        showToast('info', 'Refreshing...', `Updating "${calName}" from source...`);

        // Fetch new data from the source URL
        let response;
        let fetchSuccess = false;
        const url = meta.sourceUrl;

        // Try direct fetch first
        try {
            response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                fetchSuccess = true;
            }
        } catch (e) {
            // Direct fetch failed, will try proxies
        }

        // If direct fetch fails (CORS), try via proxy services
        if (!fetchSuccess) {
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
            ];

            for (const proxyUrl of proxies) {
                try {
                    response = await fetch(proxyUrl);
                    if (response.ok) {
                        fetchSuccess = true;
                        break;
                    }
                } catch (e) {
                    // Proxy failed, try next
                }
            }
        }

        if (!fetchSuccess || !response || !response.ok) {
            throw new Error('Could not fetch calendar. The source may be unavailable.');
        }

        const text = await response.text();

        if (!text || text.length < 10) {
            throw new Error('Received empty or invalid response');
        }

        // Parse the new events
        let events = [];
        if (text.includes('VCALENDAR') || text.includes('VEVENT')) {
            events = parseICSFile(text);
        } else {
            throw new Error('Unsupported format. Only ICS calendars can be refreshed.');
        }

        if (events.length === 0) {
            showToast('warning', 'No Events', 'No events found in the updated calendar.');
            return;
        }

        // Delete existing events from this calendar
        const oldEvents = ScheduleState.events.filter(e => e.importedCalendarId === calId);
        for (const event of oldEvents) {
            const scheduleType = event.scheduleType || 'school';
            await ProductivityData.DataStore.deleteScheduleEvent(event.id, scheduleType);
            // Also try the other schedule type in case it was stored there
            if (scheduleType === 'school') {
                await ProductivityData.DataStore.deleteScheduleEvent(event.id, 'personal');
            } else {
                await ProductivityData.DataStore.deleteScheduleEvent(event.id, 'school');
            }
        }
        ScheduleState.events = ScheduleState.events.filter(e => e.importedCalendarId !== calId);

        // Import new events
        for (const eventData of events) {
            eventData.startTime = ensureTimeFormat(eventData.startTime);
            eventData.endTime = ensureTimeFormat(eventData.endTime);

            const event = new ProductivityData.ScheduleEvent({
                ...eventData,
                type: meta.eventType || 'class',
                color: meta.color || '#6366f1',
                scheduleType: 'school',
                isImported: true,
                importedCalendarId: calId,
                importedAt: new Date().toISOString()
            });
            await ProductivityData.DataStore.saveScheduleEvent(event);
            ScheduleState.events.push(event);
        }

        // Update metadata
        meta.lastRefreshed = new Date().toISOString();
        meta.eventCount = events.length;
        await chrome.storage.local.set({ importedCalendarsMeta: ScheduleState.importedCalendarsMeta });

        // Refresh the view
        renderCalendarFilters();
        renderImportedCalendars();
        renderImportedCalendarsFilter();
        renderCurrentView();
        showToast('success', 'Calendar Updated', `"${calName}" refreshed with ${events.length} events.`);

    } catch (error) {
        console.error('Failed to refresh calendar:', error);
        showToast('error', 'Refresh Failed', error.message || 'Could not refresh the calendar.');
    }
}

// ============================================================================
// SCHEDULE CREATE PICKER (Task/Event Selection)
// ============================================================================
function openScheduleCreatePicker(date = null, time = null) {
    const defaultDate = date || new Date().toISOString().split('T')[0];

    // Tasks-only: always open the task modal
    if (typeof window.openTaskModal === 'function') {
        const prefillData = {
            dueDate: defaultDate,
            dueTime: time || null
        };
        window.openTaskModal(null, 'not-started', prefillData);
        return;
    }

    console.error('openTaskModal not found');
    showToast('error', 'Error', 'Could not open task modal');
}

function formatTime12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// ============================================================================
// EVENT CRUD OPERATIONS
// ============================================================================
function openScheduleEventModal(event = null, date = null, time = null) {
    // Tasks-only: prevent creating new calendar events
    if (event === null) {
        openScheduleCreatePicker(date, time);
        return;
    }

    // Task items on the calendar should edit the underlying task
    // Some older saved items may have taskId without isTask.
    if (event?.taskId && typeof window.openTaskModal === 'function') {
        (async () => {
            const tasks = await ProductivityData.DataStore.getTasks();
            const task = tasks.find(t => t.id === event.taskId);
            if (task) {
                window.openTaskModal(task, task.status || 'not-started', {});
            } else {
                showToast('error', 'Not Found', 'Could not find the task to edit.');
            }
        })();
        return;
    }

    // Non-task events (imported/legacy) are view-only
    showToast('info', 'Events Disabled', 'Calendar events are view-only.');
    if (event?.id) viewEvent(event.id);
    return;

    ScheduleState.editingEvent = event;

    const modal = document.getElementById('event-modal') || createEventModal();
    const isEditing = event !== null;

    // Default values - ensure time is always properly formatted
    const defaultDate = date || new Date().toISOString().split('T')[0];
    const defaultStartTime = ensureTimeFormat(time) || '09:00';
    const defaultEndTime = addHour(defaultStartTime);

    // Ensure event times are properly formatted
    const eventStartTime = event ? ensureTimeFormat(event.startTime) : defaultStartTime;
    const eventEndTime = event ? ensureTimeFormat(event.endTime) : defaultEndTime;

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-modal"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>${isEditing ? 'Edit Event' : 'New Event'}</h3>
                <button class="btn-icon" data-action="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="event-form">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="event-title">Title *</label>
                        <input type="text" id="event-title" required 
                               value="${event?.title || ''}"
                               placeholder="Event title">
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="event-date">Date *</label>
                            <input type="date" id="event-date" required 
                                   value="${event?.date || defaultDate}">
                        </div>
                        <div class="form-group">
                            <label for="event-type">Type</label>
                            <select id="event-type">
                                ${Object.entries(EVENT_COLORS).map(([key, val]) => `
                                    <option value="${key}" ${event?.type === key ? 'selected' : ''}>
                                        ${val.label}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="event-start">Start Time *</label>
                            <input type="time" id="event-start" required 
                                   value="${eventStartTime}">
                        </div>
                        <div class="form-group">
                            <label for="event-end">End Time *</label>
                            <input type="time" id="event-end" required 
                                   value="${eventEndTime}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="event-location">Location</label>
                        <input type="text" id="event-location" 
                               value="${event?.location || ''}"
                               placeholder="Room, building, or link">
                    </div>
                    
                    <div class="form-group">
                        <label for="event-description">Description</label>
                        <textarea id="event-description" rows="3" 
                                  placeholder="Additional notes...">${event?.description || ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="event-recurring" ${event?.recurring ? 'checked' : ''}>
                            Recurring event
                        </label>
                    </div>
                    
                    <div id="recurring-options" class="${event?.recurring ? '' : 'hidden'}">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="event-repeat">Repeat</label>
                                <select id="event-repeat">
                                    <option value="daily" ${event?.repeatType === 'daily' ? 'selected' : ''}>Daily</option>
                                    <option value="weekly" ${event?.repeatType === 'weekly' ? 'selected' : ''}>Weekly</option>
                                    <option value="biweekly" ${event?.repeatType === 'biweekly' ? 'selected' : ''}>Bi-weekly</option>
                                    <option value="monthly" ${event?.repeatType === 'monthly' ? 'selected' : ''}>Monthly</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="event-repeat-until">Until</label>
                                <input type="date" id="event-repeat-until" 
                                       value="${event?.repeatUntil || ''}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="event-reminder">Reminder</label>
                        <select id="event-reminder">
                            <option value="" ${!event?.reminder ? 'selected' : ''}>No reminder</option>
                            <option value="5" ${event?.reminder === 5 ? 'selected' : ''}>5 minutes before</option>
                            <option value="15" ${event?.reminder === 15 ? 'selected' : ''}>15 minutes before</option>
                            <option value="30" ${event?.reminder === 30 ? 'selected' : ''}>30 minutes before</option>
                            <option value="60" ${event?.reminder === 60 ? 'selected' : ''}>1 hour before</option>
                            <option value="1440" ${event?.reminder === 1440 ? 'selected' : ''}>1 day before</option>
                        </select>
                    </div>
                    
                    <div class="form-group color-quick-pick">
                        <label><i class="fas fa-palette"></i> Event Color</label>
                        <div class="color-dots" id="schedule-color-dots">
                            <button type="button" class="color-dot ${(event?.color || '#6366f1') === '#6366f1' ? 'active' : ''}" data-color="#6366f1" style="background:#6366f1"></button>
                            <button type="button" class="color-dot ${event?.color === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background:#10b981"></button>
                            <button type="button" class="color-dot ${event?.color === '#f59e0b' ? 'active' : ''}" data-color="#f59e0b" style="background:#f59e0b"></button>
                            <button type="button" class="color-dot ${event?.color === '#ef4444' ? 'active' : ''}" data-color="#ef4444" style="background:#ef4444"></button>
                            <button type="button" class="color-dot ${event?.color === '#8b5cf6' ? 'active' : ''}" data-color="#8b5cf6" style="background:#8b5cf6"></button>
                            <button type="button" class="color-dot ${event?.color === '#06b6d4' ? 'active' : ''}" data-color="#06b6d4" style="background:#06b6d4"></button>
                            <button type="button" class="color-dot ${event?.color === '#ec4899' ? 'active' : ''}" data-color="#ec4899" style="background:#ec4899"></button>
                        </div>
                    </div>
                    
                    <div class="form-group countdown-toggle-row">
                        <label class="toggle-label">
                            <i class="fas fa-hourglass-half"></i> Add as Countdown
                        </label>
                        <label class="switch-mini">
                            <input type="checkbox" id="event-add-countdown" ${event && ScheduleState.pinnedCountdowns?.includes(event.id) ? 'checked' : ''}>
                            <span class="slider-mini"></span>
                        </label>
                    </div>
                </div>
                
                <div class="modal-footer">
                    ${isEditing ? `
                        <button type="button" class="btn-danger" data-action="delete-event" data-event-id="${event.id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    ` : ''}
                    <button type="button" class="btn-secondary" data-action="close-modal">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <i class="fas fa-save"></i> ${isEditing ? 'Update' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');

    // Setup event listeners (CSP compliant)
    modal.querySelectorAll('[data-action="close-modal"]').forEach(el => {
        el.addEventListener('click', closeScheduleEventModal);
    });

    modal.querySelector('[data-action="delete-event"]')?.addEventListener('click', (e) => {
        const eventId = e.currentTarget.dataset.eventId;
        deleteScheduleEvent(eventId);
    });

    document.getElementById('event-form')?.addEventListener('submit', saveScheduleEvent);

    // Setup recurring toggle
    document.getElementById('event-recurring')?.addEventListener('change', (e) => {
        document.getElementById('recurring-options')?.classList.toggle('hidden', !e.target.checked);
    });

    // Setup color dot click handlers
    document.querySelectorAll('#schedule-color-dots .color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('#schedule-color-dots .color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        });
    });

    // Focus title
    document.getElementById('event-title')?.focus();
}

function createEventModal() {
    const modal = document.createElement('div');
    modal.id = 'event-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeScheduleEventModal() {
    const modal = document.getElementById('event-modal');
    if (modal) modal.classList.remove('active');
    ScheduleState.editingEvent = null;
}

async function saveScheduleEvent(e) {
    e.preventDefault();

    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    // Fix: IDs mismatch with openScheduleEventModal
    const startTime = document.getElementById('event-start')?.value;
    const endTime = document.getElementById('event-end')?.value;
    const type = document.getElementById('event-type').value;
    const location = document.getElementById('event-location').value.trim();
    const description = document.getElementById('event-description')?.value?.trim() || '';
    const recurring = document.getElementById('event-recurring')?.checked || false;
    const repeatType = document.getElementById('event-repeat')?.value; // Fix: was event-recurrence
    const repeatUntil = document.getElementById('event-repeat-until')?.value;
    const reminder = parseInt(document.getElementById('event-reminder')?.value) || null;

    // Get selected color from color dots
    const selectedColor = document.querySelector('#schedule-color-dots .color-dot.active')?.dataset.color || getEventColors(type).border;

    if (!title || !date || !startTime || !endTime) {
        showToast('error', 'Validation Error', 'Please fill in all required fields.');
        return;
    }

    // Validate times
    if (startTime >= endTime) {
        showToast('error', 'Invalid Time', 'End time must be after start time.');
        return;
    }

    // Check for conflicts
    const hasConflict = checkTimeConflict(date, startTime, endTime, ScheduleState.editingEvent?.id);
    if (hasConflict) {
        const ok = await confirmDialog('This event overlaps with another event. Continue anyway?', {
            title: 'Schedule Conflict',
            confirmText: 'Continue',
            cancelText: 'Cancel'
        });
        if (!ok) return;
    }

    const eventData = {
        id: ScheduleState.editingEvent?.id,
        title,
        date,
        startTime,
        endTime,
        type,
        location,
        description,
        recurring,
        repeatType: recurring ? repeatType : null,
        repeatUntil: recurring ? repeatUntil : null,
        reminder,
        color: selectedColor
    };

    const event = new ProductivityData.ScheduleEvent(eventData);

    try {
        await ProductivityData.DataStore.saveScheduleEvent(event);

        // Update local state
        if (ScheduleState.editingEvent) {
            const index = ScheduleState.events.findIndex(e => e.id === event.id);
            if (index >= 0) ScheduleState.events[index] = event;
        } else {
            ScheduleState.events.push(event);
        }

        // Check if user wants to add this event as a countdown
        const addAsCountdown = document.getElementById('event-add-countdown')?.checked;
        const isPinned = ScheduleState.pinnedCountdowns.includes(event.id);

        if (addAsCountdown && !isPinned) {
            // Add to countdowns
            ScheduleState.pinnedCountdowns.push(event.id);
            await savePinnedCountdowns();
            renderCountdownsSection();
        } else if (!addAsCountdown && isPinned) {
            // Remove from countdowns
            ScheduleState.pinnedCountdowns = ScheduleState.pinnedCountdowns.filter(id => id !== event.id);
            await savePinnedCountdowns();
            renderCountdownsSection();
        }

        // Save category if selected
        const categoryId = document.getElementById('event-category-select')?.value;
        if (categoryId) {
            event.categoryId = categoryId;
            await ProductivityData.DataStore.saveScheduleEvent(event);
        }

        closeScheduleEventModal();
        await renderCurrentView();
        renderTodayAgenda();
        renderUpcomingEvents();

        showToast('success', ScheduleState.editingEvent ? 'Event Updated' : 'Event Created', title);

        // Create recurring events if needed
        if (recurring && repeatUntil) {
            await createRecurringEvents(event);
        }

    } catch (error) {
        console.error('Failed to save event:', error);
        showToast('error', 'Save Failed', 'Could not save the event.');
    }
}

async function deleteScheduleEvent(eventId) {
    const ok = await confirmDialog('Delete this event?', {
        title: 'Delete Event',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        // Delete from both school and personal storage to be safe
        await ProductivityData.DataStore.deleteScheduleEvent(eventId, 'school');
        await ProductivityData.DataStore.deleteScheduleEvent(eventId, 'personal');
        ScheduleState.events = ScheduleState.events.filter(e => e.id !== eventId);

        closeScheduleEventModal();
        closeEventDetails();
        await renderCurrentView();
        renderTodayAgenda();
        renderUpcomingEvents();

        showToast('info', 'Event Deleted', 'The event has been removed.');
    } catch (error) {
        console.error('Failed to delete event:', error);
        showToast('error', 'Delete Failed', 'Could not delete the event.');
    }
}

function viewEvent(eventId) {
    const event = ScheduleState.events.find(e => e.id === eventId);
    if (!event) return;

    // Show task/event details directly on schedule page (don't navigate away)

    const modal = document.getElementById('event-details-modal') || createEventDetailsModal();
    const colors = getEventDisplayColors(event);

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-event-details"></div>
        <div class="modal-content event-details">
            <div class="event-details-header" style="background: ${colors.bg}; border-bottom: 3px solid ${colors.border}">
                <span class="event-type-badge" style="background: ${colors.border}">${colors.label}</span>
                <h3>${escapeHtml(event.title)}</h3>
                <button class="btn-icon" data-action="close-event-details">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="event-details-body">
                <div class="event-detail-row">
                    <i class="fas fa-calendar"></i>
                    <span>${new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div class="event-detail-row">
                    <i class="fas fa-clock"></i>
                    <span>${event.startTime} - ${event.endTime}</span>
                </div>
                ${event.location ? `
                    <div class="event-detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(event.location)}</span>
                    </div>
                ` : ''}
                ${event.description ? `
                    <div class="event-detail-row description">
                        <i class="fas fa-align-left"></i>
                        <span>${escapeHtml(event.description)}</span>
                    </div>
                ` : ''}
                ${event.recurring ? `
                    <div class="event-detail-row">
                        <i class="fas fa-redo"></i>
                        <span>Repeats ${event.repeatType}${event.repeatUntil ? ` until ${formatDate(event.repeatUntil)}` : ''}</span>
                    </div>
                ` : ''}
                ${event.reminder ? `
                    <div class="event-detail-row">
                        <i class="fas fa-bell"></i>
                        <span>Reminder ${event.reminder >= 60 ? `${event.reminder / 60} hour(s)` : `${event.reminder} minutes`} before</span>
                    </div>
                ` : ''}
                ${(() => {
            const countdown = calculateCountdown(event.date);
            if (!countdown.isPast) {
                return `
                            <div class="event-detail-row countdown-preview">
                                <i class="fas fa-hourglass-half"></i>
                                <span class="countdown-badge ${countdown.days <= 3 ? 'urgent' : ''}">${countdown.text}</span>
                            </div>
                        `;
            }
            return '';
        })()}
            </div>
            <div class="event-details-footer">
                <button class="btn-danger" data-action="delete-event" data-event-id="${event.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <div class="footer-right">
                    <button class="btn-outline pin-countdown-btn ${ScheduleState.pinnedCountdowns.includes(event.id) ? 'pinned' : ''}" 
                            data-action="toggle-countdown" data-event-id="${event.id}" 
                            title="${ScheduleState.pinnedCountdowns.includes(event.id) ? 'Remove from countdowns' : 'Pin to countdown'}">
                        <i class="fas fa-${ScheduleState.pinnedCountdowns.includes(event.id) ? 'check' : 'thumbtack'}"></i>
                    </button>
                    <button class="btn-secondary" data-action="close-event-details">Close</button>
                    <button class="btn-primary" data-action="edit-event" data-event-id="${event.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
    setupEventDetailsListeners(modal, event);
}

// Navigate to tasks page and show task details
async function navigateToTaskFromCalendar(taskId) {
    // Navigate to tasks page using app's navigation
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('tasks');
    } else {
        // Fallback: click the nav link
        const tasksNav = document.querySelector('[data-page="tasks"]');
        if (tasksNav) tasksNav.click();
    }

    // Wait a bit for the page to load, then trigger task view
    setTimeout(() => {
        // Try to open the task detail modal
        if (typeof window.viewTask === 'function') {
            window.viewTask(taskId);
        } else {
            // Highlight the task in the list
            const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskCard) {
                taskCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                taskCard.classList.add('highlight-pulse');
                setTimeout(() => taskCard.classList.remove('highlight-pulse'), 2000);
            }
        }
    }, 150);
}

function setupEventDetailsListeners(modal, event) {
    modal.querySelectorAll('[data-action="close-event-details"]').forEach(el => {
        el.addEventListener('click', closeEventDetails);
    });

    modal.querySelector('[data-action="edit-event"]')?.addEventListener('click', async () => {
        if (event?.taskId && typeof window.openTaskModal === 'function') {
            const tasks = await ProductivityData.DataStore.getTasks();
            const task = tasks.find(t => t.id === event.taskId);
            if (task) {
                closeEventDetails();
                window.openTaskModal(task, task.status || 'not-started', {});
                return;
            }
        }

        showToast('info', 'Events Disabled', 'This app is tasks-only now.');
    });

    modal.querySelector('[data-action="delete-event"]')?.addEventListener('click', async () => {
        if (event?.taskId) {
            try {
                await ProductivityData.DataStore.deleteTask(event.taskId);
                closeEventDetails();
                await loadTasksAsEvents();
                await renderCurrentView();
                renderTodayAgenda();
                renderUpcomingEvents();
                showToast('info', 'Task Deleted', 'The task has been removed.');
            } catch (err) {
                console.error('Failed to delete task from schedule:', err);
                showToast('error', 'Delete Failed', 'Could not delete the task.');
            }
            return;
        }

        showToast('info', 'Events Disabled', 'Calendar events cannot be deleted.');
    });

    modal.querySelector('[data-action="toggle-countdown"]')?.addEventListener('click', async () => {
        await togglePinnedCountdown(event.id);
        closeEventDetails();
        viewEvent(event.id);
    });
}

function createEventDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'event-details-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeEventDetails() {
    const modal = document.getElementById('event-details-modal');
    if (modal) modal.classList.remove('active');
}

// ============================================================================
// QUICK ADD EVENT
// ============================================================================
function quickAddEvent(input) {
    if (!input.trim()) return;

    // Parse natural language input
    // Examples: "Meeting tomorrow at 2pm", "Class Mon 9am-11am"
    const today = new Date();
    let date = today.toISOString().split('T')[0];
    let startTime = '09:00';
    let endTime = '10:00';
    let title = input;

    // Parse "tomorrow"
    if (input.toLowerCase().includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        date = tomorrow.toISOString().split('T')[0];
        title = title.replace(/tomorrow/i, '').trim();
    }

    // Parse time (e.g., "at 2pm", "2pm-4pm")
    const timeMatch = input.match(/(\d{1,2})(:\d{2})?\s*(am|pm)?(?:\s*-\s*(\d{1,2})(:\d{2})?\s*(am|pm)?)?/i);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const min = timeMatch[2] ? timeMatch[2].slice(1) : '00';
        const period = timeMatch[3]?.toLowerCase();

        if (period === 'pm' && hour < 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        startTime = `${hour.toString().padStart(2, '0')}:${min}`;

        if (timeMatch[4]) {
            let endHour = parseInt(timeMatch[4]);
            const endMin = timeMatch[5] ? timeMatch[5].slice(1) : '00';
            const endPeriod = timeMatch[6]?.toLowerCase();

            if (endPeriod === 'pm' && endHour < 12) endHour += 12;
            if (endPeriod === 'am' && endHour === 12) endHour = 0;

            endTime = `${endHour.toString().padStart(2, '0')}:${endMin}`;
        } else {
            endTime = addHour(startTime);
        }

        title = title.replace(timeMatch[0], '').trim();
    }

    // Remove "at" if present
    title = title.replace(/\s+at\s+$/i, '').replace(/^at\s+/i, '').trim();

    if (!title) title = 'New Task';

    // Tasks-only: quick add opens task modal with parsed date/time
    if (typeof window.openTaskModal === 'function') {
        const prefillData = { dueDate: date, dueTime: startTime };
        window.openTaskModal(null, 'not-started', prefillData);
    } else {
        showToast('error', 'Error', 'Could not open task modal');
    }
}

// ============================================================================
// DRAG AND DROP
// ============================================================================
function handleDragStart(e, eventId) {
    ScheduleState.draggedEvent = eventId;
    e.dataTransfer.setData('text/plain', eventId);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDrop(e, date) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const eventId = ScheduleState.draggedEvent;
    if (!eventId) return;

    const event = ScheduleState.events.find(ev => ev.id === eventId);
    if (event && event.date !== date) {
        event.date = date;
        ProductivityData.DataStore.saveScheduleEvent(event);
        renderCurrentView();
        showToast('success', 'Event Moved', `Moved to ${formatDate(date)}`);
    }

    ScheduleState.draggedEvent = null;
}

// ============================================================================
// RECURRING EVENTS
// ============================================================================
async function createRecurringEvents(baseEvent) {
    if (!baseEvent.recurring || !baseEvent.repeatUntil) return;

    const startDate = new Date(baseEvent.date);
    const endDate = new Date(baseEvent.repeatUntil);
    const increment = {
        daily: 1,
        weekly: 7,
        biweekly: 14,
        monthly: 0 // Handle separately
    }[baseEvent.repeatType] || 7;

    const events = [];
    let current = new Date(startDate);

    if (baseEvent.repeatType === 'monthly') {
        current.setMonth(current.getMonth() + 1);
        while (current <= endDate) {
            events.push({
                ...baseEvent,
                id: undefined,
                date: current.toISOString().split('T')[0],
                parentEventId: baseEvent.id
            });
            current.setMonth(current.getMonth() + 1);
        }
    } else {
        current.setDate(current.getDate() + increment);
        while (current <= endDate) {
            events.push({
                ...baseEvent,
                id: undefined,
                date: current.toISOString().split('T')[0],
                parentEventId: baseEvent.id
            });
            current.setDate(current.getDate() + increment);
        }
    }

    // Save all recurring instances
    for (const eventData of events) {
        const event = new ProductivityData.ScheduleEvent(eventData);
        await ProductivityData.DataStore.saveScheduleEvent(event);
        ScheduleState.events.push(event);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function getEventsForDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let allEvents = [];

    // 1. First, identify all existing instances to avoid duplicates
    // Map of "parentID_date" -> boolean
    const existingInstances = new Set();
    ScheduleState.events.forEach(e => {
        if (e.parentEventId) {
            existingInstances.add(`${e.parentEventId}_${e.date}`);
        }
    });

    // 2. Process all events
    ScheduleState.events.forEach(event => {
        // A. If it's a generated instance or simple event in range, keep it
        if (!event.recurring || event.parentEventId) {
            if (event.date >= startDate && event.date <= endDate) {
                allEvents.push(event);
            }
            return;
        }

        // B. If it's a recurring definition, populate instances
        if (event.recurring && event.repeatType) {
            // First, include the base event if in range
            if (event.date >= startDate && event.date <= endDate) {
                // Only if not already represented by an instance (unlikely for base)
                allEvents.push(event);
            }

            // Calculate instances in range
            const evtStart = new Date(event.date);
            const repeatUntil = event.repeatUntil ? new Date(event.repeatUntil) : new Date(end.getFullYear() + 1, 0, 1);

            // Iterate through the requested view range
            let current = new Date(start);
            while (current <= end) {
                // Check bounds
                if (current > repeatUntil) break;
                if (current < evtStart) {
                    current.setDate(current.getDate() + 1);
                    continue;
                }

                // Check if this date already has a specific instance from DB
                const dateStr = current.toISOString().split('T')[0];
                if (existingInstances.has(`${event.id}_${dateStr}`)) {
                    current.setDate(current.getDate() + 1);
                    continue;
                }

                // Don't duplicate the base event date (already added above)
                if (dateStr === event.date) {
                    current.setDate(current.getDate() + 1);
                    continue;
                }

                // Check recurrence rule
                let recurs = false;
                if (event.repeatType === 'daily') recurs = true;
                else if (event.repeatType === 'weekly') {
                    if (current.getDay() === evtStart.getDay()) recurs = true;
                }
                else if (event.repeatType === 'biweekly') {
                    const diffTime = Math.abs(current - evtStart);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    // Tolerance for DST etc not needed for simple days math usually, but ceil is safe
                    // Actually simpler: 
                    const weekDiff = Math.floor(diffDays / 7);
                    if (current.getDay() === evtStart.getDay() && weekDiff % 2 === 0) recurs = true;
                }
                else if (event.repeatType === 'monthly') {
                    if (current.getDate() === evtStart.getDate()) recurs = true;
                }

                if (recurs) {
                    // Create dynamic instance
                    const instance = { ...event };
                    // If event is a class instance, copy properties
                    if (typeof event.toJSON === 'function') Object.assign(instance, event.toJSON());

                    instance.id = `${event.id}_${dateStr}_gen`; // Generated ID
                    instance.date = dateStr;
                    instance.recurring = false;
                    instance.parentEventId = event.id;
                    instance.isGenerated = true;

                    allEvents.push(instance);
                }

                current.setDate(current.getDate() + 1);
            }
        }
    });

    // 3. Apply Filters
    let events = allEvents;

    // Filter by schedule type (school/personal/combined)
    const scheduleTypeFilter = ScheduleState.filters.scheduleType;
    if (scheduleTypeFilter && scheduleTypeFilter !== 'combined') {
        events = events.filter(e => e.scheduleType === scheduleTypeFilter || !e.scheduleType);
    }

    // Filter by event type if set (legacy single type filter)
    const typeFilter = ScheduleState.filters.type;
    if (typeFilter && typeFilter !== 'all') {
        events = events.filter(e => e.type === typeFilter);
    }

    // Filter by visible types (new multi-type visibility filter)
    const visibleTypes = ScheduleState.filters.visibleTypes;
    events = events.filter(e => {
        const eventType = e.type || 'other';
        return visibleTypes[eventType] !== false;
    });

    // Filter imported events based on master toggle
    const showImported = ScheduleState.filters.showImported;

    events = events.filter(e => {
        // If not imported, always show
        if (!e.isImported) return true;

        // If master toggle is off, hide all imported
        if (!showImported) return false;

        // If master toggle is on, check individual calendar visibility
        const calId = e.importedCalendarId;
        if (!calId) return true; // No calendar ID, show by default

        // Check individual calendar filter (default to true if not set)
        const calendarVisible = ScheduleState.filters.importedCalendars[calId];
        return calendarVisible !== false;
    });

    return events;
}

function checkTimeConflict(date, startTime, endTime, excludeId = null) {
    const dayEvents = ScheduleState.events.filter(e =>
        e.date === date && e.id !== excludeId
    );

    return dayEvents.some(event => {
        const eventStart = timeToMinutes(event.startTime);
        const eventEnd = timeToMinutes(event.endTime);
        const newStart = timeToMinutes(startTime);
        const newEnd = timeToMinutes(endTime);

        return (newStart < eventEnd && newEnd > eventStart);
    });
}

function formatHour(hour) {
    const h = hour % 12 || 12;
    const period = hour < 12 ? 'AM' : 'PM';
    return `${h} ${period}`;
}

function addHour(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const newH = (h + 1) % 24;
    return `${newH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ============================================================================
// IMPORT SCHEDULE FUNCTIONALITY
// ============================================================================
function openImportScheduleModal() {
    try {
        // Remove any existing modal
        const existingModal = document.getElementById('import-schedule-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Get saved schedule URL from settings
        chrome.storage.local.get(['scheduleUrl'], (result) => {
            const savedUrl = result.scheduleUrl || '';

            // Create a modal for import options
            const modal = document.createElement('div');
            modal.id = 'import-schedule-modal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" data-action="close-import"></div>
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3><i class="fas fa-file-import"></i> Import Schedule</h3>
                        <button class="btn-icon" data-action="close-import">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="import-settings">
                            <div class="form-group">
                                <label for="import-calendar-name">Calendar Name *</label>
                                <input type="text" id="import-calendar-name" placeholder="e.g., School Schedule, Work Calendar" required>
                                <small class="form-hint">Give this imported calendar a name to identify it in the filter list</small>
                            </div>
                            <div class="form-group">
                                <label>Default Event Type for Imported Items</label>
                                <select id="import-event-type">
                                    <option value="class" selected>📚 Class/Lecture</option>
                                    <option value="study">📖 Study Session</option>
                                    <option value="meeting">👥 Meeting</option>
                                    <option value="deadline">⚠️ Deadline</option>
                                    <option value="personal">🏠 Personal</option>
                                    <option value="work">💼 Work</option>
                                    <option value="other">📌 Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Calendar Color</label>
                                <div class="color-picker-row" style="align-items: center; gap: 10px;">
                                    <div class="color-options" id="import-custom-color-options"></div>
                                    <input type="hidden" id="import-custom-color" value="#6366f1">
                                    <span class="color-hint">This color will be used for all events from this calendar</span>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="mark-as-imported" checked>
                                    Mark events as "Imported" (to distinguish from your created events)
                                </label>
                            </div>
                        </div>
                        
                        <hr style="border-color: var(--border-color); margin: var(--spacing-lg) 0;">
                        
                        <div class="import-options">
                        <div class="import-option" data-type="file">
                            <i class="fas fa-file-upload"></i>
                            <h4>Upload File</h4>
                            <p>Import from .ics, .csv, or .json file</p>
                            <input type="file" id="schedule-file-input" accept=".ics,.csv,.json" style="display:none">
                            <button class="btn-primary" data-action="select-file">
                                Choose File
                            </button>
                        </div>
                        <div class="import-option" data-type="url">
                            <i class="fas fa-link"></i>
                            <h4>Import from URL</h4>
                            <p>Paste your school calendar subscription link (ICS/iCal)</p>
                            <input type="url" id="schedule-url-input" placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics" value="${savedUrl}">
                            <button class="btn-primary" data-action="import-url">
                                Import from URL
                            </button>
                            ${savedUrl ? '<div class="url-saved-indicator" style="margin-top: 8px; color: #10b981; font-size: 12px;"><i class="fas fa-check-circle"></i> URL loaded from settings</div>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

            document.body.appendChild(modal);

            // Fixed palette color picker (no native system dialog)
            const importColorOptions = document.getElementById('import-custom-color-options');
            const importColorValue = document.getElementById('import-custom-color');
            if (importColorOptions && importColorValue && typeof createFixedColorPicker === 'function') {
                createFixedColorPicker(importColorOptions, importColorValue, {
                    defaultColor: '#6366f1'
                });
            }

            // Setup event listeners
            modal.querySelectorAll('[data-action="close-import"]').forEach(el => {
                el.addEventListener('click', () => modal.remove());
            });

            // File selection button
            const selectFileBtn = modal.querySelector('[data-action="select-file"]');
            const fileInput = document.getElementById('schedule-file-input');

            if (selectFileBtn && fileInput) {
                selectFileBtn.addEventListener('click', () => {
                    fileInput.click();
                });

                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        try {
                            const importSettings = getImportSettings();
                            await importFromFile(file, importSettings);
                            modal.remove();
                        } catch (err) {
                            showToast('error', 'Import Error', err.message || 'Failed to import file');
                        }
                    }
                });
            }

            // URL import button
            const importUrlBtn = modal.querySelector('[data-action="import-url"]');
            if (importUrlBtn) {
                importUrlBtn.addEventListener('click', async () => {
                    const urlInput = document.getElementById('schedule-url-input');
                    const url = urlInput?.value?.trim();
                    if (url) {
                        try {
                            // Save the URL to settings for future use
                            chrome.storage.local.set({ scheduleUrl: url });

                            const importSettings = getImportSettings();
                            if (importSettings) {
                                importSettings.sourceUrl = url; // Store URL for refresh capability
                            }
                            await importFromURL(url, importSettings);
                            modal.remove();
                        } catch (err) {
                            showToast('error', 'Import Error', err.message || 'Failed to import from URL');
                        }
                    } else {
                        showToast('warning', 'Missing URL', 'Please enter a calendar URL.');
                    }
                });
            }

            // Demo schedule loader
            const demoBtn = modal.querySelector('[data-action="load-demo-schedule"]');
            if (demoBtn) {
                demoBtn.addEventListener('click', async () => {
                    try {
                        const importSettings = getImportSettings();
                        await loadDemoSchedule(importSettings);
                        modal.remove();
                    } catch (err) {
                        showToast('error', 'Demo Error', err.message || 'Failed to load demo schedule');
                    }
                });
            }

        }); // End of chrome.storage.local.get callback

    } catch (error) {
        console.error('[Schedule] Error in openImportScheduleModal:', error);
        showToast('error', 'Error', 'Failed to open import modal. Please try again.');
    }
}

// Load a demo schedule for testing
async function loadDemoSchedule(settings = {}) {
    if (!settings) return;

    showToast('info', 'Loading Demo', 'Creating sample schedule events...');

    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);

    const calendarId = 'imported_demo_' + Date.now();
    const calendarName = settings.calendarName || 'Demo Schedule';
    const customColor = settings.customColor || '#6366f1';
    const eventType = settings.eventType || 'class';

    // Save calendar metadata
    ScheduleState.importedCalendarsMeta[calendarId] = {
        name: calendarName,
        color: customColor,
        eventType,
        importedAt: new Date().toISOString(),
        eventCount: 10
    };
    ScheduleState.filters.importedCalendars[calendarId] = true;
    await chrome.storage.local.set({ importedCalendarsMeta: ScheduleState.importedCalendarsMeta });

    // Sample weekly schedule
    const demoEvents = [
        { day: 0, title: 'Mathematics 101', startTime: '09:00', endTime: '10:30', location: 'Room A101', type: 'class' },
        { day: 0, title: 'Physics Lab', startTime: '11:00', endTime: '13:00', location: 'Science Building', type: 'class' },
        { day: 1, title: 'Computer Science', startTime: '10:00', endTime: '11:30', location: 'Tech Center', type: 'class' },
        { day: 1, title: 'English Literature', startTime: '14:00', endTime: '15:30', location: 'Humanities Hall', type: 'class' },
        { day: 2, title: 'Mathematics 101', startTime: '09:00', endTime: '10:30', location: 'Room A101', type: 'class' },
        { day: 2, title: 'Study Group', startTime: '16:00', endTime: '18:00', location: 'Library', type: 'study' },
        { day: 3, title: 'Computer Science', startTime: '10:00', endTime: '11:30', location: 'Tech Center', type: 'class' },
        { day: 3, title: 'Chemistry', startTime: '13:00', endTime: '14:30', location: 'Science Building', type: 'class' },
        { day: 4, title: 'Physics Lecture', startTime: '09:00', endTime: '10:30', location: 'Auditorium', type: 'class' },
        { day: 4, title: 'Project Meeting', startTime: '15:00', endTime: '16:00', location: 'Conference Room', type: 'meeting' }
    ];

    let imported = 0;
    for (const demo of demoEvents) {
        const eventDate = new Date(monday);
        eventDate.setDate(monday.getDate() + demo.day);

        const event = new ProductivityData.ScheduleEvent({
            title: demo.title,
            date: eventDate.toISOString().split('T')[0],
            startTime: demo.startTime,
            endTime: demo.endTime,
            location: demo.location,
            type: eventType,
            color: customColor,
            scheduleType: 'school',
            isImported: true,
            importedCalendarId: calendarId,
            importedAt: new Date().toISOString()
        });

        await ProductivityData.DataStore.saveScheduleEvent(event);
        ScheduleState.events.push(event);
        imported++;
    }

    renderCalendarFilters();
    renderImportedCalendars();
    renderImportedCalendarsFilter();
    renderCurrentView();
    showToast('success', 'Demo Loaded!', `Added ${imported} sample events to "${calendarName}".`);
}

function getImportSettings() {
    const calendarName = document.getElementById('import-calendar-name')?.value?.trim();
    const rawCustomColor = document.getElementById('import-custom-color')?.value || '#6366f1';
    const customColor = (typeof normalizePaletteColor === 'function')
        ? normalizePaletteColor(rawCustomColor, '#6366f1')
        : rawCustomColor;

    if (!calendarName) {
        showToast('warning', 'Name Required', 'Please enter a name for this calendar.');
        return null;
    }

    return {
        calendarName,
        eventType: document.getElementById('import-event-type')?.value || 'class',
        customColor,
        markAsImported: document.getElementById('mark-as-imported')?.checked ?? true,
        sourceUrl: null // Will be set by URL import
    };
}

async function importFromFile(file, settings = {}) {
    if (!settings) return; // Settings validation failed

    try {
        showToast('info', 'Processing...', `Reading ${file.name}...`);

        const text = await file.text();
        const extension = file.name.split('.').pop().toLowerCase();

        await processImportedData(text, extension, settings);
    } catch (error) {
        console.error('Import file error:', error);
        showToast('error', 'Import Failed', 'Could not read the schedule file.');
    }
}

async function importFromURL(url, settings = {}) {
    try {
        showToast('info', 'Importing...', 'Fetching schedule from URL...');

        // Validate URL format
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        let response;
        let fetchSuccess = false;

        // Try direct fetch first
        try {
            response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                fetchSuccess = true;
            }
        } catch (e) {
            // Direct fetch failed, will try proxies
        }

        // If direct fetch fails (CORS), try via proxy services
        if (!fetchSuccess) {
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
            ];

            for (const proxyUrl of proxies) {
                try {
                    response = await fetch(proxyUrl);
                    if (response.ok) {
                        fetchSuccess = true;
                        break;
                    }
                } catch (e) {
                    // Proxy failed, try next
                }
            }
        }

        if (!fetchSuccess || !response || !response.ok) {
            throw new Error('All fetch attempts failed. The calendar may require authentication or the URL may be incorrect.');
        }

        const text = await response.text();

        if (!text || text.length < 10) {
            throw new Error('Received empty or invalid response');
        }

        // Determine format from URL or content
        let format = 'ics';
        if (url.toLowerCase().endsWith('.json')) format = 'json';
        else if (url.toLowerCase().endsWith('.csv')) format = 'csv';
        else if (text.trim().startsWith('{') || text.trim().startsWith('[')) format = 'json';
        else if (text.includes('VCALENDAR') || text.includes('VEVENT')) format = 'ics';

        await processImportedData(text, format, settings);

    } catch (error) {
        console.error('Import URL error:', error);
        showToast('error', 'Import Failed', error.message || 'Could not fetch the schedule. Check the URL or try downloading the file manually.');
    }
}

async function processImportedData(text, format, settings = {}) {
    if (!settings) return; // Settings validation failed

    let events = [];

    if (format === 'ics') {
        events = parseICSFile(text);
    } else if (format === 'csv') {
        events = parseCSVSchedule(text);
    } else if (format === 'json') {
        try {
            const parsed = JSON.parse(text);
            events = Array.isArray(parsed) ? parsed : (parsed.events || []);
        } catch (e) {
            console.error('JSON parse error:', e);
            showToast('error', 'Invalid JSON', 'The file does not contain valid JSON data.');
            return;
        }
    } else {
        showToast('error', 'Unsupported Format', `The format "${format}" is not supported. Use .ics, .csv, or .json files.`);
        return;
    }

    if (events.length === 0) {
        showToast('warning', 'No Events Found', 'Could not parse any events from the source.');
        return;
    }

    // Generate unique calendar ID
    const calendarId = 'imported_' + Date.now();
    const calendarName = settings.calendarName || 'Imported Calendar';
    const customColor = settings.customColor || '#6366f1';
    const eventType = settings.eventType || 'class';
    const markAsImported = settings.markAsImported !== false;

    // Save calendar metadata (include sourceUrl for refresh capability)
    ScheduleState.importedCalendarsMeta[calendarId] = {
        name: calendarName,
        color: customColor,
        eventType,
        importedAt: new Date().toISOString(),
        lastRefreshed: new Date().toISOString(),
        eventCount: events.length,
        sourceUrl: settings.sourceUrl || null // Store URL for future refresh
    };
    ScheduleState.filters.importedCalendars[calendarId] = true;
    await chrome.storage.local.set({ importedCalendarsMeta: ScheduleState.importedCalendarsMeta });

    // Save imported events
    for (const eventData of events) {
        // Ensure time format is correct
        eventData.startTime = ensureTimeFormat(eventData.startTime);
        eventData.endTime = ensureTimeFormat(eventData.endTime);

        const event = new ProductivityData.ScheduleEvent({
            ...eventData,
            type: eventType,
            color: customColor,
            scheduleType: 'school',
            isImported: markAsImported,
            importedCalendarId: calendarId,
            importedAt: markAsImported ? new Date().toISOString() : null
        });
        await ProductivityData.DataStore.saveScheduleEvent(event);
        ScheduleState.events.push(event);
    }

    // Refresh the filter list and calendar view
    renderCalendarFilters();
    renderImportedCalendars();
    renderImportedCalendarsFilter();
    renderCurrentView();
    showToast('success', 'Import Successful', `Imported ${events.length} events to "${calendarName}".`);
}

// Parse ICS (iCalendar) file format
function parseICSFile(text) {
    const events = [];
    const lines = text.split(/\r?\n/);
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'BEGIN:VEVENT') {
            currentEvent = {};
        } else if (line === 'END:VEVENT' && currentEvent) {
            if (currentEvent.title) {
                events.push({
                    title: currentEvent.title,
                    date: currentEvent.date,
                    startTime: ensureTimeFormat(currentEvent.startTime),
                    endTime: ensureTimeFormat(currentEvent.endTime),
                    location: currentEvent.location || '',
                    description: currentEvent.description || '',
                    type: 'class',
                    isRecurring: !!currentEvent.rrule
                });
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('SUMMARY:')) {
                currentEvent.title = line.substring(8);
            } else if (line.startsWith('DTSTART')) {
                const dateStr = line.split(':')[1];
                if (dateStr) {
                    const parsed = parseICSDate(dateStr);
                    currentEvent.date = parsed.date;
                    currentEvent.startTime = parsed.time;
                }
            } else if (line.startsWith('DTEND')) {
                const dateStr = line.split(':')[1];
                if (dateStr) {
                    const parsed = parseICSDate(dateStr);
                    currentEvent.endTime = parsed.time;
                }
            } else if (line.startsWith('LOCATION:')) {
                currentEvent.location = line.substring(9);
            } else if (line.startsWith('DESCRIPTION:')) {
                currentEvent.description = line.substring(12);
            } else if (line.startsWith('RRULE:')) {
                currentEvent.rrule = line.substring(6);
            }
        }
    }

    return events;
}

function parseICSDate(dateStr) {
    // Handle formats like 20251201T090000, 20251201T090000Z, or TZID=...:20251201T090000
    const isUTC = dateStr.endsWith('Z');

    // Remove Z suffix if present for parsing
    const cleanStr = dateStr.replace('Z', '');

    const match = cleanStr.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[3], 10);
        const hours = match[4] ? parseInt(match[4], 10) : 0;
        const minutes = match[5] ? parseInt(match[5], 10) : 0;

        let date, time;

        if (isUTC && match[4]) {
            // Create UTC date and convert to local
            const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));

            // Extract local time components
            const localYear = utcDate.getFullYear();
            const localMonth = String(utcDate.getMonth() + 1).padStart(2, '0');
            const localDay = String(utcDate.getDate()).padStart(2, '0');
            const localHours = String(utcDate.getHours()).padStart(2, '0');
            const localMinutes = String(utcDate.getMinutes()).padStart(2, '0');

            date = `${localYear}-${localMonth}-${localDay}`;
            time = `${localHours}:${localMinutes}`;
        } else {
            // No timezone info, treat as local time
            date = `${match[1]}-${match[2]}-${match[3]}`;
            time = match[4] && match[5]
                ? `${match[4].padStart(2, '0')}:${match[5].padStart(2, '0')}`
                : null;
        }

        return { date, time };
    }
    return { date: null, time: null };
}

// Parse CSV schedule (simple format: title, date, startTime, endTime, location)
function parseCSVSchedule(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const events = [];

    // Skip header row if present
    const startIndex = lines[0].toLowerCase().includes('title') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 3) {
            events.push({
                title: parts[0],
                date: parts[1],
                startTime: formatTimeString(parts[2]) || '09:00',
                endTime: formatTimeString(parts[3]) || '10:00',
                location: parts[4] || '',
                type: 'class'
            });
        }
    }

    return events;
}

// Ensure time string is properly formatted as HH:MM
function formatTimeString(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return timeStr;
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

// Refresh calendar with updated tasks - call this after task create/update/delete
async function refreshCalendarTasks() {
    await loadTasksAsEvents();
    await renderCurrentView();
    renderTodayAgenda();
    renderUpcomingEvents();
    renderSidebarEvents();
}

window.loadSchedule = loadSchedule;
// Tasks-only: keep legacy names but route them to task flows
window.openEventModal = (date = null, time = null) => openScheduleCreatePicker(date, time);
window.quickAddEvent = quickAddEvent;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.navigatePrev = navigatePrev;
window.navigateNext = navigateNext;
window.goToToday = goToToday;
window.openImportScheduleModal = openImportScheduleModal;
window.refreshScheduleFilters = refreshScheduleFilters;
window.refreshCalendarTasks = refreshCalendarTasks;

// Fallback event delegation for import button
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {
        if (e.target && (e.target.id === 'import-schedule-btn' || e.target.closest('#import-schedule-btn'))) {
            e.preventDefault();
            e.stopPropagation();
            openImportScheduleModal();
        }

        // Handle focus button clicks on calendar tasks
        const focusBtn = e.target.closest('.btn-focus-task');
        if (focusBtn) {
            e.preventDefault();
            e.stopPropagation();
            const taskId = focusBtn.dataset.taskId;
            if (taskId && typeof window.startFocusOnTask === 'function') {
                window.startFocusOnTask(taskId);
            }
        }

        // Handle finish & review button clicks on calendar tasks
        const finishReviewBtn = e.target.closest('.btn-finish-review-task');
        if (finishReviewBtn) {
            e.preventDefault();
            e.stopPropagation();
            const taskId = finishReviewBtn.dataset.taskId;
            if (taskId && typeof window.finishAndSendToReview === 'function') {
                window.finishAndSendToReview(taskId);
            }
        }
    }, true);
});
