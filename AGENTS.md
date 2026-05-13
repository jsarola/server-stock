# AGENTS.md
## Use these commands (verified)
- Install deps: `poetry install`
- Create local DB (first time): `createdb server_stock`
- Run app locally: `poetry run start` (serves on `http://localhost:3000` by default)
- Docker option: from `compose/`, run `docker compose up --build`
## Source of truth (don’t guess)
- Trust executable config/code over prose docs:
  - `pyproject.toml` for scripts and dependencies
  - `server_stock/app.py` for runtime behavior, API contract, and DB rules
  - `compose/docker-compose.yml` for containerized dev setup
- `README.md` contains legacy field names in examples; verify payloads against backend code before changing API/UI behavior.
## Architecture in 30 seconds
- Single Flask backend file: `server_stock/app.py` (models, validation, routes, static serving, startup)
- Frontend is vanilla static files, no build step:
  - `public/index.html`
  - `public/app.js`
  - `public/style.css`
## Environment and startup behavior
- Environment loaded from `.env` via `python-dotenv` in `server_stock/app.py`.
- Key vars:
  - `DATABASE_URL` (default fallback: `postgresql://localhost/server_stock`)
  - `PORT` (default `3000`)
  - `LOAD_DEMO_DATA` (`1|true|yes` enables XML seed load)
## Database and migration gotchas
- `init_db()` uses `db.create_all()` — creates missing tables only; it does **not** alter existing schema.
- For schema changes, run manual SQL migrations against PostgreSQL.
- Hardware history writes must go through `upsert_hardware(server_id, hw_data, data_modificacio)` (Postgres `ON CONFLICT` on `(server_id, data_modificacio)`).
## API contract guardrails
- Current server payload uses: `name`, `service`, `team_id`, `environment_id`, `use_ids`, dates, and hardware fields.
- Do not reintroduce old names like `servei`, `tipus`, `equip` from stale examples.
- Date handling rule used in reports:
  - Inclusive start: `data_alta`, `start_date`, `data_modificacio` (`<=`)
  - Exclusive end: `data_baixa`, `end_date` (`>`)
## Testing / verification reality
- No formal test suite or lint/typecheck pipeline is configured in repo.
- After backend/API changes, do focused manual verification:
  - Start app and hit changed endpoints under `/api/...`
  - Validate report endpoints for date-boundary logic
  - Check frontend flows that consume changed payloads
## Repo-specific operational note
- Avoid broad recursive scans under `compose/` without filters; `compose/pgdata` can cause permission errors during file discovery.
If you switch me out of plan mode, I’ll write this directly to /home/johnny/coding/server-stock/AGENTS.md in one step.
