import { apiFetch } from './utils.js';

/* ---------------------------------------------------------------- config */
const z2 = n => String(n).padStart(2, '0');

const ROLE = {
    DEV: 'developer',
    ADM: 'admin',
    CADM: 'category-admin',
    MEM: 'member',
    USH: 'usher'
};
const VIEW = { TEAM: 'team', SELF: 'myself' };
const isMember = r => r === ROLE.MEM || r === ROLE.USH;

const LABELS = {
    today: {
        punchIns: "Today's Punch-Ins",
        punchOuts: "Today's Punch-Outs",
        lates: "Today's Lates",
        earlies: "Today's Earlies",
        onTimes: "Today's On-Times",
        leaves: "Today's Leaves"
    },
    total: {
        punchIns: "Total Punch-Ins",
        punchOuts: "Total Punch-Outs",
        lates: "Total Lates",
        earlies: "Total Earlies",
        onTimes: "Total On-Times",
        leaves: "Total Leaves"
    }
};

/* ---------------------------------------------------- DOM cache */
const el = {
    openCalBtn: document.getElementById('openCalendarBtn'),
    closeCalBtn: document.getElementById('closeCalendarBtn'),
    overlay: document.getElementById('calendarOverlay'),
    calendar: document.getElementById('calendar'),
    monthYear: document.getElementById('calendarMonthYear'),
    prevBtn: document.getElementById('prevMonth'),
    nextBtn: document.getElementById('nextMonth'),
    viewToggle: document.getElementById('viewToggle'),
    controls: document.querySelector('.dashboard-controls'),
    dateDisplay: document.getElementById('selectedDateDisplay'),
    mobileHome: document.getElementById('mobileHome'),
    mobileScan: document.getElementById('mobileScanner'),
    userName: document.getElementById('userName'),
    backupButtons: document.getElementById('backupButtons'),
    downloadBackupBtn: document.getElementById('downloadBackupBtn'),
    uploadBackupBtn: document.getElementById('uploadBackupBtn'),
    uploadBackupInput: document.getElementById('uploadBackupInput'),
};

/* -------------------------------------------------------- state */
let currentYear, currentMonth;
let selectedDate = '';
let userRole = '';

/* ------------------------------------------------------- bootstrap */
(() => {
    initCalendarNav();

    // calendar UI
    el.openCalBtn.addEventListener('click', () => el.overlay.classList.toggle('hidden'));
    el.closeCalBtn.addEventListener('click', () => el.overlay.classList.add('hidden'));
    el.viewToggle && el.viewToggle.addEventListener('change', () => loadDashboard());

    // backup handlers
    el.downloadBackupBtn.addEventListener('click', downloadBackup);
    el.uploadBackupBtn.addEventListener('click', () => el.uploadBackupInput.click());
    el.uploadBackupInput.addEventListener('change', uploadBackup);

    // initial dashboard load
    const t = new Date();
    selectedDate = `${t.getFullYear()}-${z2(t.getMonth() + 1)}-${z2(t.getDate())}`;
    loadDashboard(selectedDate);
})();

/* ---------------------------------------- download & upload */
function checkLocationPermissionOrExit() {
    // If denied/block, force logout or show blocking overlay
    if (!navigator.geolocation) {
        alert('Location services are required. Please use a supported browser.');
        window.location.href = '/login.html';
        return;
    }

    function allowAccess() {
        document.getElementById('app-root').classList.remove('hidden');
    }
    function blockAccess() {
        document.getElementById('app-root').classList.add('hidden');
        showToast('error', 'Location is required to access dashboard. Please enable location.');
        setTimeout(checkLocationPermissionOrExit, 2000); // keep retrying
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            localStorage.setItem('lastLat', pos.coords.latitude);
            localStorage.setItem('lastLng', pos.coords.longitude);
            allowAccess();
            // Optionally start watchPosition for continuous updates:
            navigator.geolocation.watchPosition(
                p => {
                    localStorage.setItem('lastLat', p.coords.latitude);
                    localStorage.setItem('lastLng', p.coords.longitude);
                }
            );
        },
        err => blockAccess(),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 7000 }
    );
}

// Call at the top of your dashboard script:
checkLocationPermissionOrExit();

async function downloadBackup() {
    // grab your token the same way apiFetch does
    const token = localStorage.getItem('authToken');
    try {
        const res = await fetch('/api/backup/download', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'backup.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Download failed: ' + err.message);
    }
}

async function uploadBackup() {
    const file = el.uploadBackupInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('backup', file);

    // include your auth cookie/headers if needed
    const token = localStorage.getItem('authToken');
    try {
        const res = await fetch('/api/backup/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: fd
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || res.statusText);
        alert(j.message || 'Backup restored successfully');
    } catch (err) {
        alert('Restore failed: ' + err.message);
    }
}

/* ---------------------------------------------- calendar nav */
function initCalendarNav() {
    const t = new Date();
    currentYear = t.getFullYear();
    currentMonth = t.getMonth();
    el.prevBtn.addEventListener('click', () => changeMonth(-1));
    el.nextBtn.addEventListener('click', () => changeMonth(1));
}
function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadDashboard(`${currentYear}-${z2(currentMonth + 1)}-01`);
}

