from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, text
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_PATH = os.path.join(BASE_DIR, 'db', 'servers.db')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

app = Flask(__name__, static_folder=None)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Server(db.Model):
    __tablename__ = 'servers'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    servei = db.Column(db.String(255))
    tipus = db.Column(db.String(255))
    equip = db.Column(db.String(255))
    data_alta = db.Column(db.String(10))
    data_baixa = db.Column(db.String(10))

    hardware = db.relationship(
        'ServerHardware', back_populates='server',
        uselist=False, cascade='all, delete-orphan',
    )

    def to_dict(self):
        hw = self.hardware
        return {
            'id': self.id,
            'name': self.name,
            'servei': self.servei,
            'tipus': self.tipus,
            'equip': self.equip,
            'data_alta': self.data_alta,
            'data_baixa': self.data_baixa,
            'vcpus': hw.vcpus if hw else 0,
            'memory': hw.memory if hw else 0,
            'disk0': hw.disk0 if hw else 0,
            'disk1': hw.disk1 if hw else 0,
            'disk_extra': hw.disk_extra if hw else 0,
            'data_modificacio': hw.data_modificacio if hw else None,
        }


class ServerHardware(db.Model):
    __tablename__ = 'server_hardware'

    id = db.Column(db.Integer, db.ForeignKey('servers.id'), primary_key=True)
    vcpus = db.Column(db.Integer, nullable=False, default=0)
    memory = db.Column(db.Integer, nullable=False, default=0)
    disk0 = db.Column(db.Integer, nullable=False, default=0)
    disk1 = db.Column(db.Integer, nullable=False, default=0)
    disk_extra = db.Column(db.Integer, nullable=False, default=0)
    data_modificacio = db.Column(db.String(255), server_default=text("datetime('now')"))

    server = db.relationship('Server', back_populates='hardware')


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db.create_all()
    if Server.query.count() == 0:
        azmidi = Server(name='azmidi', servei='postgres+python',
                        tipus='Testing', equip='Dades', data_alta='', data_baixa='')
        galactus = Server(name='galactus', servei='airbyte',
                          tipus='Testing', equip='Dades', data_alta='', data_baixa='')
        db.session.add_all([azmidi, galactus])
        db.session.flush()
        db.session.add_all([
            ServerHardware(id=azmidi.id, vcpus=8, memory=16, disk0=32, disk1=1024, disk_extra=100),
            ServerHardware(id=galactus.id, vcpus=4, memory=8, disk0=32, disk1=0, disk_extra=0),
        ])
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
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    if Server.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'Server name already exists'}), 409
    server = Server(
        name=data['name'],
        servei=data.get('servei', ''),
        tipus=data.get('tipus', ''),
        equip=data.get('equip', ''),
        data_alta=data.get('data_alta', ''),
        data_baixa=data.get('data_baixa', ''),
    )
    db.session.add(server)
    db.session.flush()
    db.session.add(ServerHardware(
        id=server.id,
        vcpus=data.get('vcpus', 0),
        memory=data.get('memory', 0),
        disk0=data.get('disk0', 0),
        disk1=data.get('disk1', 0),
        disk_extra=data.get('disk_extra', 0),
    ))
    db.session.commit()
    db.session.refresh(server)
    return jsonify(server.to_dict()), 201


@app.route('/api/servers/<int:id>', methods=['PUT'])
def update_server(id):
    server = Server.query.get_or_404(id)
    data = request.get_json()
    new_name = data.get('name')
    if new_name and Server.query.filter(Server.name == new_name, Server.id != id).first():
        return jsonify({'error': 'Server name already exists'}), 409

    for field in ('name', 'servei', 'tipus', 'equip', 'data_alta', 'data_baixa'):
        if field in data:
            setattr(server, field, data[field])

    hw_fields = ('vcpus', 'memory', 'disk0', 'disk1', 'disk_extra')
    if any(f in data for f in hw_fields):
        hw = server.hardware
        for field in hw_fields:
            if field in data:
                setattr(hw, field, data[field])
        db.session.execute(
            text("UPDATE server_hardware SET data_modificacio = datetime('now') WHERE id = :id"),
            {'id': id},
        )

    db.session.commit()
    db.session.refresh(server)
    return jsonify(server.to_dict())


@app.route('/api/servers/<int:id>', methods=['DELETE'])
def delete_server(id):
    server = Server.query.get_or_404(id)
    db.session.delete(server)
    db.session.commit()
    return jsonify({'message': 'Server deleted', 'id': id})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    server_count = db.session.query(func.count(Server.id)).scalar()
    row = db.session.query(
        func.sum(ServerHardware.vcpus).label('total_vcpus'),
        func.sum(ServerHardware.memory).label('total_memory_gb'),
        (func.sum(ServerHardware.disk0) + func.sum(ServerHardware.disk1) + func.sum(ServerHardware.disk_extra)).label('total_disk_gb') ,
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
    print(f'Database: {DB_PATH}')
    print(f'API: http://localhost:{port}/api/servers')
    app.run(debug=True, port=port)
