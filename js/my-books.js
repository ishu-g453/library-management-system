/**
 * My Books Controller (js/my-books.js)
 * Student-centric view of personal loans, due dates, fines, and renewals.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-my-books');

    // DOM Elements
    const activeCountEl = document.getElementById('my-active-count');
    const overdueCountEl = document.getElementById('my-overdue-count');
    const returnedCountEl = document.getElementById('my-returned-count');
    const finesAmountEl = document.getElementById('my-fines-amount');
    const activeTableBody = document.getElementById('my-active-loans-table-body');
    const pastTableBody = document.getElementById('my-past-loans-table-body');

    await loadMyBooks();

    async function loadMyBooks() {
        try {
            const res = await apiRequest('/issues?status=all');
            if (res.success && res.issues) {
                const issues = res.issues;

                const active = issues.filter(i => i.status !== 'returned');
                const past = issues.filter(i => i.status === 'returned');
                const overdue = active.filter(i => i.status === 'overdue' || new Date(i.due_date) < new Date());

                let totalFines = 0;
                active.forEach(i => {
                    totalFines += (i.fine_amount || 0);
                });

                // Update Metrics
                activeCountEl.textContent = active.length;
                overdueCountEl.textContent = overdue.length;
                returnedCountEl.textContent = past.length;
                finesAmountEl.textContent = `₹${totalFines.toFixed(2)}`;

                renderActiveLoans(active);
                renderPastLoans(past);
            } else {
                activeTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (e) {
            activeTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load your borrowing records.</td></tr>';
        }
    }

    function renderActiveLoans(loans) {
        if (!loans || loans.length === 0) {
            activeTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="fa-solid fa-book-open"></i>
                        <h4>You currently have no borrowed books</h4>
                        <p>Browse our library catalog to discover and borrow books.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        activeTableBody.innerHTML = loans.map(item => {
            const isOverdue = item.status === 'overdue' || item.due_date < today;
            let statusBadge = '';

            if (isOverdue) {
                const dueDate = new Date(item.due_date);
                const nowDate = new Date(today);
                const daysLate = Math.max(1, Math.ceil((nowDate - dueDate) / (1000 * 60 * 60 * 24)));
                statusBadge = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Overdue (${daysLate} days) &bull; Fine: ₹${item.fine_amount || daysLate * 5}</span>`;
            } else {
                const dueDate = new Date(item.due_date);
                const nowDate = new Date(today);
                const daysLeft = Math.ceil((dueDate - nowDate) / (1000 * 60 * 60 * 24));
                statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Due in ${daysLeft} day(s)</span>`;
            }

            return `
                <tr>
                    <td>
                        <strong style="color: var(--text-primary); font-size: 0.95rem; display: block;">${escapeHTML(item.book_title)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-barcode"></i> ${escapeHTML(item.book_isbn)}</small>
                    </td>
                    <td>${escapeHTML(item.book_author || 'N/A')}</td>
                    <td><span style="font-size: 0.88rem;">${item.issue_date}</span></td>
                    <td><strong style="font-size: 0.88rem; color: ${isOverdue ? 'var(--danger-color)' : 'inherit'};">${item.due_date}</strong></td>
                    <td>${statusBadge}</td>
                    <td>
                        ${!isOverdue ? `
                            <button type="button" class="btn-secondary btn-sm btn-renew-loan" data-id="${item.id}" title="Extend loan duration by 14 days">
                                <i class="fa-solid fa-rotate-right"></i> Renew (+14d)
                            </button>
                        ` : `
                            <span style="color: var(--danger-color); font-size: 0.82rem; font-weight: 600;">Please Return</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

        // Attach Renew Handlers
        document.querySelectorAll('.btn-renew-loan').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                confirmRenew(id);
            });
        });
    }

    function renderPastLoans(loans) {
        if (!loans || loans.length === 0) {
            pastTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No returned books in history.</td></tr>';
            return;
        }

        pastTableBody.innerHTML = loans.map(item => `
            <tr>
                <td>
                    <strong style="color: var(--text-primary); font-size: 0.95rem; display: block;">${escapeHTML(item.book_title)}</strong>
                    <small style="color: var(--text-secondary);"><i class="fa-solid fa-barcode"></i> ${escapeHTML(item.book_isbn)}</small>
                </td>
                <td>${escapeHTML(item.book_author || 'N/A')}</td>
                <td><span style="font-size: 0.88rem;">${item.issue_date}</span></td>
                <td><span style="font-size: 0.88rem; color: var(--success-color); font-weight: 600;">${item.return_date || 'Returned'}</span></td>
                <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> Completed</span></td>
            </tr>
        `).join('');
    }

    async function confirmRenew(id) {
        if (!confirm('Do you want to extend this book checkout by an additional 14 days?')) {
            return;
        }

        try {
            const res = await apiRequest(`/issues/${id}/renew`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadMyBooks();
            } else {
                showToast(res.message || 'Renewal not allowed', 'error');
            }
        } catch (e) {
            showToast('Network error while renewing book', 'error');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

