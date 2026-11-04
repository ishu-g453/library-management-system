/**
 * Librarians Controller (js/librarians.js)
 * Administrator operations for library staff accounts.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth(['admin']);
    if (!user) return;

    setupAppLayout('nav-librarians');

    // DOM Elements
    const tableBody = document.getElementById('librarians-table-body');
    const countBadge = document.getElementById('librarian-count-badge');
    const openAddBtn = document.getElementById('btn-open-add-librarian');

    // Modals
    const addModal = document.getElementById('modal-add-librarian');
    const editModal = document.getElementById('modal-edit-librarian');
    const formAdd = document.getElementById('form-add-librarian');
    const formEdit = document.getElementById('form-edit-librarian');

    await loadLibrarians();

    if (openAddBtn) {
        openAddBtn.addEventListener('click', () => {
            formAdd.reset();
            addModal.classList.remove('hidden');
        });
    }

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-close');
            const target = document.getElementById(id);
            if (target) target.classList.add('hidden');
        });
    });

    [addModal, editModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Form Add Submission
    formAdd.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formAdd.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';

        const payload = {
            name: document.getElementById('add-lib-name').value.trim(),
            username: document.getElementById('add-lib-username').value.trim(),
            password: document.getElementById('add-lib-password').value,
            email: document.getElementById('add-lib-email').value.trim(),
            phone: document.getElementById('add-lib-phone').value.trim()
        };

        try {
            const res = await apiRequest('/librarians', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                addModal.classList.add('hidden');
                formAdd.reset();
                await loadLibrarians();
            } else {
                showToast(res.message || 'Failed to create librarian', 'error');
            }
        } catch (err) {
            showToast('Network error while saving librarian', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Staff Account';
        }
    });

    // Form Edit Submission
    formEdit.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-lib-id').value;
        const submitBtn = formEdit.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const payload = {
            name: document.getElementById('edit-lib-name').value.trim(),
            email: document.getElementById('edit-lib-email').value.trim(),
            phone: document.getElementById('edit-lib-phone').value.trim(),
            password: document.getElementById('edit-lib-password').value
        };

        try {
            const res = await apiRequest(`/librarians/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                editModal.classList.add('hidden');
                await loadLibrarians();
            } else {
                showToast(res.message || 'Failed to update librarian', 'error');
            }
        } catch (err) {
            showToast('Network error while updating librarian', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    });

    async function loadLibrarians() {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Fetching staff records...</td></tr>';

        try {
            const res = await apiRequest('/librarians');
            if (res.success && res.librarians) {
                renderLibrarians(res.librarians);
            } else {
                tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (e) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load librarians list.</td></tr>';
        }
    }

    function renderLibrarians(librarians) {
        countBadge.textContent = `${librarians.length} Staff Member(s)`;

        if (!librarians || librarians.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No librarian accounts found.</td></tr>';
            return;
        }

        tableBody.innerHTML = librarians.map(lib => {
            const initial = lib.name.charAt(0).toUpperCase();
            const dateStr = new Date(lib.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div class="user-avatar" style="width: 32px; height: 32px; font-size: 0.85rem; background: linear-gradient(135deg, #0284c7, #2563eb);">${initial}</div>
                            <strong style="color: var(--text-primary); font-size: 0.95rem;">${escapeHTML(lib.name)}</strong>
                        </div>
                    </td>
                    <td><code>@${escapeHTML(lib.username)}</code></td>
                    <td><span style="font-size: 0.88rem; color: #475569;"><i class="fa-regular fa-envelope"></i> ${escapeHTML(lib.email)}</span></td>
                    <td><span style="font-size: 0.88rem;">${escapeHTML(lib.phone || 'N/A')}</span></td>
                    <td><span class="badge badge-info">${lib.total_issued_count || 0} book(s)</span></td>
                    <td><span style="font-size: 0.82rem; color: var(--text-secondary);">${dateStr}</span></td>
                    <td>
                        <div class="table-actions">
                            <button type="button" class="action-btn edit-lib-btn" data-lib='${JSON.stringify(lib)}' title="Edit Staff Details">
                                <i class="fa-solid fa-pencil"></i>
                            </button>
                            <button type="button" class="action-btn delete-btn delete-lib-btn" data-id="${lib.id}" data-name="${escapeHTML(lib.name)}" title="Delete Librarian">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach Edit Handlers
        document.querySelectorAll('.edit-lib-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lib = JSON.parse(btn.getAttribute('data-lib'));
                document.getElementById('edit-lib-id').value = lib.id;
                document.getElementById('edit-lib-name').value = lib.name;
                document.getElementById('edit-lib-email').value = lib.email;
                document.getElementById('edit-lib-phone').value = lib.phone || '';
                document.getElementById('edit-lib-password').value = '';
                editModal.classList.remove('hidden');
            });
        });

        // Attach Delete Handlers
        document.querySelectorAll('.delete-lib-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                confirmDeleteLibrarian(id, name);
            });
        });
    }

    async function confirmDeleteLibrarian(id, name) {
        if (!confirm(`Are you sure you want to remove librarian "${name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const res = await apiRequest(`/librarians/${id}`, { method: 'DELETE' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadLibrarians();
            } else {
                showToast(res.message || 'Failed to delete librarian', 'error');
            }
        } catch (e) {
            showToast('Network error while deleting librarian', 'error');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

