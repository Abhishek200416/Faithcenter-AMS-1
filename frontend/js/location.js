import { apiFetch } from './utils.js';

export let currentPosition = null;
let currentUser = null;
let selectedSet = new Set();
let activeChecks = [];
let allUsers = [];

export async function sendPunchCoords() {
    if (!currentPosition) return;
    await apiFetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
            reason: null // or your reason
        })
    });
}

export async function checkAutoPunchOut() {
    const resp = await apiFetch('/api/attendance/active');
    if (!resp.ok) return;
    const { activeCheck, punchIn } = await resp.json();
    if (activeCheck && punchIn && !punchIn.punchOut && currentPosition) {
        const d = haversineDistance(
            currentPosition.latitude,
            currentPosition.longitude,
            activeCheck.latitude,
            activeCheck.longitude
        );
        if (d > activeCheck.radius) {
            await apiFetch('/api/attendance/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latitude: currentPosition.latitude,
                    longitude: currentPosition.longitude,
                    reason: null // or your reason
                })
            });
        }
    }
}

export function startGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
        pos => {
            currentPosition = pos.coords;
            localStorage.setItem('lastLat', pos.coords.latitude);
            localStorage.setItem('lastLng', pos.coords.longitude);
        },
        () => { },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = x => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function showTile({ message, type = 'info' }) {
    let container = document.getElementById('custom-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-notification-container';
        document.body.append(container);
    }
    const tile = document.createElement('div');
    tile.className = `cn-tile cn-${type}`;
    tile.textContent = message;
    tile.onclick = () => tile.remove();
    container.append(tile);
    setTimeout(() => tile.remove(), 6000);
}

async function ensureGeoPermission() {
    if (navigator.permissions) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'granted' || status.state === 'prompt') {
            startGeolocation();
            return;
        }
    }
    startGeolocation();
}

const E = {};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const selectedDays = new Set();

function renderDaysOfWeek() {
    if (!E.daysOfWeekList) return;
    E.daysOfWeekList.innerHTML = '';
    DAYS.forEach(d => {
        const div = document.createElement('div');
        div.className = 'day-item';
        div.textContent = d;
        if (selectedDays.has(d)) div.classList.add('selected');
        div.onclick = () => {
            selectedDays.has(d) ? selectedDays.delete(d) : selectedDays.add(d);
            div.classList.toggle('selected');
        };
        E.daysOfWeekList.append(div);
    });
}

function toggleScheduleFields() {
    document.querySelectorAll('[data-dependent]').forEach(el => {
        el.style.display =
            E.schedule.value === el.getAttribute('data-dependent') ? 'block' : 'none';
    });
}

function toggleAttendanceType() {
    const isFull = E.attendanceType.value === 'full';
    if (isFull) {
        E.schedule.value = 'weekly';
        renderDaysOfWeek();
    }
    E.timeFields.forEach(el => el.style.display = isFull ? 'none' : 'flex');
    E.windowFields.forEach(el => el.style.display = isFull ? 'none' : 'flex');
    E.messageFields.forEach(el => el.style.display = isFull ? 'none' : 'block');
    Array.from(E.scheduleOptions).forEach(opt => {
        if (opt.value === 'once') {
            opt.hidden = isFull;
            if (isFull && E.schedule.value === 'once') E.schedule.value = 'weekly';
        }
    });
    toggleScheduleFields();
    if (isFull) E.duration.value = '';
}

