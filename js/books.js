/**
 * Books Catalog Controller (js/books.js)
 * Manages book listing, searching, categories, and Add/Edit/Delete operations.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-books');

    // DOM Elements
    const searchInput = document.getElementById('search-books');
    const categorySelect = document.getElementById('filter-category');
    const availabilitySelect = document.getElementById('filter-availability');
    const resetFiltersBtn = document.getElementById('btn-reset-filters');
    const booksTableBody = document.getElementById('books-table-body');
    const openAddBtn = document.getElementById('btn-open-add-book');

    // Modals
    const addModal = document.getElementById('modal-add-book');
    const editModal = document.getElementById('modal-edit-book');
    const formAddBook = document.getElementById('form-add-book');
    const formEditBook = document.getElementById('form-edit-book');

    let allBooks = [];

    // Initialize Page
    await loadCategories();
    await loadBooks();

    // Event Listeners for Filters
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadBooks, 250);
    });

    categorySelect.addEventListener('change', loadBooks);
    availabilitySelect.addEventListener('change', loadBooks);

    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        categorySelect.value = 'All';
        availabilitySelect.value = 'all';
        loadBooks();
    });

    // Add Book Modal Handlers
    if (openAddBtn) {
        openAddBtn.addEventListener('click', () => {
            formAddBook.reset();
            addModal.classList.remove('hidden');
        });
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-close');
            const target = document.getElementById(targetId);
            if (target) target.classList.add('hidden');
        });
    });

    // Close on overlay backdrop click
    [addModal, editModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Submit Add Book Form
    formAddBook.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formAddBook.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const payload = {
            isbn: document.getElementById('add-isbn').value.trim(),
            title: document.getElementById('add-title').value.trim(),
            author: document.getElementById('add-author').value.trim(),
            category: document.getElementById('add-category').value.trim(),
            publisher: document.getElementById('add-publisher').value.trim(),
            publish_year: document.getElementById('add-year').value,
            total_copies: document.getElementById('add-copies').value,
            shelf_location: document.getElementById('add-shelf').value.trim()
        };

        try {
            const res = await apiRequest('/books', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                addModal.classList.add('hidden');
                formAddBook.reset();
                await loadCategories();
                await loadBooks();
            } else {
                showToast(res.message || 'Failed to add book', 'error');
            }
        } catch (err) {
            showToast('Network error while saving book', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Book to Catalog';
        }
    });

    // Submit Edit Book Form
    formEditBook.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-book-id').value;
        const submitBtn = formEditBook.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        const payload = {
            isbn: document.getElementById('edit-isbn').value.trim(),
            title: document.getElementById('edit-title').value.trim(),
            author: document.getElementById('edit-author').value.trim(),
            category: document.getElementById('edit-category').value.trim(),
            publisher: document.getElementById('edit-publisher').value.trim(),
            publish_year: document.getElementById('edit-year').value,
            total_copies: document.getElementById('edit-copies').value,
            shelf_location: document.getElementById('edit-shelf').value.trim()
        };

        try {
            const res = await apiRequest(`/books/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                editModal.classList.add('hidden');
                await loadCategories();
                await loadBooks();
            } else {
                showToast(res.message || 'Failed to update book', 'error');
            }
        } catch (err) {
            showToast('Network error while updating book', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Book';
        }
    });

    /**
     * Load Books from API
     */
    async function loadBooks() {
        booksTableBody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Filtering books...</td></tr>';

        const q = new URLSearchParams();
        if (searchInput.value.trim()) q.append('search', searchInput.value.trim());
        if (categorySelect.value && categorySelect.value !== 'All') q.append('category', categorySelect.value);
        if (availabilitySelect.value && availabilitySelect.value !== 'all') q.append('availability', availabilitySelect.value);

        try {
            const res = await apiRequest(`/books?${q.toString()}`);
            if (res.success) {
                allBooks = res.books || [];
                renderBooks(allBooks);
            } else {
                booksTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${res.message}</td></tr>`;
            }
        } catch (error) {
            booksTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load books catalog.</td></tr>';
        }
    }

    /**
     * Render Books Table
     */
    function renderBooks(books) {
        if (!books || books.length === 0) {
            booksTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fa-solid fa-book-open"></i>
                        <h4>No books found</h4>
                        <p>Try refining your search keyword or selecting a different category filter.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const isStaff = user.role === 'admin' || user.role === 'librarian';

        booksTableBody.innerHTML = books.map(book => {
            const isAvailable = book.available_copies > 0;
            const statusBadge = isAvailable
                ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Available</span>`
                : `<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Out of Stock</span>`;

            let actionButtons = '';
            if (isStaff) {
                actionButtons = `
                    <div class="table-actions">
                        <button type="button" class="action-btn edit-btn" data-edit-id="${book.id}" title="Edit Book">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        ${user.role === 'admin' ? `
                            <button type="button" class="action-btn delete-btn" data-delete-id="${book.id}" data-title="${escapeHTML(book.title)}" title="Delete Book">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }

            return `
                <tr>
                    <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.82rem;">${escapeHTML(book.isbn)}</code></td>
                    <td>
                        <strong style="color: var(--text-primary); font-size: 0.95rem; display: block;">${escapeHTML(book.title)}</strong>
                        <small style="color: var(--text-secondary);"><i class="fa-solid fa-user-pen" style="font-size: 0.75rem;"></i> ${escapeHTML(book.author)} ${book.publish_year ? `(${book.publish_year})` : ''}</small>
                    </td>
                    <td><span class="badge badge-info">${escapeHTML(book.category)}</span></td>
                    <td><span style="font-size: 0.85rem; color: #475569;"><i class="fa-solid fa-location-dot" style="color: #94a3b8;"></i> ${escapeHTML(book.shelf_location || 'General')}</span></td>
                    <td>
                        <strong style="color: ${isAvailable ? 'var(--primary-color)' : 'var(--danger-color)'};">${book.available_copies}</strong>
                        <span style="color: var(--text-light);"> / ${book.total_copies}</span>
                    </td>
                    <td>${statusBadge}</td>
                    ${isStaff ? `<td>${actionButtons}</td>` : ''}
                </tr>
            `;
        }).join('');

        // Attach Edit listeners
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-edit-id');
                openEditModal(id);
            });
        });

        // Attach Delete listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-delete-id');
                const title = btn.getAttribute('data-title');
                confirmDeleteBook(id, title);
            });
        });
    }

    /**
     * Open and prefill Edit Modal
     */
    async function openEditModal(id) {
        try {
            const res = await apiRequest(`/books/${id}`);
            if (res.success && res.book) {
                const b = res.book;
                document.getElementById('edit-book-id').value = b.id;
                document.getElementById('edit-isbn').value = b.isbn;
                document.getElementById('edit-title').value = b.title;
                document.getElementById('edit-author').value = b.author;
                document.getElementById('edit-category').value = b.category;
                document.getElementById('edit-publisher').value = b.publisher || '';
                document.getElementById('edit-year').value = b.publish_year || '';
                document.getElementById('edit-copies').value = b.total_copies;
                document.getElementById('edit-shelf').value = b.shelf_location || '';

                editModal.classList.remove('hidden');
            } else {
                showToast(res.message || 'Could not fetch book details', 'error');
            }
        } catch (e) {
            showToast('Error opening edit dialog', 'error');
        }
    }

    /**
     * Delete Book with confirmation
     */
    async function confirmDeleteBook(id, title) {
        if (!confirm(`Are you sure you want to permanently delete "${title}" from the catalog?`)) {
            return;
        }

        try {
            const res = await apiRequest(`/books/${id}`, { method: 'DELETE' });
            if (res.success) {
                showToast(res.message, 'success');
                await loadCategories();
                await loadBooks();
            } else {
                showToast(res.message || 'Could not delete book', 'error');
            }
        } catch (e) {
            showToast('Network error while deleting book', 'error');
        }
    }

    /**
     * Load Categories for dropdown filter
     */
    async function loadCategories() {
        try {
            const res = await apiRequest('/books/categories');
            if (res.success && res.categories) {
                const currentVal = categorySelect.value;
                categorySelect.innerHTML = '<option value="All">All Categories</option>' +
                    res.categories.map(cat => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`).join('');
                if (currentVal) categorySelect.value = currentVal;
            }
        } catch (e) {
            console.error('Failed to load categories', e);
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

