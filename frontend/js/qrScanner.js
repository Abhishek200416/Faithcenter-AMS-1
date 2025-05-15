// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';


const E = {
    // form inputs
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),

    // action selector
    scanType: document.getElementById('scanType'),

    // buttons & selects
    applyBtn: document.getElementById('applyBtn'),
    savePreset: document.getElementById('savePresetBtn'),
    presetSel: document.getElementById('presetSelect'),

    // panels + scanner
    formCard: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    scannerSection: document.getElementById('scannerSection'),
    scannerLoading: document.getElementById('scannerLoading'),

    // feedback
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),

    // preset modal
    modal: document.getElementById('presetModal'),
    nameInput: document.getElementById('presetName'),
    cancelBtn: document.getElementById('presetCancel'),
    confirmBtn: document.getElementById('presetConfirm'),
};

let html5QrInstance;
let attendanceCache = {};     // cache punches so we don’t re-punch
let currentQR, liveTs, expiryTs, qrCategory, qrIssuerId;
let role, userCategory, isMember;
const thresholds = { early: 0, late: 0, absent: 0 };
let timerInterval;

const MODE = new URLSearchParams(window.location.search).get('mode');

/** 1) Bootstrap **/
(async function init() {
    try {
        const me = await apiFetch('/api/users/me');
        role = me.role;
        userCategory = me.categoryType || null;
        isMember = (role === 'member' || role === 'usher');

        // Members / ushers ALWAYS scanner only
        if (isMember || MODE === 'scan') {
            return showScannerOnly();
        }

        // Everyone else MUST generator only
        showGeneratorOnly();
        await loadPresets();

        // restore any unexpired QR
        const saved = JSON.parse(localStorage.getItem('qrState') || '{}');
        if (saved.token && Date.now() < saved.expiryTs) {
            Object.assign(thresholds, {
                early: saved.earlyMs,
                late: saved.lateMs,
                absent: saved.absentMs
            });
            qrCategory = saved.category;
            qrIssuerId = saved.issuerId;
            currentQR = saved.token;
            liveTs = saved.liveTs;
            expiryTs = saved.expiryTs;
            E.scanType.value = saved.scanType;
            restoreQRCode();
        }
    } catch {
        showToast('error', 'Unable to initialize QR page');
    }
})();

function showScannerOnly() {
    E.formCard.classList.add('hidden');
    E.qrOutput.classList.add('hidden');
    E.scannerSection.classList.remove('hidden');
    fetchActiveQR()
        .then(initScanner)
        .catch(() => {
            showToast('error', 'No active QR available');
        });
}

function showGeneratorOnly() {
    E.formCard.classList.remove('hidden');
    E.qrOutput.classList.remove('hidden');
    E.scannerSection.classList.add('hidden');
}

/** 2) Auto‑fill IST date/time **/
window.addEventListener('load', () => {
    const now = new Date(),
        utc = now.getTime() + now.getTimezoneOffset() * 60000,
        ist = new Date(utc + 5.5 * 60 * 60000);
    E.dateIn.value = ist.toISOString().slice(0, 10);
    E.timeIn.value = ist.toTimeString().slice(0, 8);
});

/** 3) Fetch active QR **/
async function fetchActiveQR() {
    const data = await apiFetch('/api/qr/active');
    currentQR = data.token;
    qrCategory = data.category;
    qrIssuerId = data.issuedBy;
    liveTs = new Date(data.liveAt).getTime();
    expiryTs = new Date(data.expiresAt).getTime();
    thresholds.early = (data.earlyWindow || 0) * 60000;
    thresholds.late = (data.lateWindow || 0) * 60000;
    thresholds.absent = (data.duration || 0) * 60000;
}

