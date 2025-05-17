// frontend/js/manageUsers.js

import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const container = document.getElementById('usersContainer');
const filterInput = document.getElementById('filterInput');
const categoryFilter = document.getElementById('categoryFilter');
const addBtn = document.getElementById('addUserBtn');
const modal = document.getElementById('userModal');
const dialog = modal.querySelector('.modal-dialog');
const form = document.getElementById('userForm');
const cancelBtn = document.getElementById('cancelBtn');
const titleEl = document.getElementById('modalTitle');
const catSelect = document.getElementById('f-category');
const roleSelect = document.getElementById('f-role');
const nameInput = document.getElementById('f-name');
const emailInput = document.getElementById('f-email');
const usernameInput = document.getElementById('f-username');
const phoneInput = document.getElementById('f-phone');
const ageInput = document.getElementById('f-age');
const userCountEl = document.getElementById('userCount');
const clearBtn = document.querySelector('.search-wrapper .clear-btn');

const confirmModal = document.getElementById('confirmModal');
const confirmMsg = document.getElementById('confirmMessage');
const yesBtn = document.getElementById('confirmYes');
const noBtn = document.getElementById('confirmNo');

let allUsers = [];
let myRole = '';
let myId = '';
let myCategory = '';
let editId = null;

const ROLE_LABELS = {
    developer: 'Developer',
    admin: 'Admin',
    'category-admin': 'Head',
    usher: 'Member'
};

// —————————————————————————————————————
// Helpers
// —————————————————————————————————————

