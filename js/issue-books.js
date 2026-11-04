/**
 * Issue Books Controller (js/issue-books.js)
 * Dedicated checkout workstation for library circulation desk.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth(['admin', 'librarian']);
    if (!user) return;

    setupAppLayout('nav-issue-books');

    // DOM Elements
    const form = document.getElementById('form-direct-issue');
    const bookSelect = document.getElementById('direct-book-select');
    const memberSelect = document.getElementById('direct-member-select');
    const issueDateInput = document.getElementById('direct-issue-date');
    const dueDateInput = document.getElementById('direct-due-date');
    const remarksInput = document.getElementById('direct-remarks');
    const recentTableBody = document.getElementById('recent-issues-table-body');
    const submitBtn = document.getElementById('btn-submit-direct-issue');

    // Default Dates
    const today = new Date().toISOString().split('T')[0];
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 14);
    const defaultDueStr = defaultDue.toISOString().split('T')[0];

    issueDateInput.value = today;
    dueDateInput.value = defaultDueStr;
    dueDateInput.min = today;

    // Load Dropdown Options
    await loadAvailableBooks();
    await loadActiveMembers();
    await loadRecentCheckouts();

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Issue...';

        const payload = {
            book_id: bookSelect.value,
            member_id: memberSelect.value,
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
                form.reset();
                issueDateInput.value = today;
                dueDateInput.value = defaultDueStr;
                await loadAvailableBooks();
                await loadRecentCheckouts();
            } else {
                showToast(res.message || 'Failed to issue book', 'error');
            }
        } catch (err) {
            showToast('Network error while processing loan', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirm and Issue Book';
        }
    });

    async function loadAvailableBooks() {
        bookSelect.innerHTML = '<option value="">Loading available books...</option>';
        try {
            const res = await apiRequest('/books?availability=available');
            if (res.success && res.books) {
                if (res.books.length === 0) {
                    bookSelect.innerHTML = '<option value="">No books currently in stock</option>';
                } else {
                    bookSelect.innerHTML = '<option value="">-- Choose from available inventory --</option>' +
                        res.books.map(b => `
                            <option value="${b.id}">
                                ${escapeHTML(b.title)} (${b.available_copies} of ${b.total_copies} available) [${b.isbn}]
                            </option>
                        `).join('');
                }
            }
        } catch (e) {
            bookSelect.innerHTML = '<option value="">Failed to load books catalog</option>';
        }
    }

    async function loadActiveMembers() {
        memberSelect.innerHTML = '<option value="">Loading members...</option>';
        try {
            const res = await apiRequest('/members?status=active');
            if (res.success && res.members) {
                if (res.members.length === 0) {
                    memberSelect.innerHTML = '<option value="">No active members found</option>';
                } else {
                    memberSelect.innerHTML = '<option value="">-- Choose active member --</option>' +
                        res.members.map(m => `
                            <option value="${m.id}">
                                ${escapeHTML(m.name)} (${m.member_code}) - ${escapeHTML(m.department || m.role)}
                            </option>
                        `).join('');
                }
            }
        } catch (e) {
            memberSelect.innerHTML = '<option value="">Failed to load members</option>';
        }
    }

    async function loadRecentCheckouts() {
        try {
            const res = await apiRequest('/issues?status=issued');
            if (res.success && res.issues) {
                const list = res.issues.slice(0, 5);
                if (list.length === 0) {
                    recentTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No checkouts recorded today.</td></tr>';
                    return;
                }

                recentTableBody.innerHTML = list.map(item => `
                    <tr>
                        <td>
                            <strong style="color: var(--text-primary); display: block;">${escapeHTML(item.book_title)}</strong>
                            <small style="color: var(--text-secondary);">${escapeHTML(item.book_isbn)}</small>
                        </td>
                        <td>${escapeHTML(item.member_name)}</td>
                        <td><span class="badge badge-warning">${item.due_date}</span></td>
                    </tr>
                `).join('');
            }
        } catch (e) {
            recentTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Could not load checkouts.</td></tr>';
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

