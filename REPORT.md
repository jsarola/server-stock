# Server Stock — Project Report
**Date:** 2026-04-27  
**Author:** Joan Sarola  
**License:** AGPL-3.0

---

## Overview

Server Stock is a web application for managing a company's server inventory. It tracks server identity, hardware specifications over time, which team owns each server, which environment it runs on, what technologies it uses, and generates point-in-time hardware reports and cost invoices.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12+ |
| Backend | Flask 3.x + Flask-SQLAlchemy 3.x |
| Database | PostgreSQL (via psycopg2-binary) |
| Frontend | Vanilla JS + HTML + CSS (no build step) |
| Package manager | Poetry |
| Config | python-dotenv (.env file) |
| Containers | Docker + Docker Compose |

---

## Project Structure

```
server-stock/
├── server_stock/
│   ├── app.py            # All backend: models, validation, all API routes, static serving
│   └── demo_data.xml     # Demo seed data (loaded when LOAD_DEMO_DATA=true)
├── public/
│   ├── index.html        # App shell (HTML structure + modals)
│   ├── app.js            # All frontend logic
│   └── style.css         # All styles
├── compose/
│   ├── docker-compose.yml
│   ├── app/
│   │   └── Dockerfile    # Python app image
│   └── pg-18/            # PostgreSQL config and data volumes
├── .env.example          # Environment variable template
├── pyproject.toml        # Dependencies and entry point
└── CLAUDE.md             # Developer notes
```

---

## Setup from Scratch

### Local (Poetry)

```bash
# 1. Clone the repository
git clone <repo-url>
cd server-stock

# 2. Install dependencies
poetry install

# 3. Create the PostgreSQL database
createdb server_stock

# 4. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and optionally PORT and LOAD_DEMO_DATA

# 5. Run
poetry run start
# App available at http://localhost:3000
```

### Docker Compose

```bash
cd compose
docker compose up --build
# App available at http://localhost:3000
# PostgreSQL available at localhost:5432
```

The `app` service waits for PostgreSQL to pass its healthcheck before starting.

---

## Environment Variables (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://localhost/server_stock` | PostgreSQL connection string |
| `PORT` | No | `3000` | HTTP port the app listens on |
| `LOAD_DEMO_DATA` | No | _(unset)_ | Set to `true`, `1`, or `yes` to seed demo data from `demo_data.xml` on startup |

In Docker Compose, `DATABASE_URL` is set automatically to point to the `postgres` service. `LOAD_DEMO_DATA` is commented out in the compose file — uncomment to seed on first run.

---

## Database Schema

### `uses`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `name` | VARCHAR(255) | unique, not null |

### `teams`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `name` | VARCHAR(255) | unique, not null |

### `environments`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `name` | VARCHAR(255) | unique, not null |
| `create_date` | DATE | not null, defaults to today |
| `delete_date` | DATE | nullable |

### `environment_prices`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `environment_id` | INTEGER FK | → `environments.id` CASCADE DELETE |
| `price_vcpu` | NUMERIC(10,4) | cost per vCPU |
| `price_mem` | NUMERIC(10,4) | cost per GB of memory |
| `price_disk` | NUMERIC(10,4) | cost per GB of disk |
| `start_date` | DATE | not null |
| `end_date` | DATE | nullable; NULL = currently active price |

### `servers`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `name` | VARCHAR(255) | unique, not null |
| `service` | VARCHAR(255) | one of: Testing, Production, Staging, Development |
| `team_id` | INTEGER FK | → `teams.id` SET NULL on delete |
| `data_alta` | DATE | activation date |
| `data_baixa` | DATE | decommission date; NULL = still active |
| `environment_id` | INTEGER FK | → `environments.id` SET NULL on delete |

### `server_use` (association table)
| Column | Type |
|---|---|
| `server_id` | INTEGER FK → `servers.id` CASCADE |
| `use_id` | INTEGER FK → `uses.id` CASCADE |

### `server_hardware`
| Column | Type | Notes |
|---|---|---|
| `server_id` | INTEGER PK (composite) | FK → `servers.id` |
| `data_modificacio` | DATE PK (composite) | snapshot date |
| `vcpus` | INTEGER | |
| `memory` | INTEGER | GB |
| `disk0` | INTEGER | GB |
| `disk1` | INTEGER | GB |
| `disk_extra` | INTEGER | GB |

> **Important:** Always write hardware via `upsert_hardware(server_id, hw_data, date)` — uses PostgreSQL `ON CONFLICT DO UPDATE` so same-day edits overwrite rather than duplicate. The most recent row (ordered DESC by `data_modificacio`) is the current state.

