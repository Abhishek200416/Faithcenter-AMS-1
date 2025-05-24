// frontend/js/attendance.js
import { apiFetch } from './utils.js'
import { showToast } from './toast.js'

// ─── ELEMENT REFERENCES ───────────────────────────────────────
const FC = {
    search: document.getElementById('filterSearch'),
    status: document.getElementById('filterStatus'),
    log: document.getElementById('filterLog'),
    time: document.getElementById('filterTime'),
    category: document.getElementById('filterCategory'),
    role: document.getElementById('filterRole'),
}

const cards = {
    punchIn: document.getElementById('cardPunchIn'),
    punchOut: document.getElementById('cardPunchOut'),
    totalPresent: document.getElementById('cardTotalPresent'),
    completed: document.getElementById('cardCompleted'),
    onTime: document.getElementById('cardOnTime'),
    absent: document.getElementById('cardRecentAbsent'),
    unreasonedAbsent: document.getElementById('cardRecentUnreasonedAbsent'),
    unreasonedLate: document.getElementById('cardRecentUnreasonedLate'),
    totalUsers: document.getElementById('cardTotalUsers'),
}

const calendar = {
    openBtn: document.getElementById('openCalendarBtn'),
    closeBtn: document.getElementById('closeCalendarBtn'),
    overlay: document.getElementById('calendarOverlay'),
    grid: document.getElementById('calendar'),
    monthYear: document.getElementById('calendarMonthYear'),
    prev: document.getElementById('prevMonth'),
    next: document.getElementById('nextMonth'),
}

const historyTable = {
    body: document.querySelector('#history tbody'),
    spinner: document.createElement('tr'),
}

const manage = {
    openBtn: document.getElementById('manageBtn'),
    modal: document.getElementById('manageModal'),
    closeBtn: document.getElementById('closeManage'),
    cancelBtn: document.getElementById('cancelManage'),
    selectAll: document.getElementById('selectAllUsers'),
    clearAll: document.getElementById('clearAllUsers'),
    catFilter: document.getElementById('manageCategoryFilter'),
    nameFilter: document.getElementById('manageSearch'),
    list: document.getElementById('manageUserList'),
    count: document.getElementById('selectedCount'),
    dateInput: document.getElementById('manageDate'),
    timeIn: document.getElementById('manageTimeIn'),
    merIn: document.getElementById('manageMeridiemIn'),
    reasonIn: document.getElementById('manageReasonIn'),
    timeOut: document.getElementById('manageTimeOut'),
    merOut: document.getElementById('manageMeridiemOut'),
    reasonOut: document.getElementById('manageReasonOut'),
    status: document.getElementById('manageStatus'),
    saveBtn: document.getElementById('saveManage'),
}

const confirmBox = {
    modal: document.getElementById('confirmModal'),
    text: document.getElementById('confirmText'),
    yes: document.getElementById('confirmYes'),
    no: document.getElementById('confirmNo'),
}

// ─── STATE & HELPERS ─────────────────────────────────────────
let userRole, userCategory, userId, me, attendanceTypeCol
let currentYear, currentMonth, selectedDate
let allUsers = [], selectedSet = new Set(), allAttendanceDates = new Set()
let pendingDeleteId = null, isEditMode = false, editIds = { inId: null, outId: null }

const z2 = n => String(n).padStart(2, '0')
const toISO = d => {
    const dt = new Date(d)
    return `${dt.getFullYear()}-${z2(dt.getMonth() + 1)}-${z2(dt.getDate())}`
}
const debounce = (fn, ms = 300) => {
    clearTimeout(window._db)
    window._db = setTimeout(fn, ms)
}

// ─── FETCH CALENDAR DATES ────────────────────────────────────
async function fetchAllDates() {
    const res = await apiFetch('/api/attendance/history?all=true')
        ; (res.attendanceDates || []).forEach(d => allAttendanceDates.add(d))
}

