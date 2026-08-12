# Bus Ticket Booking System

A portfolio project with a Django REST API and a separate React frontend. The system will support customers, bus operators, and administrators, including concurrency-safe seat holds.

## Project structure

```text
backend/   Django 5 + Django REST Framework API
frontend/  React + Vite application (added in a later phase)
```

## Implemented backend foundation

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
python manage.py seed_data
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

### Demo accounts

Running `seed_data` creates or refreshes these local accounts:

| Role | Username | Password |
| --- | --- | --- |
| Customer | `demo_customer` | `Customer@12345` |
| Operator | `demo_operator` | `Operator@12345` |

The command also creates a demo bus, two routes, two upcoming trips, and an available `TripSeat` row for every seat on each trip. It is safe to run repeatedly.

### Bus layout JSON

Bus seat maps are stored as data, not frontend code. Each deck describes its grid, aisle, and exact seat positions:

```json
{
  "decks": [
    {
      "name": "LOWER",
      "rows": 2,
      "columns": 4,
      "aisle_after_columns": [2],
      "seats": [
        { "code": "A1", "row": 1, "column": 1 },
        { "code": "A2", "row": 1, "column": 2 },
        { "code": "A3", "row": 1, "column": 3 },
        { "code": "A4", "row": 1, "column": 4 }
      ]
    }
  ]
}
```

The backend validates that every seat has a unique code. Creating a trip copies those codes into fixed `TripSeat` rows, which will later hold the live availability state.

## Data model overview

The complete ER diagram will be added when the booking models are introduced. The custom `User` model was created in the first migration so every later foreign key points to the correct user table.
