# Bus Ticket Booking System

A portfolio project with a Django REST API and a separate React frontend. The system will support customers, bus operators, and administrators, including concurrency-safe seat holds.

## Project structure

```text
backend/   Django 5 + Django REST Framework API
frontend/  React + Vite application (added in a later phase)
```

## Phase 1: backend authentication setup

### Requirements

- Python 3.12 or newer
- PostgreSQL
- Node.js (needed when the frontend phase begins)

### PostgreSQL setup

Open PostgreSQL's `psql` terminal and create a development database:

```sql
CREATE DATABASE bus_ticket;
```

### Run the backend

From the project root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Edit `backend/.env` and set `DB_PASSWORD` to your PostgreSQL password. Then run:

```powershell
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API documentation is available at http://127.0.0.1:8000/api/docs/.

### Authentication endpoints

- `POST /api/auth/register/` — create a customer account
- `POST /api/auth/token/` — obtain access and refresh tokens
- `POST /api/auth/token/refresh/` — refresh an access token
- `GET /api/auth/me/` — return the authenticated user

Run tests after configuring the PostgreSQL database:

```powershell
python manage.py test
```

## Data model overview

The complete ER diagram will be added as the transport and booking models are introduced. The custom `User` model is created in the first migration so every later foreign key points to the correct user table.
