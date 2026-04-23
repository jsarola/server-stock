from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Database configuration - using SQLite as in the original db.js
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "db", "servers.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Server model matching the structure from db.js
class Server(db.Model):
    __tablename__ = 'servers'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    vcpus = db.Column(db.Integer, nullable=False, default=0)
    memory = db.Column(db.Integer, nullable=False, default=0)
    disk0 = db.Column(db.Integer, nullable=False, default=0)
    disk1 = db.Column(db.Integer, nullable=False, default=0)
    disk_extra = db.Column(db.Integer, nullable=False, default=0)
    disk_total = db.Column(db.Integer, nullable=False, default=0)
    servei = db.Column(db.String(255))
    tipus = db.Column(db.String(255))
    equip = db.Column(db.String(255))
    data_baixa = db.Column(db.String(255))
    created_at = db.Column(db.String(255), default='CURRENT_TIMESTAMP')
    updated_at = db.Column(db.String(255), default='CURRENT_TIMESTAMP')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'vcpus': self.vcpus,
            'memory': self.memory,
            'disk0': self.disk0,
            'disk1': self.disk1,
            'disk_extra': self.disk_extra,
            'disk_total': self.disk_total,
            'servei': self.servei,
            'tipus': self.tipus,
            'equip': self.equip,
            'data_baixa': self.data_baixa,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }

# Initialize database
def init_db():
    db.create_all()
    
    # Seed initial data if empty (matching the original db.js data)
    if Server.query.count() == 0:
        servers = [
            Server(name='azmidi', vcpus=8, memory=16, disk0=32, disk1=1024, 
                   disk_extra=0, disk_total=1056, servei='postgres+python', 
                   tipus='Testing', equip='Dades', data_baixa=''),
            Server(name='galactus', vcpus=4, memory=8, disk0=32, disk1=0, 
                   disk_extra=0, disk_total=32, servei='airbyte', 
                   tipus='Testing', equip='Dades', data_baixa='')
        ]
        db.session.add_all(servers)
        db.session.commit()
        print('✅ Database seeded with initial data')

# API Routes
@app.route('/api/servers', methods=['GET'])
def get_servers():
    servers = Server.query.all()
    return jsonify([server.to_dict() for server in servers])

@app.route('/api/servers/<int:id>', methods=['GET'])
def get_server(id):
    server = Server.query.get_or_404(id)
    return jsonify(server.to_dict())

@app.route('/api/servers', methods=['POST'])
def create_server():
    data = request.get_json()
    
    # Check for duplicate name
    if Server.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'Server name already exists'}), 400
    
    server = Server(
        name=data['name'],
        vcpus=data['vcpus'],
        memory=data['memory'],
        disk0=data['disk0'],
        disk1=data['disk1'],
        disk_extra=data['disk_extra'],
        disk_total=data['disk_total'],
        servei=data.get('servei'),
        tipus=data.get('tipus'),
        equip=data.get('equip'),
        data_baixa=data.get('data_baixa', '')
    )
    
    db.session.add(server)
    db.session.commit()
    
    return jsonify(server.to_dict()), 201

@app.route('/api/servers/<int:id>', methods=['PUT'])
def update_server(id):
    server = Server.query.get_or_404(id)
    data = request.get_json()
    
    # Check for duplicate name (excluding current server)
    if Server.query.filter(Server.name == data['name'], Server.id != id).first():
        return jsonify({'error': 'Server name already exists'}), 400
    
    server.name = data.get('name', server.name)
    server.vcpus = data.get('vcpus', server.vcpus)
    server.memory = data.get('memory', server.memory)
    server.disk0 = data.get('disk0', server.disk0)
    server.disk1 = data.get('disk1', server.disk1)
    server.disk_extra = data.get('disk_extra', server.disk_extra)
    server.disk_total = data.get('disk_total', server.disk_total)
    server.servei = data.get('servei', server.servei)
    server.tipus = data.get('tipus', server.tipus)
    server.equip = data.get('equip', server.equip)
    server.data_baixa = data.get('data_baixa', server.data_baixa)
    
    db.session.commit()
    
    return jsonify(server.to_dict())

@app.route('/api/servers/<int:id>', methods=['DELETE'])
def delete_server(id):
    server = Server.query.get_or_404(id)
    db.session.delete(server)
    db.session.commit()
    
    return jsonify({'message': 'Server deleted successfully'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    total_servers = Server.query.count()
    total_vcpus = sum(server.vcpus for server in Server.query.all())
    total_memory = sum(server.memory for server in Server.query.all())
    
    return jsonify({
        'total_servers': total_servers,
        'total_vcpus': total_vcpus,
        'total_memory': total_memory,
        'unique_services': len(set(server.servei for server in Server.query.all() if server.servei))
    })

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)