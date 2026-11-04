/**
 * Members Management Routes (/api/members)
 * Handles student and faculty library memberships, CRUD operations, and borrowing history.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/members
 * List members with search and department filtering
 */
router.get('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { search, role, status } = req.query;
        let query = `
            SELECT m.*, 
                   (SELECT COUNT(*) FROM book_issues bi WHERE bi.member_id = m.id AND bi.status IN ('issued', 'overdue')) as active_books_count,
                   (SELECT COUNT(*) FROM book_issues bi WHERE bi.member_id = m.id AND bi.status = 'returned') as returned_books_count
            FROM members m
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ' AND (LOWER(m.name) LIKE LOWER(?) OR LOWER(m.member_code) LIKE LOWER(?) OR LOWER(m.email) LIKE LOWER(?))';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        if (role && role !== 'all') {
            query += ' AND m.role = ?';
            params.push(role);
        }

        if (status && status !== 'all') {
            query += ' AND m.status = ?';
            params.push(status);
        }

        query += ' ORDER BY m.id DESC';

        const members = db.prepare(query).all(...params);
        return res.json({ success: true, count: members.length, members });
    } catch (error) {
        console.error('Fetch members error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve members list.' });
    }
});

/**
 * GET /api/members/me
 * Allows current logged in student to fetch their own member card
 */
router.get('/me', authenticateToken, (req, res) => {
    try {
        const member = db.prepare(`
            SELECT m.*,
                   (SELECT COUNT(*) FROM book_issues bi WHERE bi.member_id = m.id AND bi.status IN ('issued', 'overdue')) as active_books_count
            FROM members m
            WHERE m.user_id = ? OR LOWER(m.email) = LOWER(?)
        `).get(req.user.id, req.user.email || '');

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member profile not found for this account.' });
        }

        return res.json({ success: true, member });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load member profile.' });
    }
});

/**
 * GET /api/members/:id
 * Get single member details with active and past borrowing history
 */
router.get('/:id', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found.' });
        }

        // Get borrowing history for this member
        const issues = db.prepare(`
            SELECT bi.*, b.title as book_title, b.isbn as book_isbn
            FROM book_issues bi
            JOIN books b ON bi.book_id = b.id
            WHERE bi.member_id = ?
            ORDER BY bi.id DESC
        `).all(req.params.id);

        return res.json({ success: true, member, history: issues });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load member history.' });
    }
});

/**
 * POST /api/members
 * Create a new member (Admin & Librarian only)
 */
router.post('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { member_code, name, email, phone, department, role, status } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and Email are required fields.'
            });
        }

        // Generate or validate member code
        let code = member_code ? member_code.trim().toUpperCase() : null;
        if (!code) {
            const last = db.prepare('SELECT id FROM members ORDER BY id DESC LIMIT 1').get();
            const nextId = (last ? last.id : 0) + 1001;
            code = `MEM-${nextId}`;
        }

        // Check duplicate code
        const existingCode = db.prepare('SELECT id FROM members WHERE member_code = ?').get(code);
        if (existingCode) {
            return res.status(400).json({
                success: false,
                message: `Member code "${code}" is already assigned.`
            });
        }

        const stmt = db.prepare(`
            INSERT INTO members (member_code, name, email, phone, department, role, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            code,
            name.trim(),
            email.trim(),
            phone ? phone.trim() : null,
            department ? department.trim() : 'General',
            role || 'student',
            status || 'active'
        );

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'ADD_MEMBER', `Added new member ${name} (${code}).`);

        const newMember = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);

        return res.status(201).json({
            success: true,
            message: `Member "${name}" registered successfully with Code: ${code}!`,
            member: newMember
        });
    } catch (error) {
        console.error('Create member error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create member.' });
    }
});

/**
 * PUT /api/members/:id
 * Update member details (Admin & Librarian only)
 */
router.put('/:id', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const memberId = req.params.id;
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found.' });
        }

        const { member_code, name, email, phone, department, role, status } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and Email cannot be empty.'
            });
        }

        // Check if member code is being changed and conflicts
        if (member_code && member_code.trim().toUpperCase() !== member.member_code) {
            const conflict = db.prepare('SELECT id FROM members WHERE member_code = ? AND id != ?')
                .get(member_code.trim().toUpperCase(), memberId);
            if (conflict) {
                return res.status(400).json({
                    success: false,
                    message: `Member code "${member_code.trim().toUpperCase()}" is already in use.`
                });
            }
        }

        db.prepare(`
            UPDATE members
            SET member_code = ?, name = ?, email = ?, phone = ?, department = ?, role = ?, status = ?
            WHERE id = ?
        `).run(
            member_code ? member_code.trim().toUpperCase() : member.member_code,
            name.trim(),
            email.trim(),
            phone !== undefined ? phone : member.phone,
            department !== undefined ? department : member.department,
            role || member.role,
            status || member.status,
            memberId
        );

        const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
        return res.json({
            success: true,
            message: 'Member details updated successfully!',
            member: updated
        });
    } catch (error) {
        console.error('Update member error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update member.' });
    }
});

/**
 * DELETE /api/members/:id
 * Delete a member (Admin only)
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const memberId = req.params.id;
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found.' });
        }

        // Check active borrowings
        const activeLoans = db.prepare(`
            SELECT COUNT(*) as count FROM book_issues 
            WHERE member_id = ? AND status IN ('issued', 'overdue')
        `).get(memberId).count;

        if (activeLoans > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete member "${member.name}". They currently have ${activeLoans} unreturned book(s). Please return all books first.`
            });
        }

        // Remove past issue records and member
        db.prepare('DELETE FROM book_issues WHERE member_id = ?').run(memberId);
        db.prepare('DELETE FROM members WHERE id = ?').run(memberId);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'DELETE_MEMBER', `Deleted member ${member.name} (${member.member_code}).`);

        return res.json({
            success: true,
            message: `Member "${member.name}" deleted successfully.`
        });
    } catch (error) {
        console.error('Delete member error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete member.' });
    }
});

module.exports = router;

