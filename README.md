# BookSphere — Full-Stack Advance Library Management System

**BookSphere** is a premium, modern, full-stack Advance Library Management System tailored for educational institutions (specifically pre-configured for **K.R. Mangalam University - KRMU**). 

It features secure role-based access, fine calculation, QR code tracking, reservation waitlists, digital eBook reading, peer-to-peer book exchange, and a built-in AI Library Assistant powered by the Google Gemini API.

---

## 🚀 Key Features

*   **👥 Role-Based Access Control (RBAC):** Tailored dashboards and controls for `Owner`, `Admin`, `Teacher`, and `Student`.
*   **🛡️ 9-Layer Security Stack:** Features compression, NoSQL injection protection, body size limits, strict CORS controls, IP strike tracking, request timeouts, and advanced rate-limiting / connection speed-limiting on auth endpoints.
*   **📱 QR-Code System:** Automated checkout/check-in via generated QR codes for physical book copies.
*   **💬 Gemini AI Assistant:** Instant book recommendations, catalog queries, and library help inside the app.
*   **🔔 Intelligent Notifications:** Automated email and in-app alerts for checkout receipts, overdue books (daily), and reservation queue availability.
*   **📁 Dual Database Engine:** Automatically defaults to a secure persistent local fallback server (`mongodb-memory-server` with `WiredTiger` engine) if an external MongoDB Atlas cluster is not configured or offline.
*   **🎮 Gamification:** Interactive dashboards with reading streaks, points, and badging milestones.

---

## 🛠️ Tech Stack

*   **Backend:** Node.js, Express.js, Mongoose (MongoDB ODM), Joi (Input Schema validation).
*   **Frontend:** HTML5, CSS3 (Harmonious Modern HSL Palettes, Glassmorphism, animations), Vanilla JavaScript (served statically).
*   **Security:** Helmet, express-mongo-sanitize, hpp, compression, xss-clean, express-rate-limit, express-slow-down.
*   **APIs:** Google Gemini Pro via `@google/genai`.

---

## 📥 Getting Started & Local Setup

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### 2. Clone and Install Dependencies
Navigate into the backend folder and install the dependencies:
```bash
cd backend
npm install
```

### 3. Configure Environment Variables (Security First! 🔑)
Copy the template `.env.example` to a new `.env` file inside the `backend` folder:
```bash
cp .env.example .env
```
Open `backend/.env` and configure your credentials:
*   `MONGODB_URI`: Connect your MongoDB Atlas database. If left blank or unreachable, **BookSphere will automatically run on a persistent local embedded database** inside `backend/data/db`!
*   `GEMINI_API_KEY`: Input your Gemini key to activate the AI Chatbot.
*   `SMTP_EMAIL` & `SMTP_PASSWORD`: Set up Gmail SMTP to enable automatic email notifications.

> [!WARNING]
> **Never commit, publish, or share your `.env` file.** It is pre-configured in `.gitignore` to prevent leaking private API keys, SMTP passwords, and database URIs.

---

## 💻 Running the Application

For a fully integrated local experience, run both the backend server and frontend static server.

### Start the Backend API Server
Inside the `backend/` directory:
```bash
npm start
```
The backend starts on `http://localhost:5000`. It will automatically seed default books, eBooks, and accounts if starting on a clean database.

### Start the Frontend Dev Server
You can serve the static files in the `frontend/` folder using any local dev server, such as `http-server` proxying request routes, or by opening the index page directly. For development, we run:
```bash
npx -y http-server frontend -p 5173 --proxy http://localhost:5000
```
Then visit: `http://localhost:5173`

---

## 🔐 Pre-Seeded Default Accounts

On a fresh database setup, the system is pre-seeded with the following roles for easy testing:

| Role | Username / Email | Default Password |
|------|------------------|------------------|
| **Owner** | `owner@booksphere.com` | `owner123` (or `Owner@1234` if updated manually) |
| **Admin** | `admin@booksphere.com` | `admin123` |
| **Teacher** | `teacher@booksphere.com` | `teacher123` |
| **Student** | `student@booksphere.com` | `student123` |

*(Note: Registration for new non-owner accounts is locked to university emails ending in `@krmu.edu.in` and validated using secure OTP verification).*
