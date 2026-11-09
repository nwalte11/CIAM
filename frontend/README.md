# AEGIS-ID frontend

React/Vite security operations dashboard. Requires the AEGIS API and a Keycloak server with realm `aegis` and public client `aegis-web` configured for the frontend origin and redirect URI.

```sh
npm ci
npm run dev
```

Set `VITE_KEYCLOAK_URL` (default `http://localhost:8080`) and `VITE_API_URL` (default `http://localhost:8000`) in the environment or a Vite `.env.local` file before starting Vite. These addresses are used by the browser; the API and Keycloak must allow the frontend origin via CORS.

Run `npm test` and `npm run build` to verify. For Compose, build using `frontend/Dockerfile` and expose container port 80. Vite configuration is embedded at build time, so provide `VITE_KEYCLOAK_URL` and `VITE_API_URL` as Docker build arguments when the defaults are unsuitable.

The overview polls every five seconds. Alerts require browser permission and are shown only while this page is in the foreground; they are not background push notifications. Incident traffic is simulated.
