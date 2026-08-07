'use strict';

const state = { books: [], customers: [], transactions: [] };

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
function renderBooks() {
  const grid = document.getElementById('grid-books');
  const empty = document.getElementById('empty-books');
  document.getElementById('count-books').textContent = state.books.length;

  grid.innerHTML = '';
  empty.hidden = state.books.length > 0;

  for (const book of state.books) {
    const card = document.createElement('article');
    card.className = 'index-card';
    card.innerHTML = `
      <p class="card-id">NO. ${String(book.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(book.title)}</h3>
      <p class="card-sub">${escapeHtml(book.author || 'Unknown author')}</p>
      <span class="status-stamp ${book.isIssued ? 'issued' : 'available'}">
        ${book.isIssued ? 'Issued' : 'Available'}
      </span>
      <div class="card-actions">
        <button data-remove-book="${book.id}">Withdraw</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

function renderCustomers() {
  const grid = document.getElementById('grid-customers');
  const empty = document.getElementById('empty-customers');
  document.getElementById('count-customers').textContent = state.customers.length;

  grid.innerHTML = '';
  empty.hidden = state.customers.length > 0;

  for (const customer of state.customers) {
    const card = document.createElement('article');
    card.className = 'index-card';
    card.innerHTML = `
      <p class="card-id">MEMBER ${String(customer.id).padStart(4, '0')}</p>
      <h3>${escapeHtml(customer.name)}</h3>
      <p class="card-sub">${escapeHtml(customer.email || 'No email on file')}</p>
      <div class="card-actions">
        <button data-remove-customer="${customer.id}">Withdraw</button>
      </div>
    `;
    grid.appendChild(card);
  }
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
    row.innerHTML = `
      <td>${t.id}</td>
      <td class="${t.type === 'ISSUE' ? 'type-issue' : 'type-return'}">${t.type}</td>
      <td>${escapeHtml(bookTitle(t.bookId))}</td>
      <td>${escapeHtml(customerName(t.customerId))}</td>
      <td>${when}</td>
    `;
    body.appendChild(row);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/* -------------------- data loading -------------------- */
async function loadAll() {
  const [books, customers, transactions] = await Promise.all([
    api('/api/books'),
    api('/api/customers'),
    api('/api/transactions'),
  ]);
  state.books = books;
  state.customers = customers;
  state.transactions = transactions;
  renderBooks();
  renderCustomers();
  renderTransactions();
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
    await api('/api/books', { method: 'POST', body: JSON.stringify({ title, author }) });
    form.reset();
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
    showToast(action === 'issue' ? 'Stamped out.' : 'Stamped in.');
    await loadAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* -------------------- withdraw (delete) buttons -------------------- */
document.getElementById('grid-books').addEventListener('click', async (e) => {
  const id = e.target.dataset.removeBook;
  if (!id) return;
  try {
    await api(`/api/books/${id}`, { method: 'DELETE' });
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

loadAll().catch((err) => showToast(err.message, true));
