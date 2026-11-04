/**
 * Dashboard Controller (js/dashboard.js)
 * Loads real-time metric cards, popular books, and recent audit activity.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Require authentication for this page
    const user = Auth.requireAuth();
    if (!user) return;

    // 2. Setup sidebar, user avatar, and logout handlers
    setupAppLayout('nav-dashboard');

    // DOM Elements
    const totalTitlesEl = document.getElementById('stat-total-titles');
    const availableCopiesEl = document.getElementById('stat-available-copies');
    const issuedCopiesEl = document.getElementById('stat-issued-copies');
    const overdueCountEl = document.getElementById('stat-overdue-count');
    const popularTableBody = document.getElementById('popular-books-table-body');
    const activityTableBody = document.getElementById('recent-activity-table-body');

    try {
        // Fetch Dashboard Stats
        const response = await apiRequest('/reports/dashboard-stats');

        if (response.success && response.stats) {
            const stats = response.stats;

            // Check if user is a student - adapt stat numbers to personalize student view
            if (user.role === 'student' && stats.studentStats) {
                totalTitlesEl.textContent = stats.totalTitles;
                availableCopiesEl.textContent = stats.availableCopies;
                issuedCopiesEl.textContent = stats.studentStats.my_borrowed_books || 0;
                overdueCountEl.textContent = stats.studentStats.my_overdue_books || 0;

                // Update card labels for student
                document.querySelector('#stat-issued-copies').parentElement.querySelector('span').textContent = 'My Borrowed Books';
                document.querySelector('#stat-overdue-count').parentElement.querySelector('span').textContent = 'My Overdue Books';
            } else {
                totalTitlesEl.textContent = stats.totalTitles || 0;
                availableCopiesEl.textContent = stats.availableCopies || 0;
                issuedCopiesEl.textContent = stats.issuedCopies || 0;
                overdueCountEl.textContent = stats.overdueCount || 0;
            }

            // Render Recent Activities
            renderActivities(response.recentActivities || []);
        } else {
            showToast('Failed to load metrics from server', 'error');
        }

        // Fetch Popular Books
        const popularRes = await apiRequest('/reports/popular-books');
        if (popularRes.success && popularRes.books) {
            renderPopularBooks(popularRes.books);
        }
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error connecting to backend services', 'error');
    }

    function renderPopularBooks(books) {
        if (!books || books.length === 0) {
            popularTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No library books registered yet.</td></tr>';
            return;
        }

        popularTableBody.innerHTML = books.map(book => `
            <tr>
                <td>
                    <strong style="color: var(--text-primary); display: block;">${escapeHTML(book.title)}</strong>
                    <small style="color: var(--text-secondary);">${escapeHTML(book.author)}</small>
                </td>
                <td><span class="badge badge-info">${escapeHTML(book.category)}</span></td>
                <td>
                    ${book.available_copies > 0 
                        ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> ${book.available_copies} of ${book.total_copies}</span>`
                        : '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Out of Stock</span>'
                    }
                </td>
            </tr>
        `).join('');
    }

    function renderActivities(activities) {
        if (!activities || activities.length === 0) {
            activityTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No recent activity found.</td></tr>';
            return;
        }

        activityTableBody.innerHTML = activities.map(item => {
            const timeAgo = formatTime(item.timestamp);
            let actionBadge = 'badge-secondary';
            if (item.action.includes('ISSUE')) actionBadge = 'badge-warning';
            if (item.action.includes('RETURN')) actionBadge = 'badge-success';
            if (item.action.includes('ADD') || item.action.includes('INIT')) actionBadge = 'badge-info';
            if (item.action.includes('DELETE')) actionBadge = 'badge-danger';

            return `
                <tr>
                    <td><span class="badge ${actionBadge}">${escapeHTML(item.action)}</span></td>
                    <td style="font-size: 0.85rem; max-width: 250px;">${escapeHTML(item.details || '')}</td>
                    <td style="font-size: 0.8rem; color: var(--text-light); white-space: nowrap;">${timeAgo}</td>
                </tr>
            `;
        }).join('');
    }

    function formatTime(timestamp) {
        if (!timestamp) return 'Just now';
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

