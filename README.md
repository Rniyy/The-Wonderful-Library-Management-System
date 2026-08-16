# The Library — Circulation System

A library management system with a REST API and a browser-based UI for
tracking books, members, and circulation (issue/return) activity.

This is a rebuild of an earlier console-only version (see `legacy-cpp/`),
restructured as a proper web app with a real project layout instead of two
monolithic `.cpp` files.

## Features

- **Catalog** — add, list, and withdraw books
- **Members** — enroll, list, and withdraw library members
- **Circulation** — issue a book to a member, return it, and browse the
  full transaction ledger (newest first)
- **Barcode scanning** — scan a book or member barcode with your device
  camera to fill in the Book ID / Member ID fields at the circulation desk.
  Uses the browser's built-in `BarcodeDetector` API (Chrome and Edge,
  desktop and Android) \u2014 falls back to manual entry on browsers that
  don't support it (Safari, Firefox)
- Server-side validation: can't issue a book that's already out, can't
  return one that isn't, can't issue to an unknown member

## Tech stack

Plain **Node.js** (built-in `http`, `fs`, and `node:sqlite` — no Express,
no npm install step) on the backend, and **vanilla HTML/CSS/JS** on the
frontend. Data is persisted in a real SQLite database via Node's built-in
`node:sqlite` module (stable as of Node 22.5+, currently marked
experimental upstream). Zero external dependencies means `git clone` and
`node server.js` is the entire setup — no `npm install` step.

If you're upgrading from an older copy of this project that used JSON
files for storage, your existing `data/*.json` files are automatically
imported into the new database the first time you start the server, then
renamed to `*.json.migrated` as a backup.

## Getting started

Requires Node.js **22.5.0 or newer** (for `node:sqlite`).

```bash
git clone <your-repo-url>
cd LibraryManagement
node server.js
```

Then open **http://localhost:3000**. Data files are created automatically
on first run under `data/`.

Optional: `PORT=4000 node server.js` to run on a different port.

## Project structure

```
.
├── server.js                 # entry point — HTTP server, static files, routing
├── src/
│   ├── router.js              # tiny dependency-free router (params, JSON bodies)
│   ├── models/
│   │   ├── Book.js
│   │   ├── Customer.js
│   │   └── Transaction.js     # also orchestrates issue/return across models
│   ├── routes/
│   │   ├── books.js
│   │   ├── customers.js
│   │   └── transactions.js
│   └── data/
│       └── store.js           # JSON file persistence
├── public/                    # frontend (served as static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                      # generated at runtime (gitignored)
└── legacy-cpp/                # original console version, kept for history
```

## API reference

| Method | Path                        | Description                     |
|--------|------------------------------|----------------------------------|
| GET    | `/api/books`                 | List all books                  |
| GET    | `/api/books/:id`             | Get one book                    |
| POST   | `/api/books`                 | Add a book `{ title, author }`  |
| PUT    | `/api/books/:id`             | Update a book                   |
| DELETE | `/api/books/:id`             | Remove a book                   |
| GET    | `/api/customers`             | List all members                |
| GET    | `/api/customers/:id`         | Get one member                  |
| POST   | `/api/customers`             | Add a member `{ name, email }`  |
| PUT    | `/api/customers/:id`         | Update a member                 |
| DELETE | `/api/customers/:id`         | Remove a member                 |
| GET    | `/api/transactions`          | List all transactions           |
| POST   | `/api/transactions/issue`    | Issue `{ bookId, customerId }`  |
| POST   | `/api/transactions/return`   | Return `{ bookId, customerId }` |

## Where to take it next

- Add automated tests for the models and routes
- Real user accounts instead of one shared staff password
- Barcode scanning for faster checkout
- Email/SMS due-date reminders