'use strict';

const db = require('../data/db');
const Branch = require('./Branch');

const { DEFAULT_BRANCH_ID } = db;

const stmts = {
  selectBook: db.prepare('SELECT * FROM books WHERE id = ?'),
  selectAllBooks: db.prepare('SELECT * FROM books ORDER BY id'),
  insertBook: db.prepare('INSERT INTO books (title, author, cover) VALUES (?, ?, ?)'),
  updateBook: db.prepare('UPDATE books SET title = ?, author = ?, cover = ? WHERE id = ?'),
  deleteBook: db.prepare('DELETE FROM books WHERE id = ?'),

  selectCopies: db.prepare('SELECT * FROM copies WHERE book_id = ? ORDER BY copy_number'),
  insertCopy: db.prepare(
    'INSERT INTO copies (book_id, copy_number, is_issued, due_date, customer_id, branch_id) VALUES (?, ?, 0, NULL, NULL, ?)'
  ),
  updateCopy: db.prepare('UPDATE copies SET is_issued = ?, due_date = ?, customer_id = ? WHERE id = ?'),
  findAvailableCopyAtBranch: db.prepare(
    'SELECT * FROM copies WHERE book_id = ? AND branch_id = ? AND is_issued = 0 ORDER BY copy_number LIMIT 1'
  ),
  findIssuedCopyForCustomer: db.prepare('SELECT * FROM copies WHERE book_id = ? AND is_issued = 1 AND customer_id = ?'),
  maxCopyNumber: db.prepare('SELECT COALESCE(MAX(copy_number), 0) AS maxNum FROM copies WHERE book_id = ?'),

  selectHolds: db.prepare('SELECT customer_id FROM holds WHERE book_id = ? ORDER BY position'),
  maxHoldPosition: db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM holds WHERE book_id = ?'),
  insertHold: db.prepare('INSERT INTO holds (book_id, customer_id, position) VALUES (?, ?, ?)'),
  deleteHold: db.prepare('DELETE FROM holds WHERE book_id = ? AND customer_id = ?'),
};

function composeBook(row) {
  if (!row) return null;
  const copies = stmts.selectCopies.all(row.id).map((c) => ({
    copyId: c.copy_number,
    isIssued: Boolean(c.is_issued),
    dueDate: c.due_date,
    customerId: c.customer_id,
    branchId: c.branch_id,
  }));
  const holds = stmts.selectHolds.all(row.id).map((h) => h.customer_id);
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    cover: row.cover,
    holds,
    copies,
  };
}

