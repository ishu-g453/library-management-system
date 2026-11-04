/**
 * Library Settings Controller (js/settings.js)
 * Administrator configuration of institution details and circulation policies.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = Auth.requireAuth(['admin']);
    if (!user) return;

    setupAppLayout('nav-settings');

    // DOM Elements
    const form = document.getElementById('form-settings');
    const libName = document.getElementById('set-lib-name');
    const libEmail = document.getElementById('set-lib-email');
    const libPhone = document.getElementById('set-lib-phone');
    const fineRate = document.getElementById('set-fine-rate');
    const issueDays = document.getElementById('set-issue-days');
    const maxBooks = document.getElementById('set-max-books');
    const allowRenewals = document.getElementById('set-allow-renewals');
    const saveTopBtn = document.getElementById('btn-save-settings-top');

    await loadSettings();

    if (saveTopBtn) {
        saveTopBtn.addEventListener('click', () => {
            form.requestSubmit();
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-save-settings');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Settings...';

        const payload = {
            library_name: libName.value.trim(),
            library_email: libEmail.value.trim(),
            library_phone: libPhone.value.trim(),
            fine_rate_per_day: fineRate.value,
            max_issue_days: issueDays.value,
            max_books_per_student: maxBooks.value,
            allow_student_renewals: allowRenewals.value
        };

        try {
            const res = await apiRequest('/settings', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (res.success) {
                showToast(res.message, 'success');
                await loadSettings();
            } else {
                showToast(res.message || 'Failed to save settings', 'error');
            }
        } catch (err) {
            showToast('Network error while saving settings', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save System Configuration';
        }
    });

    async function loadSettings() {
        try {
            const res = await apiRequest('/settings');
            if (res.success && res.settings) {
                const s = res.settings;
                libName.value = s.library_name || 'SmartLib Central Academic Library';
                libEmail.value = s.library_email || 'admin@library.edu';
                libPhone.value = s.library_phone || '+91 98765 43210';
                fineRate.value = s.fine_rate_per_day || 5;
                issueDays.value = s.max_issue_days || 14;
                maxBooks.value = s.max_books_per_student || 5;
                allowRenewals.value = s.allow_student_renewals || 'true';
            }
        } catch (e) {
            showToast('Could not load current system settings', 'error');
        }
    }
});

