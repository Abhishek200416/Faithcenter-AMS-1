// public/js/attendance.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// ——————————————————————————————————————————————————————————————————
// DOM REFS
// ——————————————————————————————————————————————————————————————————
const FC = {
    search: document.getElementById('filterSearch'),
    status: document.getElementById('filterStatus'),
    log: document.getElementById('filterLog'),
    time: document.getElementById('filterTime'),
    category: document.getElementById('filterCategory'),
    role: document.getElementById('filterRole'),
};

const cards = {
    totalUsers: document.getElementById('cardTotalUsers'),
    punchIn: document.getElementById('cardPunchIn'),
    punchOut: document.getElementById('cardPunchOut'),
    totalPresent: document.getElementById('cardTotalPresent'),
    completed: document.getElementById('cardCompleted'),
    onTime: document.getElementById('cardOnTime'),
    absent: document.getElementById('cardRecentAbsent'),
    unreasonedAbsent: document.getElementById('cardRecentUnreasonedAbsent'),
    unreasonedLate: document.getElementById('cardRecentUnreasonedLate'),
};

const openCalBtn = document.getElementById('openCalendarBtn');
const closeCalBtn = document.getElementById('closeCalendarBtn');
const overlay = document.getElementById('calendarOverlay');
const calendarEl = document.getElementById('calendar');
const monthYearEl = document.getElementById('calendarMonthYear');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');

const tbody = document.querySelector('#history tbody');
const spinnerRow = document.createElement('tr');

// ——————————————————————————————————————————————————————————————————
// STATE
// ——————————————————————————————————————————————————————————————————
let userRole, userCategory, userId;
let currentYear, currentMonth;
let selectedDate;
let redSet = new Set();
let greenSet = new Set();
let blueSet = new Set();
let debounceTimer;

// two‑digit pad
const z2 = n => String(n).padStart(2, '0');
// simple debounce
const debounce = (fn, ms = 300) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
};

// —————————————————CALENDAR SETUP—————————————————————
function initCalendarNav() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    prevBtn.onclick = () => changeMonth(-1);
    nextBtn.onclick = () => changeMonth(1);
}

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentYear--;
        currentMonth = 11;
    }
    if (currentMonth > 11) {
        currentYear++;
        currentMonth = 0;
    }
    renderCalendar();
}

