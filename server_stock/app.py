from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from dotenv import load_dotenv
from datetime import date
import os
import xml.etree.ElementTree as ET

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


class Team(db.Model):
    __tablename__ = 'teams'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name}


class Environment(db.Model):
    __tablename__ = 'environments'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    create_date = db.Column(db.Date, nullable=False, default=date.today)
    delete_date = db.Column(db.Date)
    prices = db.relationship(
        'EnvironmentPrice', back_populates='environment',
        order_by='EnvironmentPrice.start_date.desc()',
        cascade='all, delete-orphan',
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'create_date': fmt_date(self.create_date),
            'delete_date': fmt_date(self.delete_date),
        }


class EnvironmentPrice(db.Model):
    __tablename__ = 'environment_prices'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    environment_id = db.Column(db.Integer, db.ForeignKey('environments.id', ondelete='CASCADE'), nullable=False)
    price_vcpu = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    price_mem = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    price_disk = db.Column(db.Numeric(10, 4), nullable=False, default=0)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)

    environment = db.relationship('Environment', back_populates='prices')

    def to_dict(self):
        return {
            'id': self.id,
            'environment_id': self.environment_id,
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
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True)
    data_alta = db.Column(db.Date)
    data_baixa = db.Column(db.Date)
    environment_id = db.Column(db.Integer, db.ForeignKey('environments.id', ondelete='SET NULL'), nullable=True)

    team = db.relationship('Team')
    environment = db.relationship('Environment')
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
            'team': self.team.to_dict() if self.team else None,
            'data_alta': fmt_date(self.data_alta),
            'data_baixa': fmt_date(self.data_baixa),
            'environment': self.environment.to_dict() if self.environment else None,
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


DEMO_DATA_PATH = os.path.join(os.path.dirname(__file__), 'demo_data.xml')


def _load_demo_data():
    tree = ET.parse(DEMO_DATA_PATH)
    root = tree.getroot()

    use_map = {}
    for el in root.findall('uses/use'):
        name = el.get('name')
        use = Use.query.filter_by(name=name).first() or Use(name=name)
        db.session.add(use)
        use_map[name] = use
    db.session.flush()

    team_map = {}
    for el in root.findall('teams/team'):
        name = el.get('name')
        team = Team.query.filter_by(name=name).first() or Team(name=name)
        db.session.add(team)
        team_map[name] = team
    db.session.flush()

    environment_map = {}
    for el in root.findall('environments/environment'):
        name = el.get('name')
        r = Environment.query.filter_by(name=name).first()
        if not r:
            r = Environment(
                name=name,
                create_date=parse_date(el.get('create_date')) or date.today(),
                delete_date=parse_date(el.get('delete_date')),
            )
            db.session.add(r)
            db.session.flush()
            for pel in el.findall('prices/price'):
                price = EnvironmentPrice(
                    environment_id=r.id,
                    price_vcpu=float(pel.get('price_vcpu', 0)),
                    price_mem=float(pel.get('price_mem', 0)),
                    price_disk=float(pel.get('price_disk', 0)),
                    start_date=parse_date(pel.get('start_date')),
                    end_date=parse_date(pel.get('end_date')),
                )
                db.session.add(price)
        environment_map[name] = r
    db.session.flush()

    for el in root.findall('servers/server'):
        name = el.get('name')
        if Server.query.filter_by(name=name).first():
            continue
        environment_name = el.get('environment')
        team_name = el.get('team')
        server = Server(
            name=name,
            service=el.get('service', ''),
            team_id=team_map[team_name].id if team_name and team_name in team_map else None,
            data_alta=parse_date(el.get('data_alta')),
            data_baixa=parse_date(el.get('data_baixa')),
            environment_id=environment_map[environment_name].id if environment_name and environment_name in environment_map else None,
        )
        server.uses = [use_map[u.get('name')] for u in el.findall('uses/use') if u.get('name') in use_map]
        db.session.add(server)
        db.session.flush()
        for snap in el.findall('hardware/snapshot'):
            snap_date = parse_date(snap.get('date'))
            if snap_date:
                hw_data = {f: int(snap.get(f, 0)) for f in ('vcpus', 'memory', 'disk0', 'disk1', 'disk_extra')}
                upsert_hardware(server.id, hw_data, snap_date)

    db.session.commit()
    print('Database seeded with demo data from demo_data.xml')