async function init() {
    if (!E.root) return;
    E.root.classList.remove('hidden');
    ensureGeoPermission();
    ({ user: currentUser } = await apiFetch('/api/users/me'));
    const { users } = await apiFetch('/api/users');
    // show absolutely everyone (except yourself) to developers
    if (currentUser.role === 'developer') {
        allUsers = users.filter(u => u.id !== currentUser.id);
    }
    // or everyone including yourself:
    // allUsers = users.slice();
    else if (currentUser.role === 'admin') {
        // maybe admins should see everyone except developers?
        allUsers = users.filter(u => u.role !== 'developer');
    } else {
        allUsers = users.filter(u =>
            u.role === 'member' && u.categoryType === currentUser.categoryType
        );
    }

    renderUserList();
    await loadChecks();

    if (E.schedule) {
        E.schedule.onchange = () => {
            toggleScheduleFields();
            if (E.schedule.value === 'weekly') renderDaysOfWeek();
        };
    }
    if (E.attendanceType) {
        E.attendanceType.onchange = toggleAttendanceType;
    }
    if (E.addBtn) {
        E.addBtn.onclick = openModal;
    }
    if (E.cancelBtn) {
        E.cancelBtn.onclick = closeModal;
    }
    if (E.backdrop) {
        E.backdrop.onclick = closeModal;
    }
    if (E.selectAll) {
        E.selectAll.onclick = () => {
            allUsers.forEach(u => selectedSet.add(u.id));
            document.querySelectorAll('.user-item').forEach(d => d.classList.add('selected'));
        };
    }
    if (E.clearAll) {
        E.clearAll.onclick = () => {
            selectedSet.clear();
            document.querySelectorAll('.user-item').forEach(d => d.classList.remove('selected'));
        };
    }
    if (E.saveBtn) {
        E.saveBtn.onclick = () => {
            if (E.attendanceType?.value === 'full') {
                E.remindBefore.value = 0;
                E.earlyWindow.value = 0;
                E.lateWindow.value = 0;
                E.earlyMsg.value = '';
                E.onTimeMsg.value = '';
                E.lateMsg.value = '';
                E.startTime.value = '';
            }
            grabPositionAndSave();
        };
    }

    const socket = io('http://localhost:3000', { auth: { token: localStorage.getItem('authToken') } });
    socket.emit('join', currentUser.categoryType || 'global');
    socket.on('locationReminder', ({ message, phase }) => showTile({ message, type: phase }));
}

function openModal() {
    if (currentPosition) {
        E.lat.value = currentPosition.latitude.toFixed(6);
        E.lng.value = currentPosition.longitude.toFixed(6);
    }
    if (E.schedule.value === 'once' && !E.specificDate.value) {
        const today = new Date();
        E.specificDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    E.modal.classList.remove('hidden');
    E.backdrop.classList.remove('hidden');
    if (E.schedule.value === 'weekly') renderDaysOfWeek();
}

function closeModal() {
    E.modal.classList.add('hidden');
    E.backdrop.classList.add('hidden');
}

function grabPositionAndSave() {
    if (currentPosition) {
        E.lat.value = currentPosition.latitude.toFixed(6);
        E.lng.value = currentPosition.longitude.toFixed(6);
        return saveCheck();
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            currentPosition = pos.coords;
            E.lat.value = pos.coords.latitude.toFixed(6);
            E.lng.value = pos.coords.longitude.toFixed(6);
            saveCheck();
        },
        () => showTile({ message: 'Unable to get location', type: 'error' })
    );
}

function renderUserList() {
    if (!E.userList) return;
    E.userList.innerHTML = '';
    allUsers.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.textContent = `${u.uid} – ${u.name}`;
        if (selectedSet.has(u.id)) div.classList.add('selected');
        div.onclick = () => {
            selectedSet.has(u.id) ? selectedSet.delete(u.id) : selectedSet.add(u.id);
            div.classList.toggle('selected');
        };
        E.userList.append(div);
    });
}

async function loadChecks() {
    activeChecks = (await apiFetch('/api/location').catch(() => [])) || [];
    if (!E.checkList) return;
    E.checkList.innerHTML = activeChecks.length === 0
        ? `<li class="no-data">No saved checks</li>`
        : '';
    activeChecks.forEach(loc => {
        const li = document.createElement('li');
        li.className = 'check-item';
        const info = document.createElement('span');
        info.textContent = loc.attendanceType === 'full'
            ? `Full-Time • ${loc.scheduleType}`
            : `${new Date(loc.startAt).toLocaleString()} • ${loc.scheduleType}`;
        li.append(info);
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => openEditModal(loc);
        li.append(editBtn);
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = 'Delete';
        delBtn.onclick = async () => {
            if (!confirm('Delete this check?')) return;
            await apiFetch(`/api/location/${loc.id}`, { method: 'DELETE' });
            loadChecks();
        };
        li.append(delBtn);
        E.checkList.append(li);
    });
}