function renderCalendar() {
    monthYearEl.textContent = `${currentYear} / ${z2(currentMonth+1)}`;
    calendarEl.innerHTML = '';

    // day‑headers
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(dn => {
        const h = document.createElement('div');
        h.className = 'calendar-day header';
        h.textContent = dn;
        calendarEl.append(h);
    });

    // leading blanks
    const firstDow = new Date(currentYear, currentMonth, 1).getDay();
    for (let i = 0; i < firstDow; i++) {
        calendarEl.append(document.createElement('div'));
    }

    // actual days
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${currentYear}-${z2(currentMonth+1)}-${z2(d)}`;
        const cell = document.createElement('div');

        // pick the correct class
        let cls = 'absent';
        if (redSet.has(iso)) cls = 'present-admin';
        else if (blueSet.has(iso)) cls = 'present-dev';
        else if (greenSet.has(iso)) cls = 'present';

        if (iso === selectedDate) cls += ' selected-date-cell';

        cell.className = `calendar-day ${cls}`;
        cell.textContent = d;
        cell.onclick = () => {
            selectedDate = iso;
            overlay.classList.add('hidden');
            loadHistory();
            renderCalendar();
        };

        calendarEl.append(cell);
    }
}

openCalBtn.onclick = () => {
    overlay.classList.toggle('hidden');
    if (!overlay.classList.contains('hidden')) positionCalendarOverlay();
};
closeCalBtn.onclick = () => overlay.classList.add('hidden');
window.addEventListener('resize', () => {
    if (!overlay.classList.contains('hidden')) positionCalendarOverlay();
});

function positionCalendarOverlay() {
    const btn = openCalBtn.getBoundingClientRect(),
        ov = overlay;
    if (window.innerWidth > 600) {
        const wr = openCalBtn.closest('.filter-item').getBoundingClientRect(),
            ovW = ov.offsetWidth,
            left = Math.min(wr.width - ovW, Math.max(0, btn.left - wr.left));
        ov.style.cssText = `position:absolute;top:calc(100%+var(--spacing));left:${left}px;`;
        const arrow = btn.left + btn.width / 2 - (wr.left + left) - 8;
        ov.style.setProperty('--arrow-left', `${Math.min(ovW-16,Math.max(16,arrow))}px`);
    } else {
        const ovW = Math.min(360, window.innerWidth * 0.9),
            ovL = (window.innerWidth - ovW) / 2,
            ovT = window.innerHeight * 0.1;
        ov.style.cssText = `position:fixed;width:${ovW}px;left:${ovL}px;top:${ovT}px;`;
        const arrow = btn.left + btn.width / 2 - ovL - 8;
        ov.style.setProperty('--arrow-left', `${Math.min(ovW-16,Math.max(16,arrow))}px`);
    }
}

// —————————————————MAIN INIT———————————————————————————————————
async function init() {
    try {
        // get my profile
        const meRes = await apiFetch('/api/users/me');
        const me = meRes.user || meRes;
        userRole = me.role;
        userCategory = me.categoryType || null;
        userId = me.id;

        // hide filters by role
        const hide = (roles, ids) =>
            roles.includes(userRole) && ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        hide(['member', 'usher'], ['searchFilter', 'categoryFilter', 'roleFilter']);
        hide(['category-admin'], ['categoryFilter', 'roleFilter']);

        // hide Total Users for members/ushers
        if (['member', 'usher'].includes(userRole)) {
            cards.totalUsers.parentElement.style.display = 'none';
        }

        // calendar boot
        initCalendarNav();
        const now = new Date();
        selectedDate = `${now.getFullYear()}-${z2(now.getMonth()+1)}-${z2(now.getDate())}`;
        renderCalendar();

        // wire up filters
        FC.status.onchange = loadHistory;
        FC.log.onchange = loadHistory;
        FC.time.onchange = loadHistory;
        FC.category.onchange = loadHistory;
        FC.role.onchange = loadHistory;
        FC.search.oninput = () => debounce(loadHistory);

        // first load
        await loadHistory();

    } catch (err) {
        showToast('error', `Init error: ${err.message}`);
    }
}

// —————————————————LOAD, RENDER & METRICS—————————————————————
async function loadHistory() {
    try {
        // show spinner
        tbody.innerHTML = '';
        spinnerRow.innerHTML = `<td colspan="9" class="loading">Loading…</td>`;
        tbody.append(spinnerRow);

        // build query string
        const qs = new URLSearchParams({ date: selectedDate });
        if (FC.status.value !== 'all') qs.set('status', FC.status.value);
        if (FC.log.value !== 'all') qs.set('type', FC.log.value);
        if (FC.time.value !== 'all') qs.set('time', FC.time.value);

        if (userRole === 'category-admin') {
            qs.set('category', userCategory);
        } else if (FC.category.value !== 'all') {
            qs.set('category', FC.category.value);
        }

        if ((userRole === 'admin' || userRole === 'developer' || userRole === 'category-admin') && FC.search.value.trim()) {
            qs.set('search', FC.search.value.trim());
        }
        if ((userRole === 'admin' || userRole === 'developer') && FC.role.value !== 'all') {
            qs.set('role', FC.role.value);
        }

        // fetch history + calendar info
        const histRes = await apiFetch(`/api/attendance/history?${qs}`);
        let rows = histRes.records || [];

        // extract our three date‑sets
        redSet = new Set(histRes.redDates || []);
        greenSet = new Set(histRes.greenDates || []);
        blueSet = new Set(histRes.blueDates || []);

        // re‑draw calendar
        renderCalendar();

        // members/ushers only see their own rows
        if (['member', 'usher'].includes(userRole)) {
            rows = rows.filter(r => r.user.id === userId);
        }

        // optionally fetch total‑users
        let cntRes = null;
        if (['admin', 'developer', 'category-admin'].includes(userRole)) {
            const catQ = userRole === 'category-admin' ?
                `?category=${userCategory}` : '';
            cntRes = await apiFetch(`/api/users/count${catQ}`);
        }

        // compute metrics
        const punchIns = rows.filter(r => r.type === 'punch-in');
        const punchOuts = rows.filter(r => r.type === 'punch-out');

        if (cntRes) {
            let totalUsers = cntRes.count || 0;
            if (userRole === 'admin') totalUsers = Math.max(0, totalUsers - 2);
            else if (userRole === 'category-admin') totalUsers = Math.max(0, totalUsers - 1);
            cards.totalUsers.textContent = totalUsers;
        }

        cards.punchIn.textContent = punchIns.length;
        cards.punchOut.textContent = punchOuts.length;
        cards.totalPresent.textContent = punchIns.filter(r => r.status !== 'absent').length;

        // completed = both in & out
        const map = {};
        rows.forEach(r => {
            map[r.user.uid] = map[r.user.uid] || new Set();
            map[r.user.uid].add(r.type);
        });
        cards.completed.textContent =
            Object.values(map).filter(s => s.has('punch-in') && s.has('punch-out')).length;

        cards.onTime.textContent = rows.filter(r => r.status === 'on-time').length;
        cards.absent.textContent = rows.filter(r => r.status === 'absent').length;
        cards.unreasonedAbsent.textContent = rows.filter(r => r.status === 'absent' && !r.reason).length;
        cards.unreasonedLate.textContent = rows.filter(r => r.status === 'late' && !r.reason).length;

        // render table rows
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" class="no-data">No records found</td></tr>`;
            return;
        }
        rows.forEach(r => {
            const u = r.user || {};
            const displayRole = u.role === 'usher' ? 'Member' : capitalize(u.role);
            const logLabel = r.type === 'punch-in' ? 'In' : 'Out';
            const statusLabel = capitalize(r.status.replace(/-/g, ' '));
            const dt = new Date(r.timestamp);

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td class="col-uid">${u.uid    || ''}</td>
        <td class="col-name">${u.name  || ''}</td>
        <td class="col-cat">${u.category|| '—'}</td>
        <td class="col-role">${displayRole}</td>
        <td class="col-log">${logLabel}</td>
        <td class="col-date">${dt.toLocaleDateString()}</td>
        <td class="col-time">${dt.toLocaleTimeString()}</td>
        <td class="col-status">${statusLabel}</td>
        <td class="col-reason">${r.reason|| ''}</td>
      `;
            tbody.append(tr);
        });

        // hide first four cols for member/usher
        if (['member', 'usher'].includes(userRole)) {
            document.querySelectorAll(
                '#history .col-uid,#history .col-name,#history .col-cat,#history .col-role'
            ).forEach(el => el.style.display = 'none');
        }

    } catch (err) {
        tbody.innerHTML = '';
        showToast('error', `Load error: ${err.message}`);
    }
}

function capitalize(s = '') { return s.charAt(0).toUpperCase() + s.slice(1); }

init();