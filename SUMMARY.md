# SUMMARY.md

Resum de tots els canvis implementats en les sessions de desenvolupament.

---

## 1. Preus per Running (`running_prices`)

### Backend — `server_stock/app.py`
- Afegit import `or_` a `from sqlalchemy import func, or_`
- Nou model **`RunningPrice`** (`running_prices`): camps `price_vcpu`, `price_mem`, `price_disk` (`NUMERIC(10,4)`), `start_date`, `end_date` (null = preu actual), FK a `running.id` amb `CASCADE`
- Relació `prices` afegida al model `Running` (ordered DESC per `start_date`, `cascade='all, delete-orphan'`)
- Nova funció `validate_price(data, require_start_date)`: valida floats no negatius i format de dates
- 4 nous endpoints REST sota `/api/running/<id>/prices`:
  - `GET` — llista preus ordenats per `start_date DESC`
  - `POST` — crea nou preu
  - `PUT /<price_id>` — actualitza preu existent
  - `DELETE /<price_id>` — elimina preu

### Frontend — `public/index.html`
- Modal Running ampliat: eliminat `modal-sm` (480 px → 640 px)
- Correcció pendent: substituïdes les classes `add-running-grid` / `add-running-group` per `.form-grid` / `.form-group`
- Afegit `<div id="prices-panel-{id}">` per a cada entrada de running

### CSS — `public/style.css`
- `.running-manager-entry` — wrapper per entrada + panell de preus
- `.running-manager-row` — grid de 6 columnes (afegida columna per botó "Preus")
- `.running-manager-row.has-panel` — arrodoniment superior quan el panell és obert
- `.r-prices-btn` — botó petit d'accent per obrir/tancar preus
- `.running-prices-panel`, `.prices-grid`, `.price-header-cell`, `.price-cell`, `.price-separator`, `.price-actions`, `.price-add-btn` — tot el sistema visual del panell de preus
- Eliminada referència obsoleta a `add-running-grid` al bloc `@media (max-width: 768px)`

### JS — `public/app.js`
- Variables d'estat noves: `expandedRunningId`, `editingPriceId`, `runningPricesCache`
- `openRunningModal` / `closeRunningModal` reinicien l'estat de preus
- `renderRunningManager` actualitzat: boto "Preus ▾/▴", panell inline, renderitzat des de cache si disponible
- `deleteRunningItem` neteja `runningPricesCache` i `expandedRunningId`
- Secció nova `// ── Running price management`:
  - `toggleRunningPrices(id)` — obre/tanca el panell i carrega dades
  - `refreshRunningPrices(runningId)` — re-fetch i re-render
  - `fmtPrice(val)` — format a 4 decimals
  - `renderRunningPricesPanel(runningId)` — grid amb capçaleres, files (estàtiques o en edició inline), separador i fila d'afegir
  - `editPriceRow`, `cancelPriceEdit`, `savePriceRow`, `createRunningPrice`, `deletePriceRow`

---

## 2. Informe puntual de maquinari

### Backend — `server_stock/app.py`
- Nou endpoint `GET /api/report/hardware?date=YYYY-MM-DD`:
  - Filtra servidors amb `data_alta <= date AND (data_baixa IS NULL OR data_baixa > date)`
  - Per a cada servidor obté el `ServerHardware` més recent amb `data_modificacio <= date`
  - Retorna: `id`, `name`, `service`, `equip`, `running`, `uses`, `disk_total` (suma de disk0+disk1+disk_extra), `hw_date`
- Helper `_active_servers_with_hw(report_date)` extret per eliminar consultes N+1: fa una sola consulta amb subquery `GROUP BY server_id / MAX(data_modificacio)`

### Frontend — `public/index.html`
- Botó "Informe" a la barra d'eines
- Modal `#reportModalOverlay` (`.modal-wide`, 900 px):
  - Filtres en columna vertical (data, desplegable service, desplegable equip, botó Consultar)
  - `#reportResults` — taula de resultats (mostra només disc total, no columnes individuals)
  - Footer amb `#reportStats` (resum de totals), botó "Factura" (`#btnInvoice`, ocult per defecte) i botó Tancar

### CSS — `public/style.css`
- `.modal-wide .modal { width: 900px }` — nova variant d'amplada
- `.report-filters { flex-direction: column; width: 200px }` — filtres en columna
- `.report-filter-group` — label + input apilats; `input { width: 100%; height: 34px }`
- `.report-stats` — estil mono per al resum de totals al footer
- `.report-table-wrap`, `.report-table-wrap th/td`, `.report-no-hw` — estils de la taula de resultats

### JS — `public/app.js`
- Variable `reportData = []` — emmagatzema el resultat complet per filtrar sense re-fetch
- `openReportModal()` — reinicia tots els filtres i resultats, posa data d'avui
- `closeReportModal()` / `handleReportOverlayClick()`
- `runReport()` — fa el fetch, omple el desplegable d'equips (valors únics del resultat), crida `applyReportFilters()`
- `applyReportFilters()` — usa `applyActiveFilters()`, renderitza taula i stats; mostra `#btnInvoice` si hi ha dades
- `applyActiveFilters(data)` — helper compartit que filtra per service i equip (usat també per a la factura)

---

## 3. Historial de maquinari per servidor

### Backend — `server_stock/app.py`
- Funció auxiliar `_validate_hw_fields(data)` — valida enters no negatius per als 5 camps de disc/CPU usant la constant `INT_FIELDS`
- 3 nous endpoints sota `/api/servers/<id>/history` (el GET ja existia):
  - `POST` — crea o actualitza un snapshot per a qualsevol data (via `upsert_hardware`)
  - `PUT /<date_str>` — actualitza valors i/o data d'un snapshot; si la data canvia, esborra la fila antiga i n'insereix una de nova
  - `DELETE /<date_str>` — elimina un snapshot concret