def init_db():
    db.create_all()
    if os.environ.get('LOAD_DEMO_DATA', '').lower() in ('1', 'true', 'yes'):
        _load_demo_data()
    elif Server.query.count() == 0:
        print('Empty database — set LOAD_DEMO_DATA=true to seed demo data')


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


# ─── Teams API ────────────────────────────────────────────────────────────────

@app.route('/api/teams', methods=['GET'])
def get_teams():
    return jsonify([t.to_dict() for t in Team.query.order_by(Team.name).all()])


@app.route('/api/teams', methods=['POST'])
def create_team():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
    if Team.query.filter_by(name=name).first():
        return jsonify({'errors': {'name': 'Ja existeix aquest team'}}), 409
    team = Team(name=name)
    db.session.add(team)
    db.session.commit()
    return jsonify(team.to_dict()), 201


@app.route('/api/teams/<int:id>', methods=['PUT'])
def update_team(id):
    team = Team.query.get_or_404(id)
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
    if Team.query.filter(Team.name == name, Team.id != id).first():
        return jsonify({'errors': {'name': 'Ja existeix aquest team'}}), 409
    team.name = name
    db.session.commit()
    return jsonify(team.to_dict())


@app.route('/api/teams/<int:id>', methods=['DELETE'])
def delete_team(id):
    team = Team.query.get_or_404(id)
    db.session.delete(team)
    db.session.commit()
    return jsonify({'message': 'Team deleted', 'id': id})


# ─── Environments API ─────────────────────────────────────────────────────────

@app.route('/api/environments', methods=['GET'])
def get_environments():
    return jsonify([r.to_dict() for r in Environment.query.order_by(Environment.name).all()])


@app.route('/api/environments', methods=['POST'])
def create_environment():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
    if Environment.query.filter_by(name=name).first():
        return jsonify({'errors': {'name': 'Ja existeix aquest entorn'}}), 409
    r = Environment(
        name=name,
        create_date=parse_date(data.get('create_date')) or date.today(),
        delete_date=parse_date(data.get('delete_date')),
    )
    db.session.add(r)
    db.session.commit()
    return jsonify(r.to_dict()), 201


@app.route('/api/environments/<int:id>', methods=['PUT'])
def update_environment(id):
    r = Environment.query.get_or_404(id)
    data = request.get_json() or {}
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'errors': {'name': 'El nom és obligatori'}}), 400
        if Environment.query.filter(Environment.name == name, Environment.id != id).first():
            return jsonify({'errors': {'name': 'Ja existeix aquest entorn'}}), 409
        r.name = name
    if 'create_date' in data:
        r.create_date = parse_date(data['create_date']) or r.create_date
    if 'delete_date' in data:
        r.delete_date = parse_date(data['delete_date'])
    db.session.commit()
    return jsonify(r.to_dict())


@app.route('/api/environments/<int:id>', methods=['DELETE'])
def delete_environment(id):
    r = Environment.query.get_or_404(id)
    db.session.delete(r)
    db.session.commit()
    return jsonify({'message': 'Environment deleted', 'id': id})


# ─── Environment prices API ───────────────────────────────────────────────────

@app.route('/api/environments/<int:id>/prices', methods=['GET'])
def get_environment_prices(id):
    Environment.query.get_or_404(id)
    prices = (EnvironmentPrice.query
              .filter_by(environment_id=id)
              .order_by(EnvironmentPrice.start_date.desc())
              .all())
    return jsonify([p.to_dict() for p in prices])


@app.route('/api/environments/<int:id>/prices', methods=['POST'])
def create_environment_price(id):
    Environment.query.get_or_404(id)
    data = request.get_json() or {}
    errors = validate_price(data)
    if errors:
        return jsonify({'errors': errors}), 400
    new_start = parse_date(data['start_date'])
    open_price = EnvironmentPrice.query.filter_by(environment_id=id, end_date=None).first()
    if open_price:
        open_price.end_date = new_start
    price = EnvironmentPrice(
        environment_id=id,
        price_vcpu=data.get('price_vcpu', 0),
        price_mem=data.get('price_mem', 0),
        price_disk=data.get('price_disk', 0),
        start_date=new_start,
        end_date=parse_date(data.get('end_date')),
    )
    db.session.add(price)
    db.session.commit()
    return jsonify(price.to_dict()), 201


