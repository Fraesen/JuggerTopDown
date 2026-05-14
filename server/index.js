import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')
const port = Number(process.env.PORT || 3000)
const setupDurationMs = Number(process.env.PVP_SETUP_MS || 60_000)
const matchStartDelayMs = Number(process.env.PVP_START_DELAY_MS || 800)
const roundBreakDurationMs = Number(process.env.PVP_ROUND_BREAK_MS || 30_000)
const roomCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const roomCodeLength = 5
const matchPoint = 3
const maxWsPayloadBytes = Number(process.env.PVP_MAX_WS_PAYLOAD_BYTES || 32 * 1024)
const maxRooms = Number(process.env.PVP_MAX_ROOMS || 100)
const maxRoomsPerAddress = Number(process.env.PVP_MAX_ROOMS_PER_ADDRESS || 10)
const maxSocketsPerAddress = Number(process.env.PVP_MAX_SOCKETS_PER_ADDRESS || 20)
const roomIdleMs = Number(process.env.PVP_ROOM_IDLE_MS || 5 * 60_000)
const rateWindowMs = Number(process.env.PVP_RATE_WINDOW_MS || 10_000)
const maxMessagesPerWindow = Number(process.env.PVP_MAX_MESSAGES_PER_WINDOW || 80)
const maxCreateRoomsPerWindow = Number(process.env.PVP_MAX_CREATE_ROOMS_PER_WINDOW || 8)
const skillKeys = ['technik', 'geschwindigkeit', 'wahrnehmung']
const pompfenOptions = ['shield', 'longpompfe', 'qtip', 'staff', 'chain']
const runnerStrategies = ['wide_middle', 'direct_jugg']
const pompferStrategies = ['none', 'flank']
const teamStrategies = ['standard', 'wide_line', 'top_defense', 'bottom_defense']

const defaultSkills = [
  { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
  { technik: 2, geschwindigkeit: 3, wahrnehmung: 1 },
  { technik: 4, geschwindigkeit: 1, wahrnehmung: 1 },
  { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
  { technik: 3, geschwindigkeit: 2, wahrnehmung: 1 },
]
const defaultPositions = [0, 1, 2, 3, 4]
const defaultLoadout = ['runner', 'shield', 'qtip', 'staff', 'chain']
const defaultPlayerStrategies = ['wide_middle', 'none', 'none', 'none', 'none']

const rooms = new Map()
const sockets = new Map()

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname === '/healthz') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    })
    response.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      sockets: sockets.size,
      uptimeSeconds: Math.round(process.uptime()),
    }))
    return
  }

  if (request.url?.startsWith('/ws/pvp')) {
    response.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('WebSocket upgrade required.')
    return
  }
  await serveStatic(request, response)
})

const wss = new WebSocketServer({ noServer: true, maxPayload: maxWsPayloadBytes })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname !== '/ws/pvp') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws) => {
  ws.meta = {
    address: ws._socket?.remoteAddress ?? 'unknown',
    windowStartedAt: Date.now(),
    messageCount: 0,
    createRoomCount: 0,
  }
  if (socketsByAddress(ws.meta.address).length > maxSocketsPerAddress) {
    closeWithError(ws, 'too_many_connections', 'Zu viele Verbindungen von dieser Adresse.')
    return
  }
  sendPublicRooms(ws)
  ws.on('message', (data) => handleMessage(ws, data))
  ws.on('close', () => handleDisconnect(ws))
  ws.on('error', () => handleDisconnect(ws))
})

