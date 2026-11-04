/**
 * Return Books Controller (js/return-books.js)
 * Processes returns, fine calculation, and stock restoration.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth(['admin', 'librarian']);
    if (!user) return;

    setupAppLayout('nav-return-books');

    // DOM Elements
    const searchInput = document.getElementById('search-returns');
    const tableBody = document.getElementById('active-returns-table-body');
    const countBadge = document.getElementById('active-returns-count-badge');

    await loadActiveLoans();

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadActiveLoans, 250);
    });

    async function loadActiveLoans() {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Searching active loans...</td></tr>';

        const q = new URLSearchParams();
        if (searchInput.value.trim()) q.append('search', searchInput.value.trim());

        try {
            const res = await apiRequest(`/issues?${q.toString()}`);
            if (res.success && res.issues) {
                // Filter to active loans only (status = issued or overdue)
                const activeLoans = res.issues.filter(i => i.status !== 'returned');
                renderActiveLoans(activeLoans);
            } else {
                tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (e) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load active loan records.</td></tr>';
        }
    }

    function renderActiveLoans(loans) {
        countBadge.textContent = `${loans.length} Borrowed Books`;

        if (!loans || loans.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fa-solid fa-check-circle" style="color: var(--success-color);"></i>
                        <h4>All books returned</h4>
                        <p>No active loans match the current search query.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        tableBody.innerHTML = loans.map(item => {
            const isOverdue = item.status === 'overdue' || item.due_date < today;
            let statusBadge = '';

            if (isOverdue) {
                const dueDate = new Date(item.due_date);
                const nowDate = new Date(today);
                const daysLate = Math.max(1, Math.ceil((nowDate - dueDate) / (1000 * 60 * 60 * 24)));
                const fine = Math.max(item.fine_amount, daysLate * 5.0);
                statusBadge = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Overdue by ${daysLate} day(s) &bull; Fine: ₹${fine}</span>`;
            } else {
                const dueDate = new Date(item.due_date);
                const nowDate = new Date(today);
                const daysLeft = Math.ceil((dueDate - nowDate) / (1000 * 60 * 60 * 24));
                statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Due in ${daysLeft} day(s)</span>`;
            }

            return `
                <tr>
                    <td><strong style="color: #64748b;">#LN-${item.id}</strong></td>
                    <td>
                        <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.book_title)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-barcode"></i> ${escapeHTML(item.book_isbn)}</small>
                    </td>
                    <td>
                        <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.member_name)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-id-card"></i> ${escapeHTML(item.member_code)} (${escapeHTML(item.member_department || 'Student')})</small>
                    </td>
                    <td><span style="font-size: 0.88rem;">${item.issue_date}</span></td>
                    <td><strong style="font-size: 0.88rem; color: ${isOverdue ? 'var(--danger-color)' : 'inherit'};">${item.due_date}</strong></td>
                    <td>${statusBadge}</td>
                    <td>
                        <button type="button" class="btn-primary btn-sm btn-action-return" data-id="${item.id}" data-title="${escapeHTML(item.book_title)}" data-member="${escapeHTML(item.member_name)}" style="width: auto;">
                            <i class="fa-solid fa-arrow-down-to-bracket"></i> Receive Return
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach Return Action Handlers
        document.querySelectorAll('.btn-action-return').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                const member = btn.getAttribute('data-member');
                confirmProcessReturn(id, title, member);
            });
        });
    }

    async function confirmProcessReturn(issueId, title, member) {
        if (!confirm(`Confirm Return: Has "${member}" handed over the copy of "${title}"?`)) {
            return;
        }

        try {
            const res = await apiRequest(`/issues/${issueId}/return`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadActiveLoans();
            } else {
                showToast(res.message || 'Failed to process return', 'error');
            }
        } catch (e) {
            showToast('Network error while processing return', 'error');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

