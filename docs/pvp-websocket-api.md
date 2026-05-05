# PvP WebSocket API

Diese API ist für Raw-JSON-over-WebSocket gedacht. Der Client verbindet sich direkt mit:

```text
ws://<host>/ws/pvp
```

Bei HTTPS wird entsprechend `wss://<host>/ws/pvp` verwendet. Raumcodes werden serverseitig erzeugt und bestehen aus genau 5 Zeichen aus `A-Z0-9`.

## Grundregeln

- Jede Nachricht ist ein JSON-Objekt mit `type`.
- Client-Nachrichten enthalten ein `requestId`.
- Server-Broadcasts enthalten, wo Reihenfolge relevant ist, ein monotones `serverSeq`.
- Server-Nachrichten enthalten `serverTime` als Unix-Zeit in Millisekunden. Clients nutzen das, um `setupEndsAt`, `startAt` und `breakEndsAt` auf lokale Zeit umzurechnen.
- Clients ignorieren Broadcasts mit `serverSeq <= lastServerSeq`.
- PvP ist deterministisch-clientseitig: Der Server verteilt Seed, Teamzuordnung, finale Team-Konfigurationen und die Startfreigabe; beide Clients simulieren danach lokal.
- Der Server ist autoritativ für Raumstatus, Anzahl der verbundenen Personen, Teamwahl, Sequenzierung, Matchstart und Zugpausen-Timing.

## Referenz-Server

Dieses Repository enthält einen Node-Referenzserver in `server/index.js`. Er liefert die gebaute App aus `dist` aus und stellt denselben Endpoint unter `/ws/pvp` bereit.

```bash
npm run serve:pvp
```

In der Vite-Entwicklung kann der Server parallel laufen:

```bash
npm start
npm run dev
```

Der Vite-Devserver proxyt `/ws/pvp` dabei zu `ws://localhost:3000/ws/pvp`.

Für Deployments:

```bash
npm install
npm run build
npm start
```

Docker:

```bash
docker build -t jugger-pvp .
docker run -p 3000:3000 jugger-pvp
```

Konfiguration per Environment:

- `PORT`: HTTP/WebSocket-Port, Default `3000`.
- `PVP_SETUP_MS`: Dauer der Teamsetup-Phase, Default `60000`.
- `PVP_START_DELAY_MS`: Vorlauf zwischen `match_start` und lokalem Start, Default `800`.
- `PVP_ROUND_BREAK_MS`: Dauer der synchronisierten Pause zwischen zwei Zügen, Default `30000` (20 Steine).
- `VITE_PVP_WS_URL`: optional für Vite-Dev-Clients, wenn der WebSocket-Server nicht auf demselben Host wie der Frontend-Devserver läuft.

## Gemeinsame Typen

```json
{
  "team": "blue",
  "version": 4,
  "skills": [
    { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
    { "technik": 2, "geschwindigkeit": 3, "wahrnehmung": 1 },
    { "technik": 4, "geschwindigkeit": 1, "wahrnehmung": 1 },
    { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
    { "technik": 3, "geschwindigkeit": 2, "wahrnehmung": 1 }
  ],
  "positions": [0, 1, 2, 3, 4],
  "loadout": ["runner", "shield", "qtip", "staff", "chain"],
  "playerStrategies": ["direct_jugg", "flank", "none", "none", "flank"],
  "teamStrategy": "standard"
}
```

`skills`, `positions`, `loadout` und `playerStrategies` müssen immer die vollen 5 Spielenden enthalten. Jede spielende Person hat genau 6 Skillpunkte verteilt auf `technik`, `geschwindigkeit` und `wahrnehmung`.

### Team-Config Werte

- `team`: `blue` oder `red`.
- `positions`: Index `0` ist immer die Läufer:in und bleibt `0`. Die Indizes `1-4` sind die vier Pompfer:innen-Slots und müssen eine eindeutige Permutation aus `1, 2, 3, 4` sein.
- `loadout`: Index `0` ist immer `runner`. Indizes `1-4` erlauben `shield`, `qtip`, `staff` oder `chain`. Pro Team darf höchstens eine `chain` in den vier Pompfer:innen-Slots vorkommen.
- `playerStrategies`: Index `0` ist die Läufer:innenstrategie und erlaubt `wide_middle` (`Breite Mitte`) oder `direct_jugg` (`Direkt zum Jugg`). Indizes `1-4` sind Pompfer:innenstrategien und erlauben `none` (`Keine`) oder `flank` (`Umlaufen`).
- `teamStrategy`: `standard`, `wide_line`, `top_defense` oder `bottom_defense`.

