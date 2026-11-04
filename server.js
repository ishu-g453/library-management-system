/**
 * Library Management System - Main Express Server
 * Serves the REST API and the frontend client on a single port.
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for VS Code Live Server (e.g. port 5500) and other dev setups
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token']
}));

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files directly from the project directory
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/members', require('./routes/members'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/librarians', require('./routes/librarians'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/settings', require('./routes/settings'));

// Health check / API status endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        system: 'SmartLib Management System API',
        timestamp: new Date().toISOString()
    });
});

// Fallback to index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Server Internal Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'An unexpected server error occurred.'
    });
});

// Start Server if run directly
let server;
if (require.main === module) {
    server = app.listen(PORT, () => {
        console.log('====================================================');
        console.log(`🚀 SmartLib System running at: http://localhost:${PORT}`);
        console.log(`📚 Database: SQLite (database.sqlite) connected`);
        console.log('🔑 Demo Accounts:');
        console.log('   - Admin:     admin     / admin123');
        console.log('   - Librarian: librarian / lib123');
        console.log('   - Student:   student   / student123');
        console.log('====================================================');
    });
}

module.exports = { app, server };