// Sanitize to lowercase a–z & 0–9 only
function sanitizeUsername(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// Custom confirmation dialog
function openConfirm(msg) {
    return new Promise(res => {
        confirmMsg.textContent = msg;
        confirmModal.classList.add('active');
        const cleanup = () => {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            confirmModal.classList.remove('active');
        };
        const onYes = () => {
            cleanup();
            res(true);
        };
        const onNo = () => {
            cleanup();
            res(false);
        };
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// —————————————————————————————————————
// 1) Determine Current User & UI Permissions
// —————————————————————————————————————
async function loadMe() {
    try {
        const { user } = await apiFetch('/api/users/me');
        myRole = user.role;
        myId = user.id;
        myCategory = user.categoryType || '';

        // Show/hide Add button
        addBtn.style.display = ['developer', 'admin', 'category-admin']
            .includes(myRole) ? '' : 'none';

        // Only dev/admin see the global filter
        categoryFilter.parentElement.style.display = ['developer', 'admin'].includes(myRole) ? '' : 'none';

    } catch {
        addBtn.style.display = 'none';
        categoryFilter.parentElement.style.display = 'none';
    }
}

// —————————————————————————————————————
// 2) Role‐assignment Options
// —————————————————————————————————————
function updateRoleOptions() {
    roleSelect.innerHTML = `<option value="" disabled selected hidden>Role</option>`;
    let allowed = [];
    if (myRole === 'developer') allowed = ['developer', 'admin', 'category-admin', 'usher'];
    else if (myRole === 'admin') allowed = ['category-admin', 'usher'];
    else if (myRole === 'category-admin') allowed = ['usher'];

    allowed.forEach(r => {
        roleSelect.append(new Option(ROLE_LABELS[r], r));
    });
    roleSelect.disabled = !allowed.length;
}

// —————————————————————————————————————
// 3) Load & Filter Users
// —————————————————————————————————————
async function loadUsers() {
    try {
        const { users } = await apiFetch('/api/users');

        let visible = [];
        if (myRole === 'developer') visible = users;
        else if (myRole === 'admin')
            visible = users.filter(u => ['category-admin', 'usher'].includes(u.role));
        else if (myRole === 'category-admin')
            visible = users.filter(u => u.role === 'usher' && u.categoryType === myCategory);
        else visible = [];

        allUsers = visible;
        applyFilters();

    } catch (err) {
        showToast('error',
            err.message.includes('Forbidden') ?
            'You are not allowed to view these users.' :
            'Unable to load users.'
        );
        container.innerHTML = '<div class="no-users">Unable to load users.</div>';
    }
}

// —————————————————————————————————————
// 4) Apply Search & Category Filters
// —————————————————————————————————————
function applyFilters() {
    const text = filterInput.value.trim().toLowerCase();
    clearBtn.style.display = text ? 'block' : 'none';
    const cat = categoryFilter.value;

    let filtered = allUsers.filter(u => {
        const matchText = !text ||
            u.name.toLowerCase().includes(text) ||
            u.email.toLowerCase().includes(text);
        const matchCat = !cat || u.categoryType === cat;
        return matchText && matchCat;
    });

    // **Sort alphabetically by name**
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    renderCards(filtered);
}

// —————————————————————————————————————
// 5) Render User Cards (Alphabetical Detail Order)
// —————————————————————————————————————
function renderCards(list) {
    userCountEl.textContent = list.length;
    container.innerHTML = '';

    if (!list.length) {
        container.innerHTML = '<div class="no-users">No users to display.</div>';
        return;
    }

    list.forEach(u => {
                const card = document.createElement('div');
                card.className = 'user-card';
                card.innerHTML = `
      <div class="user-card-header">
        <h3>${u.name}</h3>
        <div class="badges">
          <span class="badge">${ROLE_LABELS[u.role]||u.role}</span>
          ${u.categoryType
            ? `<span class="badge badge-cat">${u.categoryType}</span>`
            : ''}
        </div>
      </div>
      <div class="user-card-detail">
        <!-- Fields in TRUE ALPHABETICAL order: Age, Email, Gender, Phone, UID, Username -->
        <p><strong>Age:</strong> ${u.age ?? '—'}</p>
        <p><strong>Email:</strong> ${u.email}</p>
        <p><strong>Gender:</strong> ${u.gender}</p>
        <p><strong>Phone:</strong> ${u.phone || '—'}</p>
        <p><strong>UID:</strong> ${u.uid}</p>
        <p><strong>Username:</strong> ${u.username}</p>
        <div class="actions">
          <button class="btn edit-btn">Edit</button>
          <button class="btn delete-btn">Delete</button>
        </div>
      </div>
    `;
    card.querySelector('.edit-btn').onclick   = () => editUser(u.id);
    card.querySelector('.delete-btn').onclick = async e => {
      e.stopPropagation();
      if (await openConfirm(`Delete ${u.name}?`)) {
        try {
          await apiFetch(`/api/users/${u.id}`, { method:'DELETE' });
          showToast('success','User deleted');
          loadUsers();
        } catch (err) {
          showToast('error', err.message);
        }
      }
    };
    container.append(card);
  });
}

// —————————————————————————————————————
// 6) Search/Clear Listeners
// —————————————————————————————————————
filterInput.addEventListener('input', applyFilters);
categoryFilter.addEventListener('change', applyFilters);
clearBtn.addEventListener('click', () => {
  filterInput.value = '';
  filterInput.dispatchEvent(new Event('input'));
  filterInput.focus();
});

// —————————————————————————————————————
// 7) Open “Add User” Modal
// —————————————————————————————————————
addBtn.addEventListener('click', () => {
  editId = null;
  form.reset();
  titleEl.textContent = 'Add User';

  // Lock category for heads
  if (myRole === 'category-admin') {
    catSelect.value    = myCategory;
    catSelect.disabled = true;
  } else {
    catSelect.disabled = false;
  }

  updateRoleOptions();
  openModal();
});

// —————————————————————————————————————
// 8) Open “Edit User” Modal
// —————————————————————————————————————
async function editUser(id) {
  try {
    const { user } = await apiFetch(`/api/users/${id}`);
    editId = id;

    nameInput.value     = user.name;
    emailInput.value    = user.email;
    usernameInput.value = '';  // blank → backend will default if unchanged
    phoneInput.value    = user.phone || '';
    ageInput.value      = user.age   || '';
    form.gender.value   = user.gender;
    catSelect.value     = user.categoryType || '';
    catSelect.disabled  = (myRole === 'category-admin');

    updateRoleOptions();
    form.role.value = user.role;
    titleEl.textContent = 'Edit User';
    openModal();

  } catch {
    showToast('error','Unable to load user');
  }
}

// —————————————————————————————————————
// 9) Category → Role Dependency
// —————————————————————————————————————
catSelect.addEventListener('change', updateRoleOptions);

// —————————————————————————————————————
// 10) Modal Open/Close
// —————————————————————————————————————
function openModal() {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden','false');
  dialog.focus();
}
function closeModal() {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden','true');
}
cancelBtn.addEventListener('click', closeModal);
modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

// —————————————————————————————————————
// 11) Input Sanitizers & Validators
// —————————————————————————————————————
// allow letters, spaces (\s) and dots (.)
nameInput.addEventListener('input', () => {
  nameInput.value = nameInput.value.replace(/[^A-Za-z\s.]/g, '');
});

phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g,'').slice(0,10);
});
ageInput.addEventListener('input',   () => {
  ageInput.value = ageInput.value.replace(/\D/g,'').slice(0,3);
});
usernameInput.addEventListener('input', () => {
  usernameInput.value = sanitizeUsername(usernameInput.value);
});

// —————————————————————————————————————
// 12) Submit (Create or Update)
// —————————————————————————————————————
form.addEventListener('submit', async e => {
  e.preventDefault();

  const name     = nameInput.value.trim();
  const email    = emailInput.value.trim();
  const phone    = phoneInput.value.trim();
  const age      = ageInput.value.trim();
  const rawUser  = usernameInput.value.trim();

  if (!/^[A-Za-z]+$/.test(name))
    return showToast('error','Name may only contain letters, spaces, and dots');
  if (phone && !/^\d{10}$/.test(phone))
    return showToast('error','Phone must be 10 digits');
  if (age && !/^\d+$/.test(age))
    return showToast('error','Age must be numeric');

  // Build payload
  const payload = {
    name,
    email,
    phone: phone || null,
    age:   age   ? Number(age) : null,
    gender: form.gender.value,
    categoryType: catSelect.value.replace(/-head$/,''),
    role: form.role.value
  };

  // Optional username
  if (rawUser) {
    if (!/^[a-z0-9]+$/.test(rawUser)) {
      return showToast('error','Username must be lowercase letters & digits only');
    }
    payload.username = rawUser;
  }

  const url    = editId ? `/api/users/${editId}` : '/api/users';
  const method = editId ? 'PUT' : 'POST';

  try {
    showToast('success', editId ? 'Updating…' : 'Creating…', true);
    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showToast('success', editId ? 'User updated' : 'User created');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast('error', err.message);
  }
});

// —————————————————————————————————————
// 13) Initialize
// —————————————————————————————————————
(async function init() {
  closeModal();
  await loadMe();
  await loadUsers();
})();