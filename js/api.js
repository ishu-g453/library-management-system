/**
 * SmartLib Client API & Authentication Helper
 * Handles unified API requests, JWT tokens, session checks, toast notifications, and navigation.
 */

// Dynamically resolve API URL so both Express (port 5000) and Live Server (port 5500) work seamlessly
const API_BASE = (window.location.port === '5500' || window.location.port === '5501' || window.location.hostname === '127.0.0.1' && window.location.port !== '5000')
    ? 'http://localhost:5000/api'
    : '/api';

/**
 * Storage Helpers
 */
const Auth = {
    getToken() {
        return localStorage.getItem('smartlib_token');
    },

    getUser() {
        try {
            const raw = localStorage.getItem('smartlib_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    setSession(token, user) {
        localStorage.setItem('smartlib_token', token);
        localStorage.setItem('smartlib_user', JSON.stringify(user));
    },

    clearSession() {
        localStorage.removeItem('smartlib_token');
        localStorage.removeItem('smartlib_user');
    },

    isAuthenticated() {
        return !!this.getToken() && !!this.getUser();
    },

    /**
     * Protect page and verify authorized role
     */
    requireAuth(allowedRoles = []) {
        if (!this.isAuthenticated()) {
            window.location.href = 'index.html';
            return null;
        }

        const user = this.getUser();
        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
            alert(`Access Denied: Your account role (${user.role.toUpperCase()}) does not have permission to view this page.`);
            window.location.href = 'dashboard.html';
            return null;
        }

        return user;
    },

    logout() {
        this.clearSession();
        window.location.href = 'index.html';
    }
};

/**
 * Unified API Request function
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const token = Auth.getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({
            success: false,
            message: 'Invalid response from server.'
        }));

        if (response.status === 401) {
            Auth.clearSession();
            if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
                alert('Session expired. Please sign in again.');
                window.location.href = 'index.html';
            }
            return data;
        }

        return data;
    } catch (networkError) {
        console.error('API Network Error:', networkError);
        return {
            success: false,
            message: 'Unable to connect to backend server. Make sure the Node server is running on http://localhost:5000'
        };
    }
}

/**
 * Toast Notification System
 */
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    const icon = type === 'success' 
        ? '<i class="fa-solid fa-circle-check"></i>' 
        : type === 'warning'
        ? '<i class="fa-solid fa-triangle-exclamation"></i>'
        : '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 3.5s
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Common Navigation & Header initialization across pages
 */
function setupAppLayout(activeNavId) {
    const user = Auth.getUser();
    if (!user) return;

    // Display user profile info in topbar/sidebar
    const userNameElements = document.querySelectorAll('.display-user-name');
    const userRoleElements = document.querySelectorAll('.display-user-role');
    const userAvatarElements = document.querySelectorAll('.display-user-avatar');

    userNameElements.forEach(el => el.textContent = user.name || user.username);
    userRoleElements.forEach(el => el.textContent = user.role.toUpperCase());
    userAvatarElements.forEach(el => {
        el.textContent = (user.name || user.username).charAt(0).toUpperCase();
    });

    // Mark current active nav item
    if (activeNavId) {
        const activeLink = document.getElementById(activeNavId);
        if (activeLink) activeLink.classList.add('active');
    }

    // Role-based sidebar item visibility
    if (user.role === 'student') {
        document.querySelectorAll('.role-admin-librarian, .role-staff-only, .role-admin-only')
            .forEach(el => el.style.display = 'none');
        document.querySelectorAll('.role-student-only')
            .forEach(el => el.style.display = 'flex');
    } else if (user.role === 'librarian') {
        document.querySelectorAll('.role-admin-only, .role-student-only')
            .forEach(el => el.style.display = 'none');
        document.querySelectorAll('.role-staff-only, .role-admin-librarian')
            .forEach(el => el.style.display = 'flex');
    } else if (user.role === 'admin') {
        document.querySelectorAll('.role-student-only')
            .forEach(el => el.style.display = 'none');
        document.querySelectorAll('.role-admin-only, .role-staff-only, .role-admin-librarian')
            .forEach(el => el.style.display = 'flex');
    }

    // Auto-fetch unread notifications count for badge
    fetchNotificationBadge();

    // Logout button handler
    const logoutBtns = document.querySelectorAll('.btn-logout');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to sign out?')) {
                Auth.logout();
            }
        });
    });

    // Mobile sidebar toggle handler
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.app-sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

/**
 * Fetch and display unread notification counter badge in sidebar/topbar
 */
async function fetchNotificationBadge() {
    try {
        const res = await apiRequest('/notifications');
        if (res.success && res.unreadCount > 0) {
            const notifNav = document.getElementById('nav-notifications');
            if (notifNav && !notifNav.querySelector('.nav-badge')) {
                const badge = document.createElement('span');
                badge.className = 'nav-badge';
                badge.style.cssText = 'background: #ef4444; color: white; border-radius: 10px; padding: 1px 6px; font-size: 0.7rem; font-weight: 700; margin-left: auto;';
                badge.textContent = res.unreadCount;
                notifNav.appendChild(badge);
            }
        }
    } catch (e) {
        // Non-blocking
    }
}

