/**
 * User Profile API Routes (/api/profile)
 * Allows any authenticated user to view & edit their profile and update password.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/profile
 * Returns user profile and associated library membership card
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }

        // Check if there is an associated member profile
        const member = db.prepare('SELECT * FROM members WHERE user_id = ? OR LOWER(email) = LOWER(?)').get(user.id, user.email || '');

        // If student or member, compute loan stats
        let loanStats = null;
        if (member) {
            loanStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_borrowed,
                    SUM(CASE WHEN status IN ('issued', 'overdue') THEN 1 ELSE 0 END) as active_loans,
                    SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_loans,
                    COALESCE(SUM(fine_amount), 0) as total_fines
                FROM book_issues
                WHERE member_id = ?
            `).get(member.id);
        }

        return res.json({ success: true, user, member, loanStats });
    } catch (error) {
        console.error('Profile fetch error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load profile details.' });
    }
});

/**
 * PUT /api/profile
 * Update profile contact details
 */
router.put('/', authenticateToken, (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email are required.' });
        }

        // Check email uniqueness
        const conflict = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
            .get(email.trim(), req.user.id);
        if (conflict) {
            return res.status(400).json({ success: false, message: 'Email address is already in use by another account.' });
        }

        // Update user record
        db.prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?')
            .run(name.trim(), email.trim(), phone ? phone.trim() : null, req.user.id);

        // Also sync member record if exists
        db.prepare('UPDATE members SET name = ?, email = ?, phone = ? WHERE user_id = ?')
            .run(name.trim(), email.trim(), phone ? phone.trim() : null, req.user.id);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'UPDATE_PROFILE', `User ${req.user.username} updated profile information.`);

        const updated = db.prepare('SELECT id, username, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);

        return res.json({
            success: true,
            message: 'Profile information updated successfully!',
            user: updated
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update profile.' });
    }
});

/**
 * PUT /api/profile/password
 * Update account password with verification
 */
router.put('/password', authenticateToken, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
        }

        if (newPassword.length < 5) {
            return res.status(400).json({ success: false, message: 'New password must be at least 5 characters long.' });
        }

        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(400).json({ success: false, message: 'Current password does not match.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, req.user.id);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'CHANGE_PASSWORD', `User ${req.user.username} changed account password.`);

        return res.json({ success: true, message: 'Password changed successfully!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update password.' });
    }
});

module.exports = router;

