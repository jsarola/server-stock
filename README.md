# 🖥️ Gestió de Servidors

Aplicació Node.js per gestionar la infraestructura de servidors amb base de dades SQLite integrada.

## 📦 Instal·lació

```bash
# 1. Entrar al directori
cd servers-app

# 2. Instal·lar dependències
npm install

# 3. Arrancar el servidor
npm start
```

L'aplicació estarà disponible a: **http://localhost:3000**

## 🗂️ Estructura del projecte

```
servers-app/
├── server.js        # Servidor Express + API REST
├── db.js            # Inicialització SQLite + dades inicials
├── package.json     # Dependències
├── public/
│   └── index.html   # Interfície web
└── db/
    └── servers.db   # Base de dades (creada automàticament)
```

## 🔌 API REST

| Mètode | Endpoint            | Descripció              |
|--------|---------------------|-------------------------|
| GET    | /api/servers        | Llistar tots els servidors |
| GET    | /api/servers/:id    | Obtenir un servidor     |
| POST   | /api/servers        | Crear servidor          |
| PUT    | /api/servers/:id    | Actualitzar servidor    |
| DELETE | /api/servers/:id    | Eliminar servidor       |
| GET    | /api/stats          | Estadístiques totals    |

### Exemple POST /api/servers

```json
{
  "name": "nou-servidor",
  "vcpus": 4,
  "memory": 8,
  "disk0": 32,
  "disk1": 0,
  "disk_extra": 0,
  "disk_total": 32,
  "servei": "nginx",
  "tipus": "Producció",
  "equip": "DevOps",
  "data_baixa": ""
}
```

## 💾 Dades inicials

La base de dades s'inicialitza automàticament amb:

| Name     | vCPUs | Memory | Disk Total | Servei          | Tipus   | Equip |
|----------|-------|--------|------------|-----------------|---------|-------|
| azmidi   | 8     | 16 GB  | 1056 GB    | postgres+python | Testing | Dades |
| galactus | 4     | 8 GB   | 32 GB      | airbyte         | Testing | Dades |

## 🛠️ Dependències

- **express** — servidor web i API REST
- **better-sqlite3** — base de dades SQLite integrada (sense servidor extern)
