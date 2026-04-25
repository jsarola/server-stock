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

The app reads `DATABASE_URL` and `PORT` from a `.env` file (copy `.env.example` to get started).

## Architecture

This is a single-file Flask backend + single-file vanilla JS frontend with no build step.

**`server_stock/app.py`** — everything backend: models, validation, all API routes, and static file serving. Key parts:
- `Server` model (`servers` table): identity fields — `name`, `service`, `equip`, `data_alta`, `data_baixa`, plus a many-to-many `uses` relationship.
- `Use` model (`uses` table): a managed list of use-type labels (e.g. `postgresql`, `airflow`).
- `server_use` association table: links `servers` ↔ `uses` with cascade-delete on both FKs.
- `ServerHardware` model (`server_hardware` table): composite PK `(server_id, data_modificacio)`. Each row is a dated hardware snapshot. The most recent row (`hardware[0]`, ordered DESC) is the current state.
- `upsert_hardware()`: uses PostgreSQL `ON CONFLICT DO UPDATE` so multiple edits on the same day overwrite rather than duplicate.
- `validate()`: called on POST/PUT. Checks `service` against `SERVICE_OPTIONS`, integer fields are non-negative real ints, dates are valid ISO strings. Returns `None` on success or a dict of field→message errors.

**`public/index.html`** — all frontend in one file (CSS + HTML + JS). No framework, no build tool. Key JS globals:
- `allServers`, `allUses` — in-memory arrays loaded from the API.
- `filterAndRender()` — applies the search input and current sort state, then calls `renderTable()`.
- `openModal(server)` / `saveServer()` — the create/edit server form. Sends `use_ids: [...]` (array of Use IDs) to the API.
- `openUsesModal()` — separate modal to add/delete Use options; calls `loadUses()` + `loadServers()` after changes to keep the checklist and table in sync.
- `renderUsesChecklist(selectedIds)` — renders the use checkboxes inside the server form; uses `toggleUseItem()` for click-to-toggle behaviour.

## Database schema notes

`server_hardware` is both the current hardware record and the full history. Always use `upsert_hardware(server_id, hw_data, date)` — never insert directly. The stats endpoint (`/api/stats`) uses a `GROUP BY server_id / MAX(data_modificacio)` subquery to aggregate only the latest row per server.

Dates are stored as `db.Date`, serialised to/from ISO `yyyy-mm-dd` strings by `fmt_date()` / `parse_date()`. The frontend displays them as `dd/mm/yyyy` via `fmtDate()`.

## Schema migration notes

`db.create_all()` only creates missing tables — it does not alter existing ones. After renaming or adding columns, run the SQL manually against the PostgreSQL database before restarting the app.
