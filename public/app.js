'use strict';

const state = { books: [], customers: [], transactions: [], editingStaffId: null };
const search = { books: '', customers: '' };
const prevStats = {};
let pendingCoverDataUrl = null;

const SPINE_COLORS = ['#BFA05A', '#C07158', '#5E8C74', '#7C93B8', '#9B84AC', '#C6975E'];
function spineColorFor(id, title) {
  const str = `${id}:${title}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

/* -------------------- cover upload -------------------- */
const coverInput = document.getElementById('cover-input');
const coverPreview = document.getElementById('cover-preview');
const coverPreviewImg = document.getElementById('cover-preview-img');
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2MB

const UNSUPPORTED_TYPES = ['image/heic', 'image/heif'];

coverInput.addEventListener('change', () => {
  const file = coverInput.files[0];
  const errorEl = document.getElementById('error-book');
  errorEl.textContent = '';
  if (!file) return;

  if (file.size > MAX_COVER_BYTES) {
    errorEl.textContent = 'Cover image is too large (max 2MB).';
    coverInput.value = '';
    return;
  }

  if (UNSUPPORTED_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    errorEl.textContent = 'HEIC/HEIF photos can\u2019t be previewed in the browser \u2014 use a JPG or PNG instead.';
    coverInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    pendingCoverDataUrl = reader.result;
    coverPreviewImg.hidden = false;
    coverPreviewImg.src = pendingCoverDataUrl;
    coverPreview.hidden = false;
  };
  reader.onerror = () => {
    errorEl.textContent = 'Could not read that file. Try a different image.';
    coverInput.value = '';
  };
  reader.readAsDataURL(file);
});

coverPreviewImg.addEventListener('error', () => {
  if (!pendingCoverDataUrl) return; // src cleared intentionally
  coverPreviewImg.hidden = true;
  const errorEl = document.getElementById('error-book');
  errorEl.textContent = 'That image can\u2019t be displayed by the browser \u2014 try a JPG or PNG.';
  pendingCoverDataUrl = null;
  coverInput.value = '';
  coverPreview.hidden = true;
});

document.getElementById('cover-clear').addEventListener('click', () => {
  pendingCoverDataUrl = null;
  coverInput.value = '';
  coverPreview.hidden = true;
});

/* -------------------- ISBN lookup -------------------- */
document.getElementById('isbn-lookup-btn').addEventListener('click', async () => {
  const isbnInput = document.getElementById('isbn-input');
  const errorEl = document.getElementById('error-book');
  const btn = document.getElementById('isbn-lookup-btn');
  errorEl.textContent = '';

  const isbn = isbnInput.value.replace(/[^0-9Xx]/g, '').trim();
  if (!isbn) {
    errorEl.textContent = 'Enter an ISBN first.';
    return;
  }

  const originalLabel = btn.textContent;
  btn.textContent = 'Looking up\u2026';
  btn.disabled = true;

  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`
    );
    if (!res.ok) throw new Error('Lookup service is unavailable right now.');
    const data = await res.json();
    const record = data[`ISBN:${isbn}`];

    if (!record) {
      errorEl.textContent = 'No results for that ISBN.';
      return;
    }

    const form = document.getElementById('form-book');
    if (record.title) form.title.value = record.title;
    if (record.authors && record.authors.length > 0) {
      form.author.value = record.authors.map((a) => a.name).join(', ');
    }

    const coverUrl = record.cover?.large || record.cover?.medium || record.cover?.small;
    if (coverUrl) {
      pendingCoverDataUrl = coverUrl;
      coverPreviewImg.hidden = false;
      coverPreviewImg.src = coverUrl;
      coverPreview.hidden = false;
      coverInput.value = ''; // lookup cover replaces any manual upload
    }

    showToast('Filled in from ISBN lookup.');
  } catch (err) {
    errorEl.textContent = err.message.includes('fetch')
      ? 'Could not reach the lookup service \u2014 check your connection.'
      : err.message;
  } finally {
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
});

