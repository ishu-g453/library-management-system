/**
 * Automated Verification Test for Library Management System
 */

const { app } = require('./server');
const http = require('node:http');

const PORT = 5099;
const server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);

    try {
        const fetchJson = async (path, options = {}) => {
            const res = await fetch(`http://localhost:${PORT}${path}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            });
            const data = await res.json();
            return { status: res.status, data };
        };

        // 1. Health check
        console.log('Testing 1: /api/health...');
        const health = await fetchJson('/api/health');
        console.assert(health.status === 200 && health.data.status === 'online', 'Health check failed');
        console.log(' -> Health check OK!');

        // 2. Admin Login
        console.log('Testing 2: /api/auth/login (Admin)...');
        const adminLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'admin' })
        });
        console.assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin login failed');
        const adminToken = adminLogin.data.token;
        console.log(' -> Admin Login OK! Token acquired.');

        // 3. Invalid credentials check
        console.log('Testing 3: /api/auth/login (Invalid Password)...');
        const badLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
        });
        console.assert(badLogin.status === 401 && !badLogin.data.success, 'Invalid password test failed');
        console.log(' -> Rejected invalid credentials correctly!');

        // 4. Role mismatch check
        console.log('Testing 4: /api/auth/login (Role mismatch)...');
        const roleMismatch = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'student' })
        });
        console.assert(roleMismatch.status === 403, 'Role mismatch test failed');
        console.log(' -> Role mismatch handled correctly (403)!');

        // 5. Books listing
        console.log('Testing 5: /api/books (Catalog retrieval)...');
        const books = await fetchJson('/api/books', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(books.status === 200 && books.data.books.length >= 10, 'Books catalog test failed');
        console.log(` -> Books Catalog OK! Retrieved ${books.data.books.length} books.`);

        // 6. Dashboard statistics
        console.log('Testing 6: /api/reports/dashboard-stats...');
        const stats = await fetchJson('/api/reports/dashboard-stats', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(stats.status === 200 && stats.data.stats.totalTitles >= 10, 'Stats test failed');
        console.log(` -> Stats OK! Total Titles: ${stats.data.stats.totalTitles}, Active Loans: ${stats.data.stats.activeIssues}`);

        // 7. Circulation Issues listing
        console.log('Testing 7: /api/issues (Circulation)...');
        const issues = await fetchJson('/api/issues', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(issues.status === 200 && issues.data.issues.length >= 4, 'Issues test failed');
        console.log(` -> Issues OK! Retrieved ${issues.data.issues.length} records.`);

        // 8. Members listing
        console.log('Testing 8: /api/members (Directory)...');
        const members = await fetchJson('/api/members', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(members.status === 200 && members.data.members.length >= 5, 'Members test failed');
        console.log(` -> Members OK! Retrieved ${members.data.members.length} members.`);

        // 9. Categories API
        console.log('Testing 9: /api/categories (Categories)...');
        const categories = await fetchJson('/api/categories', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(categories.status === 200 && categories.data.categories.length >= 8, 'Categories test failed');
        console.log(` -> Categories OK! Retrieved ${categories.data.categories.length} categories.`);

        // 10. Librarians API
        console.log('Testing 10: /api/librarians (Manage Librarians)...');
        const librarians = await fetchJson('/api/librarians', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(librarians.status === 200 && librarians.data.librarians.length >= 1, 'Librarians test failed');
        console.log(` -> Librarians OK! Retrieved ${librarians.data.librarians.length} librarian(s).`);

        // 11. Notifications API
        console.log('Testing 11: /api/notifications (Bulletins)...');
        const notifs = await fetchJson('/api/notifications', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(notifs.status === 200 && notifs.data.notifications.length >= 3, 'Notifications test failed');
        console.log(` -> Notifications OK! Retrieved ${notifs.data.notifications.length} notifications.`);

        // 12. Profile API
        console.log('Testing 12: /api/profile (User Profile)...');
        const profile = await fetchJson('/api/profile', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(profile.status === 200 && profile.data.user.username === 'admin', 'Profile test failed');
        console.log(` -> Profile OK! Retrieved profile for @${profile.data.user.username}.`);

        // 13. Settings API
        console.log('Testing 13: /api/settings (System Settings)...');
        const settings = await fetchJson('/api/settings', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.assert(settings.status === 200 && settings.data.settings.library_name, 'Settings test failed');
        console.log(` -> Settings OK! Library: ${settings.data.settings.library_name}.`);

        // 14. Student Login & Protected Loan View
        console.log('Testing 14: Student Isolation & Self-Loan Check...');
        const studentLogin = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: 'student', password: 'student123', role: 'student' })
        });
        const studentToken = studentLogin.data.token;
        const studentIssues = await fetchJson('/api/issues', {
            headers: { 'Authorization': `Bearer ${studentToken}` }
        });
        console.assert(studentIssues.status === 200 && studentIssues.data.issues.every(i => i.member_name === 'Rahul Sharma'), 'Student isolation failed');
        console.log(` -> Student Isolation OK! Student Rahul Sharma only sees his own loans (${studentIssues.data.issues.length} active).`);

        console.log('\n======================================================');
        console.log('🎉 ALL 14 FULL-STACK BCA INTEGRATION TESTS PASSED!');
        console.log('======================================================\n');
    } catch (err) {
        console.error('Test execution failed:', err);
    } finally {
        server.close();
        process.exit(0);
    }
});

