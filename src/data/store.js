'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Tiny synchronous JSON-file store. Each "table" (books, customers,
 * transactions) lives in its own file as a JSON array of records.
 * Sync I/O is fine here: file sizes are small and every request already
 * waits on a single-threaded event loop with no concurrent writers.
 */
class Store {
  constructor(filename) {
    this.filePath = path.join(DATA_DIR, filename);
    this._ensureFile();
  }

  _ensureFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '[]', 'utf8');
  }

  all() {
    const raw = fs.readFileSync(this.filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  save(records) {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf8');
  }

  nextId(records) {
    return records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  }
}

module.exports = { Store };
