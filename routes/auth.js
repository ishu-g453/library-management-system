/**
 * Auth Routes (/api/auth)
 * Handles login, session check, password updates, and forgot password flow.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Role-aware, secure bcrypt authentication with JWT token issuance
 */
router.post('/login', (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required.'
            });
        }

        // Query user from database (parameterized)
        const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. User does not exist.'
            });
        }

        // Verify password hash
        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });
        }

        // Verify role match if specified
        if (role && role !== user.role) {
            return res.status(403).json({
                success: false,
                message: `Account role is "${user.role.toUpperCase()}". Please switch to the ${user.role} tab.`
            });
        }

        // Create JWT payload
        const payload = {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        // Log login activity
        try {
            db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
                .run(user.id, 'USER_LOGIN', `User ${user.username} logged in successfully as ${user.role}.`);
        } catch (e) {
            // Non-blocking log
        }

        return res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: payload
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during authentication.'
        });
    }
});

/**
 * GET /api/auth/me
 * Retrieves currently logged in user info using token
 */
router.get('/me', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        return res.json({ success: true, user });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
    }
});

/**
 * POST /api/auth/forgot-password
 * Handles password reset request with clear message if email service is unconfigured
 */
router.post('/forgot-password', (req, res) => {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
        return res.status(400).json({
            success: false,
            message: 'Please provide your registered username or email.'
        });
    }

    const user = db.prepare('SELECT id, username, email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
        .get(usernameOrEmail.trim(), usernameOrEmail.trim());

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'No account found matching that username or email address.'
        });
    }

    // Honest notification regarding email gateway
    return res.json({
        success: true,
        message: `Password reset request verified for account "${user.username}". As an SMTP email relay service is not configured in this local environment, your password has not been changed. Please contact your system administrator or use the preset demo credentials (admin123 / lib123 / student123).`
    });
});

/**
 * POST /api/auth/change-password
 * Allows logged in user to change password
 */
router.post('/change-password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 5) {
        return res.status(400).json({
            success: false,
            message: 'New password must be at least 5 characters long.'
        });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(400).json({
            success: false,
            message: 'Current password does not match.'
        });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, req.user.id);

    return res.json({
        success: true,
        message: 'Password updated successfully!'
    });
});

module.exports = router;

