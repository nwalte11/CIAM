# AEGIS-ID

AEGIS-ID is a local CIAM/SOC training lab. Keycloak protects a React dashboard
and Python API; PostgreSQL stores each trainee's incidents and reports. Scenarios
produce **synthetic records only**: no attack traffic is sent to Keycloak or
other systems. The detector alerts in those records are part of the exercise,
not a production intrusion detection system.

## Start the lab

Install Docker with Compose. In the repository root, create a local `.env`
file with two different, strong passwords (use URL-safe letters and numbers for
the database password):

```dotenv
POSTGRES_PASSWORD=choose-a-strong-database-password
KEYCLOAK_ADMIN_PASSWORD=choose-a-different-strong-admin-password
```

Run `docker compose up --build`, then open http://localhost:3000 and register
a trainee account. Keycloak's admin console is at http://localhost:8080
(username `admin`, password from `.env`). Start a simulation, inspect its
timeline, mark it contained, and submit an incident report. Your best score per
incident counts toward progression: two incidents averaging 60 unlock level 2;
four averaging 75 unlock level 3. Repeated submissions do not unlock levels.
Use `docker compose down` to stop, or `docker compose down -v` to also delete
all lab data and accounts.

The default configuration is for **local development only**: services bind to
loopback, Keycloak uses its development mode and embedded database, and HTTP is
not encrypted. Do not expose it directly to the internet or use real customer
data. Keycloak realm import occurs on first startup; remove the Keycloak volume
to reimport a changed realm.

## Adaptive exercises and evaluation

Each scenario has a fixed synthetic event timeline and evidence rubric. The
rule-based evaluator highlights missing evidence and suggested response steps;
it uses keyword matching, not semantic understanding, and its score is not a
professional assessment. The highest unlocked level is selected by default,
with variation among scenarios at that level.

Optionally set `AI_URL` to a trusted Ollama server reachable from the backend
container (for example `http://host.docker.internal:11434`, where supported) and
`AI_MODEL` to an installed model such as `llama3.2`. The model can select only
an allowed scenario at the unlocked level and provides optional, unverified
report coaching; the evidence-based score remains deterministic. If the model
is unavailable, the lab falls back to rules. Reports and synthetic evidence are
sent to the configured model server, so use only a trusted service.

## Alerts

The dashboard polls every five seconds and can show foreground browser
notifications after permission is granted. Background mobile push is optional:
subscribe a phone to a private, authenticated [ntfy](https://ntfy.sh/) topic,
then set `ALERT_URL` to its HTTPS publish URL and `ALERT_BEARER_TOKEN` to a
publish token in `.env`, and restart Compose. A generic message is sent after
an incident is saved; delivery failures are logged and do not roll it back.
This is a shared lab notification channel, not per-user delivery or guaranteed
delivery. Do not use a public topic for sensitive information. To open the
dashboard from a phone, deploy behind properly configured HTTPS and update the
Keycloak hostname, client redirect/origin settings, CORS, and frontend URLs;
the provided loopback-only setup cannot be reached from another device.

## Development

Backend tests: `cd backend && python -m pip install -r requirements-test.txt &&
python -m pytest -q`. Frontend build instructions are in `frontend/README.md`.
The API validates Keycloak access-token signature, issuer, audience and expiry;
incident and report access is scoped to the token subject.
