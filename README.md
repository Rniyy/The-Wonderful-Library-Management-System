# The Wonderful Library — Management System

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
- Server-side validation: can't issue a book that's already out, can't
  return one that isn't, can't issue to an unknown member

## Tech stack

Plain **Node.js** (built-in `http`, `fs` — no Express, no npm install step)
on the backend, and **vanilla HTML/CSS/JS** on the frontend. Data is
persisted as JSON files on disk. Zero dependencies means `git clone` and
`node server.js` is the entire setup.

## Getting started

Requires Node.js 18+.

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

- Swap the JSON file store for a real database (SQLite is a drop-in choice
  since `better-sqlite3` mirrors the synchronous `store.js` API)
- Add due dates and fines
- Add authentication so only staff can access the circulation desk
- Add automated tests for the models and routes
