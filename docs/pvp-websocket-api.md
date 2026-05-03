# PvP WebSocket API

Diese API ist fuer Raw-JSON-over-WebSocket gedacht. Der Client verbindet sich direkt mit:

```text
ws://<host>/ws/pvp
```

Bei HTTPS wird entsprechend `wss://<host>/ws/pvp` verwendet. Raumcodes werden serverseitig erzeugt und bestehen aus genau 5 Zeichen aus `A-Z0-9`.

## Grundregeln

- Jede Nachricht ist ein JSON-Objekt mit `type`.
- Client-Nachrichten enthalten ein `requestId`.
- Server-Broadcasts enthalten, wo Reihenfolge relevant ist, ein monotones `serverSeq`.
- Clients ignorieren Broadcasts mit `serverSeq <= lastServerSeq`.
- PvP ist deterministisch-clientseitig: Der Server verteilt Seed, Teamzuordnung, finale Team-Konfigurationen und die Startfreigabe; beide Clients simulieren danach lokal.
- Der Server ist autoritativ fuer Raumstatus, Spielerzahl, Teamwahl, Sequenzierung und Matchstart.

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

`skills`, `positions`, `loadout` und `playerStrategies` muessen immer die vollen 5 Spieler enthalten. Jeder Spieler hat genau 6 Skillpunkte verteilt auf `technik`, `geschwindigkeit` und `wahrnehmung`.

### Team-Config Werte

- `team`: `blue` oder `red`.
- `positions`: Index `0` ist immer der Laeufer und bleibt `0`. Die Indizes `1-4` sind die vier Pompfer-Slots und muessen eine eindeutige Permutation aus `1, 2, 3, 4` sein.
- `loadout`: Index `0` ist immer `runner`. Indizes `1-4` erlauben `shield`, `qtip`, `staff` oder `chain`. Pro Team darf hoechstens eine `chain` in den vier Pompfer-Slots vorkommen.
- `playerStrategies`: Index `0` ist die Laeuferstrategie und erlaubt `wide_middle` (`Breite Mitte`) oder `direct_jugg` (`Direkt zum Jugg`). Indizes `1-4` sind Pompferstrategien und erlauben `none` (`Keine`) oder `flank` (`Umlaufen`).
- `teamStrategy`: `standard`, `wide_line`, `top_defense` oder `bottom_defense`.

## Client Zu Server

### `create_room`

```json
{
  "type": "create_room",
  "requestId": "client-1"
}
```

Erzeugt einen Raum. Der Server antwortet mit `room_created`.

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

Waehlt oder tauscht die lokale Farbe. Falls beide Spieler dieselbe Farbe wollen, entscheidet der Server und broadcastet den finalen Zustand mit `team_selected` oder `room_state`.

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

Der Server validiert Team-Besitz und Version. Akzeptierte Updates werden als `team_config_changed` an beide Clients gesendet.

### `leave_room`

```json
{
  "type": "leave_room",
  "requestId": "client-5"
}
```

Verlaesst den Raum. Der Server informiert den anderen Spieler mit `player_left`.

### `ping`

```json
{
  "type": "ping",
  "requestId": "client-6",
  "clientTime": 1777833000000
}
```

Optionaler Keepalive. Antwort: `pong`.

## Server Zu Client

### `room_created`

```json
{
  "type": "room_created",
  "serverSeq": 1,
  "roomCode": "A1B2C",
  "playerId": "p1",
  "localTeam": "blue",
  "players": [
    { "playerId": "p1", "team": "blue", "connected": true }
  ]
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

`player_left` nutzt dieselbe Struktur und setzt den verlassenen Spieler auf `connected: false` oder entfernt ihn aus `players`.

### `team_selected`

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

Der Client wendet nur Updates an, deren `version` nicht aelter als die lokal bekannte Team-Version ist.

### `setup_started`

```json
{
  "type": "setup_started",
  "serverSeq": 6,
  "setupEndsAt": 1777833020000,
  "durationMs": 20000,
  "localTeam": "blue",
  "teamConfigs": []
}
```

Startet die 20-Sekunden-Teamsetup-Phase. `setupEndsAt` ist Unix-Zeit in Millisekunden.

### `match_start`

```json
{
  "type": "match_start",
  "serverSeq": 7,
  "seed": "A1B2C-1777833020",
  "startAt": 1777833020500,
  "localTeam": "blue",
  "teamConfigs": []
}
```

`teamConfigs` muss die finalen Konfigurationen beider Teams enthalten. Der Client setzt den Seed, wendet die Konfigurationen an und startet lokal die deterministische Simulation.

### `error`

```json
{
  "type": "error",
  "code": "invalid_team",
  "message": "Dieses Team ist nicht verfuegbar."
}
```

### `pong`

```json
{
  "type": "pong",
  "serverTime": 1777833000100
}
```