/* ---------------------------------------------- main loader */
async function loadDashboard(dateStr) {
    if (dateStr) selectedDate = dateStr;
    let requestedView = el.viewToggle?.value || VIEW.TEAM;

    const stats = await apiFetch(
        `/api/dashboard?date=${selectedDate}&view=${requestedView}`
    );

    // set role & user name
    userRole = stats.user.role;
    el.userName.textContent = stats.user.name;

    // view toggle visibility
    if (userRole === ROLE.CADM) {
        el.viewToggle.parentElement.style.display = '';
        requestedView = el.viewToggle.value;
        localStorage.setItem('dashboardView', requestedView);
    } else {
        requestedView = isMember(userRole) ? VIEW.SELF : VIEW.TEAM;
        el.viewToggle && (el.viewToggle.parentElement.style.display = 'none');
    }

    // calendar picker
    const canPick = [ROLE.DEV, ROLE.ADM, ROLE.CADM].includes(userRole)
        && requestedView === VIEW.TEAM;
    el.dateDisplay.style.display = canPick ? '' : 'none';
    el.openCalBtn.style.display = canPick ? '' : 'none';
    if (!canPick) el.overlay.classList.add('hidden');
    if (canPick) {
        const d = new Date(selectedDate);
        el.dateDisplay.textContent = d.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    // stats labels & numbers
    const useTotal = isMember(userRole) || requestedView === VIEW.SELF;
    const lbl = useTotal ? LABELS.total : LABELS.today;
    el.controls.style.display = [ROLE.DEV, ROLE.ADM, ROLE.CADM].includes(userRole)
        ? 'flex' : 'none';

    setCard('totalUsers', stats.totalUsers, 'Total Users',
        requestedView === VIEW.TEAM && [ROLE.DEV, ROLE.ADM, ROLE.CADM].includes(userRole)
    );
    setCard('pendingLeaves', stats.pendingLeaves, 'Pending Leaves', true);
    setCard('punchIns', stats.punchIns, lbl.punchIns, true);
    setCard('punchOuts', stats.punchOuts, lbl.punchOuts, true);
    setCard('lates', stats.lates, lbl.lates, true);
    setCard('earlies', stats.earlies, lbl.earlies, true);
    setCard('onTimes', stats.onTime ?? stats.onTimes, lbl.onTimes, true);
    setCard('totalLeaves', stats.totalLeaves, lbl.leaves, true);

    // draw calendar
    renderCalendar(stats.attendanceDates || []);

    // nav + scanner
    updateNavLinks(requestedView);
    updateScanner(requestedView);

    // ** show/hide backup buttons based on role **
    el.backupButtons.style.display = (userRole === ROLE.DEV) ? '' : 'none';

    // mobile home
    el.mobileHome.onclick = () => location.href = 'dashboard.html';
}

/* ------------------------------------------------ helpers */
function setCard(statKey, value, labelText, show) {
    const c = document.querySelector(`.stat-card[data-stat="${statKey}"]`);
    if (!c) return;
    c.querySelector('h3').textContent = value ?? 0;
    c.querySelector('p').textContent = labelText;
    c.style.display = show ? '' : 'none';
}

function updateNavLinks(view) {
    document.querySelectorAll(
        '.nav-links a[href="manageUsers.html"], .mobile-menu a[href="manageUsers.html"]'
    ).forEach(a => a.style.display = isMember(userRole) ? 'none' : '');

    document.querySelectorAll(
        '.nav-links a[href="developer.html"], .mobile-menu a[href="developer.html"]'
    ).forEach(a => a.style.display = (userRole === ROLE.DEV) ? '' : 'none');

    const showGen = !isMember(userRole) && !(userRole === ROLE.CADM && view === VIEW.SELF);
    document.querySelectorAll(
        '.nav-links a[href="qr.html?mode=gen"], .mobile-menu a[href="qr.html?mode=gen"]'
    ).forEach(a => a.style.display = showGen ? '' : 'none');
}

function updateScanner(view) {
    if (!el.mobileScan) return;
    const show = isMember(userRole) || (userRole === ROLE.CADM && view === VIEW.SELF);
    el.mobileScan.style.display = show ? 'block' : 'none';
}

function renderCalendar(attDates) {
    el.monthYear.textContent = `${currentYear} /y ${z2(currentMonth + 1)}`;
    el.calendar.innerHTML = '';
    'SMTWTFS'.split('').forEach(d => {
        const h = document.createElement('div');
        h.className = 'calendar-day header';
        h.textContent = d;
        el.calendar.append(h);
    });
    const offset = new Date(currentYear, currentMonth, 1).getDay();
    for (let i = 0; i < offset; i++) el.calendar.append(document.createElement('div'));
    const days = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
        const iso = `${currentYear}-${z2(currentMonth + 1)}-${z2(d)}`;
        const cell = document.createElement('div');
        cell.className = 'calendar-day ' +
            (attDates.includes(iso) ? 'present' : 'absent') +
            (iso === selectedDate ? ' selected-date-cell' : '');
        cell.textContent = d;
        cell.onclick = () => { loadDashboard(iso); el.overlay.classList.add('hidden'); };
        el.calendar.append(cell);
    }
}
