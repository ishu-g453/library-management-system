/**
 * Book Categories Controller (js/categories.js)
 * Manages classification sections, inventory counting, and category CRUD.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth(['admin', 'librarian']);
    if (!user) return;

    setupAppLayout('nav-categories');

    // DOM Elements
    const tableBody = document.getElementById('categories-table-body');
    const countBadge = document.getElementById('categories-count-badge');
    const openAddBtn = document.getElementById('btn-open-add-category');

    // Modals
    const addModal = document.getElementById('modal-add-category');
    const editModal = document.getElementById('modal-edit-category');
    const formAdd = document.getElementById('form-add-category');
    const formEdit = document.getElementById('form-edit-category');

    await loadCategories();

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

    // Form Add
    formAdd.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formAdd.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const payload = {
            name: document.getElementById('add-cat-name').value.trim(),
            description: document.getElementById('add-cat-desc').value.trim()
        };

        try {
            const res = await apiRequest('/categories', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                addModal.classList.add('hidden');
                formAdd.reset();
                await loadCategories();
            } else {
                showToast(res.message || 'Failed to add category', 'error');
            }
        } catch (e) {
            showToast('Network error while adding category', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Category';
        }
    });

    // Form Edit
    formEdit.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-cat-id').value;
        const submitBtn = formEdit.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        const payload = {
            name: document.getElementById('edit-cat-name').value.trim(),
            description: document.getElementById('edit-cat-desc').value.trim()
        };

        try {
            const res = await apiRequest(`/categories/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                editModal.classList.add('hidden');
                await loadCategories();
            } else {
                showToast(res.message || 'Failed to update category', 'error');
            }
        } catch (e) {
            showToast('Network error while updating category', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Category';
        }
    });

    async function loadCategories() {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Fetching categories...</td></tr>';

        try {
            const res = await apiRequest('/categories');
            if (res.success && res.categories) {
                renderCategories(res.categories);
            } else {
                tableBody.innerHTML = `<tr><td colspan="5" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (e) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Failed to load categories.</td></tr>';
        }
    }

    function renderCategories(categories) {
        countBadge.textContent = `${categories.length} Categories`;

        if (!categories || categories.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No categories registered yet.</td></tr>';
            return;
        }

        tableBody.innerHTML = categories.map(cat => `
            <tr>
                <td><strong style="color: var(--primary-color); font-size: 0.95rem;">${escapeHTML(cat.name)}</strong></td>
                <td><span style="font-size: 0.88rem; color: #475569;">${escapeHTML(cat.description || 'General catalog classification')}</span></td>
                <td><span class="badge badge-info">${cat.books_count || 0} title(s)</span></td>
                <td><strong>${cat.total_copies_count || 0}</strong> <small style="color: var(--text-light);">copies</small></td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="action-btn edit-cat-btn" data-cat='${JSON.stringify(cat)}' title="Edit Category">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        ${user.role === 'admin' ? `
                            <button type="button" class="action-btn delete-btn delete-cat-btn" data-id="${cat.id}" data-name="${escapeHTML(cat.name)}" title="Delete Category">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        // Attach Edit
        document.querySelectorAll('.edit-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = JSON.parse(btn.getAttribute('data-cat'));
                document.getElementById('edit-cat-id').value = cat.id;
                document.getElementById('edit-cat-name').value = cat.name;
                document.getElementById('edit-cat-desc').value = cat.description || '';
                editModal.classList.remove('hidden');
            });
        });

        // Attach Delete
        document.querySelectorAll('.delete-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                confirmDeleteCategory(id, name);
            });
        });
    }

    async function confirmDeleteCategory(id, name) {
        if (!confirm(`Are you sure you want to delete category "${name}"?`)) {
            return;
        }

        try {
            const res = await apiRequest(`/categories/${id}`, { method: 'DELETE' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadCategories();
            } else {
                showToast(res.message || 'Cannot delete category', 'error');
            }
        } catch (e) {
            showToast('Network error while deleting category', 'error');
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

