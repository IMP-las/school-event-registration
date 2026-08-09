# School Event Registration System

A web-based application for managing school events with role-based access control. Built with **Node.js + Express + LowDB** and implementing the **ANSI SPARC 3-Level Architecture**.

## 📋 Project Overview

The system eliminates paper forms by allowing:
- **Students** to view and register for school events
- **Organizers** to create events and track participants
- **Admins** to manage users and view system reports

**No SQL/NoSQL Database** - Uses JSON file storage via LowDB

---

## 🏗️ ANSI SPARC Architecture Implementation

### Level 1: External Level (View Level)
What each user sees in their browser:
- **Student View**: Event catalog with registration functionality
- **Organizer View**: Event creation form and participant list
- **Admin View**: User management dashboard and system statistics

### Level 2: Conceptual Level (Logical Level)
The logical data model:

**Entity: User**
- userId, name, email, password, role (student/organizer/admin)

**Entity: Event**
- eventId, title, description, eventDate, organizerId

**Entity: Registration**
- regId, eventId, studentId, dateRegistered

**Relationships:**
- User(Organizer) 1 --- M Event
- User(Student) M --- M Event (via Registration)

### Level 3: Internal Level (Physical Level)
How data is physically stored:
- **File**: `db.json` (JSON file)
- **Database**: LowDB (file-based, no SQL)
- **Storage Structure**: Three arrays
  - `users[]` - All user accounts
  - `events[]` - All events created
  - `registrations[]` - Student-Event registrations

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ installed
- Modern web browser
- Terminal/Command Prompt

### Step 1: Create Project Folder
```bash
mkdir school-event-registration
cd school-event-registration
```

### Step 2: Initialize Node Project
```bash
npm init -y
```

### Step 3: Install Dependencies
```bash
npm install express cors lowdb
```

### Step 4: Create Folder Structure
```
school-event-registration/
├── node_modules/
├── public/
│   ├── index.html
│   ├── student.html
│   ├── organizer.html
│   ├── admin.html
│   └── styles.css
├── server.js
├── db.json
├── package.json
└── README.md
```

### Step 5: Add All Files
- Copy provided `server.js` to root folder
- Create `public` folder and copy all HTML files
- Copy `styles.css` to public folder
- Copy `db.json` to root folder

### Step 6: Start Server
```bash
node server.js
```

You should see:
```
╔════════════════════════════════════════════╗
║   School Event Registration System         ║
║   Server running on http://localhost:3000  ║
║   ANSI SPARC Architecture Implemented      ║
╚════════════════════════════════════════════╝
```

### Step 7: Open in Browser
```
http://localhost:3000
```

---

## 🔐 Test Credentials

### Student Account
```
Email: student1@school.com
Password: pass123
```

### Organizer Account
```
Email: org1@school.com
Password: pass123
```

### Admin Account
```
Email: admin@school.com
Password: admin123
```

---

## 📂 File Structure

### `server.js`
- Express server with 14 API endpoints
- Implements all three ANSI SPARC levels
- Uses LowDB for data persistence
- Handles authentication, CRUD operations, and reporting

### `public/index.html`
- Login page for all users
- Role-based redirection after login

### `public/student.html`
- View all available events
- Register/unregister for events
- View personal registered events

### `public/organizer.html`
- Create new events
- View own events
- See participant list for each event
- Delete events

### `public/admin.html`
- System statistics dashboard
- Add new students/organizers
- View all users with delete option
- View all events with delete option
- System report (totals, averages)

### `public/styles.css`
- Responsive CSS for all pages
- Material design inspired
- Mobile-friendly interface

### `db.json`
- JSON database file
- Stores users, events, registrations
- Automatically created/updated by LowDB

---

## 🔌 API Endpoints

### Authentication
- **POST** `/api/login` - User login (Email & Password)

### Events (Student)
- **GET** `/api/events` - Get all events

### Events (Organizer)
- **GET** `/api/organizer/events/:organizerId` - Get organizer's events
- **POST** `/api/events` - Create new event
- **GET** `/api/events/:eventId/registrations` - Get event participants
- **DELETE** `/api/events/:eventId` - Delete event