> **Date logic:** `data_alta` / `start_date` / `data_modificacio` are inclusive (`<=`). `data_baixa` / `end_date` are exclusive (`>`): a resource with `data_baixa = report_date` is already inactive on that date.

---

## API Endpoints

### Uses
| Method | Path | Description |
|---|---|---|
| GET | `/api/uses` | List all uses (sorted by name) |
| POST | `/api/uses` | Create a use (`{name}`) |
| DELETE | `/api/uses/<id>` | Delete a use |

### Teams
| Method | Path | Description |
|---|---|---|
| GET | `/api/teams` | List all teams (sorted by name) |
| POST | `/api/teams` | Create a team (`{name}`) |
| PUT | `/api/teams/<id>` | Rename a team |
| DELETE | `/api/teams/<id>` | Delete (servers → team_id SET NULL) |

### Environments
| Method | Path | Description |
|---|---|---|
| GET | `/api/environments` | List all environments |
| POST | `/api/environments` | Create (`{name, create_date?, delete_date?}`) |
| PUT | `/api/environments/<id>` | Update name / dates |
| DELETE | `/api/environments/<id>` | Delete (cascades to prices; servers → environment_id SET NULL) |

### Environment Prices
| Method | Path | Description |
|---|---|---|
| GET | `/api/environments/<id>/prices` | List prices (DESC by start_date) |
| POST | `/api/environments/<id>/prices` | Create price; auto-closes any open price (end_date=NULL) |
| PUT | `/api/environments/<id>/prices/<price_id>` | Update price fields or dates |
| DELETE | `/api/environments/<id>/prices/<price_id>` | Delete a price |

### Servers
| Method | Path | Description |
|---|---|---|
| GET | `/api/servers` | List all servers with current hardware |
| GET | `/api/servers/<id>` | Single server |
| POST | `/api/servers` | Create server + initial hardware snapshot |
| PUT | `/api/servers/<id>` | Update server; if hardware fields sent, upserts today's snapshot |
| DELETE | `/api/servers/<id>` | Delete server (cascades hardware + uses) |

### Server Hardware History
| Method | Path | Description |
|---|---|---|
| GET | `/api/servers/<id>/history` | Full hardware history (DESC) |
| POST | `/api/servers/<id>/history` | Add/overwrite a snapshot for any date |
| PUT | `/api/servers/<id>/history/<date>` | Update snapshot values and/or date |
| DELETE | `/api/servers/<id>/history/<date>` | Delete a snapshot |

### Reports
| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | Totals: server count, vCPUs, memory, disk (current hardware) |
| GET | `/api/report/hardware?date=YYYY-MM-DD` | Active servers + hardware state at a given date |
| GET | `/api/report/invoice?date=YYYY-MM-DD` | Active servers + hardware + environment prices + costs at a given date |

**Invoice cost formula per server:**
```
cost_vcpu  = price_vcpu  × vcpus
cost_mem   = price_mem   × memory
cost_disk  = price_disk  × (disk0 + disk1 + disk_extra)
total      = cost_vcpu + cost_mem + cost_disk
```

---

## Frontend (`public/`)

Single-page app, no framework, no build step.

**Key JS globals:**
- `allServers`, `allUses`, `allTeams`, `allEnvironments` — in-memory arrays loaded from the API
- `filterAndRender()` — applies search + sort state, then calls `renderTable()`
- `openModal(server)` / `saveServer()` — create/edit server form; sends `team_id`, `environment_id`, `use_ids: [...]`
- `openUsesModal()` — manage Use options
- `openTeamsModal()` — manage Teams (add, rename, delete)
- `openEnvironmentsModal()` — manage environments + inline price history panels
- `openHwHistoryModal(serverId)` — hardware snapshot history with inline editing
- `openReportModal()` — point-in-time hardware report with service/team filters
- `openInvoiceModal()` — cost invoice derived from the open hardware report

**Shared helpers:**
- `fmtDate(iso)` — converts `yyyy-mm-dd` → `dd/mm/yyyy` for display
- `diskTotal(r)` — sums `disk0 + disk1 + disk_extra`
- `applyActiveFilters(data)` — filters by service and team (shared by report and invoice)

Init: `Promise.all([loadUses(), loadTeams(), loadEnvironments(), loadServers()])`.

---

## Demo Data System

**File:** `server_stock/demo_data.xml`

Activated by setting `LOAD_DEMO_DATA=true` in `.env`. The loader (`_load_demo_data()` in `app.py`) is **idempotent**: it skips any record that already exists by name, so it is safe to run on a partially populated database.

