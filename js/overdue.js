/**
 * Due Dates & Overdue Books Controller (js/overdue.js)
 * Tracks overdue books, computed daily fines, and student contact details.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-overdue');

    // DOM Elements
    const tableBody = document.getElementById('overdue-table-body');
    const itemsBadge = document.getElementById('overdue-items-badge');
    const totalFinesBadge = document.getElementById('overdue-total-fines-badge');
    const refreshBtn = document.getElementById('btn-refresh-overdue');

    const isStaff = user.role === 'admin' || user.role === 'librarian';

    await loadOverdueList();

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadOverdueList);
    }

    async function loadOverdueList() {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Auditing overdue loan records...</td></tr>';

        try {
            if (isStaff) {
                // Staff fetches system-wide overdue audit
                const res = await apiRequest('/reports/overdue');
                if (res.success && res.overdue) {
                    renderOverdue(res.overdue);
                } else {
                    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${res.message}</td></tr>`;
                }
            } else {
                // Student fetches personal overdue records
                const res = await apiRequest('/issues?status=all');
                if (res.success && res.issues) {
                    const today = new Date().toISOString().split('T')[0];
                    const studentOverdue = res.issues.filter(i => i.status === 'overdue' || (i.status !== 'returned' && i.due_date < today));
                    renderOverdue(studentOverdue);
                }
            }
        } catch (e) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to audit overdue records.</td></tr>';
        }
    }

    function renderOverdue(items) {
        itemsBadge.textContent = `${items.length} Overdue`;

        let totalFines = 0;
        items.forEach(i => {
            totalFines += (i.calculated_fine || i.fine_amount || 0);
        });
        totalFinesBadge.textContent = `Total Accrued Fines: ₹${totalFines.toFixed(2)}`;

        if (!items || items.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fa-solid fa-circle-check" style="color: var(--success-color);"></i>
                        <h4>No overdue books found</h4>
                        <p>All active library loans are within their return schedules.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        tableBody.innerHTML = items.map(item => {
            const dueDate = new Date(item.due_date);
            const nowDate = new Date(today);
            const daysLate = item.days_overdue || Math.max(1, Math.ceil((nowDate - dueDate) / (1000 * 60 * 60 * 24)));
            const fine = item.calculated_fine || Math.max(item.fine_amount || 0, daysLate * 5.0);

            return `
                <tr>
                    <td>
                        <strong style="color: var(--text-primary); font-size: 0.95rem; display: block;">${escapeHTML(item.book_title)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-barcode"></i> ${escapeHTML(item.book_isbn)}</small>
                    </td>
                    <td>
                        <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.member_name)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-id-card"></i> ${escapeHTML(item.member_code)} (${escapeHTML(item.department || item.member_department || 'Student')})</small>
                    </td>
                    <td><span style="font-size: 0.88rem;">${escapeHTML(item.member_phone || 'N/A')}</span></td>
                    <td><strong style="color: var(--danger-color); font-size: 0.9rem;">${item.due_date}</strong></td>
                    <td><span class="badge badge-danger">${daysLate} day(s) overdue</span></td>
                    <td><strong style="color: var(--danger-color); font-size: 0.95rem;">₹${fine.toFixed(2)}</strong></td>
                    ${isStaff ? `
                        <td>
                            <button type="button" class="btn-primary btn-sm btn-return-overdue" data-id="${item.id}" data-title="${escapeHTML(item.book_title)}" data-member="${escapeHTML(item.member_name)}" style="width: auto;">
                                <i class="fa-solid fa-arrow-down-to-bracket"></i> Receive Return
                            </button>
                        </td>
                    ` : ''}
                </tr>
            `;
        }).join('');

        if (isStaff) {
            document.querySelectorAll('.btn-return-overdue').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const title = btn.getAttribute('data-title');
                    const member = btn.getAttribute('data-member');
                    confirmOverdueReturn(id, title, member);
                });
            });
        }
    }

    async function confirmOverdueReturn(issueId, title, member) {
        if (!confirm(`Confirm Return: Has "${member}" returned the overdue copy of "${title}"?`)) {
            return;
        }

        try {
            const res = await apiRequest(`/issues/${issueId}/return`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadOverdueList();
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

