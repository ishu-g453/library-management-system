/**
 * Library Settings API Routes (/api/settings)
 * Manages fine rates, loan periods, system names, and institution contacts.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/settings
 * Retrieve all system settings
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM settings ORDER BY key ASC').all();
        const settingsMap = {};
        rows.forEach(r => {
            settingsMap[r.key] = r.value;
        });

        return res.json({ success: true, settings: settingsMap, raw: rows });
    } catch (error) {
        console.error('Fetch settings error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve settings.' });
    }
});

/**
 * PUT /api/settings
 * Update library configuration settings (Admin only)
 */
router.put('/', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const updates = req.body;
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid payload.' });
        }

        const updateStmt = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP');

        for (const [key, value] of Object.entries(updates)) {
            updateStmt.run(key, String(value));
        }

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'UPDATE_SETTINGS', 'Administrator updated library system settings.');

        return res.json({ success: true, message: 'Library settings saved successfully!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to save settings.' });
    }
});

module.exports = router;