@app.route('/api/environments/<int:id>/prices/<int:price_id>', methods=['PUT'])
def update_environment_price(id, price_id):
    price = EnvironmentPrice.query.filter_by(id=price_id, environment_id=id).first_or_404()
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


@app.route('/api/environments/<int:id>/prices/<int:price_id>', methods=['DELETE'])
def delete_environment_price(id, price_id):
    price = EnvironmentPrice.query.filter_by(id=price_id, environment_id=id).first_or_404()
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
        team_id=data.get('team_id') or None,
        data_alta=parse_date(data.get('data_alta')),
        data_baixa=parse_date(data.get('data_baixa')),
        environment_id=data.get('environment_id') or None,
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

    for field in ('name', 'service'):
        if field in data:
            setattr(server, field, data[field])
    if 'team_id' in data:
        server.team_id = data['team_id'] or None
    if 'data_alta' in data:
        server.data_alta = parse_date(data['data_alta'])
    if 'data_baixa' in data:
        server.data_baixa = parse_date(data['data_baixa'])
    if 'environment_id' in data:
        server.environment_id = data['environment_id'] or None
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


def _validate_hw_fields(data):
    errors = {}
    for field in INT_FIELDS:
        if field not in data:
            continue
        try:
            v = int(data[field])
            if v < 0:
                errors[field] = 'Ha de ser >= 0'
        except (TypeError, ValueError):
            errors[field] = 'Ha de ser un enter'
    return errors or None


@app.route('/api/servers/<int:id>/history', methods=['POST'])
def add_server_history(id):
    Server.query.get_or_404(id)
    data = request.get_json() or {}
    date_str = data.get('data_modificacio')
    if not date_str:
        return jsonify({'error': 'data_modificacio is required'}), 400
    snap_date = parse_date(date_str)
    if not snap_date:
        return jsonify({'error': 'Invalid date format (expected yyyy-mm-dd)'}), 400
    errs = _validate_hw_fields(data)
    if errs:
        return jsonify({'errors': errs}), 400
    hw_data = {f: int(data.get(f, 0)) for f in ('vcpus', 'memory', 'disk0', 'disk1', 'disk_extra')}
    upsert_hardware(id, hw_data, snap_date)
    db.session.commit()
    row = ServerHardware.query.filter_by(server_id=id, data_modificacio=snap_date).one()
    return jsonify(row.to_dict()), 201


@app.route('/api/servers/<int:id>/history/<date_str>', methods=['PUT'])
def update_server_history(id, date_str):
    Server.query.get_or_404(id)
    snap_date = parse_date(date_str)
    if not snap_date:
        return jsonify({'error': 'Invalid date in URL'}), 400
    row = ServerHardware.query.filter_by(server_id=id, data_modificacio=snap_date).first_or_404()
    data = request.get_json() or {}
    errs = _validate_hw_fields(data)
    if errs:
        return jsonify({'errors': errs}), 400

    new_date_str = data.get('data_modificacio')
    new_date = parse_date(new_date_str) if new_date_str else snap_date

    hw_data = {f: int(data[f]) if f in data else getattr(row, f) for f in INT_FIELDS}

    if new_date != snap_date:
        db.session.delete(row)
        db.session.flush()
        upsert_hardware(id, hw_data, new_date)
    else:
        for k, v in hw_data.items():
            setattr(row, k, v)

    db.session.commit()
    updated = ServerHardware.query.filter_by(server_id=id, data_modificacio=new_date).one()
    return jsonify(updated.to_dict())


@app.route('/api/servers/<int:id>/history/<date_str>', methods=['DELETE'])
def delete_server_history(id, date_str):
    Server.query.get_or_404(id)
    snap_date = parse_date(date_str)
    if not snap_date:
        return jsonify({'error': 'Invalid date in URL'}), 400
    row = ServerHardware.query.filter_by(server_id=id, data_modificacio=snap_date).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


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


