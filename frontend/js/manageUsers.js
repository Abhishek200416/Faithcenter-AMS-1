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

// ————————————————————————————————————————
// Helpers
// ————————————————————————————————————————

function sanitizeUsername(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function openConfirm(msg) {
    return new Promise(res => {
        confirmMsg.textContent = msg;
        confirmModal.classList.add('active');

        function onYes() { cleanup();
            res(true); }

        function onNo() { cleanup();
            res(false); }

        function cleanup() {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            confirmModal.classList.remove('active');
        }

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// ————————————————————————————————————————
// 1) Get current user + permissions
// ————————————————————————————————————————

async function loadMe() {
    try {
        const { user } = await apiFetch('/api/users/me');
        myRole = user.role;
        myId = user.id;
        myCategory = user.categoryType || '';

        // show/hide Add button
        addBtn.style.display = ['developer', 'admin', 'category-admin'].includes(myRole) ?
            '' : 'none';

        // show/hide global category filter
        categoryFilter.parentElement.style.display = ['developer', 'admin'].includes(myRole) ? '' : 'none';
    } catch {
        addBtn.style.display = 'none';
        categoryFilter.parentElement.style.display = 'none';
    }
}

// ————————————————————————————————————————
// 2) Populate Role dropdown based on your role
// ————————————————————————————————————————

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

// ————————————————————————————————————————
// 3) Fetch & filter users
// ————————————————————————————————————————

async function loadUsers() {
    try {
        const { users } = await apiFetch('/api/users');
        let visible = [];

        if (myRole === 'developer') visible = users;
        else if (myRole === 'admin') visible = users.filter(u => ['category-admin', 'usher'].includes(u.role));
        else if (myRole === 'category-admin')
            visible = users.filter(u =>
                u.role === 'usher' && u.categoryType === myCategory);
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

// ————————————————————————————————————————
// 4) Search & category filters + alphabetical sort
// ————————————————————————————————————————

function applyFilters() {
    const text = filterInput.value.trim().toLowerCase();
    clearBtn.style.display = text ? 'block' : 'none';
    const cat = categoryFilter.value;

    const filtered = allUsers
        .filter(u => {
            const matchText = !text ||
                u.name.toLowerCase().includes(text) ||
                u.email.toLowerCase().includes(text);
            const matchCat = !cat || u.categoryType === cat;
            return matchText && matchCat;
        })
        .sort((a, b) => a.name.localeCompare(b.name)); // alphabetical

    renderCards(filtered);
}

// ————————————————————————————————————————
// 5) Render each card + expand on click
// ————————————————————————————————————————

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

    // expand/collapse on any click outside the buttons
    card.addEventListener('click', e => {
      if (!e.target.closest('.edit-btn, .delete-btn')) {
        card.classList.toggle('expanded');
      }
    });

    // Edit
    card.querySelector('.edit-btn').onclick = () => editUser(u.id);

    // Delete
    card.querySelector('.delete-btn').onclick = async e => {
      e.stopPropagation();
      if (await openConfirm(`Delete ${u.name}?`)) {
        try {
          await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
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

// ————————————————————————————————————————
// 6) Filter input listeners
// ————————————————————————————————————————

filterInput.addEventListener('input',   applyFilters);
categoryFilter.addEventListener('change',applyFilters);
clearBtn.addEventListener('click', () => {
  filterInput.value = '';
  filterInput.dispatchEvent(new Event('input'));
  filterInput.focus();
});

// ————————————————————————————————————————
// 7) “Add User” modal
// ————————————————————————————————————————

addBtn.addEventListener('click', () => {
  editId = null;
  form.reset();
  titleEl.textContent = 'Add User';

  if (myRole === 'category-admin') {
    catSelect.value    = myCategory;
    catSelect.disabled = true;
  } else {
    catSelect.disabled = false;
  }

  updateRoleOptions();
  openModal();
});

// ————————————————————————————————————————
// 8) “Edit User” modal
// ————————————————————————————————————————

async function editUser(id) {
  try {
    const { user } = await apiFetch(`/api/users/${id}`);
    editId = id;

    nameInput.value     = user.name;
    emailInput.value    = user.email;
    usernameInput.value = '';              // backend will keep existing if blank
    phoneInput.value    = user.phone || '';
    ageInput.value      = user.age   || '';
    form.gender.value   = user.gender;
    catSelect.value     = user.categoryType||'';
    catSelect.disabled  = (myRole === 'category-admin');

    updateRoleOptions();
    form.role.value     = user.role;
    titleEl.textContent = 'Edit User';
    openModal();
  } catch {
    showToast('error','Unable to load user');
  }
}

// ————————————————————————————————————————
// 9) Category→Role dependency
// ————————————————————————————————————————

catSelect.addEventListener('change', updateRoleOptions);

// ————————————————————————————————————————
// 10) Modal open/close
// ————————————————————————————————————————

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

// ————————————————————————————————————————
// 11) Input sanitizers & validators
// ————————————————————————————————————————

nameInput.addEventListener('input', () => {
  // allow letters, spaces & dots
  nameInput.value = nameInput.value.replace(/[^A-Za-z\s.]/g,'');
});
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g,'').slice(0,10);
});
ageInput.addEventListener('input', () => {
  ageInput.value = ageInput.value.replace(/\D/g,'').slice(0,3);
});
usernameInput.addEventListener('input', () => {
  usernameInput.value = sanitizeUsername(usernameInput.value);
});

// ————————————————————————————————————————
// 12) Submit form (create/update)
// ————————————————————————————————————————

form.addEventListener('submit', async e => {
  e.preventDefault();

  const name   = nameInput.value.trim();
  const email  = emailInput.value.trim();
  const phone  = phoneInput.value.trim();
  const age    = ageInput.value.trim();
  const rawUser= usernameInput.value.trim();

  if (!/^[A-Za-z.\s]+$/.test(name)) {
    return showToast('error','Name may only contain letters, spaces, and dots');
  }
  if (phone && !/^\d{10}$/.test(phone)) {
    return showToast('error','Phone must be 10 digits');
  }
  if (age && !/^\d+$/.test(age)) {
    return showToast('error','Age must be numeric');
  }

  const payload = {
    name,
    email,
    phone: phone||null,
    age:    age? Number(age):null,
    gender: form.gender.value,
    categoryType: catSelect.value.replace(/-head$/,''),
    role: form.role.value
  };

  if (rawUser) {
    if (!/^[a-z0-9]+$/.test(rawUser)) {
      return showToast('error','Username must be lowercase letters & digits only');
    }
    payload.username = rawUser;
  }

  const url    = editId ? `/api/users/${editId}` : '/api/users';
  const method = editId ? 'PUT' : 'POST';

  try {
    showToast('success', editId? 'Updating…':'Creating…', true);
    await apiFetch(url, {
      method,
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    showToast('success', editId? 'User updated':'User created');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast('error', err.message);
  }
});

// ————————————————————————————————————————
// 13) Initialize everything
// ————————————————————————————————————————

(async function init() {
  closeModal();
  await loadMe();
  await loadUsers();
})();