/**
 * Database Module (SQLite)
 * Uses Node.js native sqlite module (DatabaseSync) for fast, zero-dependency SQLite storage.
 * Handles schema initialization and seeding demo accounts & books.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for better concurrency
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Initialize all database tables
 */
function initDatabase() {
    // 1. Users Table (Authentication & Roles)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('admin', 'librarian', 'student')),
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Books Table (Catalog)
    db.exec(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            isbn TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            category TEXT NOT NULL,
            publisher TEXT,
            publish_year INTEGER,
            total_copies INTEGER NOT NULL DEFAULT 1,
            available_copies INTEGER NOT NULL DEFAULT 1,
            shelf_location TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 3. Members Table (Library Members / Students / Faculty)
    db.exec(`
        CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            member_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            department TEXT,
            role TEXT DEFAULT 'student' CHECK(role IN ('student', 'faculty', 'staff')),
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'inactive')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

    // 4. Book Issues Table (Issue & Return transactions)
    db.exec(`
        CREATE TABLE IF NOT EXISTS book_issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            issue_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            return_date TEXT,
            status TEXT DEFAULT 'issued' CHECK(status IN ('issued', 'returned', 'overdue')),
            fine_amount REAL DEFAULT 0.0,
            fine_paid INTEGER DEFAULT 0,
            issued_by INTEGER,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
            FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

    // 5. Activity Logs Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

    // 6. Book Categories Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 7. Notifications Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            role TEXT DEFAULT 'all',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info' CHECK(type IN ('info', 'warning', 'alert', 'success')),
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // 8. System & Library Settings Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed default data if database is fresh
    seedInitialData();
}

/**
 * Seed initial demo data (Users, Books, Members, Issues, Categories, Notifications, Settings)
 */
function seedInitialData() {
    // 1. Seed Categories if empty
    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
    if (catCount === 0) {
        console.log('Seeding initial categories...');
        const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
        insertCat.run('Computer Science', 'Programming, algorithms, web development, data structures');
        insertCat.run('Artificial Intelligence', 'Machine learning, deep neural nets, computer vision, robotics');
        insertCat.run('Literature', 'Novels, drama, poetry, and classical literary masterpieces');
        insertCat.run('Science', 'Physics, cosmology, biology, chemistry, and environmental studies');
        insertCat.run('Business', 'Finance, management, entrepreneurship, and economics');
        insertCat.run('Self-Help', 'Productivity, psychology, mindfulness, and personal habits');
        insertCat.run('Mathematics', 'Discrete mathematics, linear algebra, calculus, and statistics');
        insertCat.run('Electronics', 'Digital circuits, microprocessors, IoT, and telecommunications');
    }

    // 2. Seed Settings if empty
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
    if (settingsCount === 0) {
        console.log('Seeding initial library settings...');
        const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)');
        insertSetting.run('fine_rate_per_day', '5', 'Overdue fine rate per day in INR');
        insertSetting.run('max_issue_days', '14', 'Standard book checkout loan duration in days');
        insertSetting.run('max_books_per_student', '5', 'Maximum simultaneous active loans allowed per student');
        insertSetting.run('library_name', 'SmartLib Central Academic Library', 'Official institution library name');
        insertSetting.run('library_email', 'admin@library.edu', 'Primary library support email');
        insertSetting.run('library_phone', '+91 98765 43210', 'Circulation desk contact phone number');
        insertSetting.run('allow_student_renewals', 'true', 'Whether students can self-renew active loans online');
        insertSetting.run('enable_email_alerts', 'false', 'Enable or disable automated email dispatch');
    }

    // 3. Seed Notifications if empty
    const notifCount = db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
    if (notifCount === 0) {
        console.log('Seeding initial notifications...');
        const insertNotif = db.prepare('INSERT INTO notifications (user_id, role, title, message, type) VALUES (?, ?, ?, ?, ?)');
        insertNotif.run(null, 'all', 'Welcome to SmartLib v1.0', 'SmartLib full-stack portal is fully initialized. Welcome to the new semester catalog!', 'success');
        insertNotif.run(null, 'student', 'Overdue Fine Policy Reminder', 'Reminder: Standard loan period is 14 days. An overdue fine of ₹5.00/day applies after due date.', 'warning');
        insertNotif.run(null, 'all', 'New Catalog Additions', 'New editions of "The Pragmatic Programmer" and "Artificial Intelligence: A Modern Approach" are now in stock.', 'info');
        insertNotif.run(null, 'admin', 'System Maintenance Scheduled', 'SQLite automated backup and WAL checkpoint completed with 0 errors.', 'info');
    }

    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount > 0) {
        // Ensure a secondary librarian exists for testing librarian management
        const hasLibrarian2 = db.prepare("SELECT id FROM users WHERE username = 'librarian2'").get();
        if (!hasLibrarian2) {
            const libHash = bcrypt.hashSync('lib123', 10);
            db.prepare('INSERT INTO users (username, password, name, email, role, phone) VALUES (?, ?, ?, ?, ?, ?)')
                .run('librarian2', libHash, 'Pooja Verma', 'pooja.verma@library.edu', 'librarian', '+91 98765 43299');
        }
        return; // Core users already initialized
    }

    console.log('Seeding initial library data...');

    // 1. Seed Demo Users with bcrypt hashed passwords
    const insertUser = db.prepare(`
        INSERT INTO users (username, password, name, email, role, phone)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const adminHash = bcrypt.hashSync('admin123', 10);
    const libHash = bcrypt.hashSync('lib123', 10);
    const studentHash = bcrypt.hashSync('student123', 10);

    insertUser.run('admin', adminHash, 'System Administrator', 'admin@library.edu', 'admin', '+91 98765 43210');
    insertUser.run('librarian', libHash, 'Head Librarian', 'librarian@library.edu', 'librarian', '+91 98765 43211');
    const studentResult = insertUser.run('student', studentHash, 'Rahul Sharma', 'student@library.edu', 'student', '+91 98765 43212');
    const studentUserId = studentResult.lastInsertRowid;

    // 2. Seed Demo Members
    const insertMember = db.prepare(`
        INSERT INTO members (user_id, member_code, name, email, phone, department, role, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const m1 = insertMember.run(studentUserId, 'MEM-1001', 'Rahul Sharma', 'rahul.cs@college.edu', '+91 98765 43212', 'Computer Science', 'student', 'active').lastInsertRowid;
    const m2 = insertMember.run(null, 'MEM-1002', 'Priya Patel', 'priya.it@college.edu', '+91 98765 43213', 'Information Tech', 'student', 'active').lastInsertRowid;
    const m3 = insertMember.run(null, 'MEM-1003', 'Dr. Ananya Sen', 'ananya.sen@college.edu', '+91 98765 43214', 'Computer Science', 'faculty', 'active').lastInsertRowid;
    const m4 = insertMember.run(null, 'MEM-1004', 'Amit Verma', 'amit.ec@college.edu', '+91 98765 43215', 'Electronics', 'student', 'active').lastInsertRowid;
    const m5 = insertMember.run(null, 'MEM-1005', 'Sneha Kulkarni', 'sneha.mech@college.edu', '+91 98765 43216', 'Mechanical', 'student', 'active').lastInsertRowid;

    // 3. Seed Demo Books
    const insertBook = db.prepare(`
        INSERT INTO books (isbn, title, author, category, publisher, publish_year, total_copies, available_copies, shelf_location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const b1 = insertBook.run('978-0132350884', 'Clean Code: A Handbook of Agile Software Craftsmanship', 'Robert C. Martin', 'Computer Science', 'Prentice Hall', 2008, 5, 4, 'Shelf CS-01').lastInsertRowid;
    const b2 = insertBook.run('978-0262033848', 'Introduction to Algorithms (CLRS)', 'Thomas H. Cormen', 'Computer Science', 'MIT Press', 2009, 4, 3, 'Shelf CS-02').lastInsertRowid;
    const b3 = insertBook.run('978-0135957059', 'The Pragmatic Programmer: Your Journey To Mastery', 'David Thomas & Andrew Hunt', 'Computer Science', 'Addison-Wesley', 2019, 3, 3, 'Shelf CS-01').lastInsertRowid;
    const b4 = insertBook.run('978-0136042594', 'Artificial Intelligence: A Modern Approach', 'Stuart Russell & Peter Norvig', 'Computer Science', 'Pearson', 2020, 3, 2, 'Shelf AI-03').lastInsertRowid;
    const b5 = insertBook.run('978-0078022159', 'Database System Concepts', 'Abraham Silberschatz', 'Computer Science', 'McGraw-Hill', 2019, 4, 4, 'Shelf DB-01').lastInsertRowid;
    const b6 = insertBook.run('978-0061120084', 'To Kill a Mockingbird', 'Harper Lee', 'Literature', 'J. B. Lippincott & Co.', 1960, 3, 2, 'Shelf LIT-04').lastInsertRowid;
    const b7 = insertBook.run('978-0553380163', 'A Brief History of Time', 'Stephen Hawking', 'Science', 'Bantam Books', 1988, 4, 4, 'Shelf SCI-02').lastInsertRowid;
    const b8 = insertBook.run('978-9390166268', 'The Psychology of Money', 'Morgan Housel', 'Business', 'Harriman House', 2020, 5, 5, 'Shelf FIN-01').lastInsertRowid;
    const b9 = insertBook.run('978-0804139298', 'Zero to One: Notes on Startups', 'Peter Thiel', 'Business', 'Crown Business', 2014, 2, 1, 'Shelf BIZ-02').lastInsertRowid;
    const b10 = insertBook.run('978-0735211292', 'Atomic Habits', 'James Clear', 'Self-Help', 'Avery', 2018, 6, 5, 'Shelf SLF-01').lastInsertRowid;

    // Helper date generator (YYYY-MM-DD)
    const toISODate = (d) => d.toISOString().split('T')[0];
    const now = new Date();
    
    // Date offsets
    const daysAgo = (n) => {
        const d = new Date(now);
        d.setDate(d.getDate() - n);
        return toISODate(d);
    };
    const daysAhead = (n) => {
        const d = new Date(now);
        d.setDate(d.getDate() + n);
        return toISODate(d);
    };

    // 4. Seed Demo Book Issues
    const insertIssue = db.prepare(`
        INSERT INTO book_issues (book_id, member_id, issue_date, due_date, return_date, status, fine_amount, fine_paid, issued_by, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Issue 1: Active Loan (Due in 7 days)
    insertIssue.run(b1, m1, daysAgo(7), daysAhead(7), null, 'issued', 0.0, 0, 1, 'Standard student borrow');

    // Issue 2: Overdue Loan (Issued 20 days ago, due 6 days ago -> Overdue! Fine: 6 days * ₹5 = ₹30)
    insertIssue.run(b4, m2, daysAgo(20), daysAgo(6), null, 'overdue', 30.0, 0, 1, 'Overdue reminder notice sent');

    // Issue 3: Active Loan (Due in 12 days)
    insertIssue.run(b9, m4, daysAgo(2), daysAhead(12), null, 'issued', 0.0, 0, 2, 'Borrowed for course project');

    // Issue 4: Active Loan (Due in 3 days)
    insertIssue.run(b6, m5, daysAgo(11), daysAhead(3), null, 'issued', 0.0, 0, 2, 'General reading');

    // Issue 5: Returned Book (Issued 25 days ago, returned 5 days ago)
    insertIssue.run(b2, m3, daysAgo(25), daysAgo(11), daysAgo(5), 'returned', 0.0, 0, 1, 'Returned on time in pristine condition');

    // 5. Seed Activity Logs
    const insertLog = db.prepare(`
        INSERT INTO activity_logs (user_id, action, details)
        VALUES (?, ?, ?)
    `);

    insertLog.run(1, 'SYSTEM_INIT', 'Database schema initialized with demo records.');
    insertLog.run(1, 'BOOK_ISSUE', 'Clean Code issued to Rahul Sharma (MEM-1001).');
    insertLog.run(2, 'BOOK_ISSUE', 'Zero to One issued to Amit Verma (MEM-1004).');
    insertLog.run(1, 'BOOK_RETURN', 'Introduction to Algorithms returned by Dr. Ananya Sen.');

    console.log('Database initialized successfully with demo data!');
}

// Call init on module import
initDatabase();

module.exports = {
    db,
    initDatabase
};

