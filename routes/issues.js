/**
 * Book Issues & Returns Routes (/api/issues)
 * Handles book circulation, returns, due dates, fines, and student loan history.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const DAILY_FINE_RATE = 5.0; // ₹5 per day overdue

/**
 * Helper to update overdue status and calculate current fines
 */
function refreshOverdueStatus() {
    const today = new Date().toISOString().split('T')[0];

    // Find all active issues past their due date
    const overdueIssues = db.prepare(`
        SELECT id, due_date FROM book_issues 
        WHERE status = 'issued' AND due_date < ?
    `).all(today);

    const updateStmt = db.prepare(`
        UPDATE book_issues 
        SET status = 'overdue', fine_amount = ? 
        WHERE id = ?
    `);

    for (const item of overdueIssues) {
        const dueDate = new Date(item.due_date);
        const now = new Date(today);
        const diffDays = Math.max(1, Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)));
        const fine = diffDays * DAILY_FINE_RATE;
        updateStmt.run(fine, item.id);
    }
}

/**
 * GET /api/issues
 * Get list of book issues with filter (status, student specific)
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        refreshOverdueStatus();

        const { status, search } = req.query;
        let query = `
            SELECT bi.*, 
                   b.title as book_title, b.isbn as book_isbn, b.author as book_author,
                   m.name as member_name, m.member_code, m.email as member_email, m.phone as member_phone,
                   u.name as issued_by_name
            FROM book_issues bi
            JOIN books b ON bi.book_id = b.id
            JOIN members m ON bi.member_id = m.id
            LEFT JOIN users u ON bi.issued_by = u.id
            WHERE 1=1
        `;
        const params = [];

        // If the logged in user is a student, only show their own loans
        if (req.user.role === 'student') {
            query += ' AND (m.user_id = ? OR LOWER(m.email) = LOWER(?))';
            params.push(req.user.id, req.user.email || '');
        }

        if (status && status !== 'all') {
            query += ' AND bi.status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND (LOWER(b.title) LIKE LOWER(?) OR LOWER(m.name) LIKE LOWER(?) OR LOWER(m.member_code) LIKE LOWER(?))';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        query += ' ORDER BY bi.id DESC';

        const issues = db.prepare(query).all(...params);
        return res.json({ success: true, count: issues.length, issues });
    } catch (error) {
        console.error('Fetch issues error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve issue records.' });
    }
});

/**
 * POST /api/issues
 * Issue a book to a member (Admin & Librarian only)
 */
router.post('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { book_id, member_id, due_date, remarks } = req.body;

        if (!book_id || !member_id) {
            return res.status(400).json({
                success: false,
                message: 'Book and Member selections are required.'
            });
        }

        // 1. Verify Book and Availability
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Selected book does not exist.' });
        }

        if (book.available_copies <= 0) {
            return res.status(400).json({
                success: false,
                message: `"${book.title}" is currently out of stock (0 available copies). Please return an issued copy before issuing again.`
            });
        }

        // 2. Verify Member & Status
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Selected member does not exist.' });
        }

        if (member.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: `Member "${member.name}" is currently ${member.status}. Cannot issue books.`
            });
        }

        // 3. Check active borrowed count (max 5 books)
        const activeCount = db.prepare(`
            SELECT COUNT(*) as count FROM book_issues 
            WHERE member_id = ? AND status IN ('issued', 'overdue')
        `).get(member_id).count;

        if (activeCount >= 5) {
            return res.status(400).json({
                success: false,
                message: `Member "${member.name}" already has ${activeCount} active book loans (maximum limit is 5).`
            });
        }

        // 4. Calculate default due date (14 days from today if not provided)
        const today = new Date().toISOString().split('T')[0];
        let calculatedDueDate = due_date;
        if (!calculatedDueDate) {
            const d = new Date();
            d.setDate(d.getDate() + 14);
            calculatedDueDate = d.toISOString().split('T')[0];
        }

        // 5. Atomic transaction: Deduct copy + Create issue record
        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?').run(book_id);

            const result = db.prepare(`
                INSERT INTO book_issues (book_id, member_id, issue_date, due_date, status, fine_amount, issued_by, remarks)
                VALUES (?, ?, ?, ?, 'issued', 0.0, ?, ?)
            `).run(book_id, member_id, today, calculatedDueDate, req.user.id, remarks || null);

            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(req.user.id, 'ISSUE_BOOK', `Issued "${book.title}" to ${member.name} (${member.member_code}). Due on: ${calculatedDueDate}`);

            db.exec('COMMIT;');

            return res.status(201).json({
                success: true,
                message: `Book "${book.title}" issued successfully to ${member.name}!`,
                issue_id: result.lastInsertRowid
            });
        } catch (txError) {
            db.exec('ROLLBACK;');
            throw txError;
        }
    } catch (error) {
        console.error('Issue book error:', error);
        return res.status(500).json({ success: false, message: 'Failed to issue book.' });
    }
});