// ─── CAL NAVIGATION ─────────────────────────────────────────
function initCalendarNav() {
    const now = new Date()
    currentYear = now.getFullYear()
    currentMonth = now.getMonth()
    calendar.prev.onclick = () => changeMonth(-1)
    calendar.next.onclick = () => changeMonth(1)
}
function changeMonth(delta) {
    currentMonth += delta
    if (currentMonth < 0) { currentYear--; currentMonth = 11 }
    else if (currentMonth > 11) { currentYear++; currentMonth = 0 }
    loadHistory()
}
function renderCalendar() {
    calendar.grid.innerHTML = ''
    calendar.monthYear.textContent = `${currentYear} / ${z2(currentMonth + 1)}`
    for (let L of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
        const h = document.createElement('div')
        h.className = 'calendar-day header'
        h.textContent = L
        calendar.grid.append(h)
    }
    const start = new Date(currentYear, currentMonth, 1).getDay()
    for (let i = 0; i < start; i++) calendar.grid.append(document.createElement('div'))
    const dim = new Date(currentYear, currentMonth + 1, 0).getDate()
    for (let d = 1; d <= dim; d++) {
        const iso = `${currentYear}-${z2(currentMonth + 1)}-${z2(d)}`
        const cell = document.createElement('div')
        cell.className = `calendar-day ${allAttendanceDates.has(iso) ? 'present-admin' : 'absent'}`
        if (iso === selectedDate) cell.classList.add('selected-date-cell')
        cell.textContent = d
        cell.onclick = () => {
            selectedDate = iso
            calendar.overlay.classList.add('hidden')
            loadHistory()
        }
        calendar.grid.append(cell)
    }
}

