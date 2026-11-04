/**
 * Librarians Management Routes (/api/librarians)
 * Admin-only management of library staff & operators.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/librarians
 * List all librarians with issue count stats (Admin only)
 */
router.get('/', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const librarians = db.prepare(`
            SELECT u.id, u.username, u.name, u.email, u.phone, u.role, u.created_at,
                   (SELECT COUNT(*) FROM book_issues bi WHERE bi.issued_by = u.id) as total_issued_count
            FROM users u
            WHERE u.role = 'librarian'
            ORDER BY u.id DESC
        `).all();

        return res.json({ success: true, count: librarians.length, librarians });
    } catch (error) {
        console.error('Fetch librarians error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve librarians.' });
    }
});

/**
 * POST /api/librarians
 * Register new librarian (Admin only)
 */
router.post('/', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const { username, password, name, email, phone } = req.body;

        if (!username || !password || !name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Username, password, full name, and email address are required.'
            });
        }

        if (password.length < 5) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 5 characters long.'
            });
        }

        // Check duplicate username
        const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
        if (existingUser) {
            return res.status(400).json({ success: false, message: `Username "${username.trim()}" is already taken.` });
        }

        // Check duplicate email
        const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
        if (existingEmail) {
            return res.status(400).json({ success: false, message: `Email "${email.trim()}" is already registered.` });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(`
            INSERT INTO users (username, password, name, email, phone, role)
            VALUES (?, ?, ?, ?, ?, 'librarian')
        `).run(username.trim(), hash, name.trim(), email.trim(), phone ? phone.trim() : null);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'ADD_LIBRARIAN', `Admin registered new librarian: ${name.trim()} (@${username.trim()})`);

        const newLibrarian = db.prepare('SELECT id, username, name, email, phone, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
        return res.status(201).json({
            success: true,
            message: `Librarian "${name}" registered successfully!`,
            librarian: newLibrarian
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to create librarian account.' });
    }
});

/**
 * PUT /api/librarians/:id
 * Edit librarian details or update password (Admin only)
 */
router.put('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, password } = req.body;

        const librarian = db.prepare('SELECT * FROM users WHERE id = ? AND role = "librarian"').get(id);
        if (!librarian) {
            return res.status(404).json({ success: false, message: 'Librarian account not found.' });
        }

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email cannot be empty.' });
        }

        // Email conflict check
        const conflictEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email.trim(), id);
        if (conflictEmail) {
            return res.status(400).json({ success: false, message: `Email "${email.trim()}" is used by another account.` });
        }

        if (password && password.trim()) {
            if (password.trim().length < 5) {
                return res.status(400).json({ success: false, message: 'New password must be at least 5 characters.' });
            }
            const hash = bcrypt.hashSync(password.trim(), 10);
            db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, password = ? WHERE id = ?')
                .run(name.trim(), email.trim(), phone ? phone.trim() : null, hash, id);
        } else {
            db.prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?')
                .run(name.trim(), email.trim(), phone ? phone.trim() : null, id);
        }

        const updated = db.prepare('SELECT id, username, name, email, phone, role, created_at FROM users WHERE id = ?').get(id);
        return res.json({ success: true, message: 'Librarian updated successfully!', librarian: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update librarian.' });
    }
});

/**
 * DELETE /api/librarians/:id
 * Delete librarian account (Admin only)
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id, 10) === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own active administrator account.' });
        }

        const librarian = db.prepare('SELECT * FROM users WHERE id = ? AND role = "librarian"').get(id);
        if (!librarian) {
            return res.status(404).json({ success: false, message: 'Librarian account not found.' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(id);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'DELETE_LIBRARIAN', `Admin deleted librarian account: ${librarian.name} (@${librarian.username})`);

        return res.json({ success: true, message: `Librarian "${librarian.name}" deleted successfully.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to delete librarian account.' });
    }
});

module.exports = router;

