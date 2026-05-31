# JuggerTopDown

JuggerTopDown ist ein kleiner Top-down-Jugger-Autobattler mit Bot-Matches, lokaler Aufstellungsverwaltung und optionalem PvP über einen Node-WebSocket-Server.

## Voraussetzungen

- Node.js 22 oder neuer
- npm
- Optional: Docker oder Docker Compose

## Installation

```bash
npm install
```

## Entwicklung

Frontend mit Vite starten:

```bash
npm run dev
```

Die App läuft standardmäßig unter `http://localhost:5173`.

Für PvP während der Entwicklung den Referenzserver parallel starten:

```bash
npm start
```

Der Vite-Devserver leitet `/ws/pvp` standardmäßig an `ws://localhost:3000/ws/pvp` weiter. Wenn der WebSocket-Server woanders läuft, kann `VITE_PVP_WS_URL` gesetzt werden.

## Tests und Build

```bash
npm test
npm run build
```

Optionaler UI-Smoke-Test:

```bash
npm run test:ui
```

## Produktion

Die Produktions-App wird gebaut und danach vom Node-Server aus `dist` ausgeliefert:

```bash
npm run build
npm start
```

Alternativ als kombinierter Befehl:

```bash
npm run serve:pvp
```

Der Server nutzt standardmäßig Port `3000` und stellt `/healthz` für Healthchecks bereit.

## Docker

```bash
docker build -t jugger-topdown .
docker run --rm -p 3000:3000 jugger-topdown
```

Mit Docker Compose:

```bash
docker compose up --build
```

## Konfiguration

Eine Vorlage liegt in `.env.example`.

- `HOST_PORT`: Host-Port für Docker Compose, Default `3000`.
- `VITE_PVP_WS_URL`: Optionaler WebSocket-Endpunkt für den Vite-Client.
- `PORT`: HTTP/WebSocket-Port des Node-Servers, Default `3000`.
- `PVP_SETUP_MS`: Dauer der Teamsetup-Phase.
- `PVP_START_DELAY_MS`: Vorlauf zwischen Matchfreigabe und lokalem Start.
- `PVP_ROUND_BREAK_MS`: Dauer der synchronisierten Pause zwischen zwei Zügen.
- `PVP_MAX_WS_PAYLOAD_BYTES`, `PVP_MAX_ROOMS`, `PVP_MAX_ROOMS_PER_ADDRESS`, `PVP_MAX_SOCKETS_PER_ADDRESS`, `PVP_ROOM_IDLE_MS`, `PVP_RATE_WINDOW_MS`, `PVP_MAX_MESSAGES_PER_WINDOW`, `PVP_MAX_CREATE_ROOMS_PER_WINDOW`: Limits für PvP-Räume, Payload-Größen und Rate-Limiting.

## Dokumentation

- [PvP WebSocket API](docs/pvp-websocket-api.md)
- [Coolify Deployment](docs/coolify-deployment.md)
- [Game Docs Draft](docs/game-docs-draft.md)

## Lizenz

MIT, siehe [LICENSE](LICENSE).
