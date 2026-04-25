from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from dotenv import load_dotenv
from datetime import date
import os

load_dotenv()

PUBLIC_DIR = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')), 'public')

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://localhost/server_stock')

app = Flask(__name__, static_folder=None)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


def parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None

def fmt_date(val):
    return val.isoformat() if val else None

INT_FIELDS = ('vcpus', 'memory', 'disk0', 'disk1', 'disk_extra')
DATE_FIELDS = ('data_alta', 'data_baixa')

def validate(data, require_name=True):
    errors = {}

    if require_name and not (data.get('name') or '').strip():
        errors['name'] = 'El nom és obligatori'

    for field in INT_FIELDS:
        if field not in data:
            continue
        val = data[field]
        if not isinstance(val, int) or isinstance(val, bool):
            errors[field] = f'{field} ha de ser un enter'
        elif val < 0:
            errors[field] = f'{field} no pot ser negatiu'

    for field in DATE_FIELDS:
        if field not in data:
            continue
        val = data[field]
        if val and parse_date(val) is None:
            errors[field] = f'{field} no és una data vàlida (format: yyyy-mm-dd)'

    return errors or None


class Server(db.Model):
    __tablename__ = 'servers'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    servei = db.Column(db.String(255))
    tipus = db.Column(db.String(255))
    equip = db.Column(db.String(255))
    data_alta = db.Column(db.Date)
    data_baixa = db.Column(db.Date)

    hardware = db.relationship(
        'ServerHardware', back_populates='server',
        order_by='ServerHardware.data_modificacio.desc()',
        cascade='all, delete-orphan',
    )

    def to_dict(self):
        hw = self.hardware[0] if self.hardware else None
        return {
            'id': self.id,
            'name': self.name,
            'servei': self.servei,
            'tipus': self.tipus,
            'equip': self.equip,
            'data_alta': fmt_date(self.data_alta),
            'data_baixa': fmt_date(self.data_baixa),
            'vcpus': hw.vcpus if hw else 0,
            'memory': hw.memory if hw else 0,
            'disk0': hw.disk0 if hw else 0,
            'disk1': hw.disk1 if hw else 0,
            'disk_extra': hw.disk_extra if hw else 0,
            'data_modificacio': fmt_date(hw.data_modificacio) if hw else None,
        }


class ServerHardware(db.Model):
    __tablename__ = 'server_hardware'

    server_id = db.Column(db.Integer, db.ForeignKey('servers.id'), primary_key=True)
    data_modificacio = db.Column(db.Date, primary_key=True)
    vcpus = db.Column(db.Integer, nullable=False, default=0)
    memory = db.Column(db.Integer, nullable=False, default=0)
    disk0 = db.Column(db.Integer, nullable=False, default=0)
    disk1 = db.Column(db.Integer, nullable=False, default=0)
    disk_extra = db.Column(db.Integer, nullable=False, default=0)

    server = db.relationship('Server', back_populates='hardware')

    def to_dict(self):
        return {
            'server_id': self.server_id,
            'data_modificacio': fmt_date(self.data_modificacio),
            'vcpus': self.vcpus,
            'memory': self.memory,
            'disk0': self.disk0,
            'disk1': self.disk1,
            'disk_extra': self.disk_extra,
        }


def upsert_hardware(server_id, hw_data, data_modificacio):
    stmt = pg_insert(ServerHardware).values(
        server_id=server_id,
        data_modificacio=data_modificacio,
        **hw_data,
    ).on_conflict_do_update(
        index_elements=['server_id', 'data_modificacio'],
        set_=hw_data,
    )
    db.session.execute(stmt)


def init_db():
    db.create_all()
    if Server.query.count() == 0:
        azmidi = Server(name='azmidi', servei='postgres+python',
                        tipus='Testing', equip='Dades', data_alta='2023-04-01')
        galactus = Server(name='galactus', servei='airbyte',
                          tipus='Testing', equip='Dades', data_alta='2021-07-01')
        db.session.add_all([azmidi, galactus])
        db.session.flush()
        if azmidi.data_alta:
            upsert_hardware(azmidi.id, dict(vcpus=8, memory=16, disk0=32, disk1=1024, disk_extra=100), azmidi.data_alta)
        if galactus.data_alta:
            upsert_hardware(galactus.id, dict(vcpus=4, memory=8, disk0=32, disk1=0, disk_extra=0), galactus.data_alta)
        db.session.commit()
        print('Database seeded with initial data')


# ─── API ──────────────────────────────────────────────────────────────────────

@app.route('/api/servers', methods=['GET'])
def get_servers():
    return jsonify([s.to_dict() for s in Server.query.order_by(Server.name).all()])


