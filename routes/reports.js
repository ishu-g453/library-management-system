/**
 * Reports & Analytics Routes (/api/reports)
 * Aggregates statistics, overdue lists, active issues, return history, and system audit logs.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

function refreshOverdueStatus() {
    const today = new Date().toISOString().split('T')[0];
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
        const fine = diffDays * 5.0;
        updateStmt.run(fine, item.id);
    }
}

/**
 * GET /api/reports/dashboard-stats
 * Returns high-level counters for dashboard widgets
 */
router.get('/dashboard-stats', authenticateToken, (req, res) => {
    try {
        refreshOverdueStatus();
        const today = new Date().toISOString().split('T')[0];

        // 1. Books Counts
        const bookStats = db.prepare(`
            SELECT 
                COUNT(*) as total_titles,
                COALESCE(SUM(total_copies), 0) as total_copies,
                COALESCE(SUM(available_copies), 0) as available_copies
            FROM books
        `).get();

        // 2. Member Counts
        const memberStats = db.prepare(`
            SELECT 
                COUNT(*) as total_members,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_members
            FROM members
        `).get();

        // 3. Issue & Loan Counts (Accurate and synchronized)
        const issueStats = db.prepare(`
            SELECT 
                SUM(CASE WHEN status IN ('issued', 'overdue') THEN 1 ELSE 0 END) as active_issued,
                SUM(CASE WHEN status = 'overdue' OR (status = 'issued' AND due_date < ?) THEN 1 ELSE 0 END) as overdue_count,
                SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned_count,
                COALESCE(SUM(fine_amount), 0) as total_fines
            FROM book_issues
        `).get(today);

        // 4. Student-specific statistics if student role
        let studentStats = null;
        if (req.user.role === 'student') {
            studentStats = db.prepare(`
                SELECT 
                    SUM(CASE WHEN bi.status IN ('issued', 'overdue') THEN 1 ELSE 0 END) as my_borrowed_books,
                    SUM(CASE WHEN bi.status = 'overdue' OR (bi.status = 'issued' AND bi.due_date < ?) THEN 1 ELSE 0 END) as my_overdue_books,
                    SUM(CASE WHEN bi.status = 'returned' THEN 1 ELSE 0 END) as my_returned_books,
                    COALESCE(SUM(bi.fine_amount), 0) as my_pending_fines
                FROM book_issues bi
                JOIN members m ON bi.member_id = m.id
                WHERE m.user_id = ? OR LOWER(m.email) = LOWER(?)
            `).get(today, req.user.id, req.user.email || '');
        }

        // 5. Recent Activity Logs (Admin/Librarian)
        const recentActivities = db.prepare(`
            SELECT al.*, u.name as user_name, u.role as user_role
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.id DESC LIMIT 6
        `).all();

        return res.json({
            success: true,
            stats: {
                totalTitles: bookStats.total_titles || 0,
                totalCopies: bookStats.total_copies || 0,
                availableCopies: bookStats.available_copies || 0,
                issuedCopies: (bookStats.total_copies - bookStats.available_copies) || 0,
                totalMembers: memberStats.total_members || 0,
                activeMembers: memberStats.active_members || 0,
                activeIssues: issueStats.active_issued || 0,
                overdueCount: issueStats.overdue_count || 0,
                returnedCount: issueStats.returned_count || 0,
                totalFines: issueStats.total_fines || 0,
                studentStats
            },
            recentActivities
        });
    } catch (error) {
        console.error('Stats error:', error);
        return res.status(500).json({ success: false, message: 'Failed to calculate stats.' });
    }
});

/**
 * GET /api/reports/overdue
 * Detailed list of overdue books with member contacts and fine details
 */
router.get('/overdue', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const overdueRecords = db.prepare(`
            SELECT bi.*, 
                   b.title as book_title, b.isbn as book_isbn, b.author as book_author,
                   m.name as member_name, m.member_code, m.email as member_email, m.phone as member_phone, m.department
            FROM book_issues bi
            JOIN books b ON bi.book_id = b.id
            JOIN members m ON bi.member_id = m.id
            WHERE bi.status = 'overdue' OR (bi.status = 'issued' AND bi.due_date < ?)
            ORDER BY bi.due_date ASC
        `).all(today);

        // Add calculated days overdue
        const enriched = overdueRecords.map(item => {
            const dueDate = new Date(item.due_date);
            const now = new Date(today);
            const daysOverdue = Math.max(1, Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)));
            const fine = Math.max(item.fine_amount, daysOverdue * 5.0);
            return {
                ...item,
                days_overdue: daysOverdue,
                calculated_fine: fine
            };
        });

        return res.json({ success: true, count: enriched.length, overdue: enriched });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch overdue report.' });
    }
});

/**
 * GET /api/reports/popular-books
 * Top most frequently issued books
 */
router.get('/popular-books', authenticateToken, (req, res) => {
    try {
        const popular = db.prepare(`
            SELECT b.id, b.title, b.author, b.category, b.available_copies, b.total_copies,
                   COUNT(bi.id) as borrow_frequency
            FROM books b
            LEFT JOIN book_issues bi ON b.id = bi.book_id
            GROUP BY b.id
            ORDER BY borrow_frequency DESC
            LIMIT 5
        `).all();

        return res.json({ success: true, books: popular });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch popular books.' });
    }
});

module.exports = router;

