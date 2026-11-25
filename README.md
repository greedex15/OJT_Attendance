# OJT Attendance System (`greedex15/OJT_Attendance`)

A full-stack **On-The-Job Training (OJT) Attendance System** featuring QR code camera scanning, mandatory supervisor digital signature verification, PostgreSQL persistence, CSV exports, and printable Daily Time Record (DTR) PDF reports.

## Tech Stack

- **Frontend:** React 18 (Vite) + Tailwind CSS + `html5-qrcode` + `react-signature-canvas`
- **Backend:** FastAPI (Python 3.11) + SQLAlchemy 2.0 + Pydantic v2
- **Database:** PostgreSQL 15 (`postgres:15-alpine`)
- **Deployment:** Docker, Docker Compose, and Nginx reverse proxy

## Project Structure

```text
OJT_Attendance/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py
│   │   └── schemas.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── QRScanner.jsx
│   │   │   ├── SignatureModal.jsx
│   │   │   ├── AttendanceTable.jsx
│   │   │   └── ExportButtons.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Quick Start (Docker Deployment)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/greedex15/OJT_Attendance.git
   cd OJT_Attendance
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Update `POSTGRES_PASSWORD` and set `FRONTEND_PORT=80` (or `3000`) in `.env`.

3. **Build and launch all services:**
   ```bash
   docker compose up -d --build
   ```

4. **Access the application:**
   - **Web App (Frontend):** `http://<server-ip>:3000` (or port `80` if `FRONTEND_PORT=80`)
   - **Backend API Docs (Swagger):** `http://<server-ip>:8000/docs`
   - **Health Check:** `http://<server-ip>:8000/api/health`

> **Remote Camera Note:** Modern browsers restrict webcam access (`getUserMedia`) on non-localhost origins unless served over **HTTPS**. On remote servers, terminate TLS with Caddy, Traefik, or a reverse proxy in front of the `frontend` container so `html5-qrcode` camera scanning works on mobile and desktop browsers.

## Local Development (Without Docker)

Run these commands in **two PowerShell terminals** from the project directory.
The workspace-root `index.html` is a legacy localStorage prototype; the supported API-backed application is served from `frontend/`.

### Backend (Terminal 1)
```powershell
cd C:\xampp\htdocs\OJT_Attendance\backend
$env:DATABASE_URL = "sqlite:///./ojt_local.db"
$env:SECRET_KEY = "local-development-only-change-before-deployment"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

If you do not have the backend virtual environment yet, create it and install dependencies first:
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Frontend (Terminal 2)
```powershell
cd C:\xampp\htdocs\OJT_Attendance\frontend
npm install
npm run dev
```
Open `http://localhost:3000`. Vite proxies `/api/*` requests to the backend on port `8000`.

## API Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Public | Service and database connectivity check |
| `POST` | `/api/auth/login` | Public | Authenticate user (`School ID` + `LRN/Password`) and return Bearer JWT |
| `GET` | `/api/auth/me` | Bearer | Get current authenticated user profile |
| `PUT` | `/api/users/me` | User | Update own display name and profile image |
| `PUT` | `/api/auth/me/profile` | User | Update own display name and PNG/JPEG/WebP profile image (up to 1 MB) |
| `GET` | `/api/users` | Admin | List registered accounts |
| `POST` | `/api/users` | Admin | Create a trainee or an admin/coordinator/supervisor/adviser account |
| `PUT` | `/api/users/{id}/profile` | Admin | Update trainee profile details without changing username or attendance records |
| `GET` | `/api/students` | Bearer | List trainees (user: own profile; admin/adviser: all profiles) |
| `POST` | `/api/students` | Admin | Register a new OJT trainee |
| `GET` | `/api/students/lookup?code=...` | User | Lookup own trainee profile from QR code and check active shift |
| `POST` | `/api/clock-in` | User | Record Time In with supervisor name & Base64 signature |
| `POST` | `/api/clock-out` | User | Record Time Out with supervisor name & Base64 signature |
| `GET` | `/api/records` | Bearer | Query attendance logs (user: own logs; admin/adviser: all logs) |
| `PUT` / `DELETE` | `/api/records/{id}` | Bearer | Always forbidden; attendance records are immutable |
| `GET` | `/api/journals` | Bearer | List own entries (user) or adviser-visible entries; admins are forbidden |
| `POST` | `/api/journals` | User | Create a journal entry with daily activity and achievements |
| `PUT` | `/api/journals/{id}` | User | Edit the user's own journal entry |
| `GET` | `/api/conversations` | Staff | List other active admin/coordinator/supervisor/adviser accounts |
| `GET` | `/api/messages?with_username={id}` | Staff | List messages in a one-to-one conversation |
| `POST` | `/api/messages` | Staff | Send a message using `{ "recipient_username": "...", "content": "..." }` |

Only `user` accounts can use attendance clock actions, QR lookup, journal access/writes, self-profile editing, and own-record exports. Admins cannot access journals or DTR/export controls. Admins and advisers can monitor trainees/attendance; coordinators, supervisors, and advisers can use direct messaging. The Chatbox is unavailable to trainees. Admin-created trainee profiles include course/major, the fixed Isabela State University - Main Echague Campus school, department, gender, and section/major fields used by attendance analytics.

### Default Login Accounts
On first startup when `users` is empty, default accounts are seeded:
- **User Account:** School ID `23-0679` / LRN `103013100015` (Clock In/Out, view/export own attendance, create/edit own journal entries)
- **Admin Account:** School ID `12-3456` / Password `123456789012` (Monitoring-only dashboard, add users/trainees, export CSV/PDF DTR)

You can change these via `DEFAULT_USER_*` and `DEFAULT_ADMIN_*` variables in `.env` or register a new School ID directly on the Login page.

## QR Code Format

The scanner accepts either:
- **Plain Student ID** (e.g. `OJT-2026-001`)
- **JSON Payload** (e.g. `{"student_id":"OJT-2026-001","full_name":"Juan Dela Cruz"}`)

Three sample trainees (`OJT-2026-001`, `OJT-2026-002`, `OJT-2026-003`) are seeded automatically on first startup when the `students` table is empty.