### Registrations (Student)
- **POST** `/api/register` - Register for event
- **POST** `/api/unregister` - Unregister from event
- **GET** `/api/student/:studentId/registrations` - Get student's registered events

### Users (Admin)
- **GET** `/api/users` - Get all users
- **POST** `/api/users` - Add new user
- **DELETE** `/api/users/:userId` - Delete user

### Reports (Admin)
- **GET** `/api/admin/report` - Get system statistics

---

## 🎯 Features

✅ **Role-Based Access Control**
- Different interfaces for Student, Organizer, Admin

✅ **Event Management**
- Create, read, update, delete events
- Track event dates and descriptions

✅ **Student Registration**
- Register/unregister for events
- View personal registered events
- View available events

✅ **Participant Tracking**
- Organizers can see who registered for their events
- Registration dates tracked

✅ **Admin Controls**
- Manage all users
- View system statistics
- Delete any event or user

✅ **No SQL Required**
- JSON file-based storage
- LowDB for simple data operations

✅ **Responsive Design**
- Works on desktop and mobile
- Clean, modern UI

---

## 📊 System Data Flow

1. **Login Flow**
   - User enters email/password
   - Server validates against `users[]` in db.json
   - Redirects to correct dashboard based on role

2. **Event Registration Flow**
   - Student views events (from `events[]`)
   - Clicks "Register"
   - New Registration entry created in `registrations[]`
   - Links studentId + eventId

3. **Event Creation Flow**
   - Organizer submits event form
   - New Event entry created in `events[]`
   - organizerId stored for tracking

4. **User Management Flow**
   - Admin adds new user
   - New User entry created in `users[]`
   - Assignment of role (student/organizer)

---

## 🔍 Database Schema

### users[]
```json
{
  "userId": 1,
  "name": "John Student",
  "email": "student1@school.com",
  "password": "pass123",
  "role": "student"
}
```

### events[]
```json
{
  "eventId": 1,
  "title": "Science Fair 2024",
  "description": "Annual science exhibition",
  "eventDate": "2024-12-15",
  "organizerId": 3
}
```

### registrations[]
```json
{
  "regId": 1,
  "eventId": 1,
  "studentId": 1,
  "dateRegistered": "2024-10-01"
}
```

---

## 🚨 Troubleshooting

### Port Already in Use
Change port in `server.js`:
```javascript
const PORT = 3001; // Change from 3000
```

### Module Not Found Error
```bash
rm -rf node_modules package-lock.json
npm install
```

### Can't Connect to Server
- Make sure `node server.js` is running
- Check that port 3000 is not blocked
- Try `http://localhost:3000`

### Data Not Persisting
- Check that `db.json` exists in root folder
- Ensure write permissions in project folder

---

## 📈 Future Enhancements

- [ ] Email notifications for registrations
- [ ] Event capacity limit enforcement
- [ ] Waitlist functionality
- [ ] Export registration list to CSV
- [ ] Event categories/tags
- [ ] User profile management
- [ ] Password reset functionality
- [ ] Event search and filtering
- [ ] Attendance tracking via QR code
- [ ] Email verification

---

## 👥 Team Members

- Mark Jolas - Summary + Organizer Module
- Chelsea Bleena - UI/UX + Student Module
- Mae Manag - Admin Module + Database Design

---

## 📄 License

ISC License - Free to use and modify

---

## 🎓 Educational Purpose

This project demonstrates:
- ✅ ANSI SPARC 3-Level Architecture
- ✅ RESTful API design
- ✅ Role-based access control
- ✅ File-based database implementation
- ✅ Frontend-Backend integration
- ✅ Responsive web design

---

## 📞 Support

For issues or questions, check:
1. Ensure all dependencies are installed (`npm install`)
2. Server is running (`node server.js`)
3. Port 3000 is accessible
4. Browser console for error messages (F12)

---

**Last Updated**: October 2024  
**Version**: 1.0.0