async function saveCheck() {
    if (!selectedSet.size) {
        showTile({ message: 'Pick at least one user', type: 'error' });
        return;
    }
    const payload = {
        latitude: +E.lat.value,
        longitude: +E.lng.value,
        radius: +E.radius.value,
        scheduleType: E.schedule.value,
        daysOfWeek: [...selectedDays],
        specificDate: E.specificDate.value,
        startTime: E.startTime.value,
        remindBeforeMins: +E.remindBefore.value,
        durationMinutes: +E.duration.value,
        earlyWindow: +E.earlyWindow.value,
        lateWindow: +E.lateWindow.value,
        outGrace: +E.outGrace.value,
        earlyMsg: E.earlyMsg.value,
        onTimeMsg: E.onTimeMsg.value,
        lateMsg: E.lateMsg.value,
        userIds: Array.from(selectedSet)
    };
    await apiFetch('/api/location/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    selectedSet.clear();
    closeModal();
    loadChecks();
}

function openEditModal(loc) {
    openModal();
    E.lat.value = loc.latitude;
    E.lng.value = loc.longitude;
    E.radius.value = loc.radius;
    E.schedule.value = loc.scheduleType;
    E.specificDate.value = loc.specificDate || '';
    E.startTime.value = loc.startTime;
    E.remindBefore.value = loc.remindBeforeMins;
    E.duration.value = loc.durationMinutes;
    E.earlyWindow.value = loc.earlyWindow;
    E.lateWindow.value = loc.lateWindow;
    E.outGrace.value = loc.outGrace;
    E.earlyMsg.value = loc.earlyMsg || '';
    E.onTimeMsg.value = loc.onTimeMsg || '';
    E.lateMsg.value = loc.lateMsg || '';
    selectedDays.clear();
    (loc.daysOfWeek || []).forEach(d => selectedDays.add(d));
    if (E.schedule.value === 'weekly') renderDaysOfWeek();
    selectedSet = new Set(loc.userIds || []);
    renderUserList();
    E.saveBtn.onclick = () => grabPositionAndUpdate(loc.id);
}

async function grabPositionAndUpdate(id) {
    if (currentPosition) {
        E.lat.value = currentPosition.latitude.toFixed(6);
        E.lng.value = currentPosition.longitude.toFixed(6);
        return updateCheck(id);
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            currentPosition = pos.coords;
            E.lat.value = pos.coords.latitude.toFixed(6);
            E.lng.value = pos.coords.longitude.toFixed(6);
            updateCheck(id);
        },
        () => showTile({ message: 'Unable to get location', type: 'error' })
    );
}

async function updateCheck(id) {
    const payload = {
        latitude: +E.lat.value,
        longitude: +E.lng.value,
        radius: +E.radius.value,
        scheduleType: E.schedule.value,
        daysOfWeek: [...selectedDays],
        specificDate: E.specificDate.value,
        startTime: E.startTime.value,
        remindBeforeMins: +E.remindBefore.value,
        durationMinutes: +E.duration.value,
        earlyWindow: +E.earlyWindow.value,
        lateWindow: +E.lateWindow.value,
        outGrace: +E.outGrace.value,
        earlyMsg: E.earlyMsg.value,
        onTimeMsg: E.onTimeMsg.value,
        lateMsg: E.lateMsg.value,
        userIds: Array.from(selectedSet)
    };
    await apiFetch(`/api/location/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    selectedSet.clear();
    closeModal();
    loadChecks();
}

document.addEventListener('DOMContentLoaded', () => {
    E.root = document.getElementById('app-root');
    E.addBtn = document.getElementById('addCheckBtn');
    E.checkList = document.getElementById('checkList');
    E.modal = document.getElementById('checkModal');
    E.backdrop = document.getElementById('modalBackdrop');
    E.lat = document.getElementById('locLatitude');
    E.lng = document.getElementById('locLongitude');
    E.radius = document.getElementById('locRadius');
    E.schedule = document.getElementById('scheduleType');
    E.scheduleOptions = E.schedule?.options;
    E.daysOfWeekList = document.getElementById('daysOfWeekList');
    E.specificDate = document.getElementById('specificDate');
    E.startTime = document.getElementById('startTime');
    E.remindBefore = document.getElementById('remindBefore');
    E.duration = document.getElementById('durationMinutes');
    E.earlyWindow = document.getElementById('earlyWindow');
    E.lateWindow = document.getElementById('lateWindow');
    E.outGrace = document.getElementById('outGrace');
    E.earlyMsg = document.getElementById('earlyMsg');
    E.onTimeMsg = document.getElementById('onTimeMsg');
    E.lateMsg = document.getElementById('lateMsg');
    E.selectAll = document.getElementById('selectAllUsers');
    E.clearAll = document.getElementById('clearAllUsers');
    E.userList = document.getElementById('userList');
    E.saveBtn = document.getElementById('saveCheckBtn');
    E.cancelBtn = document.getElementById('cancelCheckBtn');
    E.attendanceType = document.getElementById('attendanceType');
    E.timeFields = document.querySelectorAll('.time-fields');
    E.windowFields = document.querySelectorAll('.window-fields');
    E.messageFields = document.querySelectorAll('.message-fields');
    init();
});
