// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const E = {
    // CONFIG inputs
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),
    scanType: document.getElementById('scanType'),

    // CONTROLS
    applyBtn: document.getElementById('applyBtn'),
    cancelQRBtn: document.getElementById('cancelQRBtn'),
    presetSel: document.getElementById('presetSelect'),
    savePreset: document.getElementById('savePresetBtn'),

    // PANELS
    generator: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    scannerSection: document.getElementById('scannerSection'),
    root: document.getElementById('app-root'),
    liveBanner: document.getElementById('qrLiveBanner'),

    // QR DISPLAY
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    scannerLoading: document.getElementById('scannerLoading'),

    // FEEDBACK
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),

    // CAMERA OVERLAY
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

// —————————————————————————————————————————
// Bootstrap
// —————————————————————————————————————————
(async function init() {
    E.root.classList.remove('hidden');
    hide(E.cancelQRBtn);

    try {
        const me = await apiFetch('/api/users/me');
        userId = me.id;
        role = me.role;
        userCategory = me.categoryType;

        // Member / usher scan mode
        if (['member', 'usher'].includes(role) || MODE === 'scan') {
            return enterScannerMode();
        }

        // Admin/dev generator mode
        enterGeneratorMode();
        await loadPresets();
        restoreFromStorage();
    } catch (err) {
        console.error(err);
        showToast('error', 'Initialization failed');
    }
})();

// —————————————————————————————————————————
// Mode Switchers
// —————————————————————————————————————————
function enterGeneratorMode() {
    show(E.generator);
    show(E.qrOutput);
    hide(E.scannerSection);
    hide(E.liveBanner);
}

function enterScannerMode() {
    hide(E.generator);
    hide(E.qrOutput);
    show(E.scannerSection);
    hide(E.liveBanner);
    promptCameraPermission();
}

// —————————————————————————————————————————
// Presets
// —————————————————————————————————————————
async function loadPresets() {
    E.presetSel.innerHTML = '<option value="">— Load Preset —</option>';
    try {
        const presets = await apiFetch('/api/presets');
        presets.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            E.presetSel.append(o);
        });
    } catch {
        showToast('error', 'Could not load presets');
    }

    E.presetSel.onchange = async () => {
        if (!E.presetSel.value) return;
        try {
            const p = await apiFetch(`/api/presets/${E.presetSel.value}`);
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
    };
}

// —————————————————————————————————————————
// Camera Permission + PWA prompt
// —————————————————————————————————————————
function promptCameraPermission() {
    if (!E.cameraOverlay) {
        fetchAndStartScanner();
        return;
    }
    show(E.cameraOverlay);
    E.cameraOkBtn.onclick = async () => {
        hide(E.cameraOverlay);
        await fetchAndStartScanner();
        await promptInstall();
    };
}

async function promptInstall() {
    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
    });
    if (!deferred) return;
    if (confirm('📥 Add the scanner to your home screen for quick access?')) {
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
    }
}

// —————————————————————————————————————————
// Generate QR
// —————————————————————————————————————————
E.applyBtn.onclick = generateQR;

async function generateQR() {
    show(E.qrLoading);
    hide(E.qrCanvas);

    const liveAtISO = buildISO(E.dateIn.value, E.timeIn.value);
    try {
        const body = {
            liveAt: liveAtISO,
            durationMinutes: +E.absentIn.value,
            earlyWindow: +E.earlyIn.value,
            lateWindow: +E.lateIn.value,
            earlyMsg: E.earlyMsgIn.value,
            onTimeMsg: E.onTimeMsgIn.value,
            lateMsg: E.lateMsgIn.value,
            scanType: E.scanType.value,
        };
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        bindQR(data);
    } catch (err) {
        console.error(err);
        showToast('error', 'QR generation failed');
    }
}

// —————————————————————————————————————————
// Bind QR + Timer
// —————————————————————————————————————————
function bindQR(d) {
    currentQR = d.token;
    liveTs = new Date(d.liveAt).getTime();
    expiryTs = new Date(d.expiresAt).getTime();
    thresholds = {
        early: d.earlyWindow * 60000,
        late: d.lateWindow * 60000,
        absent: d.duration * 60000,
    };

    hide(E.qrLoading);
    show(E.qrCanvas);
    QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });

    if (['developer', 'admin', 'category-admin'].includes(role)) {
        show(E.cancelQRBtn);
    }

    startCountdown();
    persistState();
}

// —————————————————————————————————————————
// Cancel QR
// —————————————————————————————————————————
E.cancelQRBtn.onclick = async () => {
    if (!currentQR || !confirm('Cancel this QR?')) return;
    try {
        await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
        showToast('success', 'QR cancelled');
        resetGeneratorUI();
    } catch {
        showToast('error', 'Failed to cancel');
    }
};

// —————————————————————————————————————————
// Countdown Timer
// —————————————————————————————————————————
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
    hide(E.qrCanvas);
    E.qrTimer.textContent = '';
    hide(E.cancelQRBtn);
    E.applyBtn.disabled = false;
    show(E.generator);
}