/* -------------------- tabs -------------------- */
document.querySelectorAll('.drawer-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.drawer-tab').forEach((t) => {
      t.classList.remove('is-active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));

    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('is-active');
  });
});

/* -------------------- toast -------------------- */
let toastTimer = null;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

/* -------------------- api helper -------------------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLoginOverlay();
    const err = new Error('Please sign in.');
    err.isAuthError = true;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* -------------------- staff login -------------------- */
function showLoginOverlay() {
  document.getElementById('login-overlay').classList.add('is-visible');
  document.getElementById('login-password').focus();
}
function hideLoginOverlay() {
  document.getElementById('login-overlay').classList.remove('is-visible');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Sign-in failed.');

    passwordInput.value = '';
    hideLoginOverlay();
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {
    // ignore network errors on logout — show the login screen regardless
  }
  state.me = null;
  renderSignedInAs();
  showLoginOverlay();
});

/* -------------------- rendering -------------------- */
function customerNameById(id) {
  return state.customers.find((c) => c.id === id)?.name || `Member ${id}`;
}

function renderBooks() {
  const grid = document.getElementById('grid-books');
  const empty = document.getElementById('empty-books');
  const noResults = document.getElementById('no-results-books');
  document.getElementById('count-books').textContent = state.books.length;

  const q = search.books.trim().toLowerCase();
  const filtered = q
    ? state.books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q))
    : state.books;

  grid.innerHTML = '';
  empty.hidden = state.books.length > 0;
  noResults.hidden = !(state.books.length > 0 && filtered.length === 0);

  filtered.forEach((book, i) => {
    const card = document.createElement('article');
    const due = dueDateInfo(book);
    const holds = book.holds || [];
    const available = book.availableCopies;
    const total = book.totalCopies;
    const isReserved = available > 0 && holds.length > 0;
    const isFull = available === 0;
    card.className = 'index-card' + (due?.tier === 'late' ? ' is-overdue' : '');
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;

    let statusClass, statusLabel;
    if (isReserved) {
      statusClass = 'reserved';
      statusLabel = 'Reserved';
    } else if (isFull) {
      statusClass = 'issued';
      statusLabel = total > 1 ? 'All Issued' : 'Issued';
    } else {
      statusClass = 'available';
      statusLabel = total > 1 ? `${available}/${total} Available` : 'Available';
    }

    card.innerHTML = `
      <span class="spine" style="background:${spineColorFor(book.id, book.title)}"></span>
      ${book.cover ? `<div class="card-cover"><img src="${book.cover}" alt="Cover of ${escapeHtml(book.title)}" /></div>` : ''}
      <p class="card-id">NO. ${String(book.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(book.title)}</h3>
      <p class="card-sub">${escapeHtml(book.author || 'Unknown author')}</p>
      <span class="status-stamp ${statusClass}">${statusLabel}</span>
      ${book.branchAvailability && book.branchAvailability.length > 1 ? `
        <div class="branch-breakdown">
          ${book.branchAvailability.map((b) => `
            <span class="branch-chip">${escapeHtml(b.branchName)}: ${b.available}/${b.total}</span>
          `).join('')}
        </div>
      ` : ''}
      ${due ? `
        <div class="due-badge due-${due.tier}">
          <span class="due-dot"></span>${due.label}
        </div>
        <div class="due-progress"><div class="due-progress-fill due-${due.tier}" style="width:${due.progress}%"></div></div>
      ` : ''}
      ${holds.length > 0 ? `
        <div class="hold-list">
          <p class="hold-list-label">${isFull ? `${holds.length} on hold` : 'Reserved for'}</p>
          ${holds.map((cid) => `
            <span class="hold-chip">${escapeHtml(customerNameById(cid))}<button data-cancel-hold="${book.id}:${cid}" aria-label="Cancel hold">&times;</button></span>
          `).join('')}
        </div>
      ` : ''}
      <div class="card-actions">
        <button data-remove-book="${book.id}">Withdraw</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderCustomers() {
  const grid = document.getElementById('grid-customers');
  const empty = document.getElementById('empty-customers');
  const noResults = document.getElementById('no-results-customers');
  document.getElementById('count-customers').textContent = state.customers.length;

  const q = search.customers.trim().toLowerCase();
  const filtered = q
    ? state.customers.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q))
    : state.customers;

  grid.innerHTML = '';
  empty.hidden = state.customers.length > 0;
  noResults.hidden = !(state.customers.length > 0 && filtered.length === 0);

  filtered.forEach((customer, i) => {
    const card = document.createElement('article');
    card.className = 'index-card';
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;
    card.innerHTML = `
      <span class="spine" style="background:${spineColorFor(customer.id, customer.name)}"></span>
      <p class="card-id">MEMBER ${String(customer.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(customer.name)}</h3>
      <p class="card-sub">${escapeHtml(customer.email || 'No email on file')}</p>
      <div class="card-actions">
        <button data-remove-customer="${customer.id}">Withdraw</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderTransactions() {
  const body = document.getElementById('ledger-body');
  const empty = document.getElementById('empty-transactions');
  document.getElementById('count-transactions').textContent = state.transactions.length;

  body.innerHTML = '';
  empty.hidden = state.transactions.length > 0;

  const bookTitle = (id) => state.books.find((b) => b.id === id)?.title || `Book ${id}`;
  const customerName = (id) => state.customers.find((c) => c.id === id)?.name || `Member ${id}`;

  for (const t of state.transactions) {
    const row = document.createElement('tr');
    const when = new Date(t.timestamp).toLocaleString();
    const dueCell = t.type === 'ISSUE' && t.dueDate
      ? new Date(t.dueDate).toLocaleDateString()
      : t.type === 'RENEW' && t.dueDate
        ? `Renewed \u2192 ${new Date(t.dueDate).toLocaleDateString()}`
        : t.type === 'RETURN' && t.wasOverdue
          ? `<span class="late-tag">Late \u00b7 $${t.fineAmount.toFixed(2)}</span>`
          : '\u2014';
    row.innerHTML = `
      <td>${t.id}</td>
      <td class="${t.type === 'ISSUE' ? 'type-issue' : t.type === 'RENEW' ? 'type-renew' : 'type-return'}">${t.type}</td>
      <td>${escapeHtml(bookTitle(t.bookId))}</td>
      <td>${escapeHtml(customerName(t.customerId))}</td>
      <td>${dueCell}</td>
      <td>${when}</td>
    `;
    body.appendChild(row);
  }
}

function renderStats() {
  const available = state.books.filter((b) => !b.isIssued).length;
  const issued = state.books.filter((b) => b.isIssued).length;
  const values = {
    'stat-total-books': state.books.length,
    'stat-available': available,
    'stat-issued': issued,
    'stat-members': state.customers.length,
    'stat-transactions': state.transactions.length,
    'stat-fines': state.fines || 0,
  };
  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (prevStats[id] !== undefined && prevStats[id] !== value) {
      el.classList.remove('is-bumped');
      void el.offsetWidth; // restart animation
      el.classList.add('is-bumped');
    }
    el.textContent = id === 'stat-fines' ? `$${value.toFixed(2)}` : value;
    prevStats[id] = value;
  }
}

const LOAN_DAYS = 14;
function dueDateInfo(book) {
  if (!book.nextDueDate) return null;
  const due = new Date(book.nextDueDate);
  const now = new Date();
  const msLeft = due - now;
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const overdue = msLeft < 0;
  const elapsedRatio = Math.min(1, Math.max(0, 1 - msLeft / (LOAN_DAYS * 24 * 60 * 60 * 1000)));

  let label;
  let tier; // 'ok' | 'soon' | 'late'
  if (overdue) {
    const daysLate = Math.abs(daysLeft);
    label = daysLate <= 1 ? 'Overdue' : `Overdue \u00b7 ${daysLate}d`;
    tier = 'late';
  } else if (daysLeft <= 3) {
    label = daysLeft <= 1 ? 'Due today' : `Due in ${daysLeft}d`;
    tier = 'soon';
  } else {
    label = `Due in ${daysLeft}d`;
    tier = 'ok';
  }
  return { label, tier, progress: Math.round(elapsedRatio * 100) };
}

function renderLeaderboard() {
  if (!state.leaderboard) return;

  const renderList = (listId, emptyId, items, labelSuffix) => {
    const list = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    list.innerHTML = '';
    empty.hidden = items.length > 0;

    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item' + (i < 3 ? ` rank-${i + 1}` : '');
      li.innerHTML = `
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-name">${escapeHtml(item.name)}</span>
        <span class="leaderboard-count">${item.count} ${labelSuffix}</span>
      `;
      list.appendChild(li);
    });
  };

  renderList(
    'leaderboard-books',
    'empty-leaderboard-books',
    state.leaderboard.books.map((b) => ({ name: b.title, count: b.count })),
    'loans'
  );
  renderList(
    'leaderboard-members',
    'empty-leaderboard-members',
    state.leaderboard.members.map((m) => ({ name: m.name, count: m.count })),
    'loans'
  );
}

