'use strict';

const state = { books: [], customers: [], transactions: [] };
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
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* -------------------- rendering -------------------- */
function currentBorrowerId(bookId) {
  // transactions are newest-first; if the book is issued, the most recent
  // entry for it must be an ISSUE or RENEW, which carries the borrower's id.
  const t = state.transactions.find((t) => t.bookId === bookId);
  return t ? t.customerId : null;
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
    card.className = 'index-card' + (due?.tier === 'late' ? ' is-overdue' : '');
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;
    card.innerHTML = `
      <span class="spine" style="background:${spineColorFor(book.id, book.title)}"></span>
      ${book.cover ? `<div class="card-cover"><img src="${book.cover}" alt="Cover of ${escapeHtml(book.title)}" /></div>` : ''}
      <p class="card-id">NO. ${String(book.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(book.title)}</h3>
      <p class="card-sub">${escapeHtml(book.author || 'Unknown author')}</p>
      <span class="status-stamp ${book.isIssued ? 'issued' : 'available'}">
        ${book.isIssued ? 'Issued' : 'Available'}
      </span>
      ${due ? `
        <div class="due-badge due-${due.tier}">
          <span class="due-dot"></span>${due.label}
        </div>
        <div class="due-progress"><div class="due-progress-fill due-${due.tier}" style="width:${due.progress}%"></div></div>
      ` : ''}
      <div class="card-actions">
        ${book.isIssued ? `<button data-renew-book="${book.id}" class="card-actions--renew">Renew</button>` : ''}
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
  if (!book.isIssued || !book.dueDate) return null;
  const due = new Date(book.dueDate);
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/* -------------------- data loading -------------------- */
async function loadAll() {
  const [books, customers, transactions, fines] = await Promise.all([
    api('/api/books'),
    api('/api/customers'),
    api('/api/transactions'),
    api('/api/transactions/fines'),
  ]);
  state.books = books;
  state.customers = customers;
  state.transactions = transactions;
  state.fines = fines.outstanding;
  renderBooks();
  renderCustomers();
  renderTransactions();
  renderStats();
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

  try {
    await api('/api/books', {
      method: 'POST',
      body: JSON.stringify({ title, author, cover: pendingCoverDataUrl }),
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

  try {
    await api(`/api/transactions/${action}`, {
      method: 'POST',
      body: JSON.stringify({ bookId, customerId }),
    });
    form.reset();
    playStamp(action === 'issue' ? 'ISSUE' : 'RETURN');
    showToast(action === 'issue' ? 'Stamped out.' : 'Stamped in.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------- withdraw (delete) buttons -------------------- */
document.getElementById('grid-books').addEventListener('click', async (e) => {
  const removeId = e.target.dataset.removeBook;
  const renewId = e.target.dataset.renewBook;

  if (renewId) {
    const bookId = Number(renewId);
    const customerId = currentBorrowerId(bookId);
    if (!customerId) {
      showToast('Could not determine the current borrower.', true);
      return;
    }
    try {
      await api('/api/transactions/renew', {
        method: 'POST',
        body: JSON.stringify({ bookId, customerId }),
      });
      showToast('Renewed \u2014 due date extended.');
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

loadAll().catch((err) => showToast(err.message, true));