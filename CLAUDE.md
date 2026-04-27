# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
poetry install

# Run the app (starts on http://localhost:3000)
poetry run start

# Create the PostgreSQL database (first time only)
createdb server_stock
```

The app reads `DATABASE_URL`, `PORT`, and `LOAD_DEMO_DATA` from a `.env` file (copy `.env.example` to get started).

## Architecture

This is a single-file Flask backend + vanilla JS frontend (3 files, no build step).

**`server_stock/app.py`** — everything backend: models, validation, all API routes, and static file serving.

**`public/index.html`** — HTML structure and modals.

**`public/app.js`** — all frontend logic.

**`public/style.css`** — all styles.

---

## Models (`server_stock/app.py`)

| Model | Table | Notes |
|---|---|---|
| `Use` | `uses` | Simple name lookup; many-to-many with servers via `server_use` |
| `Team` | `teams` | Simple name lookup; FK from `servers.team_id` (SET NULL on delete) |
| `Environment` | `environments` | Running environment (cloud/on-prem); FK from `servers.environment_id` |
| `EnvironmentPrice` | `environment_prices` | Price history per environment; FK `environment_id` (CASCADE) |
| `Server` | `servers` | Core entity — see fields below |
| `ServerHardware` | `server_hardware` | Dated hardware snapshots; composite PK `(server_id, data_modificacio)` |

### `Server` fields
`name`, `service`, `team_id` (FK → `teams`), `data_alta`, `data_baixa`, `environment_id` (FK → `environments`), plus relationships: `team`, `environment`, `uses` (M2M), `hardware` (ordered DESC).

### `EnvironmentPrice` fields
`environment_id`, `price_vcpu`, `price_mem`, `price_disk` (`NUMERIC(10,4)`), `start_date`, `end_date` (NULL = currently active).

### Key helpers
- `upsert_hardware(server_id, hw_data, date)` — always use this; never insert `server_hardware` directly. Uses PostgreSQL `ON CONFLICT DO UPDATE` so same-day edits overwrite.
- `validate(data, require_name)` — checks `service` against `SERVICE_OPTIONS`, integer fields ≥ 0, dates as ISO strings.
- `validate_price(data, require_start_date)` — validates price floats and dates.
- `_active_servers_with_hw(report_date)` — shared helper returning `(servers, hw_map)` for point-in-time reports.

---

## API routes

### Uses — `/api/uses`
`GET`, `POST`, `DELETE /<id>`

### Teams — `/api/teams`
`GET`, `POST`, `PUT /<id>`, `DELETE /<id>`

### Environments — `/api/environments`
`GET`, `POST`, `PUT /<id>`, `DELETE /<id>`

### Environment prices — `/api/environments/<id>/prices`
`GET`, `POST`, `PUT /<price_id>`, `DELETE /<price_id>`
On POST: auto-closes any open price (`end_date = NULL`) by setting its `end_date = new_start_date`.

### Servers — `/api/servers`
`GET`, `GET /<id>`, `POST`, `PUT /<id>`, `DELETE /<id>`
Payload fields: `name`, `service`, `team_id`, `environment_id`, `use_ids`, `data_alta`, `data_baixa`, hardware fields.

### Hardware history — `/api/servers/<id>/history`
`GET`, `POST`, `PUT /<date_str>`, `DELETE /<date_str>`

### Reports
- `GET /api/stats` — totals across all servers (latest hardware per server).
- `GET /api/report/hardware?date=YYYY-MM-DD` — active servers + hardware state at a given date.
- `GET /api/report/invoice?date=YYYY-MM-DD` — active servers + hardware + environment prices + costs.

---

## Frontend (`public/app.js`)

Key globals:
- `allServers`, `allUses`, `allTeams`, `allEnvironments` — in-memory arrays loaded from the API.
- `filterAndRender()` — applies search input and sort state, calls `renderTable()`.
- `openModal(server)` / `saveServer()` — create/edit server form. Sends `team_id`, `environment_id`, `use_ids: [...]`.
- `openUsesModal()` / `openTeamsModal()` / `openEnvironmentsModal()` — management modals for each lookup entity.
- `renderUsesChecklist(selectedIds)` — renders use checkboxes inside the server form.
- `openHwHistoryModal(serverId, name)` — hardware snapshot history with inline CRUD.
- `openReportModal()` / `runReport()` / `applyReportFilters()` — point-in-time hardware report.
- `openInvoiceModal()` / `renderInvoice()` — cost invoice from report date + environment prices.
- `applyActiveFilters(data)` — shared helper filtering by service + team (used by both report and invoice).

Init: `Promise.all([loadUses(), loadTeams(), loadEnvironments(), loadServers()])`.

---

## Database schema notes

`server_hardware` is both the current hardware record and the full history. Always use `upsert_hardware(server_id, hw_data, date)` — never insert directly. The stats endpoint uses a `GROUP BY server_id / MAX(data_modificacio)` subquery to aggregate only the latest row per server.

Dates are stored as `db.Date`, serialised to/from ISO `yyyy-mm-dd` strings by `fmt_date()` / `parse_date()`. The frontend displays them as `dd/mm/yyyy` via `fmtDate()`.

Date boundary rules:
- `data_alta`, `start_date`, `data_modificacio` are **inclusive** (`<=`).
- `data_baixa`, `end_date` are **exclusive** (`>`): a resource with `data_baixa = report_date` is already inactive on that date.

## Schema migration notes

`db.create_all()` only creates **missing tables** — it does not alter existing ones. After renaming or adding columns, run the SQL manually against the PostgreSQL database before restarting the app.

Notable past migrations (already applied if upgrading from an older version):
```sql
-- Renamed tables
ALTER TABLE running RENAME TO environments;
ALTER TABLE running_prices RENAME TO environment_prices;
ALTER TABLE environment_prices RENAME COLUMN running_id TO environment_id;
ALTER TABLE servers RENAME COLUMN running_id TO environment_id;

-- Added teams table (replacing free-text equip column)
CREATE TABLE teams (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE);
INSERT INTO teams (name) SELECT DISTINCT equip FROM servers WHERE equip IS NOT NULL AND equip != '' ON CONFLICT DO NOTHING;
ALTER TABLE servers ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
UPDATE servers s SET team_id = t.id FROM teams t WHERE s.equip = t.name;
ALTER TABLE servers DROP COLUMN equip;
```

## Demo data

Set `LOAD_DEMO_DATA=true` in `.env` to seed the database from `server_stock/demo_data.xml` on startup. The loader is idempotent — it skips any record that already exists by name. The XML declares `<uses>`, `<teams>`, `<environments>` (with `<prices>`), and `<servers>` (with `<uses>`, `<hardware>`).
