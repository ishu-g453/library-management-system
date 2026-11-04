/**
 * Reports & Logs Controller (js/reports.js)
 * Visualizes overdue lists, inventory metrics, and system audit trail.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-reports');

    // DOM Elements
    const totalCopiesEl = document.getElementById('rep-total-copies');
    const totalTitlesEl = document.getElementById('rep-total-titles');
    const issuedCopiesEl = document.getElementById('rep-issued-copies');
    const activeLoansEl = document.getElementById('rep-active-loans');
    const overdueCountEl = document.getElementById('rep-overdue-count');
    const totalFinesEl = document.getElementById('rep-total-fines');
    const totalMembersEl = document.getElementById('rep-total-members');
    const activeMembersEl = document.getElementById('rep-active-members');
    const overdueBadge = document.getElementById('overdue-badge-count');
    const overdueTableBody = document.getElementById('overdue-report-table-body');
    const auditTableBody = document.getElementById('audit-logs-table-body');
    const printBtn = document.getElementById('btn-print-report');
    const refreshBtn = document.getElementById('btn-refresh-logs');

    // Initialize Page
    await loadReportsData();

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadReportsData);
    }

    async function loadReportsData() {
        try {
            // 1. Fetch Summary Stats
            const statsRes = await apiRequest('/reports/dashboard-stats');
            if (statsRes.success && statsRes.stats) {
                const s = statsRes.stats;
                totalCopiesEl.textContent = s.totalCopies;
                totalTitlesEl.textContent = `${s.totalTitles} distinct titles`;
                issuedCopiesEl.textContent = s.issuedCopies;
                activeLoansEl.textContent = `${s.activeIssues} active loans`;
                overdueCountEl.textContent = s.overdueCount;
                totalFinesEl.textContent = `Pending Fines: ₹${s.totalFines}`;
                totalMembersEl.textContent = s.totalMembers;
                activeMembersEl.textContent = `${s.activeMembers} active`;

                renderAuditLogs(statsRes.recentActivities || []);
            }

            // 2. Fetch Overdue List (if admin/librarian)
            if (user.role === 'admin' || user.role === 'librarian') {
                const overdueRes = await apiRequest('/reports/overdue');
                if (overdueRes.success && overdueRes.overdue) {
                    renderOverdueList(overdueRes.overdue);
                }
            } else {
                overdueTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Overdue audits are restricted to Library Administrators.</td></tr>';
            }
        } catch (e) {
            console.error('Error loading reports', e);
            showToast('Failed to load reports data', 'error');
        }
    }

    function renderOverdueList(overdue) {
        overdueBadge.textContent = `${overdue.length} Overdue`;

        if (!overdue || overdue.length === 0) {
            overdueTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="fa-solid fa-circle-check" style="color: var(--success-color);"></i>
                        <h4>Great! No overdue books</h4>
                        <p>All borrowed books are within their active loan periods.</p>
                    </td>
                </tr>
            `;
            return;
        }

        overdueTableBody.innerHTML = overdue.map(item => `
            <tr>
                <td>
                    <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.book_title)}</strong>
                    <small style="color: var(--text-secondary);"><i class="fa-solid fa-barcode"></i> ${escapeHTML(item.book_isbn)}</small>
                </td>
                <td>
                    <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.member_name)}</strong>
                    <small style="color: var(--text-secondary);"><i class="fa-solid fa-id-card"></i> ${escapeHTML(item.member_code)}</small>
                </td>
                <td><span style="font-size: 0.88rem;">${escapeHTML(item.member_phone || 'N/A')}</span></td>
                <td><strong style="color: var(--danger-color); font-size: 0.88rem;">${item.due_date}</strong></td>
                <td><span class="badge badge-danger">${item.days_overdue} day(s) late</span></td>
                <td><strong style="color: var(--danger-color);">₹${item.calculated_fine}</strong></td>
            </tr>
        `).join('');
    }

    function renderAuditLogs(activities) {
        if (!activities || activities.length === 0) {
            auditTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No activity logs recorded.</td></tr>';
            return;
        }

        auditTableBody.innerHTML = activities.map(item => {
            const dateStr = new Date(item.timestamp).toLocaleString();
            let badgeClass = 'badge-secondary';
            if (item.action.includes('LOGIN')) badgeClass = 'badge-info';
            if (item.action.includes('ISSUE')) badgeClass = 'badge-warning';
            if (item.action.includes('RETURN')) badgeClass = 'badge-success';
            if (item.action.includes('DELETE')) badgeClass = 'badge-danger';

            return `
                <tr>
                    <td><code>#${item.id}</code></td>
                    <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap;">${dateStr}</td>
                    <td><span class="badge ${badgeClass}">${escapeHTML(item.action)}</span></td>
                    <td style="font-size: 0.88rem;">${escapeHTML(item.details)}</td>
                    <td><span style="font-size: 0.85rem; font-weight: 600;">${escapeHTML(item.user_name || 'System')}</span></td>
                </tr>
            `;
        }).join('');
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