// ─── LOAD + FILTER + METRICS + RENDER ───────────────────────
async function loadHistory() {
    historyTable.body.innerHTML = '';
    historyTable.spinner.innerHTML = '<td colspan="10" class="loading">Loading…</td>';
    historyTable.body.append(historyTable.spinner);

    const qs = new URLSearchParams({
        month: currentMonth + 1,
        year: currentYear,
        date: selectedDate
    });

    if (FC.search.value.trim()) qs.set('search', FC.search.value.trim());
    if (FC.log.value !== 'all') qs.set('type', FC.log.value);
    if (FC.category.value !== 'all') qs.set('category', FC.category.value); // ← ADD THIS
    if (FC.role.value !== 'all') qs.set('role', FC.role.value); // ← ADD THIS

    const res = await apiFetch(`/api/attendance/history?${qs}`);
    let rows = res.records || []
    rows.forEach(r => allAttendanceDates.add(toISO(r.timestamp)))
    renderCalendar()

    // filter for selectedDate + filters
    rows = rows.filter(r => {
        if (toISO(r.timestamp) !== selectedDate) return false
        if (FC.status.value !== 'all' && r.type === 'punch-in') {
            if (FC.status.value === 'present' && r.status === 'absent') return false
            if (FC.status.value === 'absent' && r.status !== 'absent') return false
            if (FC.status.value === 'unreasoned-absent' &&
                !(r.status === 'absent' && !r.reason)) return false
        }
        if (FC.log.value !== 'all' && r.type !== FC.log.value) return false
        if (FC.time.value !== 'all' && r.type === 'punch-in') {
            if (FC.time.value === 'unreasoned-late') {
                if (!(r.status === 'late' && !r.reason)) return false
            } else if (r.status !== FC.time.value) return false
        }
        return true
    })

    // group by user+date (in UTC/ISO)
    let map = {};
    rows.forEach(r => {
        const dateKey = r.timestamp.slice(0, 10); // "YYYY-MM-DD"
        const key = `${r.user.id}_${dateKey}`;
        if (!map[key]) {
            map[key] = { user: r.user, date: dateKey, in: null, out: null };
        }
        if (r.type === 'punch-in') map[key].in = r;
        if (r.type === 'punch-out') map[key].out = r;
    });

    // flatten map to list
    const list = Object.values(map).map(e => {
        const status = e.in ? e.in.status : (e.out ? 'on-time' : '')
        const reason = e.in ? (e.in.reason || '') : ''
        return { ...e, status, reason }
    })


    // metrics
    const punchIns = rows.filter(r => r.type === 'punch-in')
    cards.punchIn.textContent = punchIns.length
    cards.punchOut.textContent = rows.filter(r => r.type === 'punch-out').length
    cards.totalPresent.textContent = punchIns.filter(r => r.status !== 'absent').length
    cards.completed.textContent = list.filter(e => e.in && e.out).length
    cards.onTime.textContent = punchIns.filter(r => r.status === 'on-time').length
    cards.absent.textContent = punchIns.filter(r => r.status === 'absent').length
    cards.unreasonedAbsent.textContent = punchIns.filter(r => r.status === 'absent' && !r.reason).length
    cards.unreasonedLate.textContent = punchIns.filter(r => r.status === 'late' && !r.reason).length

    // render table
    historyTable.body.innerHTML = ''
    if (!list.length) {
        historyTable.body.innerHTML = '<tr><td colspan="10" class="no-data">No records found</td></tr>'
        return
    }

    list.forEach(e => {
        const tr = document.createElement('tr')
        // Fix:
        const inT = e.in ? new Date(e.in.timestamp)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
        const outT = e.out ? new Date(e.out.timestamp)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

        const cells = [
            e.user.uid,
            e.user.name,
            e.user.category,
            e.user.role.charAt(0).toUpperCase() + e.user.role.slice(1),
            e.date,
            inT,
            outT,
            e.status.charAt(0).toUpperCase() + e.status.slice(1).replace(/-/g, ' '),
            e.reason
        ]

        // Replace with:
        // other columns
        cells.slice(0, 8).forEach(txt => {
            const td = document.createElement('td');
            td.textContent = txt;
            tr.append(td);
        });

        // Add Reason column
        const reasonTd = document.createElement('td');
        if (
            (e.status.toLowerCase() === 'absent' || e.status.toLowerCase() === 'late')
            && !e.reason && e.user.id === userId
        ) {
            // Inline input & button
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter reason';
            input.className = 'inline-reason-input';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn small';
            saveBtn.textContent = 'Save';

            saveBtn.onclick = async () => {
                const reason = input.value.trim();
                if (!reason) return showToast('error', 'Reason required');

                saveBtn.disabled = true;

                try {
                    await apiFetch(`/api/attendance/manage/${e.in.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            date: e.in.timestamp.split('T')[0],
                            time12: new Date(e.in.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
                            meridiem: (new Date(e.in.timestamp).getHours() < 12 ? 'AM' : 'PM'),
                            status: e.in.status, // backend ignores if user is not admin
                            reason
                        })
                    });
                    showToast('success', 'Reason saved');
                    await loadHistory();
                } catch (err) {
                    showToast('error', err.message || 'Failed to save reason');
                    console.error(err);
                    saveBtn.disabled = false;
                }
            };



            reasonTd.append(input, saveBtn);
        } else {
            reasonTd.textContent = e.reason || '—';
        }
        tr.append(reasonTd);


        if ((e.status === 'Absent' || e.status === 'Late') && !e.reason && e.user.id === userId) {
            // Show Add Reason
        }


        // actions
        const actTd = document.createElement('td')
        actTd.classList.add('actions-col')
        if (['developer', 'admin'].includes(userRole)) {
            const btnE = document.createElement('button')
            btnE.className = 'btn'; btnE.textContent = 'Edit'
            btnE.onclick = () => openEditModal(e)
            const btnD = document.createElement('button')
            btnD.className = 'btn accent'; btnD.textContent = 'Delete'
            btnD.onclick = () => openConfirm(e)
            actTd.append(btnE, btnD)
        }
        tr.append(actTd)

        // attendanceType column
        if (attendanceTypeCol) {
            const td = document.createElement('td')
            td.textContent = e.in?.locationCheck?.attendanceType
                || e.out?.locationCheck?.attendanceType
                || 'normal'
            tr.append(td)
        }

        historyTable.body.append(tr)
    })
}


// ─── MANUAL MODAL LIST + SELECT ──────────────────────────────
async function loadUserList() {
    manage.list.innerHTML = ''
    const term = manage.nameFilter.value.toLowerCase()
    const cat = manage.catFilter.value
    allUsers
        .filter(u => cat === 'all' || u.categoryType === cat)
        .filter(u => (`${u.uid} ${u.name}`).toLowerCase().includes(term))
        .forEach(u => {
            const div = document.createElement('div')
            div.className = 'user-item' + (selectedSet.has(u.id) ? ' selected' : '')
            div.textContent = `${u.uid} – ${u.name}`
            div.onclick = () => {
                selectedSet.has(u.id) ? selectedSet.delete(u.id) : selectedSet.add(u.id)
                div.classList.toggle('selected')
                updateSelectedCount()
            }
            manage.list.append(div)
        })
}

function updateSelectedCount() {
    const n = selectedSet.size
    manage.count.textContent = `Selected: ${n}`
    manage.selectAll.disabled = (n === allUsers.length)
    manage.clearAll.disabled = (n === 0)
}

manage.selectAll.onclick = () => {
    allUsers.forEach(u => selectedSet.add(u.id))
    loadUserList(); updateSelectedCount()
}
manage.clearAll.onclick = () => {
    selectedSet.clear()
    loadUserList(); updateSelectedCount()
}
manage.nameFilter.oninput = loadUserList
manage.catFilter.onchange = loadUserList

// ─── OPEN EDIT MODAL ────────────────────────────────────────
function openEditModal(entry) {
    isEditMode = true
    editIds.inId = entry.in?.id
    editIds.outId = entry.out?.id

    allUsers = [entry.user]
    selectedSet = new Set([entry.user.id])
    manage.catFilter.value = 'all'
    manage.nameFilter.value = ''
    loadUserList(); updateSelectedCount()

    const iso = entry.in
        ? toISO(entry.in.timestamp)
        : entry.out
            ? toISO(entry.out.timestamp)
            : toISO(new Date())
    manage.dateInput.value = iso
    if (entry.in) {
        manage.timeIn.value = new Date(entry.in.timestamp).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)
        manage.reasonIn.value = entry.in.reason || ''
    }
    if (entry.out) {
        manage.timeOut.value = new Date(entry.out.timestamp).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)
        manage.reasonOut.value = entry.out.reason || ''
    }
    manage.merIn.value = (new Date(entry.in?.timestamp).getHours() < 12 ? 'AM' : 'PM')
    manage.merOut.value = (new Date(entry.out?.timestamp).getHours() < 12 ? 'AM' : 'PM')
    manage.status.value = entry.in?.status || 'on-time'

    manage.saveBtn.onclick = async () => {
        await handleUpdate()
        manage.modal.classList.add('hidden')
        await loadHistory()
    }

    manage.modal.classList.remove('hidden')
}

// ─── OPEN NEW RECORD MODAL ──────────────────────────────────
manage.openBtn.onclick = async () => {
    isEditMode = false
    const res = await apiFetch('/api/users')
    allUsers = res.users
    selectedSet.clear()
    manage.catFilter.value = 'all'
    manage.nameFilter.value = ''
    loadUserList(); updateSelectedCount()
    manage.dateInput.value = toISO(new Date())
    manage.timeIn.value = ''
    manage.timeOut.value = ''
    manage.reasonIn.value = ''
    manage.reasonOut.value = ''
    manage.status.value = 'on-time'

    manage.saveBtn.onclick = async () => {
        await handleSave()
        manage.modal.classList.add('hidden')
        await loadHistory()
    }

    manage.modal.classList.remove('hidden')
}

manage.closeBtn.onclick = () => manage.modal.classList.add('hidden')
manage.cancelBtn.onclick = () => manage.modal.classList.add('hidden')




// ─── SAVE NEW RECORDS (Corrected for ISO timestamp) ──────────────
async function handleSave() {
    if (!selectedSet.size) {
        return showToast('error', 'No users selected');
    }

    const date = manage.dateInput.value;
    const inTime = manage.timeIn.value;
    const outTime = manage.timeOut.value;
    const inMer = manage.merIn.value;
    const outMer = manage.merOut.value;
    const inReason = manage.reasonIn.value;
    const outReason = manage.reasonOut.value;
    const status = manage.status.value;

    const base = { userIds: Array.from(selectedSet) };

    // Helper to build ISO timestamp from date, time, and meridiem
    function buildTimestamp(date, time, mer) {
        if (!date || !time || !mer) return null;
        let [h, m] = time.split(':').map(Number);
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;

        // Compose a timestamp with your local timezone offset
        // Eg: "2025-05-18T07:30:00+05:30" (for IST)
        const tzOffset = -new Date().getTimezoneOffset();
        const sign = tzOffset >= 0 ? '+' : '-';
        const absOffset = Math.abs(tzOffset);
        const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
        const mins = String(absOffset % 60).padStart(2, '0');
        return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${sign}${hours}:${mins}`;
    }


    // punch-in
    if (inTime) {
        await apiFetch('/api/attendance/manage/add', {
            method: 'POST',
            body: JSON.stringify({
                ...base,
                type: 'punch-in',
                timestamp: buildTimestamp(date, inTime, inMer),
                status,
                reason: inReason || null
            })
        });
    }
    // punch-out
    if (outTime) {
        await apiFetch('/api/attendance/manage/add', {
            method: 'POST',
            body: JSON.stringify({
                ...base,
                type: 'punch-out',
                timestamp: buildTimestamp(date, outTime, outMer),
                status: null,
                reason: outReason || null
            })
        });
    }

    if (inTime || outTime) allAttendanceDates.add(date);
}

// ─── UPDATE EXISTING RECORDS (Corrected for ISO timestamp) ───────
async function handleUpdate() {
    const date = manage.dateInput.value
    const inTime = manage.timeIn.value
    const outTime = manage.timeOut.value
    const inMer = manage.merIn.value
    const outMer = manage.merOut.value
    const inReason = manage.reasonIn.value
    const outReason = manage.reasonOut.value
    const status = manage.status.value

    function buildTimestamp(date, time, mer) {
        if (!date || !time || !mer) return null;
        let [h, m] = time.split(':').map(Number);
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }

    // punch-in edit
    if (editIds.inId && inTime) {
        await apiFetch(`/api/attendance/manage/${editIds.inId}`, {
            method: 'PUT',
            body: JSON.stringify({
                timestamp: buildTimestamp(date, inTime, inMer),
                status,
                reason: inReason || null
            })
        });
    }
    // punch-out edit
    if (editIds.outId && outTime) {
        await apiFetch(`/api/attendance/manage/${editIds.outId}`, {
            method: 'PUT',
            body: JSON.stringify({
                timestamp: buildTimestamp(date, outTime, outMer),
                status: null,
                reason: outReason || null
            })
        });
    }

    allAttendanceDates.add(date)
    isEditMode = false
}


// ─── DELETE ─────────────────────────────────────────────────
function openConfirm(entry) {
    pendingDeleteId = entry.in?.id || entry.out?.id || null
    confirmBox.text.textContent = `Delete ${entry.user.name} (${entry.user.uid})?`
    confirmBox.modal.classList.remove('hidden')
}
confirmBox.no.onclick = () => {
    pendingDeleteId = null
    confirmBox.modal.classList.add('hidden')
}
confirmBox.yes.onclick = async () => {
    if (pendingDeleteId) {
        await apiFetch(`/api/attendance/manage/${pendingDeleteId}`, { method: 'DELETE' })
        showToast('success', 'Deleted')
        await loadHistory()
    }
    pendingDeleteId = null
    confirmBox.modal.classList.add('hidden')
}

function positionCalendarOverlay() {
    const btn = calendar.openBtn.getBoundingClientRect();
    const ov = calendar.overlay;

    if (window.innerWidth > 600) {
        const wr = calendar.openBtn.closest('.filter-item').getBoundingClientRect();
        const ovW = ov.offsetWidth;
        const left = Math.min(wr.width - ovW, Math.max(0, btn.left - wr.left));
        ov.style.cssText = `position:absolute;top:calc(100% + var(--spacing));left:${left}px;`;

        const arrow = btn.left + btn.width / 2 - (wr.left + left) - 8;
        ov.style.setProperty('--arrow-left', `${Math.min(ovW - 16, Math.max(16, arrow))}px`);
    } else {
        const ovW = Math.min(360, window.innerWidth * 0.9);
        const ovL = (window.innerWidth - ovW) / 2;
        const ovT = window.innerHeight * 0.1;
        ov.style.cssText = `position:fixed;width:${ovW}px;left:${ovL}px;top:${ovT}px;`;

        const arrow = btn.left + btn.width / 2 - ovL - 8;
        ov.style.setProperty('--arrow-left', `${Math.min(ovW - 16, Math.max(16, arrow))}px`);
    }
}

calendar.openBtn.onclick = () => {
    calendar.overlay.classList.toggle('hidden');
    if (!calendar.overlay.classList.contains('hidden')) {
        positionCalendarOverlay();
    }
};

calendar.closeBtn.onclick = () => {
    calendar.overlay.classList.add('hidden');
};

window.addEventListener('resize', () => {
    if (!calendar.overlay.classList.contains('hidden')) {
        positionCalendarOverlay();
    }
});
// ─── FETCH TOTAL USER COUNT ─────────────────────────────────
async function fetchUserCount() {
    try {
        // no query‐string needed—the server figures out "who sees whom"
        const res = await apiFetch('/api/users/count');
        cards.totalUsers.textContent = res.count;
    } catch (e) {
        cards.totalUsers.textContent = '—';
        console.error('Failed to fetch user count:', e.message);
    }
}

// ─── INITIALIZATION ─────────────────────────────────────────
async function init() {
    me = (await apiFetch('/api/users/me')).user || {};
    userRole = me.role;
    userCategory = me.categoryType;
    userId = me.id;
    attendanceTypeCol = ['developer', 'admin'].includes(userRole)
        || me.attendanceType === 'full';

    await fetchUserCount(); // ← Add this!
    // hide actions column if not dev/admin
    if (!['developer', 'admin'].includes(userRole)) {
        document.body.classList.add('hide-actions-col')
    } else {
        manage.openBtn.style.display = 'inline-block'
    }

    // show attendance-type filter
    if (attendanceTypeCol) {
        document.getElementById('attendanceTypeFilterWrapper').style.display = 'block'
        document.getElementById('filterAttendanceType').onchange = loadHistory

        // Insert the header cell exactly once
        document.querySelector('#history thead tr')
            .insertAdjacentHTML('beforeend', '<th>Attendance Type</th>')
    }

    await fetchAllDates()
    initCalendarNav()
    selectedDate = toISO(new Date())

    FC.status.onchange = loadHistory
    FC.log.onchange = loadHistory
    FC.time.onchange = loadHistory
    FC.category.onchange = loadHistory
    FC.role.onchange = loadHistory
    FC.search.oninput = () => debounce(loadHistory)



    await loadHistory()
}

init()