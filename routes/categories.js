/**
 * Categories API Routes (/api/categories)
 * Handles book category CRUD and catalog counts.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/categories
 * Returns all categories with count of books in each
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT c.*, 
                   COUNT(b.id) as books_count,
                   COALESCE(SUM(b.total_copies), 0) as total_copies_count
            FROM categories c
            LEFT JOIN books b ON LOWER(b.category) = LOWER(c.name)
            GROUP BY c.id
            ORDER BY c.name ASC
        `).all();

        return res.json({ success: true, count: categories.length, categories });
    } catch (error) {
        console.error('Fetch categories error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve categories.' });
    }
});

/**
 * POST /api/categories
 * Add new book category (Admin & Librarian)
 */
router.post('/', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required.' });
        }

        const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(name.trim());
        if (existing) {
            return res.status(400).json({ success: false, message: `Category "${name.trim()}" already exists.` });
        }

        const result = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)')
            .run(name.trim(), description ? description.trim() : null);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'ADD_CATEGORY', `Created new book category: "${name.trim()}"`);

        const newCat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
        return res.status(201).json({ success: true, message: 'Category added successfully!', category: newCat });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to add category.' });
    }
});

/**
 * PUT /api/categories/:id
 * Edit book category (Admin & Librarian)
 */
router.put('/:id', authenticateToken, requireRole(['admin', 'librarian']), (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required.' });
        }

        const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!current) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        // Conflict check
        const conflict = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?')
            .get(name.trim(), id);
        if (conflict) {
            return res.status(400).json({ success: false, message: `Category "${name.trim()}" already exists.` });
        }

        // Update books category reference if name changed
        if (current.name !== name.trim()) {
            db.prepare('UPDATE books SET category = ? WHERE category = ?').run(name.trim(), current.name);
        }

        db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
            .run(name.trim(), description ? description.trim() : null, id);

        const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        return res.json({ success: true, message: 'Category updated successfully!', category: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update category.' });
    }
});

/**
 * DELETE /api/categories/:id
 * Delete book category (Admin only)
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
    try {
        const { id } = req.params;
        const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!current) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        // Check if books are assigned to this category
        const booksUsingCat = db.prepare('SELECT COUNT(*) as count FROM books WHERE LOWER(category) = LOWER(?)')
            .get(current.name).count;

        if (booksUsingCat > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category "${current.name}". It is currently assigned to ${booksUsingCat} book(s). Please reassign those books first.`
            });
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(id);

        db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'DELETE_CATEGORY', `Deleted category "${current.name}"`);

        return res.json({ success: true, message: `Category "${current.name}" deleted successfully.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to delete category.' });
    }
});

module.exports = router;

