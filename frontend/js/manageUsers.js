// js/manageUsers.js

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
const phoneInput = document.getElementById('f-phone');
const ageInput = document.getElementById('f-age');
const usernameInput = document.getElementById('f-username'); // ← new
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

// ────────────────────────────────────────────────
// custom confirm dialog
// ────────────────────────────────────────────────
function openConfirm(msg) {
    return new Promise(res => {
        confirmMsg.textContent = msg;
        confirmModal.classList.add('active');
        const cleanup = () => {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            confirmModal.classList.remove('active');
        };
        const onYes = () => { cleanup();
            res(true); };
        const onNo = () => { cleanup();
            res(false); };
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// ────────────────────────────────────────────────
// 1) who am I?
// ────────────────────────────────────────────────
async function loadMe() {
    try {
        const { user } = await apiFetch('/api/users/me');
        myRole = user.role;
        myId = user.id;
        myCategory = user.categoryType || '';

        addBtn.style.display = ['developer', 'admin', 'category-admin'].includes(myRole) ? '' : 'none';
        categoryFilter.parentElement.style.display = ['developer', 'admin'].includes(myRole) ? '' : 'none';
    } catch {
        addBtn.style.display = 'none';
        categoryFilter.parentElement.style.display = 'none';
    }
}

// ────────────────────────────────────────────────
// 2) which roles can I assign?
// ────────────────────────────────────────────────
function updateRoleOptions() {
    roleSelect.innerHTML = `<option value="" disabled selected hidden>Role</option>`;
    let allowed = [];
    if (myRole === 'developer') allowed = ['developer', 'admin', 'category-admin', 'usher'];
    else if (myRole === 'admin') allowed = ['category-admin', 'usher'];
    else if (myRole === 'category-admin') allowed = ['usher'];
    allowed.forEach(r => roleSelect.append(new Option(ROLE_LABELS[r], r)));
    roleSelect.disabled = !allowed.length;
}

// ────────────────────────────────────────────────
// 3) load all users
// ────────────────────────────────────────────────
async function loadUsers() {
    try {
        const { users } = await apiFetch('/api/users');
        let visible;
        if (myRole === 'developer') visible = users;
        else if (myRole === 'admin') visible = users.filter(u => ['category-admin', 'usher'].includes(u.role));
        else if (myRole === 'category-admin') visible = users.filter(u => u.role === 'usher' && u.categoryType === myCategory);
        else visible = [];
        allUsers = visible;
        applyFilters();
    } catch (err) {
        showToast('error', err.message.includes('Forbidden') ?
            'You are not allowed to view these users.' :
            'Unable to load users.');
        container.innerHTML = '<div class="no-users">Unable to load users.</div>';
    }
}

// ────────────────────────────────────────────────
// 4) render cards
// ────────────────────────────────────────────────
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
            ? `<span class="badge badge-cat">${u.categoryType.replace(/-head/,'')}</span>`
            : ''}
        </div>
      </div>
      <div class="user-card-detail">
        <p><strong>Username:</strong> ${u.username}</p>
        <p><strong>UID:</strong> ${u.uid}</p>
        <p><strong>Email:</strong> ${u.email}</p>
        <p><strong>Phone:</strong> ${u.phone||'—'}</p>
        <p><strong>Age:</strong> ${u.age||'—'}</p>
        <p><strong>Gender:</strong> ${u.gender}</p>
        <div class="actions">
          <button class="btn edit-btn">Edit</button>
          <button class="btn delete-btn">Delete</button>
        </div>
      </div>`;
    card.addEventListener('click', e=>{
      if (!e.target.closest('.edit-btn,.delete-btn')) card.classList.toggle('expanded');
    });
    card.querySelector('.edit-btn').onclick = () => editUser(u.id);
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

// ────────────────────────────────────────────────
// 5) filtering
// ────────────────────────────────────────────────
function applyFilters() {
  const txt = filterInput.value.trim().toLowerCase();
  clearBtn.style.display = txt ? 'block' : 'none';
  const cat = categoryFilter.value;
  const filtered = allUsers.filter(u=>{
    const mTxt = !txt || u.name.toLowerCase().includes(txt) || u.email.toLowerCase().includes(txt);
    const mCat = !cat || u.categoryType===cat;
    return mTxt && mCat;
  });
  renderCards(filtered);
}

// ────────────────────────────────────────────────
// 6) listeners for filters
// ────────────────────────────────────────────────
filterInput.addEventListener('input', applyFilters);
categoryFilter.addEventListener('change', applyFilters);
clearBtn.addEventListener('click', ()=>{
  filterInput.value='';
  filterInput.dispatchEvent(new Event('input'));
  filterInput.focus();
});

// ────────────────────────────────────────────────
// 7) Add User
// ────────────────────────────────────────────────
addBtn.addEventListener('click', ()=>{
  editId = null;
  form.reset();
  titleEl.textContent = 'Add User';
  usernameInput.value = '';         // clear optional username
  if (myRole==='category-admin') {
    catSelect.value    = myCategory;
    catSelect.disabled = true;
    roleSelect.value   = 'usher';
    roleSelect.disabled= true;
  } else {
    catSelect.value    = '';
    catSelect.disabled = false;
    updateRoleOptions();
  }
  openModal();
});

// ────────────────────────────────────────────────
// 8) Edit User
// ────────────────────────────────────────────────
async function editUser(id) {
  try {
    const { user } = await apiFetch(`/api/users/${id}`);
    editId = id;
    nameInput.value     = user.name;
    emailInput.value    = user.email;
    phoneInput.value    = user.phone || '';
    ageInput.value      = user.age   || '';
    form.gender.value   = user.gender;
    catSelect.value     = user.categoryType || '';
    usernameInput.value = user.username;      // show current username
    catSelect.disabled  = (myRole==='category-admin');
    updateRoleOptions();
    form.role.value     = user.role;
    titleEl.textContent = 'Edit User';
    openModal();
  } catch {
    showToast('error','Unable to load user');
  }
}

// ────────────────────────────────────────────────
// 9) Category → Role
// ────────────────────────────────────────────────
catSelect.addEventListener('change', updateRoleOptions);

// ────────────────────────────────────────────────
// 10) Modal open/close
// ────────────────────────────────────────────────
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

// ────────────────────────────────────────────────
// 11) Input sanitizers
// ────────────────────────────────────────────────
// Allow letters, space, dot, hyphen, apostrophe
nameInput.addEventListener('input', ()=>{
  nameInput.value = nameInput.value.replace(/[^A-Za-z\s\.\-']/g,'');
});
phoneInput.addEventListener('input', ()=>{
  phoneInput.value = phoneInput.value.replace(/\D/g,'').slice(0,10);
});
ageInput.addEventListener('input', ()=>{
  ageInput.value = ageInput.value.replace(/\D/g,'').slice(0,3);
});

// ────────────────────────────────────────────────
// 12) Submit (create or update)
// ────────────────────────────────────────────────
form.addEventListener('submit', async e=>{
  e.preventDefault();
  const name  = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const age   = ageInput.value.trim();
  const username = usernameInput.value.trim();

  if (!name) return showToast('error','Name is required');
  if (!email) return showToast('error','Email is required');
  if (phone && phone.length !== 10) return showToast('error','Phone must be 10 digits');
  if (age && isNaN(Number(age)))  return showToast('error','Age must be numeric');

  const cleanCategory = catSelect.value.replace(/-head$/,'');
  const payload = {
    name,
    email,
    phone: phone||null,
    age: age ? Number(age) : null,
    gender: form.gender.value,
    categoryType: cleanCategory,
    role: roleSelect.value,
    // only send username if non-empty; backend will auto-generate otherwise
    ...(username && { username })
  };

  const url    = editId ? `/api/users/${editId}` : '/api/users';
  const method = editId ? 'PUT' : 'POST';

  try {
    showToast('success', editId ? 'Updating…' : 'Creating…', true);
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    showToast('success', editId ? 'User updated' : 'User created');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast('error', err.message);
  }
});

// ────────────────────────────────────────────────
// 13) Initialize
// ────────────────────────────────────────────────
(async function(){
  closeModal();
  await loadMe();
  await loadUsers();
})();