/** 4) Presets **/
async function loadPresets() {
    E.presetSel.innerHTML = '<option value="">— Load Preset —</option>';
    try {
        const ps = await apiFetch('/api/presets');
        ps.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            E.presetSel.append(o);
        });
    } catch {
        showToast('error', 'Could not load presets');
    }
}
E.presetSel.addEventListener('change', async () => {
    const id = E.presetSel.value;
    if (!id) return;
    try {
        const p = await apiFetch(`/api/presets/${id}`);
        E.dateIn.value = p.date;
        E.timeIn.value = p.time;
        E.earlyIn.value = p.early;
        E.lateIn.value = p.late;
        E.absentIn.value = p.absent;
        E.earlyMsgIn.value = p.earlyMsg;
        E.onTimeMsgIn.value = p.onTimeMsg;
        E.lateMsgIn.value = p.lateMsg;
    } catch {
        showToast('error', 'Failed to load preset');
    }
});

E.savePreset.onclick = () => {
    E.nameInput.value = '';
    E.modal.classList.remove('hidden');
    E.nameInput.focus();
};
E.cancelBtn.onclick = () => E.modal.classList.add('hidden');
E.confirmBtn.onclick = async () => {
    const nm = E.nameInput.value.trim();
    if (!nm) return showToast('error', 'Enter a name');
    try {
        await apiFetch('/api/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nm,
                date: E.dateIn.value,
                time: E.timeIn.value,
                early: +E.earlyIn.value,
                late: +E.lateIn.value,
                absent: +E.absentIn.value,
                earlyMsg: E.earlyMsgIn.value,
                onTimeMsg: E.onTimeMsgIn.value,
                lateMsg: E.lateMsgIn.value
            })
        });
        showToast('success', 'Preset saved');
        E.modal.classList.add('hidden');
        await loadPresets();
    } catch {
        showToast('error', 'Failed to save preset');
    }
};

/** 5) Generate QR **/
E.applyBtn.onclick = async () => {
    E.qrLoading.classList.remove('hidden');
    E.qrCanvas.classList.add('hidden');

    // build liveAt
    const [Y, M, D] = E.dateIn.value.split('-').map(Number);
    const [h, m, s] = E.timeIn.value.split(':').map(Number);
    // convert IST→UTC by subtracting 5h30m
    const liveAtISO = new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();

    try {
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                liveAt: liveAtISO,
                durationMinutes: +E.absentIn.value,
                earlyWindow: +E.earlyIn.value,
                lateWindow: +E.lateIn.value,
                earlyMsg: E.earlyMsgIn.value,
                onTimeMsg: E.onTimeMsgIn.value,
                lateMsg: E.lateMsgIn.value,
                scanType: E.scanType.value
            })
        });
        // adopt server values
        currentQR = data.token;
        liveTs = new Date(data.liveAt).getTime();
        expiryTs = new Date(data.expiresAt).getTime();
        qrCategory = data.category;
        qrIssuerId = data.issuedBy;
        thresholds.early = data.earlyWindow * 60000;
        thresholds.late = data.lateWindow * 60000;
        thresholds.absent = data.duration * 60000;

        E.qrLoading.classList.add('hidden');
        E.qrCanvas.classList.remove('hidden');
        window.QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
        startTimer();

        localStorage.setItem('qrState', JSON.stringify({
            token: currentQR,
            liveTs, expiryTs,
            category: qrCategory, issuerId: qrIssuerId,
            scanType: E.scanType.value,
            earlyMs: thresholds.early,
            lateMs: thresholds.late,
            absentMs: thresholds.absent
        }));

        if (window.innerWidth <= 600) {
            E.formCard.classList.add('hidden');
        }
    } catch (err) {
        E.qrLoading.classList.add('hidden');
        showToast('error', 'QR generation failed: ' + err.message);
    }
};

