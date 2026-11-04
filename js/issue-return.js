/**
 * Issue & Return Controller (js/issue-return.js)
 * Manages loan records, issuing books, due dates, fines, and return verification.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-issues');

    // DOM Elements
    const searchInput = document.getElementById('search-issues');
    const filterStatus = document.getElementById('filter-issue-status');
    const refreshBtn = document.getElementById('btn-refresh-issues');
    const tableBody = document.getElementById('issues-table-body');
    const openIssueBtn = document.getElementById('btn-open-issue-modal');

    // Modal elements
    const issueModal = document.getElementById('modal-issue-book');
    const formIssueBook = document.getElementById('form-issue-book');
    const selectBook = document.getElementById('select-issue-book');
    const selectMember = document.getElementById('select-issue-member');
    const issueDateInput = document.getElementById('issue-date-input');
    const dueDateInput = document.getElementById('due-date-input');
    const remarksInput = document.getElementById('issue-remarks');

    const isStaff = user.role === 'admin' || user.role === 'librarian';

    // Set default dates for Issue Modal
    const today = new Date().toISOString().split('T')[0];
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 14);
    const defaultDueStr = defaultDue.toISOString().split('T')[0];

    issueDateInput.value = today;
    dueDateInput.value = defaultDueStr;
    dueDateInput.min = today;

    // Load Initial Data
    await loadIssues();

    // Event Listeners
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadIssues, 250);
    });

    filterStatus.addEventListener('change', loadIssues);
    refreshBtn.addEventListener('click', loadIssues);

    // Open Issue Modal
    if (openIssueBtn) {
        openIssueBtn.addEventListener('click', async () => {
            await prepareIssueModal();
            issueModal.classList.remove('hidden');
        });
    }

    // Modal close triggers
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-close');
            const target = document.getElementById(id);
            if (target) target.classList.add('hidden');
        });
    });

    if (issueModal) {
        issueModal.addEventListener('click', (e) => {
            if (e.target === issueModal) issueModal.classList.add('hidden');
        });
    }

    // Submit Issue Form
    formIssueBook.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formIssueBook.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing Issue...';

        const payload = {
            book_id: selectBook.value,
            member_id: selectMember.value,
            due_date: dueDateInput.value,
            remarks: remarksInput.value.trim()
        };

        try {
            const res = await apiRequest('/issues', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                issueModal.classList.add('hidden');
                formIssueBook.reset();
                issueDateInput.value = today;
                dueDateInput.value = defaultDueStr;
                await loadIssues();
            } else {
                showToast(res.message || 'Could not issue book', 'error');
            }
        } catch (err) {
            showToast('Network error while issuing book', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm & Issue Book';
        }
    });

    /**
     * Prepare Dropdowns in Issue Modal
     */
    async function prepareIssueModal() {
        selectBook.innerHTML = '<option value="">Loading available books...</option>';
        selectMember.innerHTML = '<option value="">Loading active members...</option>';

        try {
            // 1. Fetch available books
            const booksRes = await apiRequest('/books?availability=available');
            if (booksRes.success && booksRes.books) {
                if (booksRes.books.length === 0) {
                    selectBook.innerHTML = '<option value="">No books currently available in catalog</option>';
                } else {
                    selectBook.innerHTML = '<option value="">-- Select an Available Book --</option>' +
                        booksRes.books.map(b => `
                            <option value="${b.id}">
                                ${escapeHTML(b.title)} (${b.available_copies} of ${b.total_copies} available) [${b.isbn}]
                            </option>
                        `).join('');
                }
            }

            // 2. Fetch active members
            const membersRes = await apiRequest('/members?status=active');
            if (membersRes.success && membersRes.members) {
                if (membersRes.members.length === 0) {
                    selectMember.innerHTML = '<option value="">No active members found</option>';
                } else {
                    selectMember.innerHTML = '<option value="">-- Select Registered Member --</option>' +
                        membersRes.members.map(m => `
                            <option value="${m.id}">
                                ${escapeHTML(m.name)} (${m.member_code}) - ${escapeHTML(m.department || m.role)}
                            </option>
                        `).join('');
                }
            }
        } catch (e) {
            console.error('Failed to load modal dependencies', e);
        }
    }

    /**
     * Load issues list from API
     */
    async function loadIssues() {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Fetching circulation records...</td></tr>';

        const q = new URLSearchParams();
        if (filterStatus.value && filterStatus.value !== 'all') q.append('status', filterStatus.value);
        if (searchInput.value.trim()) q.append('search', searchInput.value.trim());

        try {
            const res = await apiRequest(`/issues?${q.toString()}`);
            if (res.success) {
                renderIssues(res.issues || []);
            } else {
                tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (error) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load issue records.</td></tr>';
        }
    }

    /**
     * Render Issues Table
     */
    function renderIssues(issues) {
        if (!issues || issues.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fa-solid fa-clipboard-check"></i>
                        <h4>No circulation records found</h4>
                        <p>No transactions match the selected filter criteria.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const now = new Date().toISOString().split('T')[0];

        tableBody.innerHTML = issues.map(item => {
            const isReturned = item.status === 'returned';
            const isOverdue = item.status === 'overdue' || (!isReturned && item.due_date < now);

            // Status Badge Formatting
            let statusBadge = '';
            if (isReturned) {
                statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check-circle"></i> Returned (${item.return_date})</span>`;
            } else if (isOverdue) {
                const fine = item.fine_amount > 0 ? ` &bull; Fine: ₹${item.fine_amount}` : '';
                statusBadge = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Overdue${fine}</span>`;
            } else {
                // Calculate days remaining
                const dueDate = new Date(item.due_date);
                const todayDate = new Date(now);
                const daysLeft = Math.ceil((dueDate - todayDate) / (1000 * 60 * 60 * 24));
                statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Due in ${daysLeft} day(s)</span>`;
            }

            // Action Buttons
            let actionHtml = '';
            if (isReturned) {
                actionHtml = `<span style="font-size: 0.8rem; color: var(--text-light);"><i class="fa-solid fa-circle-check" style="color: var(--success-color);"></i> Completed</span>`;
            } else {
                actionHtml = `
                    <div style="display: flex; gap: 0.4rem; align-items: center;">
                        ${isStaff ? `
                            <button type="button" class="btn-primary btn-sm btn-return-book" data-issue-id="${item.id}" data-book-title="${escapeHTML(item.book_title)}" data-member-name="${escapeHTML(item.member_name)}" title="Process Return">
                                <i class="fa-solid fa-arrow-turn-down"></i> Return
                            </button>
                        ` : ''}
                        <button type="button" class="btn-secondary btn-sm btn-renew-book" data-issue-id="${item.id}" data-overdue="${isOverdue}" title="Renew Loan (+14 Days)">
                            <i class="fa-solid fa-rotate-right"></i> Renew
                        </button>
                    </div>
                `;
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
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-id-card"></i> ${escapeHTML(item.member_code)}</small>
                    </td>
                    <td><span style="font-size: 0.88rem;">${item.issue_date}</span></td>
                    <td>
                        <strong style="font-size: 0.88rem; color: ${isOverdue ? 'var(--danger-color)' : 'inherit'};">
                            ${item.due_date}
                        </strong>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${actionHtml}</td>
                </tr>
            `;
        }).join('');

        // Attach Return Action Handlers
        document.querySelectorAll('.btn-return-book').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-issue-id');
                const title = btn.getAttribute('data-book-title');
                const member = btn.getAttribute('data-member-name');
                confirmReturn(id, title, member);
            });
        });

        // Attach Renew Action Handlers
        document.querySelectorAll('.btn-renew-book').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-issue-id');
                const isOverdue = btn.getAttribute('data-overdue') === 'true';
                if (isOverdue) {
                    alert('Cannot renew an overdue loan. Please return the book and clear pending fines.');
                    return;
                }
                confirmRenew(id);
            });
        });
    }

    /**
     * Process Book Return
     */
    async function confirmReturn(issueId, title, member) {
        if (!confirm(`Confirm Return: Has "${member}" returned the copy of "${title}"?`)) {
            return;
        }

        try {
            const res = await apiRequest(`/issues/${issueId}/return`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadIssues();
            } else {
                showToast(res.message || 'Failed to process return', 'error');
            }
        } catch (e) {
            showToast('Network error while processing return', 'error');
        }
    }

    /**
     * Renew Loan (+14 Days)
     */
    async function confirmRenew(issueId) {
        if (!confirm('Extend loan due date by an additional 14 days?')) {
            return;
        }

        try {
            const res = await apiRequest(`/issues/${issueId}/renew`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadIssues();
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