// —————————————————————————————————————————
// Persist & Restore
// —————————————————————————————————————————
function persistState() {
    localStorage.setItem(
        'qrState',
        JSON.stringify({
            token: currentQR,
            liveTs,
            expiryTs,
            earlyMs: thresholds.early,
            lateMs: thresholds.late,
            absentMs: thresholds.absent,
            scanType: E.scanType.value,
        })
    );
}

function restoreFromStorage() {
    const s = JSON.parse(localStorage.getItem('qrState') || '{}');
    if (s.token && Date.now() < s.expiryTs) {
        currentQR = s.token;
        liveTs = s.liveTs;
        expiryTs = s.expiryTs;
        thresholds = { early: s.earlyMs, late: s.lateMs, absent: s.absentMs };
        E.scanType.value = s.scanType;
        bindQR(s);
    }
}

// —————————————————————————————————————————
// Scanner Startup
// —————————————————————————————————————————
async function fetchAndStartScanner() {
    try {
        const data = await apiFetch('/api/qr/active');
        show(E.liveBanner);
        E.liveBanner.textContent =
            '✅ A live QR code is available — please scan!';
        bindQR(data);
        startScanner();
    } catch {
        showToast('error', 'No active QR');
    }
}

async function startScanner() {
    show(E.scannerLoading);
    qrScanner = new Html5Qrcode('qr-reader');

    const config = {
        fps: 10,
        qrbox: calculateQrBox(),
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    try {
        await qrScanner.start(
            { facingMode: 'environment' },
            config,
            onScanSuccess,
            onScanError
        );
    } catch (e) {
        console.warn('Fallback to user camera', e);
        await qrScanner.start(
            { facingMode: 'user' },
            config,
            onScanSuccess,
            onScanError
        );
    } finally {
        hide(E.scannerLoading);
    }
}

function calculateQrBox() {
    const w = window.innerWidth * 0.7;
    const h = window.innerHeight * 0.7;
    return Math.floor(Math.min(w, h));
}

// Auto-zoom on scan errors
function onScanError(_err) {
    const track = qrScanner.getState().stream
        ?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities();
    if (!caps.zoom) return;
    const settings = track.getSettings();
    const nextZoom = Math.min(caps.max, (settings.zoom || 1) + 0.1);
    track
        .applyConstraints({ advanced: [{ zoom: nextZoom }] })
        .catch(() => { });
}

async function onScanSuccess(token) {
    if (token !== currentQR) {
        showToast('error', 'Invalid QR');
        return;
    }
    qrScanner.stop();

    if (userId === qrIssuerId) {
        showToast('error', 'Cannot scan your own QR');
        return startScanner();
    }
    if (userCategory && qrCategory !== userCategory) {
        showToast('error', 'Wrong category');
        return startScanner();
    }

    handlePunch();
}

// —————————————————————————————————————————
// Punch logic & feedback
// —————————————————————————————————————————
async function handlePunch() {
    const now = Date.now();
    const key = `${currentQR}::${E.scanType.value}`;

    if (attendanceCache[key]) {
        return showFeedback(attendanceCache[key], key);
    }

    // auto-absent on expiry
    if (now > expiryTs) {
        await apiFetch('/api/attendance/punch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                qrToken: currentQR,
                type: E.scanType.value,
                status: 'absent',
                reason: null,
            }),
        });
        showToast('success', 'Marked absent');
        return startScanner();
    }

    // classify
    let title, msg, needReason = false;
    if (now < liveTs - thresholds.early) {
        title = 'Early';
        msg =
            E.earlyMsgIn.value ||
            `Early by ${Math.ceil((liveTs - now) / 60000)}m`;
    } else if (now <= liveTs + thresholds.late) {
        title = 'On Time';
        msg = E.onTimeMsgIn.value || 'On time';
    } else {
        title = 'Late';
        msg =
            E.lateMsgIn.value ||
            `Late by ${Math.ceil((now - (liveTs + thresholds.late)) / 60000)}m`;
        needReason = true;
    }

    attendanceCache[key] = {
        title,
        msg,
        needReason,
        punched: false,
    };
    showFeedback(attendanceCache[key], key);
}

function showFeedback(rec, key) {
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.msg;
    rec.needReason
        ? show(E.fbReasonContainer)
        : hide(E.fbReasonContainer);
    show(E.fbCard);

    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            const reason = rec.needReason ? E.fbReason.value.trim() : null;
            if (rec.needReason && !reason) {
                showToast('error', 'Please supply a reason');
                return;
            }
            await apiFetch('/api/attendance/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrToken: currentQR,
                    type: E.scanType.value,
                    status: rec.title.toLowerCase().replace(' ', '-'),
                    reason,
                }),
            });
            showToast('success', `You are ${rec.title}`);
            rec.punched = true;
        }
        hide(E.fbCard);
        startScanner();
    };
}

// —————————————————————————————————————————
// Helpers
// —————————————————————————————————————————
function buildISO(date, time) {
    const [Y, M, D] = date.split('-').map(Number);
    const [h, m, s] = time.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();
}

function show(el) {
    if (el) el.classList.remove('hidden');
}
function hide(el) {
    if (el) el.classList.add('hidden');
}