/**
 * POST /api/issues/:id/return
 * Return an issued book, calculate fine, and restore book availability (Admin & Librarian only)
 */
router.post('/:id/return', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const issueId = req.params.id;
        const issue = db.prepare(`
            SELECT bi.*, b.title as book_title, m.name as member_name 
            FROM book_issues bi
            JOIN books b ON bi.book_id = b.id
            JOIN members m ON bi.member_id = m.id
            WHERE bi.id = ?
        `).get(issueId);

        if (!issue) {
            return res.status(404).json({ success: false, message: 'Issue record not found.' });
        }

        if (issue.status === 'returned') {
            return res.status(400).json({
                success: false,
                message: `This book was already returned on ${issue.return_date}.`
            });
        }

        const today = new Date().toISOString().split('T')[0];
        let fine = 0.0;

        // Calculate fine if overdue
        if (today > issue.due_date) {
            const dueDate = new Date(issue.due_date);
            const returnDate = new Date(today);
            const overdueDays = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
            if (overdueDays > 0) {
                fine = overdueDays * DAILY_FINE_RATE;
            }
        }

        // Transaction: Return book + increment availability
        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                UPDATE book_issues 
                SET return_date = ?, status = 'returned', fine_amount = ?, fine_paid = ?
                WHERE id = ?
            `).run(today, fine, fine > 0 ? 1 : 0, issueId);

            db.prepare('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?').run(issue.book_id);

            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(req.user.id, 'RETURN_BOOK', `Returned "${issue.book_title}" from ${issue.member_name}. Fine: ₹${fine}`);

            db.exec('COMMIT;');

            return res.json({
                success: true,
                message: `Book "${issue.book_title}" returned successfully! ${fine > 0 ? `Overdue fine of ₹${fine} applied.` : 'No overdue fine.'}`,
                fine_amount: fine
            });
        } catch (txError) {
            db.exec('ROLLBACK;');
            throw txError;
        }
    } catch (error) {
        console.error('Return book error:', error);
        return res.status(500).json({ success: false, message: 'Failed to process return.' });
    }
});

/**
 * POST /api/issues/:id/renew
 * Extend due date by 14 days (Admin, Librarian, or the borrowing Student)
 */
router.post('/:id/renew', authenticateToken, (req, res) => {
    try {
        const issueId = req.params.id;
        const issue = db.prepare('SELECT * FROM book_issues WHERE id = ?').get(issueId);

        if (!issue) {
            return res.status(404).json({ success: false, message: 'Issue record not found.' });
        }

        if (issue.status === 'returned') {
            return res.status(400).json({ success: false, message: 'Cannot renew an already returned book.' });
        }

        if (issue.status === 'overdue') {
            return res.status(400).json({
                success: false,
                message: 'Overdue books cannot be renewed. Please return the book and clear pending fines.'
            });
        }

        // Extend due date by 14 days from current due date
        const currentDue = new Date(issue.due_date);
        currentDue.setDate(currentDue.getDate() + 14);
        const newDueDate = currentDue.toISOString().split('T')[0];

        db.prepare('UPDATE book_issues SET due_date = ? WHERE id = ?').run(newDueDate, issueId);

        return res.json({
            success: true,
            message: `Book renewed successfully! New due date is ${newDueDate}.`,
            new_due_date: newDueDate
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to renew book.' });
    }
});

module.exports = router;

