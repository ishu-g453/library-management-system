/**
 * Authentication and Role-based Authorization Middleware
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'smartlib-super-secret-jwt-key-2026';

/**
 * Verify JWT Token from Authorization header
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.split(' ')[1] 
        : req.headers['x-access-token'];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. Authentication token missing.'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired authentication session. Please login again.'
        });
    }
}

/**
 * Require specific role(s) to access a route
 * @param {Array<string>|string} allowedRoles 
 */
function requireRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Authentication required.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden. Action restricted to: ${roles.join(', ')}.`
            });
        }

        next();
    };
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    requireRole
};

