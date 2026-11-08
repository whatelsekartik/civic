from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['ok'] is True

def test_system_reports_missing_models_honestly():
    response = client.get('/api/system')
    assert response.status_code == 200
    assert response.json()['models']['specialised_models']['pothole'] == 'not_installed'
    assert response.json()['models']['specialised_models']['waste'] == 'not_installed'

def test_zone_crud():
    payload = {'name':'Test no-parking','zone_type':'no_parking','points':[[0,0],[100,0],[100,100],[0,100]],'dwell_seconds':2}
    created = client.post('/api/zones', json=payload)
    assert created.status_code == 200
    zone_id = created.json()['id']
    listed = client.get('/api/zones').json()
    assert any(z['id'] == zone_id for z in listed)
    deleted = client.delete(f'/api/zones/{zone_id}')
    assert deleted.status_code == 200

def test_incident_status_rejects_invalid_value():
    response = client.patch('/api/incidents/missing/status', json={'status':'Guilty'})
    assert response.status_code == 400