## Client Zu Server

### `create_room`

```json
{
  "type": "create_room",
  "requestId": "client-1",
  "isPublic": true
}
```

Erzeugt einen Raum. `isPublic` ist optional. Wenn `true`, wird der Raum in der oeffentlichen Raumliste angezeigt, solange er in der Lobby ist und noch nicht voll ist. Der Server antwortet mit `room_created`.

### `list_public_rooms`

```json
{
  "type": "list_public_rooms",
  "requestId": "client-2"
}
```

Fordert die aktuelle Liste oeffentlicher Lobby-Raeume an. Der Server sendet ausserdem automatisch `public_rooms`, wenn sich die Liste aendert.

### `join_room`

```json
{
  "type": "join_room",
  "requestId": "client-2",
  "roomCode": "A1B2C"
}
```

Tritt einem Raum bei. Bei Fehlern sendet der Server `join_failed`.

### `select_team`

```json
{
  "type": "select_team",
  "requestId": "client-3",
  "team": "red"
}
```

Wählt oder tauscht die lokale Farbe. Falls beide Personen dieselbe Farbe wollen, entscheidet der Server und broadcastet den finalen Zustand mit `team_selected` oder `room_state`.

### `team_config_update`

```json
{
  "type": "team_config_update",
  "requestId": "client-4",
  "config": {
    "team": "blue",
    "version": 5,
    "skills": [
      { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
      { "technik": 2, "geschwindigkeit": 3, "wahrnehmung": 1 },
      { "technik": 4, "geschwindigkeit": 1, "wahrnehmung": 1 },
      { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
      { "technik": 3, "geschwindigkeit": 2, "wahrnehmung": 1 }
    ],
    "positions": [0, 1, 2, 3, 4],
    "loadout": ["runner", "shield", "qtip", "staff", "chain"],
    "playerStrategies": ["direct_jugg", "flank", "none", "none", "flank"],
    "teamStrategy": "standard"
  }
}
```

Der Server validiert Team-Besitz und Version. Akzeptierte Updates werden als `team_config_changed` an beide Clients gesendet. In der initialen Setup-Phase dürfen Skillung, Pompfen, Positionen und Strategien geändert werden. Nach Matchstart bleibt die Skillung gesperrt; Pompfenwahl, Positionen und Strategien dürfen zwischen den Zügen weiter geändert werden.

### `leave_room`

```json
{
  "type": "leave_room",
  "requestId": "client-5"
}
```

Verlässt den Raum. Der Server informiert die andere Person mit `player_left`.

### `ping`

```json
{
  "type": "ping",
  "requestId": "client-6",
  "clientTime": 1777833000000
}
```

Optionaler Keepalive. Antwort: `pong`.

### `round_break_report`

```json
{
  "type": "round_break_report",
  "requestId": "client-7",
  "roundId": 1,
  "label": "Blau punktet",
  "score": { "blue": 1, "red": 0 }
}
```

Meldet ein lokal erkanntes Zugende an den Server. Der Server broadcastet daraufhin `round_break_started` mit einem gemeinsamen `breakEndsAt`. Falls ein anderer Client denselben Zug bereits gemeldet hat, sendet der Server den bereits festgelegten Pausen-Zeitpunkt erneut.

## Server Zu Client

### `room_created`

```json
{
  "type": "room_created",
  "serverSeq": 1,
  "roomCode": "A1B2C",
  "isPublic": true,
  "playerId": "p1",
  "localTeam": "blue",
  "players": [
    { "playerId": "p1", "team": "blue", "connected": true }
  ],
  "teamConfigs": []
}
```

### `join_failed`

```json
{
  "type": "join_failed",
  "code": "room_not_found",
  "message": "Der Raum wurde nicht gefunden."
}
```

Empfohlene Codes: `room_not_found`, `room_full`, `match_already_started`, `invalid_code`.

### `room_state`

