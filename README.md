# SmartLib - BCA Final-Year Full-Stack Library Management System

A complete, production-grade Library Management System designed for BCA final-year academic submission. Built with **HTML5, Modern CSS, Vanilla JavaScript**, **Node.js, Express.js**, and persistent **SQLite** database storage.

---

## 📑 Complete 14-Page Site Architecture

| # | Page Name | File | Role Access | Description |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Sign In / Login** | `index.html` | Public | Role-based secure login (bcrypt + JWT), quick autofill & forgot password modal |
| 2 | **Dashboard** | `dashboard.html` | All Roles | Real-time metric cards, trending titles, and recent activity logs |
| 3 | **Manage Books** | `books.html` | All Roles | Complete catalog search, category filters, Add/Edit/Delete book modals |
| 4 | **Book Categories** | `categories.html` | Staff Only | Category management, description editing, and real-time title counts |
| 5 | **Issue Books** | `issue-books.html` | Staff Only | Dedicated checkout desk with book availability & loan limits |
| 6 | **Return Books** | `return-books.html` | Staff Only | Dedicated check-in desk, stock restoration, and overdue fine calculation |
| 7 | **Due Dates & Overdue** | `overdue.html` | All Roles | Overdue audit, days late calculation, and accrued fines at ₹5/day |
| 8 | **My Borrowed Books** | `my-books.html` | Students Only | Student-specific active loans, due dates, fines, and 1-click renewal (+14 days) |
| 9 | **Manage Members** | `members.html` | Staff Only | Register students & faculty, manage membership status, loan history modal |
| 10 | **Manage Librarians** | `librarians.html` | Admin Only | Register, edit, and manage library staff accounts and credentials |
| 11 | **Reports & Analytics** | `reports.html` | Staff Only | Inventory metrics, overdue lists, audit trail, and print/export report view |
| 12 | **Notifications** | `notifications.html` | All Roles | Broadcast announcements, overdue notices, unread badge, and bulletin posting |
| 13 | **User Profile** | `profile.html` | All Roles | Profile view, contact updates, password change, and student digital ID card |
| 14 | **System Settings** | `settings.html` | Admin Only | Fine rate config, loan durations, book limits, and institution details |
| + | **Help & Documentation** | `help.html` | All Roles | Project technical overview, role permissions matrix, and system FAQ |

---

## 🔑 Demo Login Credentials

The database (`database.sqlite`) is initialized with secure bcrypt password hashes:

| Role | Username | Password | Display Name | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | System Administrator | Full access across all 14 pages and system settings |
| **Librarian** | `librarian` | `lib123` | Head Librarian | Cataloging, Issue & Return, Members, Reports, Bulletins |
| **Student** | `student` | `student123` | Rahul Sharma | Browse Books, My Borrowed Books, Due Dates, Profile, Renewals |

---

## 🚀 How to Run the Application in VS Code

### 1. Open Terminal in VS Code
Open the `library-management-system` folder in VS Code, then open the integrated terminal:
```bash
npm start
```
You will see:
```text
🚀 SmartLib System running at: http://localhost:5000
📚 Database: SQLite (database.sqlite) connected
```

### 2. Open in Browser
Visit in your web browser:
```
http://localhost:5000
```

### 3. Run Automated System Tests
To run all 14 backend and integration verification tests:
```bash
npm test
```
All 14 integration test suites test and verify data persistence, authentication, role isolation, and CRUD operations across all routes.
