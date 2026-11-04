/**
 * SmartLib - Login Page Controller
 * Connects frontend form to the Node.js Express & SQLite backend.
 */

document.addEventListener('DOMContentLoaded', () => {
    // If user is already authenticated with valid token, redirect to dashboard
    if (Auth.isAuthenticated()) {
        const user = Auth.getUser();
        if (confirm(`You are already signed in as ${user.name} (${user.role.toUpperCase()}). Do you want to go to the Dashboard?`)) {
            window.location.href = 'dashboard.html';
            return;
        }
    }

    // Selected role state
    let selectedRole = 'admin';

    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const usernameError = document.getElementById('username-error');
    const passwordError = document.getElementById('password-error');
    const alertBox = document.getElementById('alert-box');
    const alertMessage = document.getElementById('alert-message');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const toggleIcon = document.getElementById('toggle-icon');
    const roleButtons = document.querySelectorAll('.role-btn');
    const demoChips = document.querySelectorAll('.chip, .demo-card-item');
    const loginButton = document.getElementById('login-button');
    const btnText = loginButton.querySelector('.btn-text');
    const btnIcon = loginButton.querySelector('.btn-icon');
    const btnSpinner = loginButton.querySelector('.btn-spinner');

    // Forgot Password Modal Elements
    const forgotLink = document.getElementById('forgot-password-link');
    const forgotModal = document.getElementById('forgot-modal');
    const closeForgotBtn = document.getElementById('close-forgot-modal');
    const cancelForgotBtn = document.getElementById('cancel-forgot-modal');
    const submitForgotBtn = document.getElementById('submit-forgot-modal');
    const resetIdentityInput = document.getElementById('reset-identity');
    const forgotFeedback = document.getElementById('forgot-feedback');

    // 1. Role Selection Switching
    roleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            roleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRole = btn.getAttribute('data-role');
            hideAlert();
        });
    });

    // 2. Toggle Password Visibility
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        if (isPassword) {
            passwordInput.setAttribute('type', 'text');
            toggleIcon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            passwordInput.setAttribute('type', 'password');
            toggleIcon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // 3. Demo Account Quick Autofill
    demoChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const u = chip.getAttribute('data-user');
            const p = chip.getAttribute('data-pass');
            const r = chip.getAttribute('data-role');

            usernameInput.value = u;
            passwordInput.value = p;

            // Update role active state
            roleButtons.forEach(b => {
                if (b.getAttribute('data-role') === r) {
                    b.classList.add('active');
                    selectedRole = r;
                } else {
                    b.classList.remove('active');
                }
            });

            // Visual feedback on the clicked chip
            const pill = chip.querySelector('.demo-click-pill');
            if (pill) {
                const originalText = pill.textContent;
                pill.textContent = '✓ Ready';
                pill.style.backgroundColor = '#10b981';
                pill.style.color = '#ffffff';
                pill.style.borderColor = '#10b981';
                setTimeout(() => {
                    pill.textContent = originalText;
                    pill.style.backgroundColor = '';
                    pill.style.color = '';
                    pill.style.borderColor = '';
                }, 1200);
            }

            clearErrors();
            hideAlert();
        });
    });

    // 4. Form Validation & Backend Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        hideAlert();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        let hasError = false;

        if (!username) {
            showFieldError(usernameInput, usernameError, 'Please enter your username or email address');
            hasError = true;
        }

        if (!password) {
            showFieldError(passwordInput, passwordError, 'Please enter your password');
            hasError = true;
        }

        if (hasError) return;

        // Visual loading state
        setLoadingState(true);

        try {
            // Send login request to Node.js / Express backend
            const response = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password,
                    role: selectedRole
                })
            });

            if (response.success && response.token) {
                // Store JWT token and user session
                Auth.setSession(response.token, response.user);
                showToast(`Welcome back, ${response.user.name}! Redirecting...`, 'success');

                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 800);
            } else {
                showAlert(response.message || 'Authentication failed. Please verify your credentials.');
            }
        } catch (error) {
            showAlert('Could not contact authentication server. Please check that Node backend is running.');
        } finally {
            setLoadingState(false);
        }
    });

    // 5. Forgot Password Flow
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotModal.classList.remove('hidden');
        resetIdentityInput.value = usernameInput.value.trim();
        forgotFeedback.classList.add('hidden');
    });

    const closeModal = () => {
        forgotModal.classList.add('hidden');
        forgotFeedback.classList.add('hidden');
    };

    closeForgotBtn.addEventListener('click', closeModal);
    cancelForgotBtn.addEventListener('click', closeModal);
    forgotModal.addEventListener('click', (e) => {
        if (e.target === forgotModal) closeModal();
    });

    submitForgotBtn.addEventListener('click', async () => {
        const idVal = resetIdentityInput.value.trim();
        if (!idVal) {
            forgotFeedback.className = 'alert-box';
            forgotFeedback.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> <span>Please enter a username or email.</span>';
            forgotFeedback.classList.remove('hidden');
            return;
        }

        submitForgotBtn.disabled = true;
        submitForgotBtn.textContent = 'Verifying...';

        try {
            const res = await apiRequest('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ usernameOrEmail: idVal })
            });

            forgotFeedback.classList.remove('hidden');
            if (res.success) {
                forgotFeedback.className = 'alert-box alert-info';
                forgotFeedback.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${res.message}</span>`;
            } else {
                forgotFeedback.className = 'alert-box';
                forgotFeedback.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${res.message}</span>`;
            }
        } catch (e) {
            forgotFeedback.className = 'alert-box';
            forgotFeedback.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> <span>Network error. Please try again.</span>';
            forgotFeedback.classList.remove('hidden');
        } finally {
            submitForgotBtn.disabled = false;
            submitForgotBtn.textContent = 'Submit Request';
        }
    });

    // Helper functions
    function showFieldError(inputElement, errorElement, message) {
        inputElement.parentElement.classList.add('error');
        errorElement.textContent = message;
    }

    function clearErrors() {
        usernameInput.parentElement.classList.remove('error');
        passwordInput.parentElement.classList.remove('error');
        usernameError.textContent = '';
        passwordError.textContent = '';
    }

    function showAlert(message) {
        alertMessage.textContent = message;
        alertBox.classList.remove('hidden');
    }

    function hideAlert() {
        alertBox.classList.add('hidden');
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            loginButton.disabled = true;
            btnText.classList.add('hidden');
            btnIcon.classList.add('hidden');
            btnSpinner.classList.remove('hidden');
        } else {
            loginButton.disabled = false;
            btnText.classList.remove('hidden');
            btnIcon.classList.remove('hidden');
            btnSpinner.classList.add('hidden');
        }
    }

    usernameInput.addEventListener('input', () => {
        usernameInput.parentElement.classList.remove('error');
        usernameError.textContent = '';
        hideAlert();
    });

    passwordInput.addEventListener('input', () => {
        passwordInput.parentElement.classList.remove('error');
        passwordError.textContent = '';
        hideAlert();
    });
});