server.listen(port, () => {
  console.log(`Jugger PvP server listening on http://localhost:${port}`)
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws/pvp`)
})

async function serveStatic(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  const filePath = resolve(join(distDir, safePath))

  if (!filePath.startsWith(distDir)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  const resolvedFile = await readableFile(filePath)
  const fallbackFile = resolvedFile ?? (await readableFile(join(distDir, 'index.html')))
  if (!fallbackFile) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Build missing. Run "npm run build" before "npm start", or use "npm run serve:pvp".')
    return
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(fallbackFile)] ?? 'application/octet-stream' })
  createReadStream(fallbackFile).pipe(response)
}

async function readableFile(filePath) {
  if (!existsSync(filePath)) return null
  const fileStat = await stat(filePath).catch(() => null)
  return fileStat?.isFile() ? filePath : null
}

function handleMessage(ws, data) {
  if (!consumeRateLimit(ws)) {
    closeWithError(ws, 'rate_limited', 'Zu viele Nachrichten.')
    return
  }

  if (byteLength(data) > maxWsPayloadBytes) {
    closeWithError(ws, 'message_too_large', 'Die Nachricht ist zu gross.')
    return
  }

  let message
  try {
    message = JSON.parse(data.toString())
  } catch {
    send(ws, { type: 'error', code: 'invalid_json', message: 'Ungueltige JSON-Nachricht.' })
    return
  }

  switch (message.type) {
    case 'create_room':
      createRoom(ws, message)
      break
    case 'list_public_rooms':
      sendPublicRooms(ws)
      break
    case 'join_room':
      joinRoom(ws, message.roomCode)
      break
    case 'leave_room':
      leaveRoom(ws)
      break
    case 'select_team':
      selectTeam(ws, message.team)
      break
    case 'team_config_update':
      updateTeamConfig(ws, message.config)
      break
    case 'round_break_report':
      reportRoundBreak(ws, message)
      break
    case 'ping':
      send(ws, { type: 'pong', clientTime: message.clientTime })
      break
    default:
      send(ws, { type: 'error', code: 'unknown_type', message: `Unbekannter Nachrichtentyp: ${message.type}` })
      break
  }
}

function createRoom(ws, message = {}) {
  if (!consumeCreateRoomLimit(ws)) {
    send(ws, { type: 'error', code: 'rate_limited', message: 'Zu viele Raeume in kurzer Zeit.' })
    return
  }
  if (rooms.size >= maxRooms) {
    send(ws, { type: 'error', code: 'server_full', message: 'Der PvP-Server ist gerade voll.' })
    return
  }
  if (roomsByAddress(ws.meta?.address).length >= maxRoomsPerAddress) {
    send(ws, { type: 'error', code: 'too_many_rooms', message: 'Zu viele offene Raeume von dieser Adresse.' })
    return
  }

  leaveRoom(ws, { silent: true })
  const room = {
    code: createUniqueRoomCode(),
    createdAt: Date.now(),
    phase: 'lobby',
    serverSeq: 0,
    matchCounter: 0,
    roundId: 1,
    roundBreak: null,
    roundBreakReports: new Map(),
    score: { blue: 0, red: 0 },
    isPublic: Boolean(message.isPublic),
    setupEndsAt: null,
    setupTimer: null,
    idleTimer: null,
    ownerAddress: ws.meta?.address ?? 'unknown',
    players: [],
    teamConfigs: {
      blue: createDefaultTeamConfig('blue'),
      red: createDefaultTeamConfig('red'),
    },
  }
  rooms.set(room.code, room)
  scheduleRoomIdleCleanup(room)

  const player = attachPlayer(ws, room, 'blue')
  send(ws, {
    type: 'room_created',
    serverSeq: nextSeq(room),
    roomCode: room.code,
    playerId: player.playerId,
    localTeam: player.team,
    players: publicPlayers(room),
    isPublic: room.isPublic,
    teamConfigs: teamConfigs(room),
  })
  broadcastPublicRooms()
}

function joinRoom(ws, roomCode) {
  const normalizedCode = String(roomCode ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{5}$/.test(normalizedCode)) {
    send(ws, { type: 'join_failed', code: 'invalid_code', message: 'Der Raumcode ist ungueltig.' })
    return
  }
  const room = rooms.get(normalizedCode)
  if (!room) {
    send(ws, { type: 'join_failed', code: 'room_not_found', message: 'Der Raum wurde nicht gefunden.' })
    return
  }
  if (room.phase === 'match') {
    send(ws, { type: 'join_failed', code: 'match_already_started', message: 'Das Match laeuft bereits.' })
    return
  }
  if (connectedPlayers(room).length >= 2) {
    send(ws, { type: 'join_failed', code: 'room_full', message: 'Der Raum ist voll.' })
    return
  }

  leaveRoom(ws, { silent: true })
  attachPlayer(ws, room, availableTeam(room))
  broadcastRoomState(room, 'player_joined')
  broadcastPublicRooms()
  if (connectedPlayers(room).length === 2 && room.phase === 'lobby') startSetup(room)
}

function leaveRoom(ws, options = {}) {
  const player = sockets.get(ws)
  if (!player) return
  const room = player.room
  sockets.delete(ws)
  player.connected = false
  player.socket = null

  if (!options.silent) {
    broadcastRoomState(room, 'player_left')
  }

  if (connectedPlayers(room).length === 0) {
    deleteRoom(room)
  } else if (room.phase !== 'match') {
    scheduleRoomIdleCleanup(room)
  }
  broadcastPublicRooms()
}

function handleDisconnect(ws) {
  leaveRoom(ws)
}

function selectTeam(ws, team) {
  const player = sockets.get(ws)
  if (!player) {
    send(ws, { type: 'error', code: 'not_in_room', message: 'Du bist in keinem Raum.' })
    return
  }
  const room = player.room
  if (room.phase === 'match') {
    send(ws, { type: 'error', code: 'match_already_started', message: 'Die Teamwahl ist im Match gesperrt.' })
    return
  }
  if (!['blue', 'red'].includes(team)) {
    send(ws, { type: 'error', code: 'invalid_team', message: 'Dieses Team ist nicht verfuegbar.' })
    return
  }

  const other = connectedPlayers(room).find((candidate) => candidate !== player)
  if (other?.team === team) {
    other.team = player.team
  }
  player.team = team
  broadcastRoomState(room)
}

function updateTeamConfig(ws, config) {
  const player = sockets.get(ws)
  if (!player) {
    send(ws, { type: 'error', code: 'not_in_room', message: 'Du bist in keinem Raum.' })
    return
  }
  const room = player.room
  if (config?.team !== player.team) {
    send(ws, { type: 'error', code: 'team_not_owned', message: 'Du kannst nur dein eigenes Team konfigurieren.' })
    return
  }

  const current = room.teamConfigs[player.team]
  const incomingVersion = Number.isFinite(Number(config.version)) ? Number(config.version) : 0
  if (incomingVersion < current.version) {
    send(ws, { type: 'error', code: 'stale_config', message: 'Diese Team-Konfiguration ist veraltet.' })
    return
  }

  const normalizedConfig = normalizeTeamConfig(config, current, {
    allowSkills: room.phase !== 'match',
    allowLoadout: true,
  })
  room.teamConfigs[player.team] = normalizedConfig
  broadcast(room, { type: 'team_config_changed', serverSeq: nextSeq(room), config: normalizedConfig })
}

function startSetup(room) {
  room.phase = 'setup'
  room.setupEndsAt = Date.now() + setupDurationMs
  broadcastSetupStarted(room)
  broadcastPublicRooms()
  clearTimeout(room.idleTimer)
  clearTimeout(room.setupTimer)
  room.setupTimer = setTimeout(() => startMatch(room), setupDurationMs)
}

function startMatch(room) {
  if (connectedPlayers(room).length < 2) return
  room.phase = 'match'
  room.matchCounter += 1
  room.roundId = 1
  room.roundBreak = null
  room.roundBreakReports.clear()
  room.score = { blue: 0, red: 0 }
  clearTimeout(room.idleTimer)
  const startAt = Date.now() + matchStartDelayMs
  const seed = `${room.code}-${room.createdAt}-${room.matchCounter}`
  for (const player of connectedPlayers(room)) {
    send(player.socket, {
      type: 'match_start',
      serverSeq: nextSeq(room),
      seed,
      startAt,
      roundId: room.roundId,
      localTeam: player.team,
      teamConfigs: teamConfigs(room),
    })
  }
}

function reportRoundBreak(ws, message) {
  const player = sockets.get(ws)
  if (!player) {
    send(ws, { type: 'error', code: 'not_in_room', message: 'Du bist in keinem Raum.' })
    return
  }
  const room = player.room
  if (room.phase !== 'match') return
  const roundId = Number(message.roundId)

  if (room.roundBreak && roundId <= room.roundBreak.roundId) {
    send(ws, roundBreakMessage(room, room.roundBreak))
    return
  }

  if (!Number.isInteger(roundId) || roundId !== room.roundId) {
    send(ws, { type: 'error', code: 'invalid_round', message: 'Der Zug passt nicht zum Serverstand.' })
    return
  }

  const connected = connectedPlayers(room)
  if (connected.length < 2) {
    send(ws, { type: 'error', code: 'opponent_missing', message: 'Die zweite Person ist nicht verbunden.' })
    return
  }

  const score = normalizeScore(message.score)
  const scoringTeam = validScoreProgress(room.score, score)
  if (!scoringTeam) {
    send(ws, { type: 'error', code: 'invalid_score', message: 'Der gemeldete Punkt passt nicht zum Serverstand.' })
    return
  }

  room.roundBreakReports.set(player.playerId, { roundId, score, scoringTeam })
  if (room.roundBreakReports.size < connected.length) {
    send(ws, { type: 'round_break_pending', serverSeq: nextSeq(room), roundId })
    return
  }

  const reports = [...room.roundBreakReports.values()]
  if (!reports.every((report) => report.roundId === roundId && scoresEqual(report.score, score))) {
    room.roundBreakReports.clear()
    broadcast(room, {
      type: 'error',
      code: 'round_break_mismatch',
      message: 'Die Punktmeldungen stimmen nicht ueberein. Der Zug wird nicht serverseitig fortgesetzt.',
    })
    return
  }

  const now = Date.now()
  const roundBreak = {
    roundId,
    nextRoundId: roundId + 1,
    label: `${teamName(scoringTeam)} punktet`,
    score,
    breakStartedAt: now,
    breakEndsAt: now + roundBreakDurationMs,
  }
  room.roundId = roundBreak.nextRoundId
  room.roundBreak = roundBreak
  room.score = { ...score }
  room.roundBreakReports.clear()
  broadcast(room, roundBreakMessage(room, roundBreak))
}

function roundBreakMessage(room, roundBreak) {
  return {
    type: 'round_break_started',
    serverSeq: nextSeq(room),
    roundId: roundBreak.roundId,
    nextRoundId: roundBreak.nextRoundId,
    label: roundBreak.label,
    score: roundBreak.score,
    breakStartedAt: roundBreak.breakStartedAt,
    breakEndsAt: roundBreak.breakEndsAt,
  }
}

function broadcastSetupStarted(room) {
  for (const player of connectedPlayers(room)) {
    send(player.socket, {
      type: 'setup_started',
      serverSeq: nextSeq(room),
      setupEndsAt: room.setupEndsAt,
      durationMs: setupDurationMs,
      localTeam: player.team,
      teamConfigs: teamConfigs(room),
    })
  }
}

function broadcastRoomState(room, type = 'room_state') {
  for (const player of connectedPlayers(room)) {
    send(player.socket, {
      type,
      serverSeq: nextSeq(room),
      roomCode: room.code,
      playerId: player.playerId,
      localTeam: player.team,
      players: publicPlayers(room),
      isPublic: room.isPublic,
      teamConfigs: teamConfigs(room),
    })
  }
}

function broadcast(room, message) {
  for (const player of connectedPlayers(room)) {
    send(player.socket, message)
  }
}

function send(ws, message) {
  if (!ws || ws.readyState !== 1) return
  ws.send(JSON.stringify({ serverTime: Date.now(), ...message }))
}

function sendPublicRooms(ws) {
  send(ws, { type: 'public_rooms', rooms: publicRoomSummaries() })
}

function broadcastPublicRooms() {
  const message = { type: 'public_rooms', rooms: publicRoomSummaries() }
  for (const client of wss.clients) {
    send(client, message)
  }
}

function publicRoomSummaries() {
  return [...rooms.values()]
    .filter((room) => room.isPublic && room.phase === 'lobby' && connectedPlayers(room).length < 2)
    .map((room) => ({
      roomCode: room.code,
      players: connectedPlayers(room).length,
      maxPlayers: 2,
      createdAt: room.createdAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function closeWithError(ws, code, message) {
  send(ws, { type: 'error', code, message })
  ws.close(1008, code)
}

function attachPlayer(ws, room, team) {
  const player = {
    playerId: `p${room.players.length + 1}`,
    room,
    socket: ws,
    team,
    connected: true,
  }
  room.players.push(player)
  sockets.set(ws, player)
  return player
}

function connectedPlayers(room) {
  return room.players.filter((player) => player.connected && player.socket?.readyState === 1)
}

function socketsByAddress(address) {
  return [...wss.clients].filter((client) => client.readyState === 1 && client.meta?.address === address)
}

function roomsByAddress(address) {
  return [...rooms.values()].filter(
    (room) => room.ownerAddress === address || connectedPlayers(room).some((player) => player.socket?.meta?.address === address),
  )
}

function byteLength(data) {
  if (typeof data === 'string') return Buffer.byteLength(data)
  if (Buffer.isBuffer(data)) return data.length
  if (Array.isArray(data)) return data.reduce((sum, chunk) => sum + byteLength(chunk), 0)
  if (data instanceof ArrayBuffer) return data.byteLength
  return Buffer.byteLength(String(data))
}

function consumeRateLimit(ws) {
  const meta = ws.meta
  if (!meta) return true
  const now = Date.now()
  if (now - meta.windowStartedAt > rateWindowMs) {
    meta.windowStartedAt = now
    meta.messageCount = 0
    meta.createRoomCount = 0
  }
  meta.messageCount += 1
  return meta.messageCount <= maxMessagesPerWindow
}

function consumeCreateRoomLimit(ws) {
  const meta = ws.meta
  if (!meta) return true
  meta.createRoomCount += 1
  return meta.createRoomCount <= maxCreateRoomsPerWindow
}

function scheduleRoomIdleCleanup(room) {
  clearTimeout(room.idleTimer)
  room.idleTimer = setTimeout(() => expireRoom(room), roomIdleMs)
}

function expireRoom(room) {
  if (!rooms.has(room.code) || room.phase === 'match') return
  for (const player of room.players) {
    send(player.socket, { type: 'error', code: 'room_expired', message: 'Der Raum wurde wegen Inaktivitaet geschlossen.' })
    sockets.delete(player.socket)
    player.connected = false
    player.socket?.close(1000, 'room_expired')
    player.socket = null
  }
  deleteRoom(room)
}

function deleteRoom(room) {
  clearTimeout(room.setupTimer)
  clearTimeout(room.idleTimer)
  rooms.delete(room.code)
  broadcastPublicRooms()
}

function publicPlayers(room) {
  return room.players.map((player) => ({
    playerId: player.playerId,
    team: player.team,
    connected: player.connected,
  }))
}

function teamConfigs(room) {
  return [cloneConfig(room.teamConfigs.blue), cloneConfig(room.teamConfigs.red)]
}

function availableTeam(room) {
  const taken = new Set(connectedPlayers(room).map((player) => player.team))
  return taken.has('blue') ? 'red' : 'blue'
}

function createDefaultTeamConfig(team) {
  return {
    team,
    version: 0,
    skills: defaultSkills.map((skill) => ({ ...skill })),
    positions: [...defaultPositions],
    loadout: [...defaultLoadout],
    playerStrategies: [...defaultPlayerStrategies],
    teamStrategy: 'standard',
  }
}

function normalizeTeamConfig(config, fallback, { allowSkills = true, allowLoadout = true } = {}) {
  return {
    team: fallback.team,
    version: Number.isFinite(Number(config.version)) ? Number(config.version) : fallback.version,
    skills: allowSkills ? Array.from({ length: 5 }, (_, index) => normalizeSkill(config.skills?.[index], fallback.skills[index])) : fallback.skills.map((skill) => ({ ...skill })),
    positions: normalizePositions(config.positions ?? fallback.positions),
    loadout: allowLoadout ? normalizeLoadout(config.loadout ?? fallback.loadout) : [...fallback.loadout],
    playerStrategies: normalizePlayerStrategies(config.playerStrategies ?? fallback.playerStrategies),
    teamStrategy: teamStrategies.includes(config.teamStrategy) ? config.teamStrategy : fallback.teamStrategy,
  }
}

function normalizeSkill(skill, fallback) {
  const normalized = Object.fromEntries(
    skillKeys.map((key) => {
      const value = Number(skill?.[key])
      return [key, Number.isInteger(value) && value >= 0 ? value : fallback[key]]
    }),
  )
  const spent = skillKeys.reduce((sum, key) => sum + normalized[key], 0)
  return spent === 6 ? normalized : { ...fallback }
}

function normalizePositions(source) {
  const used = new Set([0])
  const next = [0]
  for (let index = 1; index < 5; index += 1) {
    const candidate = Number(source?.[index])
    const slot = Number.isInteger(candidate) && candidate >= 1 && candidate <= 4 && !used.has(candidate)
      ? candidate
      : [1, 2, 3, 4].find((value) => !used.has(value))
    next[index] = slot ?? index
    used.add(next[index])
  }
  return next
}

function normalizeLoadout(source) {
  const next = ['runner']
  let chainUsed = false
  for (let index = 1; index < 5; index += 1) {
    let pompfe = pompfenOptions.includes(source?.[index]) ? source[index] : 'staff'
    if (pompfe === 'chain') {
      if (chainUsed) pompfe = 'staff'
      chainUsed = true
    }
    next[index] = pompfe
  }
  return next
}

function normalizePlayerStrategies(source) {
  return Array.from({ length: 5 }, (_, index) => {
    const options = index === 0 ? runnerStrategies : pompferStrategies
    return options.includes(source?.[index]) ? source[index] : options[0]
  })
}

function cloneConfig(config) {
  return {
    ...config,
    skills: config.skills.map((skill) => ({ ...skill })),
    positions: [...config.positions],
    loadout: [...config.loadout],
    playerStrategies: [...config.playerStrategies],
  }
}

function nextSeq(room) {
  room.serverSeq += 1
  return room.serverSeq
}

function createUniqueRoomCode() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = randomRoomCode()
    if (!rooms.has(code)) return code
  }
  throw new Error('Could not allocate room code.')
}

function randomRoomCode() {
  const bytes = randomBytes(roomCodeLength)
  return Array.from(bytes, (byte) => roomCodeAlphabet[byte % roomCodeAlphabet.length]).join('')
}

function normalizeScore(score) {
  return {
    blue: clampScore(score?.blue),
    red: clampScore(score?.red),
  }
}

function clampScore(value) {
  return Math.max(0, Math.min(matchPoint, Math.trunc(Number(value) || 0)))
}

function scoresEqual(a, b) {
  return a.blue === b.blue && a.red === b.red
}

function validScoreProgress(previous, next) {
  const blueDelta = next.blue - previous.blue
  const redDelta = next.red - previous.red
  if (blueDelta === 1 && redDelta === 0) return 'blue'
  if (redDelta === 1 && blueDelta === 0) return 'red'
  return null
}

function teamName(team) {
  return team === 'blue' ? 'Blau' : 'Rot'
}
