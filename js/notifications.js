/**
 * Notifications Controller (js/notifications.js)
 * Manages user bulletins, read/unread states, and broadcast announcements.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-notifications');

    // DOM Elements
    const listContainer = document.getElementById('notifications-list-container');
    const unreadBadge = document.getElementById('unread-count-badge');
    const markAllBtn = document.getElementById('btn-mark-all-read');
    const openCreateBtn = document.getElementById('btn-open-create-notif');

    // Modal
    const createModal = document.getElementById('modal-create-notif');
    const formCreate = document.getElementById('form-create-notif');

    await loadNotifications();

    if (openCreateBtn) {
        openCreateBtn.addEventListener('click', () => {
            formCreate.reset();
            createModal.classList.remove('hidden');
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                const res = await apiRequest('/notifications/mark-all-read', { method: 'POST' });
                if (res.success) {
                    showToast(res.message, 'success');
                    await loadNotifications();
                }
            } catch (e) {
                showToast('Failed to mark all as read', 'error');
            }
        });
    }

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-close');
            const target = document.getElementById(id);
            if (target) target.classList.add('hidden');
        });
    });

    if (createModal) {
        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) createModal.classList.add('hidden');
        });

        formCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = formCreate.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';

            const payload = {
                title: document.getElementById('notif-title').value.trim(),
                type: document.getElementById('notif-type').value,
                target_role: document.getElementById('notif-role').value,
                message: document.getElementById('notif-message').value.trim()
            };

            try {
                const res = await apiRequest('/notifications', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (res.success) {
                    showToast(res.message, 'success');
                    createModal.classList.add('hidden');
                    formCreate.reset();
                    await loadNotifications();
                } else {
                    showToast(res.message || 'Failed to post bulletin', 'error');
                }
            } catch (err) {
                showToast('Network error while broadcasting notice', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Broadcast Notice';
            }
        });
    }

    async function loadNotifications() {
        listContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading notices...</div>';

        try {
            const res = await apiRequest('/notifications');
            if (res.success && res.notifications) {
                unreadBadge.textContent = `${res.unreadCount || 0} Unread`;
                renderNotifications(res.notifications);
            } else {
                listContainer.innerHTML = `<div class="empty-state">${res.message}</div>`;
            }
        } catch (e) {
            listContainer.innerHTML = '<div class="empty-state">Failed to load bulletins.</div>';
        }
    }

    function renderNotifications(notifs) {
        if (!notifs || notifs.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-bell-slash"></i>
                    <h4>No notifications right now</h4>
                    <p>You are fully caught up with all library announcements.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${notifs.map(item => {
                    const isUnread = item.is_read === 0;
                    let borderLeft = '#3b82f6';
                    let typeIcon = '<i class="fa-solid fa-circle-info" style="color: #3b82f6;"></i>';
                    let bgTint = isUnread ? '#f8fafc' : '#ffffff';

                    if (item.type === 'warning') {
                        borderLeft = '#f59e0b';
                        typeIcon = '<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>';
                    } else if (item.type === 'alert') {
                        borderLeft = '#ef4444';
                        typeIcon = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';
                    } else if (item.type === 'success') {
                        borderLeft = '#10b981';
                        typeIcon = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
                    }

                    const timeStr = new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                    return `
                        <div class="notif-card-item" data-id="${item.id}" style="border: 1px solid var(--border-color); border-left: 4px solid ${borderLeft}; border-radius: 10px; padding: 1.15rem 1.25rem; background: ${bgTint}; transition: var(--transition);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    ${typeIcon}
                                    <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                                        ${escapeHTML(item.title)}
                                    </h4>
                                    ${isUnread ? '<span style="background: #2563eb; color: white; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">NEW</span>' : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-size: 0.78rem; color: var(--text-secondary);">${timeStr}</span>
                                    ${user.role === 'admin' ? `
                                        <button type="button" class="btn-delete-notif" data-id="${item.id}" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 2px;" title="Delete Bulletin">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <p style="font-size: 0.9rem; color: #475569; margin-bottom: 0.5rem; line-height: 1.5;">
                                ${escapeHTML(item.message)}
                            </p>
                            ${isUnread ? `
                                <button type="button" class="btn-mark-read" data-id="${item.id}" style="background: none; border: none; color: var(--primary-color); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0;">
                                    <i class="fa-solid fa-check"></i> Mark as read
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Attach Mark Single As Read
        document.querySelectorAll('.btn-mark-read').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
                await loadNotifications();
            });
        });

        // Attach Admin Delete
        if (user.role === 'admin') {
            document.querySelectorAll('.btn-delete-notif').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('Remove this bulletin notice?')) return;
                    const id = btn.getAttribute('data-id');
                    await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
                    await loadNotifications();
                });
            });
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});