def _active_servers_with_hw(report_date):
    servers = Server.query.filter(
        Server.data_alta <= report_date,
        or_(Server.data_baixa.is_(None), Server.data_baixa > report_date),
    ).order_by(Server.name).all()

    if not servers:
        return servers, {}

    latest_subq = (
        db.session.query(
            ServerHardware.server_id,
            func.max(ServerHardware.data_modificacio).label('max_date'),
        )
        .filter(
            ServerHardware.server_id.in_([s.id for s in servers]),
            ServerHardware.data_modificacio <= report_date,
        )
        .group_by(ServerHardware.server_id)
        .subquery()
    )
    hw_rows = (
        db.session.query(ServerHardware)
        .join(latest_subq,
              (ServerHardware.server_id == latest_subq.c.server_id) &
              (ServerHardware.data_modificacio == latest_subq.c.max_date))
        .all()
    )
    return servers, {hw.server_id: hw for hw in hw_rows}


@app.route('/api/report/hardware', methods=['GET'])
def hardware_report():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date parameter required'}), 400
    report_date = parse_date(date_str)
    if not report_date:
        return jsonify({'error': 'Invalid date format (expected yyyy-mm-dd)'}), 400

    servers, hw_map = _active_servers_with_hw(report_date)
    result = []
    for s in servers:
        hw = hw_map.get(s.id)
        result.append({
            'id': s.id, 'name': s.name, 'service': s.service,
            'team': s.team.name if s.team else None,
            'environment': s.environment.name if s.environment else None,
            'data_alta': fmt_date(s.data_alta), 'data_baixa': fmt_date(s.data_baixa),
            'uses': [u.name for u in s.uses],
            'vcpus': hw.vcpus if hw else None,
            'memory': hw.memory if hw else None,
            'disk0': hw.disk0 if hw else None,
            'disk1': hw.disk1 if hw else None,
            'disk_extra': hw.disk_extra if hw else None,
            'hw_date': fmt_date(hw.data_modificacio) if hw else None,
        })
    return jsonify(result)


@app.route('/api/report/invoice', methods=['GET'])
def invoice_report():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date parameter required'}), 400
    report_date = parse_date(date_str)
    if not report_date:
        return jsonify({'error': 'Invalid date format (expected yyyy-mm-dd)'}), 400

    servers, hw_map = _active_servers_with_hw(report_date)

    environment_ids = list({s.environment_id for s in servers if s.environment_id})
    price_map = {}
    if environment_ids:
        latest_price_subq = (
            db.session.query(
                EnvironmentPrice.environment_id,
                func.max(EnvironmentPrice.start_date).label('max_start'),
            )
            .filter(
                EnvironmentPrice.environment_id.in_(environment_ids),
                EnvironmentPrice.start_date <= report_date,
                or_(EnvironmentPrice.end_date.is_(None), EnvironmentPrice.end_date > report_date),
            )
            .group_by(EnvironmentPrice.environment_id)
            .subquery()
        )
        price_rows = (
            db.session.query(EnvironmentPrice)
            .join(latest_price_subq,
                  (EnvironmentPrice.environment_id == latest_price_subq.c.environment_id) &
                  (EnvironmentPrice.start_date == latest_price_subq.c.max_start))
            .all()
        )
        price_map = {p.environment_id: p for p in price_rows}

    result = []
    for s in servers:
        hw = hw_map.get(s.id)
        vcpus  = hw.vcpus  if hw else 0
        memory = hw.memory if hw else 0
        disk   = ((hw.disk0 or 0) + (hw.disk1 or 0) + (hw.disk_extra or 0)) if hw else 0

        price = price_map.get(s.environment_id) if s.environment_id else None

        if price:
            pv = float(price.price_vcpu)
            pm = float(price.price_mem)
            pd = float(price.price_disk)
            cost_vcpu = round(pv * vcpus,  4)
            cost_mem  = round(pm * memory, 4)
            cost_disk = round(pd * disk,   4)
            total     = round(cost_vcpu + cost_mem + cost_disk, 4)
        else:
            pv = pm = pd = None
            cost_vcpu = cost_mem = cost_disk = total = None

        result.append({
            'id': s.id, 'name': s.name, 'service': s.service,
            'team': s.team.name if s.team else None,
            'environment': s.environment.name if s.environment else None,
            'vcpus': vcpus, 'memory': memory, 'disk': disk,
            'price_vcpu': pv, 'price_mem': pm, 'price_disk': pd,
            'cost_vcpu': cost_vcpu, 'cost_mem': cost_mem, 'cost_disk': cost_disk,
            'total': total,
        })

    return jsonify(result)


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
