# Changelog

## Unreleased

## [v0.2] - 2026-07-03

### Added
- Filtre per `uses` al formulari d'informe de maquinari.

### Changed
- Totes les dates visibles a la UI ara es mostren amb format `yyyy/mm/dd`.
- Els camps de data dels formularis utilitzen una mascara d'entrada `yyyy/mm/dd`.
- El boto `Nomes actius` ara canvia a vermell quan esta actiu i recupera l'estil original en desactivar-lo.

### Fixed
- El formulari d'informe ara actualitza les opcions dependents de `uses` i `teams` quan es canvia el `service`.
- El backend accepta dates tant en format `yyyy-mm-dd` com `yyyy/mm/dd` per evitar errors de validacio amb la nova UI.

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
