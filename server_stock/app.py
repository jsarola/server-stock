from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, or_
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
SERVICE_OPTIONS = ('Testing', 'Production', 'Staging', 'Development')

def validate(data, require_name=True):
    errors = {}

    if require_name and not (data.get('name') or '').strip():
        errors['name'] = 'El nom és obligatori'

    if 'service' in data and data['service']:
        if data['service'] not in SERVICE_OPTIONS:
            errors['service'] = f'Service ha de ser un de: {", ".join(SERVICE_OPTIONS)}'

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


def validate_price(data, require_start_date=True):
    errors = {}
    for field in ('price_vcpu', 'price_mem', 'price_disk'):
        val = data.get(field)
        if val is not None:
            try:
                f = float(val)
                if f < 0:
                    errors[field] = f'{field} no pot ser negatiu'
            except (TypeError, ValueError):
                errors[field] = f'{field} ha de ser un número'
    if require_start_date:
        if not data.get('start_date'):
            errors['start_date'] = "La data d'inici és obligatòria"
        elif parse_date(data['start_date']) is None:
            errors['start_date'] = 'start_date no és una data vàlida'
    elif data.get('start_date') and parse_date(data['start_date']) is None:
        errors['start_date'] = 'start_date no és una data vàlida'
    if data.get('end_date') and parse_date(data['end_date']) is None:
        errors['end_date'] = 'end_date no és una data vàlida'
    return errors or None


server_use = db.Table('server_use',
    db.Column('server_id', db.Integer, db.ForeignKey('servers.id', ondelete='CASCADE'), primary_key=True),
    db.Column('use_id', db.Integer, db.ForeignKey('uses.id', ondelete='CASCADE'), primary_key=True),
)


class Use(db.Model):
    __tablename__ = 'uses'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name}


class Running(db.Model):
    __tablename__ = 'running'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    create_date = db.Column(db.Date, nullable=False, default=date.today)
    delete_date = db.Column(db.Date)
    prices = db.relationship(
        'RunningPrice', back_populates='running',
        order_by='RunningPrice.start_date.desc()',
        cascade='all, delete-orphan',
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'create_date': fmt_date(self.create_date),
            'delete_date': fmt_date(self.delete_date),
        }


class RunningPrice(db.Model):
    __tablename__ = 'running_prices'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    running_id = db.Column(db.Integer, db.ForeignKey('running.id', ondelete='CASCADE'), nullable=False)
    price_vcpu = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    price_mem = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    price_disk = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)

    running = db.relationship('Running', back_populates='prices')

    def to_dict(self):
        return {
            'id': self.id,
            'running_id': self.running_id,
            'price_vcpu': float(self.price_vcpu),
            'price_mem': float(self.price_mem),
            'price_disk': float(self.price_disk),
            'start_date': fmt_date(self.start_date),
            'end_date': fmt_date(self.end_date),
        }


class Server(db.Model):
    __tablename__ = 'servers'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    service = db.Column(db.String(255))
    equip = db.Column(db.String(255))
    data_alta = db.Column(db.Date)
    data_baixa = db.Column(db.Date)
    running_id = db.Column(db.Integer, db.ForeignKey('running.id', ondelete='SET NULL'), nullable=True)

    running = db.relationship('Running')
    uses = db.relationship('Use', secondary=server_use, lazy='subquery')
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
            'service': self.service,
            'equip': self.equip,
            'data_alta': fmt_date(self.data_alta),
            'data_baixa': fmt_date(self.data_baixa),
            'running': self.running.to_dict() if self.running else None,
            'uses': [u.to_dict() for u in self.uses],
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
        pg_use = Use(name='postgresql')
        py_use = Use(name='python')
        db.session.add_all([pg_use, py_use])
        db.session.flush()

        azmidi = Server(name='azmidi', service='Testing', equip='Dades', data_alta='2023-04-01')
        azmidi.uses = [pg_use, py_use]
        galactus = Server(name='galactus', service='Testing', equip='Dades', data_alta='2021-07-01')
        db.session.add_all([azmidi, galactus])
        db.session.flush()
        if azmidi.data_alta:
            upsert_hardware(azmidi.id, dict(vcpus=8, memory=16, disk0=32, disk1=1024, disk_extra=100), azmidi.data_alta)
        if galactus.data_alta:
            upsert_hardware(galactus.id, dict(vcpus=4, memory=8, disk0=32, disk1=0, disk_extra=0), galactus.data_alta)
        db.session.commit()
        print('Database seeded with initial data')


# ─── Uses API ─────────────────────────────────────────────────────────────────

@app.route('/api/uses', methods=['GET'])
def get_uses():
    return jsonify([u.to_dict() for u in Use.query.order_by(Use.name).all()])


@app.route('/api/uses', methods=['POST'])
def create_use():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
    if Use.query.filter_by(name=name).first():
        return jsonify({'errors': {'name': 'Ja existeix aquest ús'}}), 409
    use = Use(name=name)
    db.session.add(use)
    db.session.commit()
    return jsonify(use.to_dict()), 201


