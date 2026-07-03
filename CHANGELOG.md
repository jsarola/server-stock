# Changelog

## Unreleased

## [v0.1-beta] - 2026-07-03

### Added
- Importacio de maquines virtuals des de CSV en arrencar, activable amb `LOAD_VM_CSV_DATA` i configurable amb `VM_CSV_DATA_FILE`.
- Creacio automatica de `teams` i `uses` durant la importacio CSV.
- Menu desplegable de gestio per `Usos`, `Teams` i `Entorns`.
- Toggle `light/dark mode` amb persistencia local.
- Filtres avancats al llistat de servidors.
- Boto `Nomes actius`.
- Exportacio CSV de la factura.
- Fila final de totals dins la taula de factura.

### Changed
- El llistat de servidors mostra nomes el `Total Disc`.
- Els totals superiors del dashboard es recalculen segons els filtres actius.
- La modal de factura ara es redimensionable.
- Els totals visibles es mostren amb 2 decimals.

### Fixed
- Millorada la visibilitat del total de factura afegint resum dins la taula.
- Millorada la usabilitat de la factura en pantalles amb espai limitat.