**Demo data includes:**
- 8 uses: postgresql, python, nginx, redis, docker, airflow, elasticsearch, grafana
- 3 teams: Dades, Backend, Monitoring
- 4 environments (AWS EU-West-1, On-Premise BCN, GCP Europe-West1, Hetzner DE), each with 1–2 price periods
- 7 servers across Testing / Production / Staging / Development, with hardware snapshots spanning 2020–2024 (one server decommissioned in 2024)

**XML structure:**
```xml
<demo_data>
  <uses>
    <use name="postgresql"/>
  </uses>
  <teams>
    <team name="Dades"/>
  </teams>
  <environments>
    <environment name="AWS EU-West-1" create_date="2021-01-01">
      <prices>
        <price price_vcpu="0.0480" price_mem="0.0100" price_disk="0.0010"
               start_date="2021-01-01" end_date="2023-06-01"/>
        <price price_vcpu="0.0560" price_mem="0.0120" price_disk="0.0012"
               start_date="2023-06-01"/>
      </prices>
    </environment>
  </environments>
  <servers>
    <server name="azmidi" service="Testing" team="Dades"
            data_alta="2023-04-01" environment="AWS EU-West-1">
      <uses>
        <use name="postgresql"/>
      </uses>
      <hardware>
        <snapshot date="2023-04-01" vcpus="8" memory="16"
                  disk0="32" disk1="1024" disk_extra="100"/>
      </hardware>
    </server>
  </servers>
</demo_data>
```

---

## Docker

**`compose/docker-compose.yml`** defines two services:

| Service | Image | Port |
|---|---|---|
| `postgres` | `postgres:18-alpine` | 5432 |
| `app` | built from `compose/app/Dockerfile` | 3000 |

The `postgres` service has a healthcheck (`pg_isready`); the `app` service uses `depends_on: condition: service_healthy` so it never starts before the database is ready.

**`compose/app/Dockerfile`** builds the Python image:
- Base: `python:3.12-slim`
- Installs Poetry with virtualenv disabled (deps go into system Python)
- Copies `pyproject.toml` + `poetry.lock` first for layer caching
- Copies `server_stock/` and `public/`
- Exposes port 3000

---

## Features Implemented (chronological)

| # | Feature | Key files changed |
|---|---|---|
| 1 | Initial server inventory (name, service, dates, uses) | `app.py`, `index.html` |
| 2 | Hardware separated from server identity; sort buttons in UI | `app.py`, `index.html` |
| 3 | Hardware versioning (`server_hardware` table); migrate SQLite → PostgreSQL | `app.py` |
| 4 | Running environments (`running` table); price per running | `app.py`, `app.js`, `style.css` |
| 5 | Running prices (`running_prices` table) with history and auto-close of open price | `app.py`, `app.js`, `style.css` |
| 6 | Hardware history per server (modal + full CRUD) | `app.py`, `app.js`, `style.css` |
| 7 | Point-in-time hardware report (`/api/report/hardware`) | `app.py`, `app.js`, `style.css` |
| 8 | Invoice report (`/api/report/invoice`) with cost breakdown | `app.py`, `app.js`, `style.css` |
| 9 | Code simplification: shared helpers, eliminated N+1 queries | `app.py`, `app.js` |
| 10 | Demo data system: XML file + `LOAD_DEMO_DATA` env var | `app.py`, `demo_data.xml` |
| 11 | Rename `running` → `environments`, `running_prices` → `environment_prices` | `app.py`, `app.js`, `index.html`, `demo_data.xml` |
| 12 | Replace free-text `equip` field with `teams` table + FK; Teams management UI | `app.py`, `app.js`, `index.html`, `demo_data.xml` |
| 13 | Docker support: `Dockerfile` + `docker-compose.yml` with healthcheck | `compose/` |

---

## Schema Migration Notes

`db.create_all()` only creates **missing tables** — it does not alter existing columns. After adding or renaming a column, run the SQL manually against PostgreSQL before restarting.

**Full migration history** (for upgrades from older versions):

```sql
-- Feature 11: rename running tables
ALTER TABLE running RENAME TO environments;
ALTER TABLE running_prices RENAME TO environment_prices;
ALTER TABLE environment_prices RENAME COLUMN running_id TO environment_id;
ALTER TABLE servers RENAME COLUMN running_id TO environment_id;

-- Feature 12: replace equip with teams
CREATE TABLE teams (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE);
INSERT INTO teams (name)
  SELECT DISTINCT equip FROM servers
  WHERE equip IS NOT NULL AND equip != ''
  ON CONFLICT DO NOTHING;
ALTER TABLE servers ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
UPDATE servers s SET team_id = t.id FROM teams t WHERE s.equip = t.name;
ALTER TABLE servers DROP COLUMN equip;
```