const Book = {
  getAll() {
    return stmts.selectAllBooks.all().map(composeBook);
  },

  getById(id) {
    return composeBook(stmts.selectBook.get(id));
  },

  create({ title, author, cover, copies, branchId }) {
    const copyCount = Math.min(Math.max(Number(copies) || 1, 1), 999);
    const resolvedBranchId = branchId ? Number(branchId) : DEFAULT_BRANCH_ID;
    const info = stmts.insertBook.run(
      String(title).trim(),
      String(author || 'Unknown').trim(),
      cover ? String(cover) : null
    );
    const bookId = info.lastInsertRowid;
    for (let i = 1; i <= copyCount; i++) {
      stmts.insertCopy.run(bookId, i, resolvedBranchId);
    }
    return this.getById(bookId);
  },

  /** Adds more copies of an existing title at a given branch. Throws a {status, message} error on failure. */
  addCopies(id, branchId, count) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const branch = Branch.getById(Number(branchId));
    if (!branch) throw { status: 404, message: `Branch ${branchId} not found.` };
    const addCount = Math.min(Math.max(Number(count) || 1, 1), 999);
    let nextNum = stmts.maxCopyNumber.get(id).maxNum + 1;
    for (let i = 0; i < addCount; i++) {
      stmts.insertCopy.run(id, nextNum++, branch.id);
    }
    return this.getById(id);
  },

  update(id, changes) {
    const book = this.getById(id);
    if (!book) return null;
    const title = changes.title !== undefined ? changes.title : book.title;
    const author = changes.author !== undefined ? changes.author : book.author;
    const cover = changes.cover !== undefined ? changes.cover : book.cover;
    stmts.updateBook.run(title, author, cover, id);
    return this.getById(id);
  },

  /** Removes a book. Throws a {status, message} error on failure. */
  remove(id) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    if (book.copies.some((c) => c.isIssued)) {
      throw { status: 409, message: `Can't withdraw "${book.title}" while a copy is still checked out.` };
    }
    stmts.deleteBook.run(id); // copies and holds cascade-delete via foreign keys
    return true;
  },

  isCopyOverdue(copy) {
    return Boolean(copy.isIssued && copy.dueDate && new Date(copy.dueDate) < new Date());
  },

  availableCount(book) {
    return book.copies.filter((c) => !c.isIssued).length;
  },

  availableCountAtBranch(book, branchId) {
    return book.copies.filter((c) => !c.isIssued && c.branchId === Number(branchId)).length;
  },

  /** Attaches computed fields (counts, soonest due date, per-branch breakdown) for API responses.
   *  Doesn't mutate storage. */
  withStats(book) {
    const total = book.copies.length;
    const available = this.availableCount(book);
    const issuedCopies = book.copies.filter((c) => c.isIssued);
    const nextDueDate = issuedCopies.length
      ? issuedCopies.reduce((min, c) => (!min || c.dueDate < min ? c.dueDate : min), null)
      : null;
    const anyOverdue = issuedCopies.some((c) => this.isCopyOverdue(c));

    const branches = Branch.getAll();
    const branchAvailability = branches
      .map((b) => {
        const copiesHere = book.copies.filter((c) => c.branchId === b.id);
        return {
          branchId: b.id,
          branchName: b.name,
          total: copiesHere.length,
          available: copiesHere.filter((c) => !c.isIssued).length,
        };
      })
      .filter((b) => b.total > 0);

    return { ...book, totalCopies: total, availableCopies: available, nextDueDate, anyOverdue, branchAvailability };
  },

  /** Marks the first available copy at a branch as issued. Throws a {status, message} error on failure. */
  issueCopy(id, customerId, dueDate, branchId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const resolvedBranchId = branchId ? Number(branchId) : DEFAULT_BRANCH_ID;
    const copyRow = stmts.findAvailableCopyAtBranch.get(id, resolvedBranchId);
    if (!copyRow) {
      const branch = Branch.getById(resolvedBranchId);
      throw {
        status: 409,
        message: `No copies of "${book.title}" are available at ${branch ? branch.name : 'that branch'}.`,
      };
    }
    stmts.updateCopy.run(1, dueDate, customerId, copyRow.id);
    return this.getById(id);
  },

  /** Finds and clears the copy issued to a given customer. Throws a {status, message} error if none found. */
  returnCopy(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const copyRow = stmts.findIssuedCopyForCustomer.get(id, customerId);
    if (!copyRow) {
      throw { status: 409, message: `That member doesn't have a copy of "${book.title}" checked out.` };
    }
    const priorDueDate = copyRow.due_date;
    stmts.updateCopy.run(0, null, null, copyRow.id);
    return { book: this.getById(id), priorDueDate };
  },

  /** Extends the due date on the copy issued to a given customer. Throws a {status, message} error if none found. */
  renewCopy(id, customerId, newDueDate) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    const copyRow = stmts.findIssuedCopyForCustomer.get(id, customerId);
    if (!copyRow) {
      throw { status: 409, message: `That member doesn't have a copy of "${book.title}" checked out.` };
    }
    stmts.updateCopy.run(1, newDueDate, customerId, copyRow.id);
    return this.getById(id);
  },

  /** Adds a customer to a book's hold queue. Throws a {status, message} error on failure. */
  addHold(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    if (this.availableCount(book) > 0) {
      throw { status: 409, message: `"${book.title}" is available right now \u2014 no need to hold it.` };
    }
    if (book.holds.includes(customerId)) {
      throw { status: 409, message: 'That member is already in the hold queue for this book.' };
    }
    const nextPos = stmts.maxHoldPosition.get(id).maxPos + 1;
    stmts.insertHold.run(id, customerId, nextPos);
    return this.getById(id);
  },

  /** Removes a customer from a book's hold queue. Throws a {status, message} error on failure. */
  removeHold(id, customerId) {
    const book = this.getById(id);
    if (!book) throw { status: 404, message: `Book ${id} not found.` };
    stmts.deleteHold.run(id, customerId);
    return this.getById(id);
  },

  /** Removes and returns the first customer in the hold queue (called on issue). */
  shiftHold(id) {
    const book = this.getById(id);
    if (!book || book.holds.length === 0) return null;
    const next = book.holds[0];
    stmts.deleteHold.run(id, next);
    return next;
  },
};

module.exports = Book;