```json
{
  "type": "room_state",
  "serverSeq": 2,
  "roomCode": "A1B2C",
  "playerId": "p2",
  "localTeam": "red",
  "players": [
    { "playerId": "p1", "team": "blue", "connected": true },
    { "playerId": "p2", "team": "red", "connected": true }
  ],
  "teamConfigs": []
}
```

Snapshot des aktuellen Raums. Kann nach Join, Reconnect oder Teamwechsel gesendet werden.

### `public_rooms`

```json
{
  "type": "public_rooms",
  "rooms": [
    {
      "roomCode": "A1B2C",
      "players": 1,
      "maxPlayers": 2,
      "createdAt": 1777833000000
    }
  ]
}
```

Liste oeffentlicher Raeume, denen direkt beigetreten werden kann. Enthalten sind nur Lobby-Raeume mit freiem Platz; Raeume verschwinden bei Start der Setup-Phase, bei Ablauf oder wenn sie voll sind.

### `player_joined` / `player_left`

```json
{
  "type": "player_joined",
  "serverSeq": 3,
  "playerId": "p2",
  "players": [
    { "playerId": "p1", "team": "blue", "connected": true },
    { "playerId": "p2", "team": "red", "connected": true }
  ]
}
```

`player_left` nutzt dieselbe Struktur und setzt die verlassende Person auf `connected: false` oder entfernt sie aus `players`.

### `team_selected`

Optionales Event für Server, die Teamwechsel als eigenes Event broadcasten. Der Referenzserver in diesem Repository sendet nach Teamwechseln stattdessen einen vollständigen `room_state`.

```json
{
  "type": "team_selected",
  "serverSeq": 4,
  "playerId": "p2",
  "team": "red",
  "players": [
    { "playerId": "p1", "team": "blue", "connected": true },
    { "playerId": "p2", "team": "red", "connected": true }
  ]
}
```

### `team_config_changed`

```json
{
  "type": "team_config_changed",
  "serverSeq": 5,
  "config": {
    "team": "red",
    "version": 3,
    "skills": [
      { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
      { "technik": 2, "geschwindigkeit": 3, "wahrnehmung": 1 },
      { "technik": 4, "geschwindigkeit": 1, "wahrnehmung": 1 },
      { "technik": 2, "geschwindigkeit": 2, "wahrnehmung": 2 },
      { "technik": 3, "geschwindigkeit": 2, "wahrnehmung": 1 }
    ],
    "positions": [0, 1, 2, 3, 4],
    "loadout": ["runner", "shield", "qtip", "staff", "chain"],
    "playerStrategies": ["direct_jugg", "flank", "none", "none", "flank"],
    "teamStrategy": "standard"
  }
}
```

Der Client wendet nur Updates an, deren `version` nicht älter als die lokal bekannte Team-Version ist.

### `setup_started`

```json
{
  "type": "setup_started",
  "serverSeq": 6,
  "setupEndsAt": 1777833060000,
  "durationMs": 60000,
  "localTeam": "blue",
  "teamConfigs": []
}
```

Startet die 60-Sekunden-Teamsetup-Phase. `setupEndsAt` ist Unix-Zeit in Millisekunden.

### `match_start`

```json
{
  "type": "match_start",
  "serverSeq": 7,
  "seed": "A1B2C-1777833020",
  "startAt": 1777833020500,
  "roundId": 1,
  "localTeam": "blue",
  "teamConfigs": []
}
```

`teamConfigs` muss die finalen Konfigurationen beider Teams enthalten. Der Client setzt den Seed, wendet die Konfigurationen an und startet lokal die deterministische Simulation.

### `round_break_started`

```json
{
  "type": "round_break_started",
  "serverSeq": 8,
  "roundId": 1,
  "nextRoundId": 2,
  "label": "Blau punktet",
  "score": { "blue": 1, "red": 0 },
  "breakStartedAt": 1777833040000,
  "breakEndsAt": 1777833055000
}
```

Synchronisiert Zugende und nächsten Zugstart. Beide Clients setzen ihre Zugpause auf denselben `breakEndsAt`-Zeitpunkt. Der Client darf während dieser Pause Aufstellung/Strategie ändern; die letzten drei Steine bleiben gesperrt.

### `error`

```json
{
  "type": "error",
  "code": "invalid_team",
  "message": "Dieses Team ist nicht verfügbar."
}
```

### `pong`

```json
{
  "type": "pong",
  "serverTime": 1777833000100
}
```