@app.route('/api/uses/<int:id>', methods=['DELETE'])
def delete_use(id):
    use = Use.query.get_or_404(id)
    db.session.delete(use)
    db.session.commit()
    return jsonify({'message': 'Use deleted', 'id': id})


# ─── Running API ──────────────────────────────────────────────────────────────

@app.route('/api/running', methods=['GET'])
def get_running():
    return jsonify([r.to_dict() for r in Running.query.order_by(Running.name).all()])


@app.route('/api/running', methods=['POST'])
def create_running():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
    if Running.query.filter_by(name=name).first():
        return jsonify({'errors': {'name': 'Ja existeix aquest running'}}), 409
    r = Running(
        name=name,
        create_date=parse_date(data.get('create_date')) or date.today(),
        delete_date=parse_date(data.get('delete_date')),
    )
    db.session.add(r)
    db.session.commit()
    return jsonify(r.to_dict()), 201


@app.route('/api/running/<int:id>', methods=['PUT'])
def update_running(id):
    r = Running.query.get_or_404(id)
    data = request.get_json() or {}
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
        if Running.query.filter(Running.name == name, Running.id != id).first():
            return jsonify({'errors': {'name': 'Ja existeix aquest running'}}), 409
        r.name = name
    if 'create_date' in data:
        r.create_date = parse_date(data['create_date']) or r.create_date
    if 'delete_date' in data:
        r.delete_date = parse_date(data['delete_date'])
    db.session.commit()
    return jsonify(r.to_dict())


@app.route('/api/running/<int:id>', methods=['DELETE'])
def delete_running(id):
    r = Running.query.get_or_404(id)
    db.session.delete(r)
    db.session.commit()
    return jsonify({'message': 'Running deleted', 'id': id})


# ─── Running prices API ───────────────────────────────────────────────────────

@app.route('/api/running/<int:id>/prices', methods=['GET'])
def get_running_prices(id):
    Running.query.get_or_404(id)
    prices = (RunningPrice.query
              .filter_by(running_id=id)
              .order_by(RunningPrice.start_date.desc())
              .all())
    return jsonify([p.to_dict() for p in prices])


@app.route('/api/running/<int:id>/prices', methods=['POST'])
def create_running_price(id):
    Running.query.get_or_404(id)
    data = request.get_json() or {}
    errors = validate_price(data)
    if errors:
        return jsonify({'errors': errors}), 400
    price = RunningPrice(
        running_id=id,
        price_vcpu=data.get('price_vcpu', 0),
        price_mem=data.get('price_mem', 0),
        price_disk=data.get('price_disk', 0),
        start_date=parse_date(data['start_date']),
        end_date=parse_date(data.get('end_date')),
    )
    db.session.add(price)
    db.session.commit()
    return jsonify(price.to_dict()), 201


@app.route('/api/running/<int:id>/prices/<int:price_id>', methods=['PUT'])
def update_running_price(id, price_id):
    price = RunningPrice.query.filter_by(id=price_id, running_id=id).first_or_404()
    data = request.get_json() or {}
    errors = validate_price(data, require_start_date=False)
    if errors:
        return jsonify({'errors': errors}), 400
    for field in ('price_vcpu', 'price_mem', 'price_disk'):
        if field in data:
            setattr(price, field, data[field])
    if 'start_date' in data and data['start_date']:
        price.start_date = parse_date(data['start_date'])
    if 'end_date' in data:
        price.end_date = parse_date(data['end_date'])
    db.session.commit()
    return jsonify(price.to_dict())


@app.route('/api/running/<int:id>/prices/<int:price_id>', methods=['DELETE'])
def delete_running_price(id, price_id):
    price = RunningPrice.query.filter_by(id=price_id, running_id=id).first_or_404()
    db.session.delete(price)
    db.session.commit()
    return jsonify({'message': 'Price deleted', 'id': price_id})


# ─── Servers API ──────────────────────────────────────────────────────────────

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
        service=data.get('service', ''),
        equip=data.get('equip', ''),
        data_alta=parse_date(data.get('data_alta')),
        data_baixa=parse_date(data.get('data_baixa')),
        running_id=data.get('running_id') or None,
    )
    if 'use_ids' in data:
        server.uses = Use.query.filter(Use.id.in_(data['use_ids'])).all()
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

    for field in ('name', 'service', 'equip'):
        if field in data:
            setattr(server, field, data[field])
    if 'data_alta' in data:
        server.data_alta = parse_date(data['data_alta'])
    if 'data_baixa' in data:
        server.data_baixa = parse_date(data['data_baixa'])
    if 'running_id' in data:
        server.running_id = data['running_id'] or None
    if 'use_ids' in data:
        server.uses = Use.query.filter(Use.id.in_(data['use_ids'])).all()

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
