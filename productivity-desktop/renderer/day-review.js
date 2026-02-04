/* global ProductivityData, createFixedColorPicker, showToast, openModal, closeModal */

(function () {
    'use strict';

    const MINUTES_PER_DAY = 1440;

    const DayReview = {
        initialized: false,
        dateYMD: null,
        entries: [],
        clockFormat: '24',
        selection: {
            startMin: null,
            endMin: null
        },
        editingId: null
    };

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toLocalYMD(date) {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        return `${y}-${m}-${day}`;
    }

    function getYesterdayYMD() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return toLocalYMD(d);
    }

    function minutesToHHMM(min) {
        const m = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        return `${pad2(hh)}:${pad2(mm)}`;
    }

    function hour24To12(hour24) {
        const h = ((hour24 % 24) + 24) % 24;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = (h % 12) || 12;
        return { h12, ampm };
    }

    function minutesToDisplay(min) {
        if (DayReview.clockFormat === '12') {
            const m = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
            const hh24 = Math.floor(m / 60);
            const mm = m % 60;
            const { h12, ampm } = hour24To12(hh24);
            return `${h12}:${pad2(mm)} ${ampm}`;
        }
        return minutesToHHMM(min);
    }

    function durationMinutes(startMin, endMin) {
        if (startMin == null || endMin == null) return 0;
        if (endMin > startMin) return endMin - startMin;
        return (MINUTES_PER_DAY - startMin) + endMin;
    }

    function rangeToSegments(startMin, endMin) {
        if (startMin == null || endMin == null) return [];
        if (endMin > startMin) return [[startMin, endMin]];
        return [[startMin, MINUTES_PER_DAY], [0, endMin]];
    }

    function segmentsOverlap(a, b) {
        // [start, end) overlap
        return a[0] < b[1] && b[0] < a[1];
    }

    function rangesOverlap(startA, endA, startB, endB) {
        const segA = rangeToSegments(startA, endA);
        const segB = rangeToSegments(startB, endB);
        for (const a of segA) {
            for (const b of segB) {
                if (segmentsOverlap(a, b)) return true;
            }
        }
        return false;
    }

    function percent(min) {
        return (min / MINUTES_PER_DAY) * 100;
    }

    function notify(type, title, message) {
        if (typeof showToast === 'function') {
            showToast(type, title, message);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](`${title}: ${message}`);
        alert(`${title}\n\n${message}`);
    }

    function getEls() {
        return {
            dateInput: document.getElementById('dayreview-date'),
            yesterdayBtn: document.getElementById('dayreview-yesterday-btn'),
            formatSelect: document.getElementById('dayreview-format'),
            clock: document.getElementById('dayreview-clock'),
            selection: document.getElementById('dayreview-selection'),
            clearBtn: document.getElementById('dayreview-clear-selection-btn'),
            timeline: document.getElementById('dayreview-timeline'),
            entries: document.getElementById('dayreview-entries'),

            // Modal
            modal: document.getElementById('dayreview-block-modal'),
            modalTitle: document.getElementById('dayreview-block-modal-title'),
            modalStartHour: document.getElementById('dayreview-block-start-hour'),
            modalStartMinute: document.getElementById('dayreview-block-start-minute'),
            modalEndHour: document.getElementById('dayreview-block-end-hour'),
            modalEndMinute: document.getElementById('dayreview-block-end-minute'),
            modalRange: document.getElementById('dayreview-block-range'),
            modalLabel: document.getElementById('dayreview-block-label'),
            modalColorValue: document.getElementById('dayreview-block-color'),
            modalColorOptions: document.getElementById('dayreview-block-color-options'),
            modalSaveBtn: document.getElementById('dayreview-block-save')
        };
    }

    function clampInt(value, min, max, fallback) {
        const n = parseInt(String(value), 10);
        if (Number.isNaN(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function formatHourLabel(hour24) {
        if (DayReview.clockFormat === '12') {
            const { h12, ampm } = hour24To12(hour24);
            return `${h12} ${ampm}`;
        }
        return pad2(hour24);
    }

    function populateHourSelect(selectEl) {
        if (!selectEl) return;
        const opts = [];
        for (let h = 0; h < 24; h++) {
            const label = (DayReview.clockFormat === '12') ? formatHourLabel(h) : pad2(h);
            opts.push(`<option value="${h}">${label}</option>`);
        }
        selectEl.innerHTML = opts.join('');
    }

    function updateModalRangeText() {
        const els = getEls();
        if (!els.modalRange) return;
        const startMin = DayReview.selection.startMin;
        const endMin = DayReview.selection.endMin;
        if (startMin == null || endMin == null) {
            els.modalRange.textContent = '';
            return;
        }

        const dur = durationMinutes(startMin, endMin);
        const h = Math.floor(dur / 60);
        const m = dur % 60;
        els.modalRange.textContent = `${minutesToDisplay(startMin)} → ${minutesToDisplay(endMin)} • ${h}h${m ? ` ${m}m` : ''}`;
    }

    function syncSelectionFromModalMinutes() {
        const els = getEls();
        if (!els.modalStartHour || !els.modalEndHour) return;
        if (!els.modalStartMinute || !els.modalEndMinute) return;
        if (DayReview.selection.startMin == null || DayReview.selection.endMin == null) return;

        const startHour = clampInt(els.modalStartHour.value, 0, 23, 0);
        const endHour = clampInt(els.modalEndHour.value, 0, 23, 0);
        const startMinute = clampInt(els.modalStartMinute.value, 0, 59, 0);
        const endMinute = clampInt(els.modalEndMinute.value, 0, 59, 0);

        els.modalStartMinute.value = String(startMinute);
        els.modalEndMinute.value = String(endMinute);

        DayReview.selection.startMin = (startHour * 60) + startMinute;
        DayReview.selection.endMin = (endHour * 60) + endMinute;

        updateModalRangeText();
        renderClockSelection();
        renderTimeline();
    }

    function ensureModalColorPicker() {
        const els = getEls();
        if (!els.modalColorOptions || !els.modalColorValue) return;
        if (typeof createFixedColorPicker !== 'function') return;

        if (!els.modalColorOptions.__setFixedColor) {
            createFixedColorPicker(els.modalColorOptions, els.modalColorValue, { ariaLabel: 'Day review color' });
        }
    }

    function buildClock(clockEl) {
        if (!clockEl) return;
        clockEl.innerHTML = '';
        clockEl.dataset.layout = DayReview.clockFormat;

        const overlay = document.createElement('div');
        overlay.className = 'dayreview-clock-overlay';
        clockEl.appendChild(overlay);

        const rect = clockEl.getBoundingClientRect();
        const size = Math.min(rect.width || 340, rect.height || 340);
        const cx = size / 2;
        const cy = size / 2;
        // Ring sits inside with room for labels
        const outerR = (size / 2) - 50; // Leave 50px for labels outside
        const innerR = outerR - 50;

        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.classList.add('dayreview-clock-svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

        function polarToCartesian(centerX, centerY, radius, angleDeg) {
            const a = (angleDeg * Math.PI) / 180;
            return {
                x: centerX + (radius * Math.cos(a)),
                y: centerY + (radius * Math.sin(a))
            };
        }

        function describeArc(centerX, centerY, radius, startAngleDeg, endAngleDeg) {
            const start = polarToCartesian(centerX, centerY, radius, startAngleDeg);
            const end = polarToCartesian(centerX, centerY, radius, endAngleDeg);
            const delta = endAngleDeg - startAngleDeg;
            const largeArcFlag = delta > 180 ? '1' : '0';
            return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
        }

        function addRingBase(radius, thickness) {
            const c = document.createElementNS(NS, 'circle');
            c.classList.add('dayreview-ring-base');
            c.setAttribute('cx', String(cx));
            c.setAttribute('cy', String(cy));
            c.setAttribute('r', String(radius));
            c.setAttribute('fill', 'none');
            c.setAttribute('stroke-width', String(thickness));
            svg.appendChild(c);
        }

        function addSegment({ radius, thickness, startAngleDeg, endAngleDeg, minutes, extraClass }) {
            const path = document.createElementNS(NS, 'path');
            path.classList.add('dayreview-seg');
            if (extraClass) path.classList.add(extraClass);
            path.setAttribute('d', describeArc(cx, cy, radius, startAngleDeg, endAngleDeg));
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-width', String(thickness));
            path.setAttribute('stroke-linecap', 'butt');
            path.setAttribute('stroke-linejoin', 'miter');
            path.dataset.minutes = String(minutes);

            const title = document.createElementNS(NS, 'title');
            title.textContent = minutesToDisplay(minutes);
            path.appendChild(title);

            svg.appendChild(path);
        }

        function addDot({ radius, angleDeg, minutes, extraClass }) {
            const pos = polarToCartesian(cx, cy, radius, angleDeg);
            const dot = document.createElementNS(NS, 'circle');
            dot.classList.add('dayreview-dot');
            if (extraClass) dot.classList.add(extraClass);
            dot.setAttribute('cx', String(pos.x));
            dot.setAttribute('cy', String(pos.y));
            dot.setAttribute('r', '3.6');
            dot.dataset.minutes = String(minutes);

            const title = document.createElementNS(NS, 'title');
            title.textContent = minutesToDisplay(minutes);
            dot.appendChild(title);

            svg.appendChild(dot);
        }

        function addLabel({ radius, angleDeg, text, extraClass }) {
            const pos = polarToCartesian(cx, cy, radius, angleDeg);
            const label = document.createElementNS(NS, 'text');
            label.classList.add('dayreview-label');
            if (extraClass) label.classList.add(extraClass);
            label.setAttribute('x', String(pos.x));
            label.setAttribute('y', String(pos.y));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'central');
            const isDark = document.documentElement.dataset.theme === 'dark';
            label.style.fill = isDark ? '#e0e0ee' : '#333';
            label.textContent = String(text);
            svg.appendChild(label);
        }

        // 24h look: single connected donut ring with half-hour segments
        if (DayReview.clockFormat === '24') {
            const thickness = 24;
            const labelRadius = outerR + 20; // Outside the ring, in the reserved 50px gap

            addRingBase(outerR, thickness);

            // 48 segments (one per half hour) for smooth selection
            for (let seg = 0; seg < 48; seg++) {
                const start = (seg / 48) * 360 - 90;
                const end = ((seg + 1) / 48) * 360 - 90;
                const minutes = seg * 30;
                addSegment({ radius: outerR, thickness, startAngleDeg: start, endAngleDeg: end, minutes, extraClass: null });
            }

            // Hour labels outside the ring
            for (let hour24 = 0; hour24 < 24; hour24++) {
                const angle = (hour24 / 24) * 360 - 90;
                addLabel({
                    radius: labelRadius,
                    angleDeg: angle,
                    text: String(hour24),
                    extraClass: 'layout-24'
                });
            }

            // Half-hour dots ON the ring (between labels)
            for (let hour24 = 0; hour24 < 24; hour24++) {
                const angle = ((hour24 + 0.5) / 24) * 360 - 90;
                addDot({ radius: outerR, angleDeg: angle, minutes: (hour24 * 60) + 30, extraClass: null });
            }

            clockEl.appendChild(svg);
            return;
        }

        // 12h look: dual connected rings with AM (inner) and PM (outer)
        const amLabel = document.createElement('div');
        amLabel.className = 'dayreview-ring-label am';
        amLabel.textContent = 'AM';
        const pmLabel = document.createElement('div');
        pmLabel.className = 'dayreview-ring-label pm';
        pmLabel.textContent = 'PM';
        clockEl.appendChild(pmLabel);
        clockEl.appendChild(amLabel);

        const thicknessOuter = 22;
        const thicknessInner = 20;
        const amLabelRadius = innerR - thicknessInner - 12; // Labels inside AM ring (towards center)
        const pmLabelRadius = outerR + 18; // Labels outside PM ring, in the reserved 50px gap

        addRingBase(outerR, thicknessOuter);
        addRingBase(innerR, thicknessInner);

        // AM ring: 24 half-hour segments (0:00-11:30)
        for (let seg = 0; seg < 24; seg++) {
            const start = (seg / 24) * 360 - 90;
            const end = ((seg + 1) / 24) * 360 - 90;
            const minutes = seg * 30;
            addSegment({ radius: innerR, thickness: thicknessInner, startAngleDeg: start, endAngleDeg: end, minutes, extraClass: 'ring-am' });
        }

        // AM half-hour dots ON the ring
        for (let h12 = 1; h12 <= 12; h12++) {
            const hour24 = (h12 % 12);
            const angle = ((h12 - 0.5) / 12) * 360 - 90;
            addDot({ radius: innerR, angleDeg: angle, minutes: (hour24 * 60) + 30, extraClass: 'ring-am' });
        }

        // AM labels inside (towards center)
        for (let h12 = 1; h12 <= 12; h12++) {
            const angle = ((h12 % 12) / 12) * 360 - 90;
            addLabel({
                radius: amLabelRadius,
                angleDeg: angle,
                text: String(h12),
                extraClass: 'ring-am'
            });
        }

        // PM ring: 24 half-hour segments (12:00-23:30)
        for (let seg = 0; seg < 24; seg++) {
            const start = (seg / 24) * 360 - 90;
            const end = ((seg + 1) / 24) * 360 - 90;
            const minutes = 720 + (seg * 30);
            addSegment({ radius: outerR, thickness: thicknessOuter, startAngleDeg: start, endAngleDeg: end, minutes, extraClass: 'ring-pm' });
        }

        // PM half-hour dots ON the ring
        for (let h12 = 1; h12 <= 12; h12++) {
            const hour24 = 12 + (h12 % 12);
            const angle = ((h12 - 0.5) / 12) * 360 - 90;
            addDot({ radius: outerR, angleDeg: angle, minutes: (hour24 * 60) + 30, extraClass: 'ring-pm' });
        }

        // PM labels outside the ring
        for (let h12 = 1; h12 <= 12; h12++) {
            const angle = ((h12 % 12) / 12) * 360 - 90;
            addLabel({
                radius: pmLabelRadius,
                angleDeg: angle,
                text: String(h12),
                extraClass: 'ring-pm'
            });
        }

        clockEl.appendChild(svg);
    }

    function hourCellOverlapsRange(hour, startMin, endMin) {
        if (startMin == null || endMin == null) return false;
        const hourSeg = [hour * 60, (hour + 1) * 60];
        const segs = rangeToSegments(startMin, endMin);
        return segs.some(seg => segmentsOverlap(seg, hourSeg));
    }

    function getEntryForHour(hour24) {
        const hourSeg = [hour24 * 60, (hour24 + 1) * 60];
        for (const entry of DayReview.entries || []) {
            const segs = rangeToSegments(entry.startMin, entry.endMin);
            for (const seg of segs) {
                if (segmentsOverlap(seg, hourSeg)) return entry;
            }
        }
        return null;
    }

    function getEntryForMinute(minuteOfDay) {
        const seg = [minuteOfDay, minuteOfDay + 1];
        for (const entry of DayReview.entries || []) {
            const segs = rangeToSegments(entry.startMin, entry.endMin);
            for (const s of segs) {
                if (segmentsOverlap(s, seg)) return entry;
            }
        }
        return null;
    }

    function renderClockEntries() {
        const { clock } = getEls();
        if (!clock) return;

        clock.querySelectorAll('.dayreview-seg').forEach((btn) => {
            btn.classList.remove('has-entry');
            btn.style.removeProperty('--entry-color');

            const minutes = parseInt(btn.dataset.minutes || '0', 10);
            const entry = getEntryForMinute(minutes);
            if (entry && entry.color) {
                btn.classList.add('has-entry');
                btn.style.setProperty('--entry-color', entry.color);
            }
        });

        clock.querySelectorAll('.dayreview-dot').forEach((dot) => {
            dot.classList.remove('has-entry');
            dot.style.removeProperty('--entry-color');

            const m = parseInt(dot.dataset.minutes || '0', 10);
            const entry = getEntryForMinute(m);
            if (entry && entry.color) {
                dot.classList.add('has-entry');
                dot.style.setProperty('--entry-color', entry.color);
            }
        });
    }

    function renderSelectionText() {
        const { selection, editingId } = DayReview;
        const el = getEls().selection;
        if (!el) return;

        if (selection.startMin == null) {
            el.textContent = 'Pick a start hour.';
            return;
        }

        if (selection.endMin == null) {
            el.textContent = `Start: ${minutesToDisplay(selection.startMin)} (pick an end hour)`;
            return;
        }

        const dur = durationMinutes(selection.startMin, selection.endMin);
        const hours = Math.floor(dur / 60);
        const mins = dur % 60;
        const durLabel = `${hours}h${mins ? ` ${mins}m` : ''}`;
        el.textContent = `${editingId ? 'Editing' : 'Selected'}: ${minutesToDisplay(selection.startMin)} → ${minutesToDisplay(selection.endMin)} (${durLabel})`;
    }

    function renderClockSelection() {
        const { selection } = DayReview;
        const { clock } = getEls();
        if (!clock) return;

        const overlay = clock.querySelector('.dayreview-clock-overlay');
        if (overlay) {
            if (selection.startMin == null || selection.endMin == null) {
                overlay.style.backgroundImage = '';
            } else {
                const start = ((selection.startMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
                const end = ((selection.endMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
                const startDeg = (start / MINUTES_PER_DAY) * 360;
                const endDeg = (end / MINUTES_PER_DAY) * 360;
                const color = 'rgba(99, 102, 241, 0.35)';
                if (end > start) {
                    overlay.style.backgroundImage = `conic-gradient(from -90deg, transparent 0deg, transparent ${startDeg}deg, ${color} ${startDeg}deg, ${color} ${endDeg}deg, transparent ${endDeg}deg, transparent 360deg)`;
                } else {
                    overlay.style.backgroundImage = `conic-gradient(from -90deg, ${color} 0deg, ${color} ${endDeg}deg, transparent ${endDeg}deg, transparent ${startDeg}deg, ${color} ${startDeg}deg, ${color} 360deg)`;
                }
            }
        }

        clock.querySelectorAll('.dayreview-seg').forEach((btn) => {
            const m = parseInt(btn.dataset.minutes || '0', 10);
            const segEnd = m + 30;
            btn.classList.toggle('start', selection.startMin != null && m <= selection.startMin && selection.startMin < segEnd);
            btn.classList.toggle('end', selection.endMin != null && m <= selection.endMin && selection.endMin < segEnd);
            btn.classList.toggle('in-range', selection.startMin != null && selection.endMin != null && (() => {
                const segs = rangeToSegments(selection.startMin, selection.endMin);
                return segs.some(([a, b]) => segmentsOverlap([a, b], [m, segEnd]));
            })());
        });

        clock.querySelectorAll('.dayreview-dot').forEach((dot) => {
            const m = parseInt(dot.dataset.minutes || '0', 10);
            dot.classList.toggle('start', selection.startMin != null && m === selection.startMin);
            dot.classList.toggle('end', selection.endMin != null && m === selection.endMin);
            dot.classList.toggle('in-range', (() => {
                if (selection.startMin == null || selection.endMin == null) return false;
                const segs = rangeToSegments(selection.startMin, selection.endMin);
                return segs.some(([a, b]) => segmentsOverlap([a, b], [m, m + 1]));
            })());
        });

        renderClockEntries();

        renderSelectionText();
    }

    async function loadForDate(dateYMD) {
        const ymd = String(dateYMD || '').trim();
        if (!ymd) return;

        DayReview.dateYMD = ymd;
        DayReview.entries = await ProductivityData.DataStore.getDayReviewForDate(ymd);
        renderTimeline();
        renderEntries();
        renderClockSelection();
    }

    function renderTimeline() {
        const { timeline } = getEls();
        if (!timeline) return;

        timeline.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'dayreview-timeline-wrap';

        const labels = document.createElement('div');
        labels.className = 'dayreview-timeline-labels';
        labels.innerHTML = DayReview.clockFormat === '12'
            ? '<span>12a</span><span>4a</span><span>8a</span><span>12p</span><span>4p</span><span>8p</span><span>12a</span>'
            : '<span>00</span><span>04</span><span>08</span><span>12</span><span>16</span><span>20</span><span>24</span>';

        const bar = document.createElement('div');
        bar.className = 'dayreview-timeline-bar';

        const ticks = document.createElement('div');
        ticks.className = 'dayreview-timeline-ticks';
        for (let i = 0; i <= 24; i++) {
            const t = document.createElement('div');
            t.className = (i % 4 === 0) ? 'tick major' : 'tick';
            t.style.left = `${(i / 24) * 100}%`;
            ticks.appendChild(t);
        }

        bar.appendChild(ticks);

        for (const entry of DayReview.entries) {
            const segs = rangeToSegments(entry.startMin, entry.endMin);
            for (const [a, b] of segs) {
                const block = document.createElement('div');
                block.className = 'dayreview-timeline-block';
                block.style.left = `${percent(a)}%`;
                block.style.width = `${percent(b - a)}%`;
                block.style.background = entry.color || '#6366f1';
                block.title = `${entry.label || ''} (${minutesToDisplay(entry.startMin)} → ${minutesToDisplay(entry.endMin)})`;
                bar.appendChild(block);
            }
        }

        wrap.appendChild(labels);
        wrap.appendChild(bar);
        timeline.appendChild(wrap);
    }

    function renderEntries() {
        const { entries: entriesEl } = getEls();
        if (!entriesEl) return;

        const entries = Array.isArray(DayReview.entries) ? [...DayReview.entries] : [];
        entries.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));

        if (!entries.length) {
            entriesEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>No time blocks saved for this day yet.</p>
                </div>
            `;
            return;
        }

        entriesEl.innerHTML = '';

        for (const entry of entries) {
            const row = document.createElement('div');
            row.className = 'dayreview-entry';

            const main = document.createElement('div');
            main.className = 'dayreview-entry-main';

            const title = document.createElement('div');
            title.className = 'dayreview-entry-title';

            const dot = document.createElement('span');
            dot.className = 'dayreview-color-dot';
            dot.style.background = entry.color || '#6366f1';

            const label = document.createElement('span');
            label.textContent = entry.label || 'Untitled';

            title.appendChild(dot);
            title.appendChild(label);

            const meta = document.createElement('div');
            meta.className = 'dayreview-entry-meta';
            const dur = durationMinutes(entry.startMin, entry.endMin);
            const h = Math.floor(dur / 60);
            const m = dur % 60;
            meta.textContent = `${minutesToDisplay(entry.startMin)} → ${minutesToDisplay(entry.endMin)} • ${h}h${m ? ` ${m}m` : ''}`;

            main.appendChild(title);
            main.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'dayreview-entry-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-secondary';
            editBtn.innerHTML = '<i class="fas fa-pen"></i> Edit';
            editBtn.addEventListener('click', () => startEdit(entry));

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn-secondary';
            delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
            delBtn.addEventListener('click', () => deleteEntry(entry.id));

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);

            row.appendChild(main);
            row.appendChild(actions);
            entriesEl.appendChild(row);
        }
    }

    function startEdit(entry) {
        DayReview.editingId = entry.id;
        DayReview.selection.startMin = entry.startMin;
        DayReview.selection.endMin = entry.endMin;
        renderClockSelection();

        openBlockModal({
            title: 'Edit Time Block',
            startMin: entry.startMin,
            endMin: entry.endMin,
            label: entry.label,
            color: entry.color
        });
    }

    async function deleteEntry(entryId) {
        const id = String(entryId || '');
        if (!id) return;

        const remaining = (DayReview.entries || []).filter(e => String(e.id) !== id);
        await ProductivityData.DataStore.saveDayReviewForDate(DayReview.dateYMD, remaining);
        DayReview.entries = remaining;

        if (DayReview.editingId && String(DayReview.editingId) === id) {
            DayReview.editingId = null;
        }

        renderTimeline();
        renderEntries();
        renderClockSelection();
    }

    function clearSelection() {
        DayReview.selection.startMin = null;
        DayReview.selection.endMin = null;
        DayReview.editingId = null;
        renderClockSelection();
    }

    function openBlockModal({ title, startMin, endMin, label, color }) {
        const els = getEls();
        if (!els.modal) return;

        if (els.modalTitle) {
            els.modalTitle.textContent = String(title || 'Add Time Block');
        }
        const startHour = Math.floor((((startMin ?? 0) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY / 60);
        const endHour = Math.floor((((endMin ?? 0) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY / 60);
        const startMinute = ((startMin ?? 0) % 60 + 60) % 60;
        const endMinute = ((endMin ?? 0) % 60 + 60) % 60;

        populateHourSelect(els.modalStartHour);
        populateHourSelect(els.modalEndHour);
        if (els.modalStartHour) els.modalStartHour.value = String(startHour);
        if (els.modalEndHour) els.modalEndHour.value = String(endHour);
        if (els.modalStartMinute) els.modalStartMinute.value = String(startMinute);
        if (els.modalEndMinute) els.modalEndMinute.value = String(endMinute);

        updateModalRangeText();

        ensureModalColorPicker();

        if (els.modalLabel) {
            els.modalLabel.value = String(label || '').trim();
        }
        if (els.modalColorValue) {
            els.modalColorValue.value = String(color || els.modalColorValue.value || '#6366f1');
            if (els.modalColorOptions && els.modalColorOptions.__setFixedColor) {
                els.modalColorOptions.__setFixedColor(els.modalColorValue.value);
            }
        }

        if (typeof openModal === 'function') openModal('dayreview-block-modal');
        else els.modal.classList.add('active');

        setTimeout(() => els.modalLabel?.focus(), 0);
    }

    async function saveFromModal() {
        const els = getEls();
        const dateYMD = String(els.dateInput?.value || DayReview.dateYMD || '').trim();
        if (!dateYMD) {
            notify('error', 'Missing date', 'Please pick a date.');
            return;
        }

        // Apply minute edits from modal before validating/saving
        syncSelectionFromModalMinutes();

        const startMin = DayReview.selection.startMin;
        const endMin = DayReview.selection.endMin;
        if (startMin == null || endMin == null) {
            notify('error', 'Missing selection', 'Select a start and end time on the clock.');
            return;
        }

        const label = String(els.modalLabel?.value || '').trim();
        if (!label) {
            notify('error', 'Missing label', 'Please write what you did during this time (e.g., Sleeping, Working).');
            return;
        }

        const dur = durationMinutes(startMin, endMin);
        if (dur <= 0 || dur >= MINUTES_PER_DAY) {
            notify('error', 'Invalid range', 'Please select a non-zero time range.');
            return;
        }

        const color = String(els.modalColorValue?.value || '#6366f1');
        const existing = await ProductivityData.DataStore.getDayReviewForDate(dateYMD);
        const editingId = DayReview.editingId ? String(DayReview.editingId) : null;

        for (const e of existing) {
            if (editingId && String(e.id) === editingId) continue;
            if (rangesOverlap(startMin, endMin, e.startMin, e.endMin)) {
                notify('error', 'Overlapping time block', 'This time range overlaps an existing block. Edit the existing one or choose a different time.');
                return;
            }
        }

        const entry = {
            id: editingId || ProductivityData.generateUUID(),
            startMin,
            endMin,
            label,
            color,
            updatedAt: new Date().toISOString(),
            createdAt: editingId ? undefined : new Date().toISOString()
        };

        const next = existing.filter(e => !editingId || String(e.id) !== editingId);
        next.push(entry);
        next.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));

        await ProductivityData.DataStore.saveDayReviewForDate(dateYMD, next);

        DayReview.dateYMD = dateYMD;
        DayReview.entries = next;
        DayReview.editingId = null;

        if (typeof closeModal === 'function') closeModal('dayreview-block-modal');
        else els.modal?.classList.remove('active');

        clearSelection();
        renderTimeline();
        renderEntries();
        renderClockSelection();

        notify('success', 'Saved', 'Time block saved.');
    }

    function bindEvents() {
        const els = getEls();

        els.formatSelect?.addEventListener('change', async () => {
            const next = String(els.formatSelect.value || '24');
            await applyClockFormat(next);
        });

        const dragState = {
            active: false,
            moved: false,
            pointerId: null,
            prevStart: null,
            prevEnd: null,
            anchorMin: null,
            startX: 0,
            startY: 0
        };

        function minFromHit(el) {
            if (!el) return null;
            if (el.classList.contains('dayreview-dot')) {
                return clampInt(el.dataset.minutes, 0, MINUTES_PER_DAY - 1, 0);
            }
            if (el.classList.contains('dayreview-seg')) {
                return clampInt(el.dataset.minutes, 0, MINUTES_PER_DAY - 1, 0);
            }
            return null;
        }

        function pointToMinute(clockEl, clientX, clientY) {
            const r = clockEl.getBoundingClientRect();
            const size = Math.min(r.width || 0, r.height || 0);
            if (!size) return null;

            const cx = r.left + (r.width / 2);
            const cy = r.top + (r.height / 2);
            const dx = clientX - cx;
            const dy = clientY - cy;
            const dist = Math.sqrt((dx * dx) + (dy * dy));

            // 0deg at top, clockwise
            const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;

            if (DayReview.clockFormat === '24') {
                const raw = (deg / 360) * MINUTES_PER_DAY;
                const snapped = (Math.round(raw / 30) * 30) % MINUTES_PER_DAY; // snap to 0/30
                return snapped;
            }

            // 12h: decide AM vs PM by radius (inner vs outer)
            const outerR = (size / 2) - 26;
            const innerR = outerR - 64;
            const mid = (outerR + innerR) / 2;
            const isInner = dist < mid;
            const hourOffset = isInner ? 0 : 12;

            const raw12 = (deg / 360) * 720; // 12h in minutes
            const snapped12 = (Math.round(raw12 / 30) * 30) % 720; // snap to 0/30
            const h = Math.floor(snapped12 / 60) % 12;
            const m = snapped12 % 60;
            return ((hourOffset + h) * 60) + m;
        }

        function openModalFromSelection() {
            if (DayReview.selection.startMin == null || DayReview.selection.endMin == null) return;
            openBlockModal({
                title: 'Add Time Block',
                startMin: DayReview.selection.startMin,
                endMin: DayReview.selection.endMin,
                label: '',
                color: '#6366f1'
            });
        }

        els.clock?.addEventListener('pointerdown', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            const hit = target.closest && target.closest('.dayreview-seg, .dayreview-dot');
            if (!(hit instanceof Element)) return;

            const anchor = minFromHit(hit);
            if (anchor == null) return;

            dragState.active = true;
            dragState.moved = false;
            dragState.pointerId = e.pointerId;
            dragState.prevStart = DayReview.selection.startMin;
            dragState.prevEnd = DayReview.selection.endMin;
            dragState.anchorMin = anchor;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;

            e.preventDefault();
            try { els.clock.setPointerCapture(e.pointerId); } catch { /* ignore */ }

            // If we're waiting for an end, keep start and set a provisional end.
            if (dragState.prevStart != null && dragState.prevEnd == null) {
                DayReview.selection.endMin = anchor;
            } else {
                DayReview.selection.startMin = anchor;
                DayReview.selection.endMin = null;
            }

            DayReview.editingId = null;
            renderClockSelection();
        });

        els.clock?.addEventListener('pointermove', (e) => {
            if (!dragState.active) return;
            if (dragState.pointerId != null && e.pointerId !== dragState.pointerId) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            const movedEnough = (dx * dx) + (dy * dy) >= (6 * 6);

            const endMin = pointToMinute(els.clock, e.clientX, e.clientY);
            if (endMin == null) return;

            if (movedEnough) dragState.moved = true;

            // While dragging, always show an end selection
            if (dragState.prevStart != null && dragState.prevEnd == null) {
                DayReview.selection.startMin = dragState.prevStart;
            } else if (dragState.anchorMin != null) {
                DayReview.selection.startMin = dragState.anchorMin;
            }
            DayReview.selection.endMin = endMin;

            renderClockSelection();
        });

        function endDrag(e) {
            if (!dragState.active) return;
            if (dragState.pointerId != null && e.pointerId !== dragState.pointerId) return;

            e.preventDefault();
            try { els.clock.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

            const moved = dragState.moved;
            const anchor = dragState.anchorMin;
            const prevStart = dragState.prevStart;
            const prevEnd = dragState.prevEnd;

            dragState.active = false;
            dragState.moved = false;
            dragState.pointerId = null;
            dragState.prevStart = null;
            dragState.prevEnd = null;
            dragState.anchorMin = null;

            if (!moved) {
                // Treat as a normal click.
                if (prevStart != null && prevEnd == null) {
                    DayReview.selection.startMin = prevStart;
                    DayReview.selection.endMin = anchor;
                    renderClockSelection();
                    openModalFromSelection();
                    return;
                }

                DayReview.selection.startMin = anchor;
                DayReview.selection.endMin = null;
                DayReview.editingId = null;
                renderClockSelection();
                return;
            }

            // Drag-to-select finished
            if (DayReview.selection.startMin != null && DayReview.selection.endMin != null) {
                openModalFromSelection();
            }
        }

        els.clock?.addEventListener('pointerup', endDrag);
        els.clock?.addEventListener('pointercancel', endDrag);

        els.clearBtn?.addEventListener('click', clearSelection);

        els.modalSaveBtn?.addEventListener('click', saveFromModal);
        els.modalLabel?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                saveFromModal();
            }
        });

        els.modalStartMinute?.addEventListener('input', syncSelectionFromModalMinutes);
        els.modalEndMinute?.addEventListener('input', syncSelectionFromModalMinutes);
        els.modalStartHour?.addEventListener('change', syncSelectionFromModalMinutes);
        els.modalEndHour?.addEventListener('change', syncSelectionFromModalMinutes);

        els.dateInput?.addEventListener('change', async () => {
            await loadForDate(els.dateInput.value);
        });

        els.yesterdayBtn?.addEventListener('click', async () => {
            const y = getYesterdayYMD();
            if (els.dateInput) els.dateInput.value = y;
            await loadForDate(y);
        });
    }

    function initUI() {
        const els = getEls();
        if (!els.clock || !els.dateInput) return false;

        ensureModalColorPicker();

        populateHourSelect(els.modalStartHour);
        populateHourSelect(els.modalEndHour);

        bindEvents();

        return true;
    }

    async function applyClockFormat(nextFormat) {
        const els = getEls();
        const format = (nextFormat === '12') ? '12' : '24';

        DayReview.clockFormat = format;

        // Update modal hour labels while preserving current selection
        if (els.modalStartHour && els.modalEndHour) {
            const sh = els.modalStartHour.value;
            const eh = els.modalEndHour.value;
            populateHourSelect(els.modalStartHour);
            populateHourSelect(els.modalEndHour);
            if (sh != null) els.modalStartHour.value = sh;
            if (eh != null) els.modalEndHour.value = eh;
        }

        const page = document.getElementById('page-day-review');
        if (page) page.setAttribute('data-clock', format);
        if (els.formatSelect) els.formatSelect.value = format;

        // Rebuild visuals
        buildClock(els.clock);
        renderClockSelection();
        renderTimeline();
        renderEntries();

        // Persist preference
        try {
            if (ProductivityData?.DataStore?.set && ProductivityData?.STORAGE_KEYS?.DAY_REVIEW_CLOCK_FORMAT) {
                await ProductivityData.DataStore.set(ProductivityData.STORAGE_KEYS.DAY_REVIEW_CLOCK_FORMAT, format);
            }
        } catch (e) {
            console.warn('Failed to save Day Review clock format:', e);
        }
    }

    // Public entrypoint called by app.js navigation
    window.loadDayReviewPage = async function loadDayReviewPage() {
        try {
            const els = getEls();
            if (!els.dateInput) return;

            if (!DayReview.initialized) {
                const ok = initUI();
                if (!ok) return;
                DayReview.initialized = true;
            }

            // Restore clock format preference
            let preferred = '24';
            try {
                if (ProductivityData?.DataStore?.get && ProductivityData?.STORAGE_KEYS?.DAY_REVIEW_CLOCK_FORMAT) {
                    preferred = await ProductivityData.DataStore.get(ProductivityData.STORAGE_KEYS.DAY_REVIEW_CLOCK_FORMAT, '24');
                }
            } catch (e) {
                preferred = '24';
            }

            await applyClockFormat(String(preferred));

            const defaultDate = els.dateInput.value || getYesterdayYMD();
            if (!els.dateInput.value) els.dateInput.value = defaultDate;
            await loadForDate(defaultDate);

        } catch (err) {
            console.error('Day Review page failed to load:', err);
            notify('error', 'Day Review Error', 'Failed to load Day Review page.');
        }
    };
})();
