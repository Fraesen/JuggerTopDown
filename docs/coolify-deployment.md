# Coolify Deployment

JuggerTopDown kann in Coolify als Dockerfile-App oder als Docker-Compose-App betrieben werden. Der Container baut das Vite-Frontend, startet den Node-Server und liefert sowohl die App als auch den PvP-WebSocket unter derselben Domain aus.

## Schnellstart In Coolify

1. Neues Projekt in Coolify anlegen.
2. Repository als neue Ressource hinzufügen.
3. Deployment-Typ wählen:
   - **Dockerfile**: `Dockerfile` im Repository nutzen.
   - **Docker Compose**: `docker-compose.yml` im Repository nutzen.
4. Port auf `3000` setzen.
5. Healthcheck-Pfad auf `/healthz` setzen.
6. Domain zuweisen und HTTPS aktivieren.
7. Deploy starten.

Der WebSocket läuft unter:

```text
wss://<deine-domain>/ws/pvp
```

Da Frontend und WebSocket im selben Container und unter derselben Domain laufen, muss `VITE_PVP_WS_URL` im Normalfall nicht gesetzt werden.

## Environment Variablen

| Variable | Default | Bedeutung |
| --- | ---: | --- |
| `PORT` | `3000` | Interner HTTP/WebSocket-Port. In Coolify auf `3000` lassen. |
| `PVP_SETUP_MS` | `60000` | Initiale PvP-Teamsetup-Zeit vor Matchstart. |
| `PVP_START_DELAY_MS` | `800` | Kurzer gemeinsamer Startvorlauf nach Serverfreigabe. |
| `PVP_ROUND_BREAK_MS` | `30000` | Pause zwischen Zügen. Entspricht aktuell 20 Steinen. |
| `PVP_MAX_WS_PAYLOAD_BYTES` | `32768` | Maximale WebSocket-Nachrichtengröße. |
| `PVP_MAX_ROOMS` | `100` | Maximale Anzahl gleichzeitiger Räume. |
| `PVP_MAX_ROOMS_PER_ADDRESS` | `10` | Raumlimit pro IP-Adresse. |
| `PVP_MAX_SOCKETS_PER_ADDRESS` | `20` | Verbindungslimit pro IP-Adresse. |
| `PVP_ROOM_IDLE_MS` | `300000` | Ablaufzeit leerer/nicht gestarteter Räume. |
| `PVP_RATE_WINDOW_MS` | `10000` | Zeitfenster für WebSocket-Rate-Limits. |
| `PVP_MAX_MESSAGES_PER_WINDOW` | `80` | Maximale Nachrichten pro Rate-Limit-Fenster. |
| `PVP_MAX_CREATE_ROOMS_PER_WINDOW` | `8` | Maximale Raumerstellungen pro Rate-Limit-Fenster. |

## Lokaler Container-Test

Dockerfile:

```bash
docker build -t jugger-topdown .
docker run --rm -p 3000:3000 jugger-topdown
```

Docker Compose:

```bash
docker compose up --build
```

Danach:

```text
http://localhost:3000
http://localhost:3000/healthz
ws://localhost:3000/ws/pvp
```

## Hinweise Für Reverse Proxy Und WebSockets

- Coolify/Traefik muss WebSocket-Upgrades für `/ws/pvp` durchreichen. Bei gleicher Domain und Standard-Coolify-Proxy passiert das normalerweise automatisch.
- Die App erzeugt die WebSocket-URL aus der aktuellen Browser-URL: `https` wird zu `wss`, `http` zu `ws`.
- Wenn Frontend und WebSocket später getrennt gehostet werden, kann beim Build `VITE_PVP_WS_URL` gesetzt werden. Für das aktuelle Coolify-Setup ist das nicht nötig.

## Healthcheck

Der Server stellt `/healthz` bereit:

```json
{
  "ok": true,
  "rooms": 0,
  "sockets": 0,
  "uptimeSeconds": 12
}
```

Der Dockerfile-Container und `docker-compose.yml` enthalten einen Healthcheck gegen diesen Endpoint.
