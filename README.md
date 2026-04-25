# Gestió de Servidors

Aplicació web en Python/Flask per gestionar la infraestructura de servidors amb base de dades PostgreSQL.

## Requisits previs

- Python 3.12+
- [Poetry](https://python-poetry.org/)
- PostgreSQL (instància local o remota)

## Instal·lació

```bash
# 1. Instal·lar dependències
poetry install

# 2. Crear la base de dades (si és local)
createdb server_stock

# 3. Configurar les variables d'entorn
cp .env.example .env
# Editar .env amb les dades de connexió
```

## Configuració (.env)

```env
# Connexió a la base de dades
DATABASE_URL=postgresql://usuari:contrasenya@localhost:5432/server_stock

# Port del servidor web (opcional, per defecte 3000)
PORT=3000
```

## Execució

```bash
poetry run start
```

L'aplicació estarà disponible a: **http://localhost:3000**

Les taules es creen automàticament en el primer arrencament. Si la base de dades és buida, s'insereixen dues entrades d'exemple.

## Estructura del projecte

```
server-stock/
├── server_stock/
│   └── app.py          # Servidor Flask + API REST + models
├── public/
│   └── index.html      # Interfície web
├── pyproject.toml      # Dependències i scripts
├── .env                # Variables d'entorn (no es commiteja)
└── .env.example        # Plantilla de variables d'entorn
```

## Esquema de la base de dades

### `servers`
Informació d'identificació del servidor.

| Columna      | Tipus   | Descripció                  |
|--------------|---------|-----------------------------|
| id           | Integer | Clau primària, autoincrement |
| name         | String  | Nom únic del servidor        |
| servei       | String  | Servei que executa           |
| tipus        | String  | Tipus (Testing, Producció…)  |
| equip        | String  | Equip responsable            |
| data_alta    | Date    | Data d'alta (dd/mm/yyyy)     |
| data_baixa   | Date    | Data de baixa (dd/mm/yyyy)   |

### `server_hardware`
Historial de configuració de maquinari. Cada fila és un snapshot d'un dia concret. La configuració actual és la fila més recent per servidor.

| Columna          | Tipus   | Descripció                              |
|------------------|---------|-----------------------------------------|
| server_id        | Integer | Clau forana → `servers.id`              |
| data_modificacio | Date    | Data del snapshot (clau primària composta) |
| vcpus            | Integer | Nombre de vCPUs                         |
| memory           | Integer | Memòria RAM en GB                       |
| disk0            | Integer | Disc primari en GB                      |
| disk1            | Integer | Disc secundari en GB                    |
| disk_extra       | Integer | Disc addicional en GB                   |

La clau primària composta `(server_id, data_modificacio)` garanteix un únic registre per servidor i dia. Si es fan diverses modificacions el mateix dia, el registre s'actualitza en lloc de duplicar-se.

El disc total es calcula com `disk0 + disk1 + disk_extra` i no s'emmagatzema.

## API REST

| Mètode | Endpoint                    | Descripció                          |
|--------|-----------------------------|-------------------------------------|
| GET    | /api/servers                | Llistar tots els servidors          |
| GET    | /api/servers/\<id\>         | Obtenir un servidor                 |
| POST   | /api/servers                | Crear servidor                      |
| PUT    | /api/servers/\<id\>         | Actualitzar servidor                |
| DELETE | /api/servers/\<id\>         | Eliminar servidor                   |
| GET    | /api/servers/\<id\>/history | Historial de maquinari del servidor |
| GET    | /api/stats                  | Estadístiques totals                |

### Exemple POST /api/servers

```json
{
  "name": "nou-servidor",
  "servei": "nginx",
  "tipus": "Producció",
  "equip": "DevOps",
  "data_alta": "2024-01-15",
  "data_baixa": null,
  "vcpus": 4,
  "memory": 8,
  "disk0": 32,
  "disk1": 0,
  "disk_extra": 0
}
```

Les dates s'envien en format `yyyy-mm-dd` i es mostren a la interfície com `dd/mm/yyyy`.

### Exemple GET /api/servers/\<id\>/history

```json
[
  {
    "server_id": 1,
    "data_modificacio": "2024-06-01",
    "vcpus": 16,
    "memory": 32,
    "disk0": 32,
    "disk1": 1024,
    "disk_extra": 0
  },
  {
    "server_id": 1,
    "data_modificacio": "2024-01-15",
    "vcpus": 8,
    "memory": 16,
    "disk0": 32,
    "disk1": 1024,
    "disk_extra": 100
  }
]
```

### Validació

L'API retorna errors amb format `{ "errors": { "camp": "missatge" } }` i codi HTTP 400 quan:
- El nom és buit (en creació)
- Un camp enter conté un valor no enter o negatiu
- Una data no és vàlida

## Interfície web

- Taula de servidors amb cerca per nom, servei, tipus i equip
- Ordenació per qualsevol columna (clic a la capçalera)
- Disc total calculat a partir de `disk0 + disk1 + disk_extra`
- Formulari de creació i edició amb validació de camps
- Dates mostrades en format `dd/mm/yyyy`

## Dependències

| Paquet            | Ús                              |
|-------------------|---------------------------------|
| flask             | Servidor web i API REST         |
| flask-sqlalchemy  | ORM per a PostgreSQL            |
| psycopg2-binary   | Driver PostgreSQL per a Python  |
| python-dotenv     | Càrrega de variables d'entorn   |
| werkzeug          | Utilitats HTTP per a Flask      |
