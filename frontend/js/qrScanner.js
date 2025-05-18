import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const E = {
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),
    scanType: document.getElementById('scanType'),
    applyBtn: document.getElementById('applyBtn'),
    cancelBtn: document.getElementById('cancelQRBtn'),
    presetSel: document.getElementById('presetSelect'),
    savePresetBtn: document.getElementById('savePresetBtn'),
    generator: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    scannerSection: document.getElementById('scannerSection'),
    liveBanner: document.getElementById('qrLiveBanner'),
    root: document.getElementById('app-root'),
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    scannerLoading: document.getElementById('scannerLoading'),
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),
    cameraOverlay: document.getElementById('cameraOverlay'),
    cameraOkBtn: document.getElementById('cameraOkBtn'),
};

let qrScanner,
    attendanceCache = {},
    currentQR = null,
    liveTs = 0,
    expiryTs = 0,
    thresholds = { early: 0, late: 0, absent: 0 },
    userId, role, userCategory,
    timerInterval;

const MODE = new URLSearchParams(window.location.search).get('mode');

; (async function init() {
    E.root.classList.remove('hidden');
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 60 * 60000);
    E.dateIn.value = ist.toISOString().slice(0, 10);
    E.timeIn.value = ist.toTimeString().slice(0, 8);

    const me = await apiFetch('/api/users/me');
    userId = me.id; role = me.role; userCategory = me.categoryType;

    if (['member', 'usher'].includes(role) || MODE === 'scan') {
        enterScannerMode();
    } else {
        enterGeneratorMode();
        loadPresets();
        restoreFromStorage();
    }
})();

function enterGeneratorMode() {
    E.generator.classList.remove('hidden');
    E.qrOutput.classList.remove('hidden');
    E.scannerSection.classList.add('hidden');
    if (['developer', 'admin', 'category-admin'].includes(role)) {
        E.cancelBtn.classList.remove('hidden');
    }
}

function enterScannerMode() {
    E.generator.classList.add('hidden');
    E.qrOutput.classList.add('hidden');
    E.scannerSection.classList.remove('hidden');
    E.cancelBtn.classList.add('hidden');
    E.liveBanner?.classList.add('hidden');
    promptCameraPermission();
}

function promptCameraPermission() {
    if (!E.cameraOverlay) {
        fetchAndStartScanner();
        return;
    }
    E.cameraOverlay.classList.remove('hidden');
    E.cameraOkBtn.onclick = async () => {
        E.cameraOverlay.classList.add('hidden');
        fetchAndStartScanner();
    };
}

async function loadPresets() {
    E.presetSel.innerHTML = '<option value="">— Load Preset —</option>';
    const ps = await apiFetch('/api/presets');
    ps.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.name;
        E.presetSel.append(o);
    });
    E.presetSel.onchange = async () => {
        if (!E.presetSel.value) return;
        const p = await apiFetch(`/api/presets/${E.presetSel.value}`);
        E.dateIn.value = p.date;
        E.timeIn.value = p.time;
        E.earlyIn.value = p.early;
        E.lateIn.value = p.late;
        E.absentIn.value = p.absent;
        E.earlyMsgIn.value = p.earlyMsg;
        E.onTimeMsgIn.value = p.onTimeMsg;
        E.lateMsgIn.value = p.lateMsg;
    };
    E.savePresetBtn.onclick = async () => {
        const name = prompt('Preset name?');
        if (!name) return;
        await apiFetch('/api/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                date: E.dateIn.value,
                time: E.timeIn.value,
                early: E.earlyIn.value,
                late: E.lateIn.value,
                absent: E.absentIn.value,
                earlyMsg: E.earlyMsgIn.value,
                onTimeMsg: E.onTimeMsgIn.value,
                lateMsg: E.lateMsgIn.value
            })
        });
        showToast('success', 'Preset saved');
        loadPresets();
    };
}

E.applyBtn.onclick = generateQR;
async function generateQR() {
    E.qrLoading.classList.remove('hidden');
    E.qrCanvas.classList.add('hidden');
    const liveAt = buildISO(E.dateIn.value, E.timeIn.value);
    const d = await apiFetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            liveAt,
            durationMinutes: +E.absentIn.value,
            earlyWindow: +E.earlyIn.value,
            lateWindow: +E.lateIn.value,
            earlyMsg: E.earlyMsgIn.value,
            onTimeMsg: E.onTimeMsgIn.value,
            lateMsg: E.lateMsgIn.value,
            scanType: E.scanType.value
        })
    });
    bindQR(d);
}

function bindQR(d) {
    currentQR = d.token;
    liveTs = new Date(d.liveAt).getTime();
    expiryTs = new Date(d.expiresAt).getTime();
    thresholds = {
        early: d.earlyWindow * 60000,
        late: d.lateWindow * 60000,
        absent: d.duration * 60000
    };
    E.qrLoading.classList.add('hidden');
    E.qrCanvas.classList.remove('hidden');
    QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
    if (['developer', 'admin', 'category-admin'].includes(role)) {
        E.cancelBtn.classList.remove('hidden');
    }
    startCountdown();
    persistState();
}

E.cancelBtn.onclick = async () => {
    if (!currentQR || !confirm('Cancel this QR?')) return;
    await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
    showToast('success', 'QR cancelled');
    resetGeneratorUI();
};