@app.route('/api/servers/<int:id>', methods=['GET'])
def get_server(id):
    return jsonify(Server.query.get_or_404(id).to_dict())


@app.route('/api/servers', methods=['POST'])
def create_server():
    data = request.get_json() or {}
    errors = validate(data, require_name=True)
    if errors:
        return jsonify({'errors': errors}), 400
    if Server.query.filter_by(name=data['name'].strip()).first():
        return jsonify({'errors': {'name': 'Ja existeix un servidor amb aquest nom'}}), 409

    server = Server(
        name=data['name'],
        servei=data.get('servei', ''),
        tipus=data.get('tipus', ''),
        equip=data.get('equip', ''),
        data_alta=parse_date(data.get('data_alta')),
        data_baixa=parse_date(data.get('data_baixa')),
    )
    db.session.add(server)
    db.session.flush()

    hw_data = dict(
        vcpus=data.get('vcpus', 0),
        memory=data.get('memory', 0),
        disk0=data.get('disk0', 0),
        disk1=data.get('disk1', 0),
        disk_extra=data.get('disk_extra', 0),
    )
    upsert_hardware(server.id, hw_data, server.data_alta or date.today())

    db.session.commit()
    db.session.refresh(server)
    return jsonify(server.to_dict()), 201


@app.route('/api/servers/<int:id>', methods=['PUT'])
def update_server(id):
    server = Server.query.get_or_404(id)
    data = request.get_json() or {}
    errors = validate(data, require_name=False)
    if errors:
        return jsonify({'errors': errors}), 400
    new_name = data.get('name')
    if new_name and Server.query.filter(Server.name == new_name, Server.id != id).first():
        return jsonify({'errors': {'name': 'Ja existeix un servidor amb aquest nom'}}), 409

    for field in ('name', 'servei', 'tipus', 'equip'):
        if field in data:
            setattr(server, field, data[field])
    if 'data_alta' in data:
        server.data_alta = parse_date(data['data_alta'])
    if 'data_baixa' in data:
        server.data_baixa = parse_date(data['data_baixa'])

    hw_fields = ('vcpus', 'memory', 'disk0', 'disk1', 'disk_extra')
    if any(f in data for f in hw_fields):
        current = server.hardware[0] if server.hardware else None
        hw_data = {
            f: data[f] if f in data else (getattr(current, f) if current else 0)
            for f in hw_fields
        }
        upsert_hardware(id, hw_data, date.today())

    db.session.commit()
    db.session.refresh(server)
    return jsonify(server.to_dict())


@app.route('/api/servers/<int:id>', methods=['DELETE'])
def delete_server(id):
    server = Server.query.get_or_404(id)
    db.session.delete(server)
    db.session.commit()
    return jsonify({'message': 'Server deleted', 'id': id})


@app.route('/api/servers/<int:id>/history', methods=['GET'])
def get_server_history(id):
    Server.query.get_or_404(id)
    records = (ServerHardware.query
               .filter_by(server_id=id)
               .order_by(ServerHardware.data_modificacio.desc())
               .all())
    return jsonify([r.to_dict() for r in records])


@app.route('/api/stats', methods=['GET'])
def get_stats():
    server_count = db.session.query(func.count(Server.id)).scalar()

    latest_subq = (
        db.session.query(
            ServerHardware.server_id,
            func.max(ServerHardware.data_modificacio).label('max_date'),
        ).group_by(ServerHardware.server_id).subquery()
    )
    row = db.session.query(
        func.sum(ServerHardware.vcpus).label('total_vcpus'),
        func.sum(ServerHardware.memory).label('total_memory_gb'),
        (func.sum(ServerHardware.disk0) + func.sum(ServerHardware.disk1) + func.sum(ServerHardware.disk_extra)).label('total_disk_gb'),
    ).join(
        latest_subq,
        (ServerHardware.server_id == latest_subq.c.server_id) &
        (ServerHardware.data_modificacio == latest_subq.c.max_date),
    ).one()

    return jsonify({
        'total_servers': server_count or 0,
        'total_vcpus': row.total_vcpus or 0,
        'total_memory_gb': row.total_memory_gb or 0,
        'total_disk_gb': row.total_disk_gb or 0,
    })


# ─── Frontend ─────────────────────────────────────────────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(PUBLIC_DIR, path)):
        return send_from_directory(PUBLIC_DIR, path)
    return send_from_directory(PUBLIC_DIR, 'index.html')


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    with app.app_context():
        init_db()
    port = int(os.environ.get('PORT', 3000))
    print(f'Server running at http://localhost:{port}')
    print(f'Database: {DATABASE_URL}')
    print(f'API: http://localhost:{port}/api/servers')
    app.run(debug=True, port=port)
