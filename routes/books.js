/**
 * Books API Routes (/api/books)
 * Handles book catalog CRUD, search, availability checks, and category listing.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/books
 * List all books with optional search query & category filter
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const { search, category, availability } = req.query;
        let query = 'SELECT * FROM books WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (LOWER(title) LIKE LOWER(?) OR LOWER(author) LIKE LOWER(?) OR LOWER(isbn) LIKE LOWER(?))';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        if (category && category !== 'All') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (availability === 'available') {
            query += ' AND available_copies > 0';
        } else if (availability === 'unavailable') {
            query += ' AND available_copies = 0';
        }

        query += ' ORDER BY id DESC';

        const books = db.prepare(query).all(...params);
        return res.json({ success: true, count: books.length, books });
    } catch (error) {
        console.error('Fetch books error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve books.' });
    }
});

/**
 * GET /api/books/categories
 * Get distinct categories list
 */
router.get('/categories', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT DISTINCT category FROM books ORDER BY category ASC').all();
        const categories = rows.map(r => r.category);
        return res.json({ success: true, categories });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
    }
});

/**
 * GET /api/books/:id
 * Get single book details
 */
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found.' });
        }
        return res.json({ success: true, book });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to retrieve book.' });
    }
});

/**
 * POST /api/books
 * Add new book (Admin & Librarian only)
 */
router.post('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { isbn, title, author, category, publisher, publish_year, total_copies, shelf_location } = req.body;

        if (!isbn || !title || !author || !category) {
            return res.status(400).json({
                success: false,
                message: 'ISBN, Title, Author and Category are mandatory fields.'
            });
        }

        const copies = parseInt(total_copies, 10) || 1;
        if (copies < 1) {
            return res.status(400).json({
                success: false,
                message: 'Total copies must be at least 1.'
            });
        }

        // Check duplicate ISBN
        const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn.trim());
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Book with ISBN "${isbn.trim()}" already exists in the catalog.`
            });
        }

        const stmt = db.prepare(`
            INSERT INTO books (isbn, title, author, category, publisher, publish_year, total_copies, available_copies, shelf_location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            isbn.trim(),
            title.trim(),
            author.trim(),
            category.trim(),
            publisher ? publisher.trim() : null,
            publish_year ? parseInt(publish_year, 10) : null,
            copies,
            copies,
            shelf_location ? shelf_location.trim() : 'General'
        );

        // Activity log
        try {
            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(req.user.id, 'ADD_BOOK', `Added new book "${title}" (ISBN: ${isbn}).`);
        } catch (e) {}

        const newBook = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
        return res.status(201).json({
            success: true,
            message: 'Book added successfully to catalog!',
            book: newBook
        });
    } catch (error) {
        console.error('Add book error:', error);
        return res.status(500).json({ success: false, message: 'Failed to add book.' });
    }
});

/**
 * PUT /api/books/:id
 * Update book information (Admin & Librarian only)
 */
router.put('/:id', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const bookId = req.params.id;
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found.' });
        }

        const { isbn, title, author, category, publisher, publish_year, total_copies, shelf_location } = req.body;

        if (!title || !author || !category) {
            return res.status(400).json({
                success: false,
                message: 'Title, Author, and Category cannot be empty.'
            });
        }

        const newTotalCopies = parseInt(total_copies, 10) || book.total_copies;
        const currentlyIssued = book.total_copies - book.available_copies;

        if (newTotalCopies < currentlyIssued) {
            return res.status(400).json({
                success: false,
                message: `Cannot reduce total copies below ${currentlyIssued} because ${currentlyIssued} copies are currently issued.`
            });
        }

        // Available copies adjustments
        const newAvailableCopies = newTotalCopies - currentlyIssued;

        // Check if ISBN is modified and conflicts with another book
        if (isbn && isbn.trim() !== book.isbn) {
            const conflict = db.prepare('SELECT id FROM books WHERE isbn = ? AND id != ?').get(isbn.trim(), bookId);
            if (conflict) {
                return res.status(400).json({
                    success: false,
                    message: `Another book with ISBN "${isbn.trim()}" already exists.`
                });
            }
        }

        db.prepare(`
            UPDATE books
            SET isbn = ?, title = ?, author = ?, category = ?, publisher = ?, publish_year = ?, 
                total_copies = ?, available_copies = ?, shelf_location = ?
            WHERE id = ?
        `).run(
            isbn ? isbn.trim() : book.isbn,
            title.trim(),
            author.trim(),
            category.trim(),
            publisher !== undefined ? publisher : book.publisher,
            publish_year !== undefined ? parseInt(publish_year, 10) : book.publish_year,
            newTotalCopies,
            newAvailableCopies,
            shelf_location !== undefined ? shelf_location : book.shelf_location,
            bookId
        );

        const updated = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
        return res.json({
            success: true,
            message: 'Book updated successfully!',
            book: updated
        });
    } catch (error) {
        console.error('Update book error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update book.' });
    }
});

/**
 * DELETE /api/books/:id
 * Delete book from catalog (Admin only)
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const bookId = req.params.id;
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found.' });
        }

        // Prevent deleting book if copies are currently issued
        const activeIssues = db.prepare(`
            SELECT COUNT(*) as count FROM book_issues 
            WHERE book_id = ? AND status IN ('issued', 'overdue')
        `).get(bookId).count;

        if (activeIssues > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete book. ${activeIssues} copy/copies are currently borrowed. Return all copies first.`
            });
        }

        // Delete past returned records or cascade
        db.prepare('DELETE FROM book_issues WHERE book_id = ?').run(bookId);
        db.prepare('DELETE FROM books WHERE id = ?').run(bookId);

        try {
            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(req.user.id, 'DELETE_BOOK', `Deleted book "${book.title}" (ID: ${bookId}).`);
        } catch (e) {}

        return res.json({
            success: true,
            message: `Book "${book.title}" deleted successfully.`
        });
    } catch (error) {
        console.error('Delete book error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete book.' });
    }
});

module.exports = router;

