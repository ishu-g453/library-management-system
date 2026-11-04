/**
 * User Profile Controller (js/profile.js)
 * Manages personal info, password changes, and student ID cards.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth();
    if (!user) return;

    setupAppLayout('nav-profile');

    // DOM Elements
    const usernameEl = document.getElementById('profile-username');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');
    const joinedEl = document.getElementById('profile-meta-joined');

    // Forms
    const formProfile = document.getElementById('form-update-profile');
    const formPassword = document.getElementById('form-change-password');
    const editNameInput = document.getElementById('edit-prof-name');
    const editEmailInput = document.getElementById('edit-prof-email');
    const editPhoneInput = document.getElementById('edit-prof-phone');

    // Student Member Card
    const studentCard = document.getElementById('student-member-card');
    const cardCode = document.getElementById('card-member-code');
    const cardName = document.getElementById('card-member-name');
    const cardDept = document.getElementById('card-member-dept');
    const cardLoans = document.getElementById('card-active-loans');
    const cardFines = document.getElementById('card-fines');

    await loadProfile();

    // Profile Form Submit
    formProfile.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-save-profile');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const payload = {
            name: editNameInput.value.trim(),
            email: editEmailInput.value.trim(),
            phone: editPhoneInput.value.trim()
        };

        try {
            const res = await apiRequest('/profile', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                // Update local storage user name
                const currentSessionUser = Auth.getUser();
                if (currentSessionUser) {
                    currentSessionUser.name = payload.name;
                    currentSessionUser.email = payload.email;
                    localStorage.setItem('smartlib_user', JSON.stringify(currentSessionUser));
                }
                await loadProfile();
                setupAppLayout('nav-profile');
            } else {
                showToast(res.message || 'Failed to update profile', 'error');
            }
        } catch (err) {
            showToast('Network error while updating profile', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Personal Details';
        }
    });

    // Password Form Submit
    formPassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        const curPass = document.getElementById('pass-current').value;
        const newPass = document.getElementById('pass-new').value;
        const confirmPass = document.getElementById('pass-confirm').value;

        if (newPass !== confirmPass) {
            showToast('New passwords do not match.', 'error');
            return;
        }

        const submitBtn = document.getElementById('btn-change-pass');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating Password...';

        try {
            const res = await apiRequest('/profile/password', {
                method: 'PUT',
                body: JSON.stringify({
                    currentPassword: curPass,
                    newPassword: newPass
                })
            });

            if (res.success) {
                showToast(res.message, 'success');
                formPassword.reset();
            } else {
                showToast(res.message || 'Failed to change password', 'error');
            }
        } catch (err) {
            showToast('Network error while changing password', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Update Password';
        }
    });

    async function loadProfile() {
        try {
            const res = await apiRequest('/profile');
            if (res.success && res.user) {
                const u = res.user;
                usernameEl.textContent = `@${u.username}`;
                emailEl.textContent = u.email || 'N/A';
                phoneEl.textContent = u.phone || 'N/A';
                joinedEl.textContent = `Registered: ${new Date(u.created_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}`;

                editNameInput.value = u.name;
                editEmailInput.value = u.email || '';
                editPhoneInput.value = u.phone || '';

                // If member/student details exist
                if (res.member) {
                    studentCard.classList.remove('hidden');
                    const m = res.member;
                    cardCode.textContent = m.member_code;
                    cardName.textContent = m.name;
                    cardDept.textContent = `${m.department || 'General'} (${m.role.toUpperCase()})`;
                    if (res.loanStats) {
                        cardLoans.textContent = res.loanStats.active_loans || 0;
                        cardFines.textContent = `₹${(res.loanStats.total_fines || 0).toFixed(2)}`;
                    }
                }
            }
        } catch (e) {
            showToast('Could not load profile details', 'error');
        }
    }
});

