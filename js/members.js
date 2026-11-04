/**
 * Members Directory Controller (js/members.js)
 * Manages students & faculty membership cards, registration, and loan audit logs.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Only Admin and Librarian can access the members directory
    const user = Auth.requireAuth(['admin', 'librarian']);
    if (!user) return;

    setupAppLayout('nav-members');

    // DOM Elements
    const searchInput = document.getElementById('search-members');
    const roleFilter = document.getElementById('filter-member-role');
    const statusFilter = document.getElementById('filter-member-status');
    const resetFiltersBtn = document.getElementById('btn-reset-member-filters');
    const tableBody = document.getElementById('members-table-body');
    const openAddBtn = document.getElementById('btn-open-add-member');

    // Modals
    const addModal = document.getElementById('modal-add-member');
    const editModal = document.getElementById('modal-edit-member');
    const historyModal = document.getElementById('modal-member-history');
    const formAddMember = document.getElementById('form-add-member');
    const formEditMember = document.getElementById('form-edit-member');
    const historyTableBody = document.getElementById('member-history-table-body');
    const profileSummary = document.getElementById('member-profile-summary');

    // Load initial data
    await loadMembers();

    // Event Listeners
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadMembers, 250);
    });

    roleFilter.addEventListener('change', loadMembers);
    statusFilter.addEventListener('change', loadMembers);

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        roleFilter.value = 'all';
        statusFilter.value = 'all';
        loadMembers();
    });

    if (openAddBtn) {
        openAddBtn.addEventListener('click', () => {
            formAddMember.reset();
            addModal.classList.remove('hidden');
        });
    }

    // Modal Close Triggers
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-close');
            const target = document.getElementById(id);
            if (target) target.classList.add('hidden');
        });
    });

    [addModal, editModal, historyModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Submit Add Member
    formAddMember.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formAddMember.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';

        const payload = {
            member_code: document.getElementById('add-member-code').value.trim(),
            name: document.getElementById('add-member-name').value.trim(),
            email: document.getElementById('add-member-email').value.trim(),
            phone: document.getElementById('add-member-phone').value.trim(),
            department: document.getElementById('add-member-dept').value.trim(),
            role: document.getElementById('add-member-role').value,
            status: document.getElementById('add-member-status').value
        };

        try {
            const res = await apiRequest('/members', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                addModal.classList.add('hidden');
                formAddMember.reset();
                await loadMembers();
            } else {
                showToast(res.message || 'Failed to register member', 'error');
            }
        } catch (e) {
            showToast('Network error while creating member', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register Member';
        }
    });

    // Submit Edit Member
    formEditMember.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-member-id').value;
        const submitBtn = formEditMember.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        const payload = {
            member_code: document.getElementById('edit-member-code').value.trim(),
            name: document.getElementById('edit-member-name').value.trim(),
            email: document.getElementById('edit-member-email').value.trim(),
            phone: document.getElementById('edit-member-phone').value.trim(),
            department: document.getElementById('edit-member-dept').value.trim(),
            role: document.getElementById('edit-member-role').value,
            status: document.getElementById('edit-member-status').value
        };

        try {
            const res = await apiRequest(`/members/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                editModal.classList.add('hidden');
                await loadMembers();
            } else {
                showToast(res.message || 'Failed to update member', 'error');
            }
        } catch (e) {
            showToast('Network error while updating member', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Member';
        }
    });

    /**
     * Load Members Table from API
     */
    async function loadMembers() {
        tableBody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading members...</td></tr>';

        const q = new URLSearchParams();
        if (searchInput.value.trim()) q.append('search', searchInput.value.trim());
        if (roleFilter.value && roleFilter.value !== 'all') q.append('role', roleFilter.value);
        if (statusFilter.value && statusFilter.value !== 'all') q.append('status', statusFilter.value);

        try {
            const res = await apiRequest(`/members?${q.toString()}`);
            if (res.success) {
                renderMembers(res.members || []);
            } else {
                tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (e) {
            tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load members list.</td></tr>';
        }
    }

    /**
     * Render Members Table
     */
    function renderMembers(members) {
        if (!members || members.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <i class="fa-solid fa-users-slash"></i>
                        <h4>No library members found</h4>
                        <p>No members match the current search filters.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = members.map(m => {
            const statusBadge = m.status === 'active' 
                ? '<span class="badge badge-success">Active</span>'
                : m.status === 'suspended'
                ? '<span class="badge badge-danger">Suspended</span>'
                : '<span class="badge badge-secondary">Inactive</span>';

            const roleBadge = m.role === 'faculty'
                ? '<span class="badge badge-info"><i class="fa-solid fa-chalkboard-user"></i> Faculty</span>'
                : m.role === 'staff'
                ? '<span class="badge badge-secondary">Staff</span>'
                : '<span class="badge badge-warning"><i class="fa-solid fa-graduation-cap"></i> Student</span>';

            const activeLoansCount = m.active_books_count || 0;
            const loansBadge = activeLoansCount > 0
                ? `<span class="badge badge-warning">${activeLoansCount} book(s)</span>`
                : '<span style="color: var(--text-light); font-size: 0.85rem;">0 active</span>';

            return `
                <tr>
                    <td><strong style="color: var(--primary-color);">${escapeHTML(m.member_code)}</strong></td>
                    <td>
                        <strong style="color: var(--text-primary); display: block;">${escapeHTML(m.name)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-regular fa-envelope"></i> ${escapeHTML(m.email)}</small>
                    </td>
                    <td><span style="font-size: 0.88rem; color: #475569;">${escapeHTML(m.phone || 'N/A')}</span></td>
                    <td><span style="font-size: 0.88rem;">${escapeHTML(m.department || 'General')}</span></td>
                    <td>${roleBadge}</td>
                    <td>${loansBadge}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="table-actions">
                            <button type="button" class="action-btn view-history-btn" data-member-id="${m.id}" title="View Loan History">
                                <i class="fa-solid fa-clock-rotate-left"></i>
                            </button>
                            <button type="button" class="action-btn edit-member-btn" data-member-id="${m.id}" title="Edit Member">
                                <i class="fa-solid fa-pencil"></i>
                            </button>
                            ${user.role === 'admin' ? `
                                <button type="button" class="action-btn delete-btn delete-member-btn" data-member-id="${m.id}" data-member-name="${escapeHTML(m.name)}" title="Delete Member">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach History Modal Handlers
        document.querySelectorAll('.view-history-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-member-id');
                openMemberHistory(id);
            });
        });

        // Attach Edit Modal Handlers
        document.querySelectorAll('.edit-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-member-id');
                openEditMemberModal(id);
            });
        });

        // Attach Delete Handlers
        document.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-member-id');
                const name = btn.getAttribute('data-member-name');
                confirmDeleteMember(id, name);
            });
        });
    }

    /**
     * View Member Loan History
     */
    async function openMemberHistory(id) {
        profileSummary.innerHTML = 'Loading profile details...';
        historyTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading history...</td></tr>';
        historyModal.classList.remove('hidden');

        try {
            const res = await apiRequest(`/members/${id}`);
            if (res.success && res.member) {
                const m = res.member;
                profileSummary.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                            <h4 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.2rem;">
                                ${escapeHTML(m.name)} <span style="font-size: 0.85rem; color: var(--primary-color);">(${escapeHTML(m.member_code)})</span>
                            </h4>
                            <p style="font-size: 0.88rem; color: var(--text-secondary);">
                                Email: ${escapeHTML(m.email)} &bull; Phone: ${escapeHTML(m.phone || 'N/A')} &bull; Department: ${escapeHTML(m.department || 'N/A')}
                            </p>
                        </div>
                        <div>
                            <span class="badge ${m.status === 'active' ? 'badge-success' : 'badge-danger'}">${escapeHTML(m.status)}</span>
                        </div>
                    </div>
                `;

                const history = res.history || [];
                if (history.length === 0) {
                    historyTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No books issued to this member yet.</td></tr>';
                } else {
                    historyTableBody.innerHTML = history.map(item => `
                        <tr>
                            <td>
                                <strong>${escapeHTML(item.book_title)}</strong>
                                <small style="display: block; color: var(--text-secondary);">${escapeHTML(item.book_isbn)}</small>
                            </td>
                            <td>${item.issue_date}</td>
                            <td>${item.due_date}</td>
                            <td>${item.return_date || '<span style="color: var(--warning-color); font-weight: 600;">Currently Borrowed</span>'}</td>
                            <td>
                                <span class="badge ${item.status === 'returned' ? 'badge-success' : item.status === 'overdue' ? 'badge-danger' : 'badge-warning'}">
                                    ${item.status}
                                </span>
                            </td>
                        </tr>
                    `).join('');
                }
            } else {
                showToast(res.message || 'Could not load member details', 'error');
            }
        } catch (e) {
            showToast('Error opening history dialog', 'error');
        }
    }

    /**
     * Open Edit Member Modal
     */
    async function openEditMemberModal(id) {
        try {
            const res = await apiRequest(`/members/${id}`);
            if (res.success && res.member) {
                const m = res.member;
                document.getElementById('edit-member-id').value = m.id;
                document.getElementById('edit-member-code').value = m.member_code;
                document.getElementById('edit-member-name').value = m.name;
                document.getElementById('edit-member-email').value = m.email;
                document.getElementById('edit-member-phone').value = m.phone || '';
                document.getElementById('edit-member-dept').value = m.department || '';
                document.getElementById('edit-member-role').value = m.role || 'student';
                document.getElementById('edit-member-status').value = m.status || 'active';

                editModal.classList.remove('hidden');
            } else {
                showToast(res.message || 'Could not fetch member info', 'error');
            }
        } catch (e) {
            showToast('Error opening edit dialog', 'error');
        }
    }

    /**
     * Delete Member
     */
    async function confirmDeleteMember(id, name) {
        if (!confirm(`Are you sure you want to delete member "${name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const res = await apiRequest(`/members/${id}`, { method: 'DELETE' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadMembers();
            } else {
                showToast(res.message || 'Failed to delete member', 'error');
            }
        } catch (e) {
            showToast('Network error while deleting member', 'error');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