function startTimer() {
    clearInterval(timerInterval);
    function tick() {
        const d = expiryTs - Date.now();
        if (d <= 0) {
            E.qrTimer.textContent = 'Expired';
            clearInterval(timerInterval);
            localStorage.removeItem('qrState');
            E.qrCanvas.classList.add('hidden');
            if (window.innerWidth <= 600) E.formCard.classList.remove('hidden');
            E.applyBtn.disabled = false;
            return;
        }
        E.applyBtn.disabled = true;
        const mm = String(Math.floor(d / 60000)).padStart(2, '0'),
            ss = String(Math.floor((d % 60000) / 1000)).padStart(2, '0');
        E.qrTimer.textContent = `Expires in ${mm}:${ss}`;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
}

function restoreQRCode() {
    E.qrLoading.classList.add('hidden');
    E.qrCanvas.classList.remove('hidden');
    window.QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
    startTimer();
    if (window.innerWidth <= 600) E.formCard.classList.add('hidden');
}

/** 6) Scanner startup **/
async function initScanner() {
    E.scannerLoading.classList.remove('hidden');
    html5QrInstance = new Html5Qrcode('qr-reader');
    const cfg = { fps: 20, qrbox: 300 };

    try {
        await html5QrInstance.start(
            { facingMode: 'environment' },
            cfg,
            onScan
        );
    } catch {
        // fallback to user camera
        try {
            await html5QrInstance.start(
                { facingMode: 'user' },
                cfg,
                onScan
            );
        } catch (e) {
            showToast('error', 'Camera error: ' + (e.message || e));
        }
    } finally {
        E.scannerLoading.classList.add('hidden');
    }
}

/** 7) onScan **/
async function onScan(token) {
    if (token !== currentQR) {
        return showToast('error', 'Invalid QR');
    }

    // issuer cannot scan own
    if (qrIssuerId === role/* or compare userId on front if you store it */) {
        return showToast('error', 'You cannot scan your own QR');
    }

    // category check
    if (qrCategory && qrCategory !== userCategory) {
        return showToast('error', 'Not for your category');
    }

    const now = Date.now(),
        key = `${currentQR}::${E.scanType.value}`;

    // already punched?
    if (attendanceCache[key]) {
        return popFeedback(attendanceCache[key], key);
    }

    // expired → auto absent
    if (now > expiryTs) {
        try {
            await apiFetch('/api/attendance/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrToken: currentQR,
                    type: E.scanType.value,
                    status: 'absent',
                    reason: null
                })
            });
            return showToast('success', 'Marked absent (expired)');
        } catch (e) {
            return showToast('error', e.message || 'Punch failed');
        }
    }

    // compute early/on-time/late
    let title, main, custom, needReason = false;
    const delta = now - liveTs;
    if (delta < -thresholds.early) {
        title = 'Early'; main = `Early by ${Math.floor(-delta / 60000)}m`; custom = E.earlyMsgIn.value || main;
    }
    else if (delta <= thresholds.late) {
        title = 'On Time'; main = 'On time'; custom = E.onTimeMsgIn.value || main;
    }
    else {
        title = 'Late'; main = `Late by ${Math.floor((delta - thresholds.late) / 60000)}m`;
        custom = E.lateMsgIn.value || main;
        needReason = true;
    }

    attendanceCache[key] = { title, main, custom, needReason, punched: false };
    popFeedback(attendanceCache[key], key);
}

/** 8) popFeedback **/
function popFeedback(rec, key) {
    html5QrInstance?.stop();
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    E.fbReasonContainer.classList.toggle('hidden', !rec.needReason);
    E.fbCard.classList.remove('hidden');

    E.fbOk.onclick = async () => {
        // record if not yet
        if (!rec.punched) {
            const reason = rec.needReason ? E.fbReason.value.trim() : null;
            if (rec.needReason && !reason) {
                return showToast('error', 'Please supply a reason');
            }
            try {
                await apiFetch('/api/attendance/punch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        qrToken: currentQR,
                        type: E.scanType.value,
                        status: rec.title.toLowerCase().replace(' ', '-'),
                        reason
                    })
                });
                showToast('success', `You are ${rec.title}`);
                rec.punched = true;
            } catch (e) {
                return showToast('error', e.message || 'Punch failed');
            }
        }
        // hide modal & go home
        E.fbCard.classList.add('hidden');
        window.location.href = 'dashboard.html';
    };
}
