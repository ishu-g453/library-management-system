/**
 * Notifications API Routes (/api/notifications)
 * Handles announcements, overdue notices, policy alerts, and read states.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Retrieves notifications relevant to the current user
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        const notifications = db.prepare(`
            SELECT * FROM notifications
            WHERE user_id = ? OR role = 'all' OR role = ?
            ORDER BY id DESC
        `).all(userId, role);

        const unreadCount = notifications.filter(n => n.is_read === 0).length;

        return res.json({ success: true, count: notifications.length, unreadCount, notifications });
    } catch (error) {
        console.error('Fetch notifications error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
    }
});

/**
 * POST /api/notifications
 * Create a new announcement or alert (Admin & Librarian)
 */
router.post('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { title, message, type, target_role } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required.' });
        }

        const role = target_role || 'all';
        const notifType = ['info', 'warning', 'alert', 'success'].includes(type) ? type : 'info';

        const result = db.prepare(`
            INSERT INTO notifications (user_id, role, title, message, type)
            VALUES (NULL, ?, ?, ?, ?)
        `).run(role, title.trim(), message.trim(), notifType);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'POST_NOTIFICATION', `Published bulletin: "${title.trim()}" (Target: ${role})`);

        const newNotif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
        return res.status(201).json({ success: true, message: 'Notification broadcasted successfully!', notification: newNotif });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to create notification.' });
    }
});

/**
 * PUT /api/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticateToken, (req, res) => {
    try {
        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
        return res.json({ success: true, message: 'Notification marked as read.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update notification.' });
    }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for current user
 */
router.post('/mark-all-read', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        db.prepare(`
            UPDATE notifications 
            SET is_read = 1 
            WHERE user_id = ? OR role = 'all' OR role = ?
        `).run(userId, role);

        return res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
    }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification (Admin only)
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
        return res.json({ success: true, message: 'Notification removed.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
    }
});

module.exports = router;

