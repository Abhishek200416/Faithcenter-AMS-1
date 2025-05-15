import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const form = document.getElementById('leaveForm');
const todayBtn = document.getElementById('todayBtn');
const tomorrowBtn = document.getElementById('tomorrowBtn');
const tableBody = document.querySelector('#leavesTable tbody');
const requestToSel = document.getElementById('requestTo');
const viewToggle = document.getElementById('viewToggle');
const applySection = document.getElementById('applySection');

let userRole;

/**
 * Show/hide options in the “Request To” dropdown
 */
function adjustRequestToOptions() {
    Array.from(requestToSel.options).forEach(opt => {
        // Category‑Admin may only pick Admin or Developer
        if (userRole === 'category-admin') {
            opt.hidden = !(opt.value === 'admin' || opt.value === 'developer');
        }
        // Everyone else sees all options
        else {
            opt.hidden = false;
        }
    });
}

async function init() {
    // 1️⃣ fetch current user’s role
    const me = await apiFetch('/api/users/me');
    userRole = me.role;

    // 2️⃣ “Manage Team” toggle only for category‑admin
    viewToggle.parentElement.style.display = userRole === 'category-admin' ? '' : 'none';

    // 3️⃣ show Apply form only for category‑admin & regular users
    //    assume any role OTHER than 'admin' or 'developer' is a regular user
    const isApplicant = (userRole === 'category-admin' ||
        (userRole !== 'admin' && userRole !== 'developer'));
    applySection.style.display = isApplicant ? '' : 'none';

    // 4️⃣ filter dropdown and then load leaves
    adjustRequestToOptions();
    loadLeaves();
}

// Today / Tomorrow shortcuts
todayBtn.onclick = () => {
    const d = new Date().toISOString().slice(0, 10);
    form.fromDate.value = d;
    form.toDate.value = d;
};
tomorrowBtn.onclick = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const d = t.toISOString().slice(0, 10);
    form.fromDate.value = d;
    form.toDate.value = d;
};

// Switch between “Myself” and “Team” views
viewToggle.onchange = () => {
    applySection.style.display = viewToggle.value === 'team' ? 'none' : '';
    loadLeaves();
};

// Submit a new leave (only if the form is visible)
form.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
        fromDate: form.fromDate.value,
        toDate: form.toDate.value,
        reason: form.reason.value,
        requestTo: requestToSel.value
    };
    await apiFetch('/api/leaves', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    showToast('success', 'Request submitted');
    form.reset();
    loadLeaves();
});

async function loadLeaves() {
    const mode = viewToggle.value || 'myself';

    // apiFetch already returns parsed JSON, so destruct directly:
    const { leaves } = await apiFetch(`/api/leaves?mode=${mode}`);

    tableBody.innerHTML = '';
    leaves.forEach(l => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
      <td>${l.user?.name || 'You'}</td>
      <td>${new Date(l.fromDate).toLocaleDateString()}</td>
      <td>${new Date(l.toDate).toLocaleDateString()}</td>
      <td>${l.requestTo}</td>
      <td>${l.reason}</td>
      <td>${l.status}</td>
      <td>${l.note || ''}</td>
      <td>${
        (l.status === 'pending'
         && userRole === 'category-admin'
         && mode === 'team')
          ? `<button data-id="${l.id}" class="approve">✔</button>
             <button data-id="${l.id}" class="reject">✖</button>`
          : ''
      }</td>
    `;
    tableBody.appendChild(tr);
  });

  // Wire up approve/reject only for Category‑Admin in team mode
  if (userRole === 'category-admin' && viewToggle.value === 'team') {
    tableBody.querySelectorAll('.approve').forEach(btn => {
      btn.onclick = () => updateStatus(btn.dataset.id, 'approved');
    });
    tableBody.querySelectorAll('.reject').forEach(btn => {
      btn.onclick = () => updateStatus(btn.dataset.id, 'rejected');
    });
  }
}

async function updateStatus(id, status) {
  const note = prompt('Enter a note (optional):', '') || '';
  await apiFetch(`/api/leaves/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify({ status, note })
  });
  showToast('success', `Marked ${status}`);
  loadLeaves();
}

// kick things off
init();
document.addEventListener('DOMContentLoaded', () => {
    // 1) Create the overlay element
    const overlay = document.createElement('div');
    overlay.id = 'underDevOverlay';
    Object.assign(overlay.style, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      width:           '100vw',
      height:          '100vh',
      background:      'rgba(0, 0, 0, 0.85)',
      color:           '#fff',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontSize:        '2rem',
      textAlign:       'center',
      zIndex:          '9999',
      cursor:          'default'
    });
    overlay.textContent = '🚧 This feature is under development 🚧';
  
    // 2) Hide the main UI
    const main = document.querySelector('main');
    if (main) main.style.display = 'none';
  
    // 3) Add the overlay to the page
    document.body.appendChild(overlay);
  
    // 4) After 3 seconds, redirect to dashboard.html
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 2000);
  });