function renderSignedInAs() {
  const el = document.getElementById('signed-in-as');
  el.textContent = state.me ? `Signed in as ${state.me.username}` : '';
}

function renderStaff() {
  const grid = document.getElementById('grid-staff');
  const empty = document.getElementById('empty-staff');
  document.getElementById('count-staff').textContent = state.staff.length;

  const isAdmin = state.me && state.me.role === 'admin';
  document.getElementById('form-staff').hidden = !isAdmin;

  grid.innerHTML = '';
  empty.hidden = state.staff.length > 0;

  state.staff.forEach((s, i) => {
    const isSelf = state.me && state.me.id === s.id;
    const isEditing = state.editingStaffId === s.id;
    const card = document.createElement('article');
    card.className = 'index-card';
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;

    if (isEditing) {
      card.innerHTML = `
        <span class="spine" style="background:${spineColorFor(s.id, s.username)}"></span>
        <p class="card-id">STAFF ${String(s.id).padStart(4, '0')}</p>
        <div class="staff-edit-form">
          <label>Username<input type="text" class="staff-edit-username" value="${escapeHtml(s.username)}" /></label>
          <label>New password<input type="password" class="staff-edit-password" placeholder="leave blank to keep current" /></label>
          ${isAdmin ? `
            <label>Role
              <select class="staff-edit-role">
                <option value="staff" ${s.role === 'staff' ? 'selected' : ''}>Staff</option>
                <option value="admin" ${s.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </label>
          ` : ''}
          <p class="form-error" id="error-staff-edit-${s.id}"></p>
          <div class="card-actions">
            <button data-save-staff="${s.id}" class="card-actions--renew">Save</button>
            <button data-cancel-edit-staff="${s.id}">Cancel</button>
          </div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <span class="spine" style="background:${spineColorFor(s.id, s.username)}"></span>
        <p class="card-id">STAFF ${String(s.id).padStart(4, '0')}</p>
        <h3>${escapeHtml(s.username)}${isSelf ? ' <span class="you-tag">You</span>' : ''}</h3>
        <p class="card-sub">
          <span class="role-badge role-badge--${s.role}">${s.role === 'admin' ? 'Admin' : 'Staff'}</span>
          Added ${new Date(s.createdAt).toLocaleDateString()}
        </p>
        <div class="card-actions">
          ${isSelf || isAdmin ? `<button data-edit-staff="${s.id}" class="card-actions--renew">Edit</button>` : ''}
          ${!isSelf && isAdmin ? `<button data-remove-staff="${s.id}">Remove</button>` : ''}
        </div>
      `;
    }
    grid.appendChild(card);
  });
}

document.getElementById('form-staff').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error-staff');
  errorEl.textContent = '';
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const role = form.role.value;

  try {
    await api('/api/staff', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    form.reset();
    showToast('Staff account added.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('grid-staff').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editStaff;
  const cancelId = e.target.dataset.cancelEditStaff;
  const saveId = e.target.dataset.saveStaff;
  const removeId = e.target.dataset.removeStaff;

  if (editId) {
    state.editingStaffId = Number(editId);
    renderStaff();
    return;
  }

  if (cancelId) {
    state.editingStaffId = null;
    renderStaff();
    return;
  }

  if (saveId) {
    const id = Number(saveId);
    const card = e.target.closest('.index-card');
    const username = card.querySelector('.staff-edit-username').value.trim();
    const password = card.querySelector('.staff-edit-password').value;
    const roleSelect = card.querySelector('.staff-edit-role');
    const errorEl = document.getElementById(`error-staff-edit-${id}`);
    errorEl.textContent = '';

    const payload = { username };
    if (password) payload.password = password;
    if (roleSelect) payload.role = roleSelect.value;

    try {
      await api(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editingStaffId = null;
      showToast('Staff account updated.');
      await loadAll();
    } catch (err) {
      errorEl.textContent = err.message;
    }
    return;
  }

  if (!removeId) return;
  try {
    await api(`/api/staff/${removeId}`, { method: 'DELETE' });
    showToast('Staff account removed.');
    await loadAll();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderBranches() {
  const grid = document.getElementById('grid-branches');
  const empty = document.getElementById('empty-branches');
  document.getElementById('count-branches').textContent = state.branches.length;

  grid.innerHTML = '';
  empty.hidden = state.branches.length > 0;

  state.branches.forEach((branch, i) => {
    const card = document.createElement('article');
    card.className = 'index-card';
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;
    card.innerHTML = `
      <span class="spine" style="background:${spineColorFor(branch.id, branch.name)}"></span>
      <p class="card-id">BRANCH ${String(branch.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(branch.name)}</h3>
      <p class="card-sub">${escapeHtml(branch.address || 'No address on file')}</p>
      <div class="card-actions">
        <button data-remove-branch="${branch.id}">Remove</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function populateBranchSelects() {
  const selects = [document.getElementById('book-branch-select'), document.getElementById('desk-branch-select')];
  for (const select of selects) {
    const previous = select.value;
    select.innerHTML = state.branches
      .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
      .join('');
    if (state.branches.some((b) => String(b.id) === previous)) select.value = previous;
  }
}

document.getElementById('form-branch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error-branch');
  errorEl.textContent = '';
  const form = e.target;
  const name = form.name.value.trim();
  const address = form.address.value.trim();

  try {
    await api('/api/branches', { method: 'POST', body: JSON.stringify({ name, address }) });
    form.reset();
    showToast('Branch added.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('grid-branches').addEventListener('click', async (e) => {
  const id = e.target.dataset.removeBranch;
  if (!id) return;
  try {
    await api(`/api/branches/${id}`, { method: 'DELETE' });
    showToast('Branch removed.');
    await loadAll();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderAnalytics() {
  const container = document.getElementById('analytics-chart');
  const empty = document.getElementById('empty-analytics');
  const DAYS = 14;

  // Build the last 14 calendar days (oldest first) as YYYY-MM-DD keys.
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const issuedByDay = Object.fromEntries(days.map((d) => [d, 0]));
  const returnedByDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const t of state.transactions) {
    const day = t.timestamp.slice(0, 10);
    if (t.type === 'ISSUE' && day in issuedByDay) issuedByDay[day]++;
    if (t.type === 'RETURN' && day in returnedByDay) returnedByDay[day]++;
  }

  const totalActivity = Object.values(issuedByDay).reduce((a, b) => a + b, 0)
    + Object.values(returnedByDay).reduce((a, b) => a + b, 0);
  empty.hidden = totalActivity > 0;
  if (totalActivity === 0) {
    container.innerHTML = '';
    return;
  }

  const maxCount = Math.max(1, ...days.map((d) => Math.max(issuedByDay[d], returnedByDay[d])));
  const width = 700;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 26, left: 10 };
  const chartHeight = height - padding.top - padding.bottom;
  const groupWidth = (width - padding.left - padding.right) / DAYS;
  const barWidth = Math.min(14, groupWidth * 0.32);

  const issueColor = 'var(--warm-dark)';
  const returnColor = 'var(--accent-dark)';

  const bars = days.map((day, i) => {
    const groupX = padding.left + i * groupWidth;
    const centerX = groupX + groupWidth / 2;
    const issueH = (issuedByDay[day] / maxCount) * chartHeight;
    const returnH = (returnedByDay[day] / maxCount) * chartHeight;
    const baseY = padding.top + chartHeight;
    const label = new Date(day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return `
      <g class="analytics-bar-group">
        <title>${label}: ${issuedByDay[day]} issued, ${returnedByDay[day]} returned</title>
        <rect x="${centerX - barWidth - 1}" y="${baseY - issueH}" width="${barWidth}" height="${Math.max(issueH, issuedByDay[day] > 0 ? 2 : 0)}" fill="${issueColor}" rx="2" />
        <rect x="${centerX + 1}" y="${baseY - returnH}" width="${barWidth}" height="${Math.max(returnH, returnedByDay[day] > 0 ? 2 : 0)}" fill="${returnColor}" rx="2" />
        ${i % 2 === 0 ? `<text x="${centerX}" y="${height - 6}" text-anchor="middle" class="analytics-axis-label">${label}</text>` : ''}
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="analytics-svg" preserveAspectRatio="xMidYMid meet">
      <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" class="analytics-axis-line" />
      ${bars}
    </svg>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/* -------------------- data loading -------------------- */
async function loadAll() {
  const [books, customers, transactions, fines, leaderboard, branches, reminders, staff, me] = await Promise.all([
    api('/api/books'),
    api('/api/customers'),
    api('/api/transactions'),
    api('/api/transactions/fines'),
    api('/api/transactions/leaderboard'),
    api('/api/branches'),
    api('/api/reminders/due'),
    api('/api/staff'),
    api('/api/me'),
  ]);
  state.books = books;
  state.customers = customers;
  state.transactions = transactions;
  state.fines = fines.outstanding;
  state.leaderboard = leaderboard;
  state.branches = branches;
  state.reminders = reminders;
  state.staff = staff;
  state.me = me.staff;
  renderBooks();
  renderCustomers();
  renderTransactions();
  renderStats();
  renderLeaderboard();
  renderAnalytics();
  renderBranches();
  populateBranchSelects();
  renderReminders();
  renderStaff();
  renderSignedInAs();
}

/* -------------------- search -------------------- */
document.getElementById('search-books').addEventListener('input', (e) => {
  search.books = e.target.value;
  renderBooks();
});
document.getElementById('search-customers').addEventListener('input', (e) => {
  search.customers = e.target.value;
  renderCustomers();
});

/* -------------------- stamp slam effect -------------------- */
function playStamp(type) {
  const overlay = document.getElementById('stamp-overlay');
  const mark = document.getElementById('stamp-mark');
  mark.textContent = type === 'ISSUE' ? 'Issued' : 'Returned';
  mark.className = `stamp-mark ${type === 'ISSUE' ? 'type-issue' : 'type-return'}`;

  overlay.classList.remove('is-playing');
  void overlay.offsetWidth; // restart animation
  overlay.classList.add('is-playing');

  document.body.classList.remove('is-shaking');
  void document.body.offsetWidth;
  document.body.classList.add('is-shaking');

  setTimeout(() => overlay.classList.remove('is-playing'), 700);
}

/* -------------------- form: add book -------------------- */
document.getElementById('form-book').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error-book');
  errorEl.textContent = '';
  const form = e.target;
  const title = form.title.value.trim();
  const author = form.author.value.trim();
  const copies = form.copies.value ? Number(form.copies.value) : 1;
  const branchId = form.branchId.value ? Number(form.branchId.value) : undefined;

  try {
    await api('/api/books', {
      method: 'POST',
      body: JSON.stringify({ title, author, cover: pendingCoverDataUrl, copies, branchId }),
    });
    form.reset();
    pendingCoverDataUrl = null;
    coverPreview.hidden = true;
    showToast('Card filed.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------- form: add customer -------------------- */
document.getElementById('form-customer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error-customer');
  errorEl.textContent = '';
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();

  try {
    await api('/api/customers', { method: 'POST', body: JSON.stringify({ name, email }) });
    form.reset();
    showToast('Member card issued.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------- form: issue / return -------------------- */
document.getElementById('form-transaction').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error-transaction');
  errorEl.textContent = '';
  const form = e.target;
  const action = e.submitter?.dataset.action || 'issue';
  const bookId = Number(form.bookId.value);
  const customerId = Number(form.customerId.value);
  const branchId = form.branchId.value ? Number(form.branchId.value) : undefined;

  try {
    if (action === 'hold') {
      await api(`/api/books/${bookId}/holds`, {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      });
      form.reset();
      showToast('Hold placed.');
    } else if (action === 'renew') {
      await api('/api/transactions/renew', {
        method: 'POST',
        body: JSON.stringify({ bookId, customerId }),
      });
      form.reset();
      showToast('Renewed \u2014 due date extended.');
    } else if (action === 'issue') {
      await api('/api/transactions/issue', {
        method: 'POST',
        body: JSON.stringify({ bookId, customerId, branchId }),
      });
      form.reset();
      playStamp('ISSUE');
      showToast('Stamped out.');
    } else {
      await api(`/api/transactions/${action}`, {
        method: 'POST',
        body: JSON.stringify({ bookId, customerId }),
      });
      form.reset();
      playStamp('RETURN');
      showToast('Stamped in.');
    }
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------- withdraw (delete) buttons -------------------- */
document.getElementById('grid-books').addEventListener('click', async (e) => {
  const removeId = e.target.dataset.removeBook;
  const cancelHold = e.target.dataset.cancelHold;

  if (cancelHold) {
    const [bookId, customerId] = cancelHold.split(':');
    try {
      await api(`/api/books/${bookId}/holds/${customerId}`, { method: 'DELETE' });
      showToast('Hold cancelled.');
      await loadAll();
    } catch (err) {
      showToast(err.message, true);
    }
    return;
  }

  if (!removeId) return;
  try {
    await api(`/api/books/${removeId}`, { method: 'DELETE' });
    showToast('Card withdrawn.');
    await loadAll();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('grid-customers').addEventListener('click', async (e) => {
  const id = e.target.dataset.removeCustomer;
  if (!id) return;
  try {
    await api(`/api/customers/${id}`, { method: 'DELETE' });
    showToast('Member withdrawn.');
    await loadAll();
  } catch (err) {
    showToast(err.message, true);
  }
});

/* -------------------- CSV export -------------------- */
function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function renderReminders() {
  const list = document.getElementById('reminders-list');
  const status = document.getElementById('reminders-status');
  if (!state.reminders) return;

  const { due, webhookConfigured } = state.reminders;
  list.innerHTML = '';

  if (due.length === 0) {
    status.textContent = webhookConfigured
      ? 'Nothing due soon or overdue right now.'
      : 'Nothing due soon or overdue right now. (No delivery method configured \u2014 sends will log locally only.)';
    return;
  }

  status.textContent = webhookConfigured
    ? `${due.length} member${due.length === 1 ? '' : 's'} to notify.`
    : `${due.length} member${due.length === 1 ? '' : 's'} to notify. No delivery method configured \u2014 sends will log locally only, not actually reach anyone.`;

  for (const r of due) {
    const li = document.createElement('li');
    li.className = 'reminder-item';
    li.innerHTML = `
      <span class="reminder-kind reminder-kind--${r.kind}">${r.kind === 'overdue' ? 'Overdue' : 'Due soon'}</span>
      <span class="reminder-text">${escapeHtml(r.bookTitle)} \u2014 ${escapeHtml(r.customerName)}</span>
      <span class="reminder-email">${r.customerEmail ? escapeHtml(r.customerEmail) : 'no email on file'}</span>
    `;
    list.appendChild(li);
  }
}

document.getElementById('send-reminders-btn').addEventListener('click', async () => {
  const btn = document.getElementById('send-reminders-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking\u2026';
  try {
    const summary = await api('/api/reminders/send', { method: 'POST' });
    showToast(`Sent ${summary.sent}, skipped ${summary.skipped} (already sent today).`);
    await loadAll();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById('export-csv').addEventListener('click', () => {
  if (state.transactions.length === 0) {
    showToast('No circulation activity to export yet.', true);
    return;
  }

  const bookTitle = (id) => state.books.find((b) => b.id === id)?.title || `Book ${id}`;
  const customerName = (id) => state.customers.find((c) => c.id === id)?.name || `Member ${id}`;

  const headers = ['ID', 'Type', 'Book', 'Member', 'Due Date', 'Fine', 'Timestamp'];
  const rows = state.transactions.map((t) => [
    t.id,
    t.type,
    bookTitle(t.bookId),
    customerName(t.customerId),
    t.dueDate ? new Date(t.dueDate).toISOString() : '',
    t.type === 'RETURN' && t.wasOverdue ? t.fineAmount.toFixed(2) : '',
    t.timestamp,
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `circulation-ledger-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Ledger exported.');
});

/* -------------------- barcode scanning -------------------- */
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerVideo = document.getElementById('scanner-video');
const scannerStatus = document.getElementById('scanner-status');
let scannerStream = null;
let scannerRAF = null;

async function openScanner(targetName) {
  scannerStatus.textContent = '';
  scannerOverlay.classList.add('is-visible');

  if (!('BarcodeDetector' in window)) {
    scannerStatus.textContent =
      "Barcode scanning isn't supported in this browser \u2014 try Chrome or Edge, or enter the number manually.";
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();

    let formats;
    try {
      formats = await BarcodeDetector.getSupportedFormats();
    } catch {
      formats = ['qr_code', 'code_128', 'ean_13', 'upc_a'];
    }
    const detector = new BarcodeDetector({ formats });

    const scanLoop = async () => {
      if (!scannerOverlay.classList.contains('is-visible')) return;
      try {
        const barcodes = await detector.detect(scannerVideo);
        if (barcodes.length > 0) {
          const digits = barcodes[0].rawValue.replace(/[^0-9]/g, '');
          if (digits) {
            const input = document.querySelector(`#form-transaction [name="${targetName}"]`);
            if (input) input.value = digits;
            showToast(`Scanned: ${digits}`);
            closeScanner();
            return;
          }
        }
      } catch {
        // a failed detection on one frame is normal (blur, bad angle) — just try the next frame
      }
      scannerRAF = requestAnimationFrame(scanLoop);
    };
    scanLoop();
  } catch (err) {
    scannerStatus.textContent =
      err.name === 'NotAllowedError'
        ? 'Camera access was denied \u2014 allow camera permissions and try again.'
        : 'Could not access the camera on this device.';
  }
}

function closeScanner() {
  scannerOverlay.classList.remove('is-visible');
  if (scannerRAF) cancelAnimationFrame(scannerRAF);
  scannerRAF = null;
  if (scannerStream) {
    scannerStream.getTracks().forEach((t) => t.stop());
    scannerStream = null;
  }
  scannerVideo.srcObject = null;
}

document.querySelectorAll('.scan-btn').forEach((btn) => {
  btn.addEventListener('click', () => openScanner(btn.dataset.scanTarget));
});
document.getElementById('scanner-cancel').addEventListener('click', closeScanner);

loadAll().catch((err) => {
  if (!err.isAuthError) showToast(err.message, true);
});