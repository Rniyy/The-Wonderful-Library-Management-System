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
  desktop and Android) — falls back to manual entry on browsers that
  don't support it (Safari, Firefox)
- **Due-date reminders** — checks once a day (and once at startup) for
  loans due soon or overdue, and notifies the member. Logs locally by
  default; set `REMINDER_WEBHOOK_URL` to actually deliver email/SMS (see
  below)
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

## Running the tests

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) — no dependencies to
install. Tests run against an isolated in-memory database, so they never
touch your real `data/library.db`. Covers both the models directly and
the HTTP routes layer (real requests against a real server instance on a
random port, including auth enforcement and error handling).

## Project structure

```
.
├── server.js                 # entry point — HTTP server, static files, routing, daily reminder timer
├── src/
│   ├── auth.js                 # session management
│   ├── router.js                # tiny dependency-free router (params, JSON bodies)
│   ├── models/
│   │   ├── Book.js               # books + copies + holds
│   │   ├── Branch.js
│   │   ├── Customer.js
│   │   ├── Reminder.js
│   │   ├── Staff.js               # staff accounts (hashed passwords)
│   │   └── Transaction.js        # also orchestrates issue/return across models
│   ├── routes/
│   │   ├── books.js
│   │   ├── branches.js
│   │   ├── customers.js
│   │   ├── login.js
│   │   ├── reminders.js
│   │   ├── staff.js
│   │   └── transactions.js
│   ├── notifications/
│   │   └── notifier.js           # pluggable reminder delivery (local log / webhook)
│   └── data/
│       └── db.js                 # SQLite setup + JSON/schema migrations
├── public/                    # frontend (served as static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/                     # node --test suite (models)
├── data/                      # generated at runtime (gitignored)
└── legacy-cpp/                # original console version, kept for history
```

## API reference

| Method | Path                              | Description                              |
|--------|-------------------------------------|-------------------------------------------|
| GET    | `/api/books`                       | List all books (with copy/branch stats)  |
| GET    | `/api/books/:id`                   | Get one book                             |
| POST   | `/api/books`                       | Add a book `{ title, author, cover, copies, branchId }` |
| PUT    | `/api/books/:id`                   | Update a book                            |
| DELETE | `/api/books/:id`                   | Remove a book (blocked if a copy is out) |
| POST   | `/api/books/:id/copies`            | Add copies at a branch `{ branchId, count }` |
| POST   | `/api/books/:id/holds`             | Place a hold `{ customerId }`            |
| DELETE | `/api/books/:id/holds/:customerId` | Cancel a hold                            |
| GET    | `/api/customers`                   | List all members                         |
| GET    | `/api/customers/:id`               | Get one member                           |
| POST   | `/api/customers`                   | Add a member `{ name, email }`           |
| PUT    | `/api/customers/:id`               | Update a member                          |
| DELETE | `/api/customers/:id`                | Remove a member                          |
| GET    | `/api/branches`                    | List all branches                        |
| POST   | `/api/branches`                    | Add a branch `{ name, address }`         |
| DELETE | `/api/branches/:id`                | Remove a branch (blocked while it holds copies) |
| GET    | `/api/transactions`                | List all transactions (newest first)     |
| POST   | `/api/transactions/issue`          | Issue `{ bookId, customerId, branchId }` |
| POST   | `/api/transactions/return`         | Return `{ bookId, customerId }`          |
| POST   | `/api/transactions/renew`          | Renew `{ bookId, customerId }`           |
| GET    | `/api/transactions/fines`          | Total outstanding fines                  |
| GET    | `/api/transactions/leaderboard`    | Top borrowed books / most active members |
| GET    | `/api/reminders/due`               | Preview what's due soon or overdue       |
| POST   | `/api/reminders/send`              | Send reminders for everything due now    |
| GET    | `/api/staff`                       | List staff accounts                      |
| POST   | `/api/staff`                       | Add a staff account `{ username, password, role }` — admin only |
| PUT    | `/api/staff/:id`                   | Edit an account — self, or any account if admin |
| DELETE | `/api/staff/:id`                   | Remove a staff account — admin only, not your own, not the last admin |
| GET    | `/api/backup`                      | Download a full database backup — admin only |
| POST   | `/api/backup/restore`              | Restore from an uploaded backup file — admin only, requires a server restart to take effect |
| POST   | `/api/login`                       | Sign in `{ username, password }`         |
| POST   | `/api/logout`                      | Sign out                                 |
| GET    | `/api/me`                          | Current signed-in staff account          |

## Due-date reminders

The server checks once a day (and once shortly after startup) for loans
due soon or overdue, and sends one reminder per member per day for each.
By default this just logs to `data/reminders.log` and the console — it
doesn't reach anyone. To actually deliver email or SMS, set:

```
REMINDER_WEBHOOK_URL=https://your-webhook-url node server.js
```

Each due/overdue loan gets POSTed as JSON to that URL. Point it at a
Zapier, Make, or n8n webhook (no code needed on your end), or write a
small function of your own that receives the JSON and calls a real email
API (SendGrid, Postmark, etc.) or SMS API (Twilio). You can also trigger
a check on demand from the **Check & Send Now** button on the Circulation
tab.

## Staff accounts

Every `/api/*` endpoint requires a signed-in staff account — the catalog,
members, and ledger can't be read or changed without logging in. On a
fresh install, a default account is created automatically:

```
username: admin
password: library
```

The server prints a warning at startup if you're still using this
default. **Change it before deploying anywhere real** — sign in, go to
the **Staff** tab, add a real account for yourself, and remove the
default one (you can't remove the account you're currently signed in
as, so add your own first, sign in as that, then remove `admin`).

To set a different default on first run instead (useful for scripted
deploys), set both before starting the server the very first time:

```
STAFF_USERNAME=yourname STAFF_PASSWORD=your-real-password node server.js
```

These only take effect when no staff accounts exist yet — they won't
touch an install that's already been set up.

Accounts have two roles: **admin** (can manage other staff accounts —
create, edit, remove, change roles) and **staff** (everything else —
catalog, members, circulation, branches, reminders). Everyone can edit
their own username and password regardless of role. The system won't let
the last admin be demoted or removed, so you can't lock yourself out.

### Login rate limiting

`/api/login` locks out an IP address for 15 minutes after 5 failed
attempts within a 5-minute window, to slow down password guessing. A
successful login clears the count. This is in-memory and per-process —
it resets if you restart the server, and if you run multiple server
instances behind a load balancer, each one tracks independently.

### Backup & restore

From the **Staff** tab (admin only):

- **Download Backup** produces a complete, consistent snapshot of the
  database (using SQLite's `VACUUM INTO`, which is safe to run even
  while the server is live and being written to) and downloads it as a
  `.db` file.
- **Restore from file** uploads a previous backup. It's validated (real
  SQLite file, has the expected tables, passes an integrity check)
  before anything changes, and the database that was live gets copied
  to `data/library.db.pre-restore-<timestamp>` first as a safety net.
  **The server needs to be restarted afterward** for the restored data
  to actually take effect — the live process keeps using its existing
  in-memory connection until then, by design, rather than risk swapping
  a database out from under active requests.

## Where to take it next

- A cron-based reminder check instead of (or alongside) the in-process
  daily timer, for deployments where the server isn't always running