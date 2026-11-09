from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.scenarios import SCENARIOS, evaluate


@pytest.fixture
def client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    main.Base.metadata.create_all(engine)
    monkeypatch.setattr(main, "engine", engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)

    def database():
        with sessions() as session:
            yield session

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(main.jwks, "get_signing_key_from_jwt", lambda token: SimpleNamespace(key=private.public_key()))
    main.app.dependency_overrides[main.db_session] = database

    def token(subject, audience=main.AUDIENCE):
        now = datetime.now(timezone.utc)
        return jwt.encode({"sub": subject, "iss": main.ISSUER, "aud": audience, "iat": now,
                           "exp": now + timedelta(minutes=5)}, private, algorithm="RS256")

    with TestClient(main.app) as test_client:
        yield test_client, token
    main.app.dependency_overrides.clear()
    engine.dispose()


def test_authentication_and_user_isolation(client):
    api, token = client
    assert api.get("/api/overview").status_code == 401
    assert api.get("/api/overview", headers={"Authorization": "Bearer " + token("alice", "wrong")}).status_code == 401
    alice = {"Authorization": "Bearer " + token("alice")}
    bob = {"Authorization": "Bearer " + token("bob")}
    incident = api.post("/api/simulations", headers=alice).json()
    assert api.get("/api/incidents/" + str(incident["id"]), headers=bob).status_code == 404
    assert api.post(f"/api/incidents/{incident['id']}/status", headers=bob, json={"status": "contained"}).status_code == 404
    assert api.get("/api/overview", headers=bob).json()["incidents"] == []


def test_simulation_report_and_progress(client):
    api, token = client
    headers = {"Authorization": "Bearer " + token("alice")}
    first = api.post("/api/simulations", headers=headers).json()
    detail = api.get(f"/api/incidents/{first['id']}", headers=headers).json()
    assert any(event["source"] == "detector" for event in detail["events"])
    assert api.post(f"/api/incidents/{first['id']}/reports", headers=headers, json={"body": " "}).status_code == 422
    scenario = next(s for s in SCENARIOS if s["id"] == first["scenario"])
    text = " ".join(term for _, terms in scenario["rubric"] for term in terms)
    for _ in range(2):
        report = api.post(f"/api/incidents/{first['id']}/reports", headers=headers, json={"body": text})
        assert report.json()["score"] == 100
    assert api.get("/api/overview", headers=headers).json()["level"] == 1
    second = api.post("/api/simulations", headers=headers).json()
    scenario = next(s for s in SCENARIOS if s["id"] == second["scenario"])
    text = " ".join(term for _, terms in scenario["rubric"] for term in terms)
    api.post(f"/api/incidents/{second['id']}/reports", headers=headers, json={"body": text})
    assert api.get("/api/overview", headers=headers).json()["level"] == 2
    assert api.post("/api/simulations", headers=headers).json()["scenario"] == "credential-stuffing"
    assert api.post(f"/api/incidents/{first['id']}/status", headers=headers, json={"status": "contained"}).json()["status"] == "contained"


def test_evaluator_reports_missing_evidence():
    score, feedback = evaluate(SCENARIOS[0], "Password spray from 192.0.2.10")
    assert score == 50
    assert any(item.startswith("Missing:") for item in feedback)


def test_mobile_alert_is_generic_and_sent_after_incident(client, monkeypatch):
    api, token = client
    sent = []
    monkeypatch.setattr(main, "ALERT_URL", "https://alerts.example.test/topic")
    monkeypatch.setattr(main, "ALERT_BEARER_TOKEN", "test-value")

    def post(url, **kwargs):
        sent.append((url, kwargs))
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(main.httpx, "post", post)
    response = api.post("/api/simulations", headers={"Authorization": "Bearer " + token("alice")})
    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0][1]["content"] == "A new AEGIS-ID training incident is ready."
    assert sent[0][1]["headers"]["Authorization"].endswith("test-value")