### Frontend — `public/index.html`
- Modal `#hwHistoryOverlay` (`.modal-wide`):
  - Fila d'afegir: date picker + 5 camps numèrics + botó Afegir
  - Taula `#hwHistoryBody`: columnes Data, vCPUs, Mem, Disk-0, Disk-1, Disk+, Total, Accions
- Botó `HW` afegit a la columna d'accions de cada fila de la taula principal

### CSS — `public/style.css`
- `.hw-add-row` — flex layout per a la fila d'afegir snapshot
- `.hw-history-wrap`, `.hw-history-table` — taula d'historial amb estils mono
- `.hw-history-table tr.editing td` — fons diferenciat en edició inline
- `.hw-history-table input` — inputs inline: date (120 px) i number (62 px, text-align right)
- `.hw-btn` + variants `.edit`, `.del`, `.save` — botons d'acció petits amb hover de colors
- `.icon-btn-hw` — estil del botó HW a la taula principal (mida i font mono)

### JS — `public/app.js`
- Variables d'estat: `hwHistoryServerId`, `hwHistoryRecords`, `editingHwDate`
- `openHwHistoryModal(serverId, serverName)` — obre modal, posa data d'avui al formulari, carrega historial
- `closeHwHistoryModal()` / `handleHwHistoryOverlayClick()`
- `loadHwHistory()` — `GET /api/servers/<id>/history`, emmagatzema i renderitza
- `renderHwHistory()` — per a cada fila: mode lectura (data formatada, valors, botons ✎/✕) o mode edició inline (inputs per a tots els camps incloent data); usa `diskTotal()` per al total
- `editHwRow(date)` / `cancelHwEdit()` — canvien `editingHwDate` i re-renderitzen
- `saveHwRow(originalDate)` — `PUT` amb tots els camps; si la data ha canviat, l'API gestiona el delete+insert
- `createHwSnapshot()` — `POST` amb data i valors; reseteja el formulari
- `deleteHwRow(date)` — `DELETE` amb confirmació
- Totes les operacions fan `Promise.all([loadHwHistory(), loadServers()])` en paral·lel

---

## 4. Factura / Invoice

### Backend — `server_stock/app.py`
- Nou endpoint `GET /api/report/invoice?date=YYYY-MM-DD`:
  - Usa `_active_servers_with_hw(report_date)` per obtenir servidors i maquinari actius
  - Consulta de preus massiva: una sola query amb subquery `GROUP BY running_id / MAX(start_date)` per obtenir el preu vigent de cada running en la data (`start_date <= date AND (end_date IS NULL OR end_date > date)`)
  - Retorna per cada servidor: `hw` (vcpus, memory, disk_total), `price` (price_vcpu, price_mem, price_disk), `cost` (cost_vcpu, cost_mem, cost_disk, total); omissió si no hi ha preu

### Frontend — `public/index.html`
- Modal `#invoiceModalOverlay` (`.modal-wide`): taula de resultats `#invoiceResults`, total general `#invoiceGrandTotal` al footer

### CSS — `public/style.css`
- `.invoice-grand-total` — total general en negreta al footer
- `.invoice-no-price`, `.invoice-price-hint` — indicadors per a servidors sense preu
- `.invoice-total-cell` — cel·la de total per servidor en negreta

### JS — `public/app.js`
- `openInvoiceModal()` — fetch de `/api/report/invoice`, aplica `applyActiveFilters()`, crida `renderInvoice()`
- `closeInvoiceModal()` / `handleInvoiceOverlayClick()`
- `renderInvoice(rows)` — taula amb columnes vCPUs×preu, Mem×preu, Disc×preu, Total; total general al footer; mostra `—` per a servidors sense preu actiu

---

## 5. Correccions de lògica de dates

- **`data_baixa` i `end_date` usen `>` estricte** (no `>=`): una data de baixa/tancament igual a la data de consulta significa que el recurs ja ha deixat d'estar actiu en aquell dia.
- **`data_alta`, `start_date`, `data_modificacio` mantenen `<=`**: la data d'alta/inici és inclusiva.
- Corregit als endpoints: `/api/report/hardware`, `/api/report/invoice` i totes les consultes de preus.

---

## 6. Auto-tancament de preu actiu

### Backend — `server_stock/app.py`
- Al endpoint `POST /api/running/<id>/prices`: quan es crea un nou preu, si existeix un preu amb `end_date = NULL` (preu obert), se li assigna automàticament `end_date = new_start_date`.
- Garanteix que no hi hagi mai dos preus solapats per al mateix running.

---

## 7. Millores de codi (`/simplify`)

### Backend — `server_stock/app.py`
- `_validate_hw_fields` usa la constant `INT_FIELDS` en lloc d'una tupla duplicada
- `hw_data` en `update_server_history` substituït per comprehensió: `{f: int(data[f]) if f in data else getattr(row, f) for f in INT_FIELDS}`
- `_active_servers_with_hw(report_date)` extret com a helper compartit per `/api/report/hardware` i `/api/report/invoice`, eliminant les consultes N+1

### JS — `public/app.js`
- `diskTotal(r)` usa `renderHwHistory` i `applyReportFilters` en lloc de càlculs inline duplicats
- `fmtDate()` substitueix la funció local `fmtD` duplicada a `applyReportFilters`
- `applyActiveFilters(data)` extret com a helper compartit (service + equip filter) usat per `applyReportFilters` i `openInvoiceModal`
- `Promise.all([loadHwHistory(), loadServers()])` en les tres operacions de mutació d'historial (en lloc d'awaits seqüencials)

### CSS — `public/style.css`
- `.icon-btn-hw` substitueix l'estil inline `style="font-size:0.8rem"` del botó HW