function startCountdown() {
    clearInterval(timerInterval);
    E.applyBtn.disabled = true;
    timerInterval = setInterval(() => {
        const rem = expiryTs - Date.now();
        if (rem <= 0) return resetGeneratorUI();
        const mm = String(Math.floor(rem / 60000)).padStart(2, '0');
        const ss = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0');
        E.qrTimer.textContent = `Expires in ${mm}:${ss}`;
    }, 1000);
}

function resetGeneratorUI() {
    clearInterval(timerInterval);
    localStorage.removeItem('qrState');
    E.qrCanvas.classList.add('hidden');
    E.qrTimer.textContent = '';
    E.cancelBtn.classList.add('hidden');
    E.applyBtn.disabled = false;
    E.generator.classList.remove('hidden');
}

function persistState() {
    localStorage.setItem('qrState', JSON.stringify({
        token: currentQR, liveTs, expiryTs,
        earlyMs: thresholds.early,
        lateMs: thresholds.late,
        absentMs: thresholds.absent,
        scanType: E.scanType.value
    }));
}

function restoreFromStorage() {
    const s = JSON.parse(localStorage.getItem('qrState') || '{}');
    if (s.token && Date.now() < s.expiryTs) {
        currentQR = s.token; liveTs = s.liveTs; expiryTs = s.expiryTs;
        thresholds = { early: s.earlyMs, late: s.lateMs, absent: s.absentMs };
        E.scanType.value = s.scanType;
        bindQR(s);
    }
}

async function fetchAndStartScanner() {
    try {
        const d = await apiFetch('/api/qr/active');
        E.liveBanner.classList.remove('hidden');
        E.liveBanner.textContent = '✅ Live QR available — please scan!';
        bindQR(d);
        startScanner();
    } catch {
        showToast('error', 'No active QR');
    }
}

async function startScanner() {
    E.scannerLoading.classList.remove('hidden');
    qrScanner = new Html5Qrcode('qr-reader');
    const cfg = { fps: 10, qrbox: calculateQrBox(), experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
    try {
        await qrScanner.start({ facingMode: 'environment' }, cfg, onScanSuccess, onScanError);
    } catch {
        await qrScanner.start({ facingMode: 'user' }, cfg, onScanSuccess, onScanError);
    } finally {
        E.scannerLoading.classList.add('hidden');
    }
}

function calculateQrBox() {
    const w = window.innerWidth * 0.7, h = window.innerHeight * 0.7;
    return Math.floor(Math.min(w, h));
}

function onScanError() {
    const track = qrScanner.getState().stream?.getVideoTracks()[0];
    if (track?.getCapabilities().zoom) {
        const cap = track.getCapabilities().zoom;
        const cur = track.getSettings().zoom || 1;
        const next = Math.min(cap.max, cur + 0.1);
        track.applyConstraints({ advanced: [{ zoom: next }] }).catch(() => { });
    }
}

async function onScanSuccess(token) {
    if (token !== currentQR) {
        showToast('error', 'Invalid QR');
        return;
    }
    await qrScanner.stop();
    handlePunch();
}

async function handlePunch() {
    const now = Date.now();
    const key = `${currentQR}::${E.scanType.value}`;
    if (attendanceCache[key]) {
        return showFeedback(attendanceCache[key]);
    }
    if (E.scanType.value === 'punch-out') {
        await apiFetch('/api/attendance/punch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrToken: currentQR, type: 'punch-out', status: 'punch-out', reason: null })
        });
        showToast('success', 'Punched out');
        return startScanner();
    }
    if (now > expiryTs) {
        await apiFetch('/api/attendance/punch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrToken: currentQR, type: 'punch-in', status: 'absent', reason: null })
        });
        showToast('success', 'Marked absent');
        return startScanner();
    }
    let title, custom, needReason = false;
    if (now < liveTs - thresholds.early) {
        title = 'Early';
        custom = E.earlyMsgIn.value || `Early by ${Math.ceil((liveTs - now) / 60000)}m`;
    } else if (now <= liveTs + thresholds.late) {
        title = 'On Time';
        custom = E.onTimeMsgIn.value || 'On time';
    } else {
        title = 'Late';
        custom = E.lateMsgIn.value || `Late by ${Math.ceil((now - (liveTs + thresholds.late)) / 60000)}m`;
        needReason = true;
    }
    attendanceCache[key] = { title, custom, needReason, punched: false };
    showFeedback(attendanceCache[key]);
}

function showFeedback(rec) {
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    rec.needReason ? E.fbReasonContainer.classList.remove('hidden') : E.fbReasonContainer.classList.add('hidden');
    E.fbCard.classList.remove('hidden');
    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            if (rec.needReason && !E.fbReason.value.trim()) {
                return showToast('error', 'Please supply a reason');
            }
            await apiFetch('/api/attendance/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrToken: currentQR,
                    type: 'punch-in',
                    status: rec.title.toLowerCase().replace(' ', '-'),
                    reason: rec.needReason ? E.fbReason.value.trim() : null
                })
            });
            rec.punched = true;
            showToast('success', `You are ${rec.title}`);
        }
        E.fbCard.classList.add('hidden');
        startScanner();
    };
}

function buildISO(date, time) {
    const [Y, M, D] = date.split('-').map(Number);
    const [h, m, s] = time.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();
}

function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }
