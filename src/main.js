import './style.css'

const FIELD = {
  width: 1280,
  height: 640,
  lengthMeters: 40,
  widthMeters: 20,
  groundLineMeters: 10,
  malDistanceMeters: 2,
  scale: 30,
  originX: 40,
  originY: 20,
  malRadius: 16,
}

FIELD.center = { x: FIELD.width / 2, y: FIELD.height / 2 }

const TEAMS = {
  blue: {
    name: 'Blau',
    color: '#21a8a3',
    dark: '#116d76',
    spawnX: fieldPoint(6, 10).x,
    mal: fieldPoint(2, 10),
    attackMal: fieldPoint(38, 10),
  },
  red: {
    name: 'Rot',
    color: '#dd614a',
    dark: '#8f382c',
    spawnX: fieldPoint(34, 10).x,
    mal: fieldPoint(38, 10),
    attackMal: fieldPoint(2, 10),
  },
}

const FIELD_POLYGON = [
  fieldPoint(0, 5),
  fieldPoint(5, 0),
  fieldPoint(35, 0),
  fieldPoint(40, 5),
  fieldPoint(40, 15),
  fieldPoint(35, 20),
  fieldPoint(5, 20),
  fieldPoint(0, 15),
]

const START_POSITIONS = {
  blue: [
    fieldPoint(0.65, 10.0),
    fieldPoint(0.65, 6.0),
    fieldPoint(0.65, 8.0),
    fieldPoint(0.65, 12.0),
    fieldPoint(0.65, 14.0),
  ],
  red: [
    fieldPoint(39.35, 10.0),
    fieldPoint(39.35, 6.0),
    fieldPoint(39.35, 8.0),
    fieldPoint(39.35, 12.0),
    fieldPoint(39.35, 14.0),
  ],
}

const PLAYER_RADIUS = 17
const JUGG_RADIUS = 11
const MATCH_SECONDS = 180
const MATCH_POINT = 3
const STONE_SECONDS = 1.5
const HIT_STONES = 5
const RECOVERY_DASH_DURATION = 0.24
const RECOVERY_DASH_SPEED = 315
const PIN_RANGE = 64
const PIN_ORBIT_MIN_RADIUS = 38
const PIN_ORBIT_MAX_RADIUS = 60
const PIN_ORBIT_SPEED_FACTOR = 0.36
const ATTACK_DURATION = 0.1
const DOUBLE_HIT_WINDOW = 0.3
const ATTACK_COOLDOWN = 0.72
const ATTACK_RANGE = 70
const ATTACK_ARC = 0.95
const CLOSE_STRIKE_RANGE = 46
const RUNNER_STRIKE_RANGE_BONUS = 14
const RUNNING_ATTACK_SPEED_THRESHOLD = 12
const RUNNING_ATTACK_PENALTY = 0.25
const RUNNER_TARGET_BONUS = 0.75
const OPENING_RUSH_SECONDS = 2.8
const OPENING_FAN_REACHED_RADIUS = 30
const CARRIER_PRESSURE_COUNT = 2
const RUNNER_DUEL_RANGE = 48
const RUNNER_DUEL_COOLDOWN = 0.8
const RUNNER_GRAPPLE_RANGE = 42
const RUNNER_GRAPPLE_BREAK_RANGE = 68
const SKILL_POINTS_PER_PLAYER = 6
const TECHNIK_BASE = 30
const TECHNIK_PER_POINT = 10
const SPEED_BASE = 40
const SPEED_PER_POINT = 8
const WAHRNEHMUNG_BASE = 30
const WAHRNEHMUNG_PER_POINT = 10
const CALL_DURATION = 1.8
const CALL_BUBBLE_DURATION = 1.15
const CALL_COOLDOWN = 2.2
const CALL_CORRIDOR_LENGTH = 250
const CALL_CORRIDOR_WIDTH = 92
const DOUBLE_PIN_CALL_RANGE = 116
const DOUBLE_PIN_TRAP_DURATION = STONE_SECONDS * 2.4
const DOUBLE_PIN_RELEASE_PAUSE = STONE_SECONDS * 0.9

const PLAYER_SKILLS = {
  blue: [
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 2, geschwindigkeit: 3, wahrnehmung: 1 },
    { technik: 4, geschwindigkeit: 1, wahrnehmung: 1 },
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 3, geschwindigkeit: 2, wahrnehmung: 1 },
  ],
  red: [
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 2, geschwindigkeit: 3, wahrnehmung: 1 },
    { technik: 4, geschwindigkeit: 1, wahrnehmung: 1 },
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 3, geschwindigkeit: 2, wahrnehmung: 1 },
  ],
}

document.querySelector('#app').innerHTML = `
  <div class="game-shell">
    <header class="score-strip" aria-live="polite">
      <div class="team-score team-score-blue">
        <span>Blau</span>
        <strong id="blue-score">0</strong>
      </div>
      <div class="match-core">
        <span id="match-state">Autobattler</span>
        <strong id="clock">03:00</strong>
      </div>
      <div class="team-score team-score-red">
        <span>Rot</span>
        <strong id="red-score">0</strong>
      </div>
    </header>

    <main class="play-layout">
      <section class="arena-wrap" aria-label="Jugger Spielfeld">
        <canvas id="game" width="${FIELD.width}" height="${FIELD.height}"></canvas>
        <div id="player-tooltip" class="player-tooltip" hidden></div>
      </section>

      <aside class="command-panel">
        <div>
          <p class="eyebrow">5 vs 5 Autobattler</p>
          <h1>Jugger</h1>
        </div>

        <div class="controls-row">
          <button id="start-btn" class="primary" type="button">Start</button>
          <button id="pause-btn" type="button">Pause</button>
          <button id="reset-btn" type="button">Reset</button>
        </div>

        <div class="status-grid">
          <div>
            <span>Besitz</span>
            <strong id="possession">frei</strong>
          </div>
          <div>
            <span>Pins</span>
            <strong id="pins">0</strong>
          </div>
          <div>
            <span>Inaktiv</span>
            <strong id="inactive">0</strong>
          </div>
          <div>
            <span>Stein</span>
            <strong id="stone">0</strong>
          </div>
        </div>

        <div class="mini-map" id="mini-map" aria-hidden="true"></div>

        <details class="collapsible-panel skill-panel">
          <summary class="panel-heading">
            <span>Blau skillen</span>
            <strong>6 Punkte pro Spieler</strong>
          </summary>
          <div id="skill-list" class="skill-list"></div>
        </details>

        <details class="collapsible-panel roster-panel">
          <summary class="panel-heading">
            <span>Teamrollen</span>
            <strong>Regeln</strong>
          </summary>
          <div class="roster-grid" aria-label="Teamrollen">
            <span class="match-dot"></span>
            <strong>3 Punkte gewinnen</strong>
            <span class="runner-dot"></span>
            <strong>1 Laeufer</strong>
            <span class="pompfer-dot"></span>
            <strong>4 Pompfer</strong>
            <span class="technik-dot"></span>
            <strong>Technik: 30 + 10 je Punkt</strong>
            <span class="speed-dot"></span>
            <strong>Geschwindigkeit: Tempo</strong>
            <span class="perception-dot"></span>
            <strong>Wahrnehmung: Call-Chance</strong>
            <span class="jugg-dot"></span>
            <strong>Nur Laeufer tragen den Jugg</strong>
            <span class="pin-dot"></span>
            <strong>Pompfer pinnen Inaktive</strong>
          </div>
        </details>
      </aside>
    </main>
  </div>
`

const canvas = document.querySelector('#game')
const ctx = canvas.getContext('2d')
const arenaWrap = document.querySelector('.arena-wrap')

const hud = {
  blueScore: document.querySelector('#blue-score'),
  redScore: document.querySelector('#red-score'),
  clock: document.querySelector('#clock'),
  matchState: document.querySelector('#match-state'),
  possession: document.querySelector('#possession'),
  pins: document.querySelector('#pins'),
  inactive: document.querySelector('#inactive'),
  stone: document.querySelector('#stone'),
  miniMap: document.querySelector('#mini-map'),
  skillList: document.querySelector('#skill-list'),
  playerTooltip: document.querySelector('#player-tooltip'),
  startBtn: document.querySelector('#start-btn'),
  pauseBtn: document.querySelector('#pause-btn'),
  resetBtn: document.querySelector('#reset-btn'),
}

const state = {
  running: false,
  paused: false,
  lastTime: 0,
  timeLeft: MATCH_SECONDS,
  score: { blue: 0, red: 0 },
  players: [],
  particles: [],
  message: 'Bereit',
  messageTimer: 0,
  roundTime: 0,
  stoneTimer: 0,
  stoneCount: 0,
  teamCallCooldowns: { blue: 0, red: 0 },
  hover: {
    active: false,
    x: 0,
    y: 0,
    clientX: 0,
    clientY: 0,
    player: null,
  },
  jugg: {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    carrier: null,
    cooldown: 0,
  },
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function fieldPoint(meterX, meterY) {
  return {
    x: FIELD.originX + meterX * FIELD.scale,
    y: FIELD.originY + meterY * FIELD.scale,
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalize(x, y) {
  const length = Math.hypot(x, y)
  if (length < 0.001) return { x: 0, y: 0 }
  return { x: x / length, y: y / length }
}

function facePoint(player, target) {
  const dx = target.x - player.x
  const dy = target.y - player.y
  if (Math.hypot(dx, dy) < 0.001) return
  player.angle = Math.atan2(dy, dx)
}

function pointInPolygon(point, polygon = FIELD_POLYGON) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 0.0001) return a
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1)
  return {
    x: a.x + dx * t,
    y: a.y + dy * t,
  }
}

function nearestFieldBoundary(point) {
  let nearest = FIELD_POLYGON[0]
  let bestDistance = Infinity

  for (let i = 0; i < FIELD_POLYGON.length; i += 1) {
    const a = FIELD_POLYGON[i]
    const b = FIELD_POLYGON[(i + 1) % FIELD_POLYGON.length]
    const candidate = closestPointOnSegment(point, a, b)
    const d = distance(point, candidate)
    if (d < bestDistance) {
      nearest = candidate
      bestDistance = d
    }
  }

  return { point: nearest, distance: bestDistance }
}

function constrainToField(entity, radius, bounce = false) {
  const point = { x: entity.x, y: entity.y }
  const nearest = nearestFieldBoundary(point)
  const inside = pointInPolygon(point)

  if (inside && nearest.distance >= radius + 1) return

  const inward = normalize(FIELD.center.x - nearest.point.x, FIELD.center.y - nearest.point.y)
  entity.x = nearest.point.x + inward.x * (radius + 2)
  entity.y = nearest.point.y + inward.y * (radius + 2)

  if (!bounce) return

  const outwardVelocity = entity.vx * inward.x + entity.vy * inward.y
  if (outwardVelocity < 0) {
    entity.vx -= outwardVelocity * inward.x * 1.55
    entity.vy -= outwardVelocity * inward.y * 1.55
  }
}

function isRunner(player) {
  return player.role === 'runner'
}

function isPompfer(player) {
  return player.role !== 'runner'
}

function isGrappled(player) {
  return Boolean(player.grappledBy)
}

function isGrappling(player) {
  return Boolean(player.grappleTarget || player.grappledBy)
}

function isInactive(player) {
  return player.penaltyStones > 0 || player.pinLock > 0 || Boolean(player.pinnedBy)
}

function canReceiveNewPin(player) {
  return player.penaltyStones > 0 && !player.pinnedBy && player.pinLock <= 0
}

function isRecoveryDashing(player) {
  return player.recoveryDashTimer > 0
}

function statsFromSkill(skill) {
  return {
    technik: TECHNIK_BASE + skill.technik * TECHNIK_PER_POINT,
    geschwindigkeit: SPEED_BASE + skill.geschwindigkeit * SPEED_PER_POINT,
    wahrnehmung: WAHRNEHMUNG_BASE + skill.wahrnehmung * WAHRNEHMUNG_PER_POINT,
  }
}

function roleLabel(index) {
  return index === 0 ? 'Laeufer' : `Pompfer ${index}`
}

function playerIndex(player) {
  return Number(player.id.split('-')[1])
}

function createPlayer(team, index, role) {
  const stats = statsFromSkill(PLAYER_SKILLS[team][index])
  const spawn = START_POSITIONS[team][index]

  return {
    id: `${team}-${index}`,
    team,
    role,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: team === 'blue' ? 0 : Math.PI,
    radius: PLAYER_RADIUS,
    technik: stats.technik,
    geschwindigkeit: stats.geschwindigkeit,
    wahrnehmung: stats.wahrnehmung,
    speed: (role === 'runner' ? 132 : 124) + stats.geschwindigkeit * (role === 'runner' ? 1.32 : 1.16),
    openingComplete: false,
    retreatingWithJugg: false,
    attack: 0,
    attackTarget: null,
    attackWindup: 0,
    attackWhileMoving: false,
    doubleWindow: 0,
    attackCooldown: 0,
    duelCooldown: 0,
    grappleTarget: null,
    grappledBy: null,
    callCooldown: 0,
    callTimer: 0,
    callType: null,
    callSource: null,
    callBubbleTimer: 0,
    callBubbleText: '',
    pendingInactiveStones: 0,
    holdOffset: 0,
    penaltyStones: 0,
    penaltyTotalStones: 0,
    countedStones: 0,
    pinnedBy: null,
    pinTarget: null,
    pinClaimedBy: null,
    pinOrbitDirection: team === 'blue' ? 1 : -1,
    pinLock: 0,
    pinWasActive: false,
    doublePinTrapTarget: null,
    doublePinReleaseTarget: null,
    doublePinReleasePause: 0,
    recoveryDashQueued: false,
    recoveryDashTimer: 0,
    recoveryDashX: 0,
    recoveryDashY: 0,
  }
}

function applyBlueSkills() {
  for (const player of state.players) {
    if (player.team !== 'blue') continue
    const index = playerIndex(player)
    const stats = statsFromSkill(PLAYER_SKILLS.blue[index])
    player.technik = stats.technik
    player.geschwindigkeit = stats.geschwindigkeit
    player.wahrnehmung = stats.wahrnehmung
    player.speed = (player.role === 'runner' ? 132 : 124) + stats.geschwindigkeit * (player.role === 'runner' ? 1.32 : 1.16)
  }
}

function skillForPlayer(player) {
  return PLAYER_SKILLS[player.team][playerIndex(player)]
}

function releaseGrapple(player) {
  if (player.grappleTarget) {
    player.grappleTarget.grappledBy = null
    player.grappleTarget = null
  }
  if (player.grappledBy) {
    player.grappledBy.grappleTarget = null
    player.grappledBy = null
  }
}

function setBlueSkill(index, key, delta) {
  const skill = PLAYER_SKILLS.blue[index]
  const keys = ['technik', 'geschwindigkeit', 'wahrnehmung']
  const otherKeys = keys.filter((candidate) => candidate !== key)

  if (delta > 0) {
    const donor = otherKeys.sort((a, b) => skill[b] - skill[a])[0]
    if (skill[donor] <= 0) return
    skill[key] += 1
    skill[donor] -= 1
  } else {
    if (skill[key] <= 0) return
    const receiver = otherKeys.sort((a, b) => skill[a] - skill[b])[0]
    skill[key] -= 1
    skill[receiver] += 1
  }

  applyBlueSkills()
  renderSkillPanel()
}

function renderSkillPanel() {
  hud.skillList.innerHTML = PLAYER_SKILLS.blue
    .map((skill, index) => {
      const stats = statsFromSkill(skill)
      const spent = skill.technik + skill.geschwindigkeit + skill.wahrnehmung
      return `
        <article class="skill-row">
          <header>
            <span>${roleLabel(index)}</span>
            <strong>${spent}/${SKILL_POINTS_PER_PLAYER}</strong>
          </header>
          <div class="skill-control">
            <span>T</span>
            <button type="button" data-player="${index}" data-skill="technik" data-delta="-1" ${skill.technik <= 0 ? 'disabled' : ''}>-</button>
            <strong>${skill.technik}</strong>
            <button type="button" data-player="${index}" data-skill="technik" data-delta="1" ${skill.geschwindigkeit + skill.wahrnehmung <= 0 ? 'disabled' : ''}>+</button>
            <small>${stats.technik}</small>
          </div>
          <div class="skill-control">
            <span>G</span>
            <button type="button" data-player="${index}" data-skill="geschwindigkeit" data-delta="-1" ${skill.geschwindigkeit <= 0 ? 'disabled' : ''}>-</button>
            <strong>${skill.geschwindigkeit}</strong>
            <button type="button" data-player="${index}" data-skill="geschwindigkeit" data-delta="1" ${skill.technik + skill.wahrnehmung <= 0 ? 'disabled' : ''}>+</button>
            <small>${stats.geschwindigkeit}</small>
          </div>
          <div class="skill-control">
            <span>W</span>
            <button type="button" data-player="${index}" data-skill="wahrnehmung" data-delta="-1" ${skill.wahrnehmung <= 0 ? 'disabled' : ''}>-</button>
            <strong>${skill.wahrnehmung}</strong>
            <button type="button" data-player="${index}" data-skill="wahrnehmung" data-delta="1" ${skill.technik + skill.geschwindigkeit <= 0 ? 'disabled' : ''}>+</button>
            <small>${stats.wahrnehmung}%</small>
          </div>
        </article>
      `
    })
    .join('')
}

function setupTeams() {
  state.players = [
    createPlayer('blue', 0, 'runner'),
    createPlayer('blue', 1, 'pompfer'),
    createPlayer('blue', 2, 'pompfer'),
    createPlayer('blue', 3, 'pompfer'),
    createPlayer('blue', 4, 'pompfer'),
    createPlayer('red', 0, 'runner'),
    createPlayer('red', 1, 'pompfer'),
    createPlayer('red', 2, 'pompfer'),
    createPlayer('red', 3, 'pompfer'),
    createPlayer('red', 4, 'pompfer'),
  ]
}

function resetJugg() {
  state.jugg.x = FIELD.width / 2
  state.jugg.y = FIELD.height / 2
  state.jugg.vx = 0
  state.jugg.vy = 0
  state.jugg.carrier = null
  state.jugg.cooldown = 0.45
}

function resetRound(message = 'Los') {
  setupTeams()
  resetJugg()
  state.roundTime = 0
  state.message = message
  state.messageTimer = 1.5
}

function resetMatch() {
  state.score.blue = 0
  state.score.red = 0
  state.timeLeft = MATCH_SECONDS
  state.running = false
  state.paused = false
  state.stoneTimer = 0
  state.stoneCount = 0
  state.teamCallCooldowns.blue = 0
  state.teamCallCooldowns.red = 0
  state.particles = []
  state.hover.player = null
  hud.playerTooltip.hidden = true
  hud.startBtn.textContent = 'Start'
  hud.pauseBtn.textContent = 'Pause'
  resetRound('Bereit')
  updateHud()
}

function startMatch() {
  if (state.timeLeft <= 0 || state.score.blue >= MATCH_POINT || state.score.red >= MATCH_POINT) resetMatch()
  state.running = true
  state.paused = false
  state.message = 'Spiel laeuft'
  state.messageTimer = 1.2
  hud.startBtn.textContent = 'Weiter'
  hud.pauseBtn.textContent = 'Pause'
}

function togglePause() {
  if (!state.running) return
  state.paused = !state.paused
  hud.pauseBtn.textContent = state.paused ? 'Weiter' : 'Pause'
  state.message = state.paused ? 'Pause' : 'Spiel laeuft'
  state.messageTimer = 0.8
  updatePlayerTooltip()
}

function throwJugg(carrier, force = 535) {
  if (state.jugg.carrier !== carrier || !isRunner(carrier) || carrier.grappledBy) return
  const aim = carrier.angle
  state.jugg.carrier = null
  state.jugg.x = carrier.x + Math.cos(aim) * 28
  state.jugg.y = carrier.y + Math.sin(aim) * 28
  state.jugg.vx = Math.cos(aim) * force + carrier.vx * 0.28
  state.jugg.vy = Math.sin(aim) * force + carrier.vy * 0.28
  state.jugg.cooldown = 0.32
  burst(state.jugg.x, state.jugg.y, TEAMS[carrier.team].color, 10)
}

function dropJugg(carrier) {
  if (state.jugg.carrier !== carrier) return
  state.jugg.carrier = null
  state.jugg.vx = carrier.vx * 0.25
  state.jugg.vy = carrier.vy * 0.25
  state.jugg.cooldown = 0.58
}

function attack(player, target = null) {
  if (player.attackCooldown > 0 || player.attackWindup > 0 || isInactive(player) || isRecoveryDashing(player) || !isPompfer(player)) return
  if (target && target.team !== player.team && !isInactive(target)) {
    player.attackTarget = target
    facePoint(player, target)
  } else {
    player.attackTarget = null
  }
  player.attackWhileMoving = Math.hypot(player.vx, player.vy) > RUNNING_ATTACK_SPEED_THRESHOLD
  player.attack = ATTACK_DURATION
  player.attackWindup = ATTACK_DURATION
  player.doubleWindow = DOUBLE_HIT_WINDOW
}

function startRecoveryDash(player) {
  const nearbyEnemy = nearestEnemy(player, () => true).target
  const awayFromEnemy = nearbyEnemy ? normalize(player.x - nearbyEnemy.x, player.y - nearbyEnemy.y) : { x: 0, y: 0 }
  const forward = { x: Math.cos(player.angle), y: Math.sin(player.angle) }
  const direction = normalize(awayFromEnemy.x * 1.4 + forward.x * 0.45, awayFromEnemy.y * 1.4 + forward.y * 0.45)
  const fallback = player.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }

  player.recoveryDashTimer = RECOVERY_DASH_DURATION
  player.recoveryDashX = direction.x || fallback.x
  player.recoveryDashY = direction.y || fallback.y
  player.attack = 0
  player.attackWindup = 0
  player.doubleWindow = 0
}

function completePenalty(player) {
  player.penaltyStones = 0
  player.countedStones = player.penaltyTotalStones
  if (player.pinnedBy || player.pinLock > 0) {
    player.recoveryDashQueued = true
    return
  }

  player.recoveryDashQueued = false
  startRecoveryDash(player)
}

function advanceGlobalStone() {
  for (const player of state.players) {
    if (player.penaltyStones > 0) {
      player.penaltyStones -= 1
      player.countedStones += 1
      if (player.penaltyStones <= 0) completePenalty(player)
    }

    if (player.pinLock > 0 && !player.pinnedBy) {
      player.pinLock = 0
      if (player.recoveryDashQueued && player.penaltyStones <= 0) {
        player.recoveryDashQueued = false
        startRecoveryDash(player)
      }
    }
  }

  releaseDoppelpinPinsOnStone()
}

function releaseDoppelpinPinsOnStone() {
  for (const pinner of state.players) {
    const target = pinner.doublePinReleaseTarget
    if (!target) continue

    if (target.pinnedBy === pinner) {
      target.pinnedBy = null
      target.pinClaimedBy = null
      target.pinLock = target.penaltyStones <= 0 ? 1 : target.pinLock
      if (target.penaltyStones <= 0) target.recoveryDashQueued = true
      if (pinner.pinTarget === target) pinner.pinTarget = null
      pinner.doublePinReleasePause = DOUBLE_PIN_RELEASE_PAUSE
    }

    pinner.doublePinReleaseTarget = null
    if (pinner.callType === 'doppelpin') clearCallIntent(pinner)
  }
}

function makeInactive(player, stones = HIT_STONES) {
  if (isInactive(player) && player.penaltyStones >= stones) return
  releaseGrapple(player)
  if (state.jugg.carrier === player) dropJugg(player)
  player.penaltyStones = stones
  player.penaltyTotalStones = stones
  player.pendingInactiveStones = 0
  player.attackWindup = 0
  player.attackTarget = null
  player.attackWhileMoving = false
  player.doubleWindow = 0
  player.attack = 0
  player.countedStones = 0
  player.pinLock = 0
  player.pinnedBy = null
  player.pinClaimedBy = null
  player.pinWasActive = false
  player.recoveryDashQueued = false
  player.recoveryDashTimer = 0
  player.recoveryDashX = 0
  player.recoveryDashY = 0
  player.callTimer = 0
  player.callType = null
  player.callSource = null
  player.callBubbleTimer = 0
  player.callBubbleText = ''
  player.doublePinTrapTarget = null
  player.doublePinReleaseTarget = null
  player.doublePinReleasePause = 0
  player.vx = 0
  player.vy = 0
}

function queueInactive(player, stones = HIT_STONES) {
  if ((player.attackWindup > 0 || player.doubleWindow > 0) && !isInactive(player)) {
    player.pendingInactiveStones = Math.max(player.pendingInactiveStones, stones)
    player.vx = 0
    player.vy = 0
    if (state.jugg.carrier === player) dropJugg(player)
    return
  }

  makeInactive(player, stones)
}

function nearestEnemy(player, filter = () => true) {
  let best = null
  let bestDistance = Infinity
  for (const other of state.players) {
    if (other.team === player.team || !filter(other)) continue
    const d = distance(player, other)
    if (d < bestDistance) {
      best = other
      bestDistance = d
    }
  }
  return { target: best, distance: bestDistance }
}

function nearestInactiveEnemy(player) {
  return nearestEnemy(player, (other) => isInactive(other))
}

function canSeekNewPin(player) {
  return (
    isPompfer(player) &&
    !isInactive(player) &&
    !player.pinTarget &&
    player.callType !== 'hilfmir' &&
    player.doublePinReleasePause <= 0 &&
    !player.doublePinTrapTarget
  )
}

function pinPriorityCompare(a, b, target) {
  const distanceDiff = distance(a, target) - distance(b, target)
  if (Math.abs(distanceDiff) > 0.01) return distanceDiff
  return playerIndex(a) - playerIndex(b)
}

function bestPinnerForTarget(target, team) {
  return activeTeamPompfers(team)
    .filter((player) => canSeekNewPin(player))
    .sort((a, b) => pinPriorityCompare(a, b, target))[0]
}

function nearestClaimablePinTarget(player) {
  return nearestEnemy(player, (other) => canReceiveNewPin(other) && bestPinnerForTarget(other, player.team) === player)
}

function oppositePlayer(player) {
  const index = playerIndex(player)
  const enemyTeam = player.team === 'blue' ? 'red' : 'blue'
  return state.players.find((other) => other.team === enemyTeam && playerIndex(other) === index)
}

function openingFanPoint(player) {
  const index = playerIndex(player)
  const lane = [10, 4.4, 7.2, 12.8, 15.6][index]
  const meterX = player.team === 'blue' ? 10 + index * 0.75 : 30 - index * 0.75
  return fieldPoint(meterX, lane)
}

function openingRushTarget(player) {
  if (player.openingComplete) return null
  if (state.roundTime > OPENING_RUSH_SECONDS || state.jugg.carrier) {
    player.openingComplete = true
    return null
  }

  const fanPoint = openingFanPoint(player)
  if (distance(player, fanPoint) <= OPENING_FAN_REACHED_RADIUS) {
    player.openingComplete = true
    return null
  }

  return fanPoint
}

function activeTeamPompfers(team) {
  return state.players.filter((player) => player.team === team && isPompfer(player) && !isInactive(player))
}

function carrierPressureRank(player, carrier) {
  return [...activeTeamPompfers(player.team)]
    .sort((a, b) => distance(a, carrier) - distance(b, carrier))
    .findIndex((candidate) => candidate === player)
}

function flankPoint(target, player, distanceFromTarget = 44) {
  const side = playerIndex(player) % 2 === 0 ? -1 : 1
  const approach = normalize(target.x - player.x, target.y - player.y)
  const perpendicular = { x: -approach.y * side, y: approach.x * side }
  return {
    x: target.x - approach.x * distanceFromTarget + perpendicular.x * 34,
    y: target.y - approach.y * distanceFromTarget + perpendicular.y * 34,
  }
}

function laneBlockPoint(player, carrier) {
  const ownMal = TEAMS[player.team].mal
  const index = playerIndex(player)
  const lane = index <= 2 ? -1 : 1
  const toMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
  const perpendicular = { x: -toMal.y, y: toMal.x }

  return {
    x: carrier.x + (ownMal.x - carrier.x) * 0.42 + perpendicular.x * lane * 86,
    y: carrier.y + (ownMal.y - carrier.y) * 0.42 + perpendicular.y * lane * 86,
  }
}

function supportPoint(player, carrier) {
  const index = playerIndex(player)
  const lane = [-1.9, -0.85, 0.85, 1.9][index - 1] ?? 0
  const forward = normalize(TEAMS[player.team].attackMal.x - carrier.x, TEAMS[player.team].attackMal.y - carrier.y)
  const perpendicular = { x: -forward.y, y: forward.x }
  const depth = index <= 2 ? 104 : 46

  return {
    x: carrier.x + forward.x * depth + perpendicular.x * lane * 74,
    y: carrier.y + forward.y * depth + perpendicular.y * lane * 74,
  }
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= 0.001) return distance(point, start)
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1)
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

function enemyReachRadius(enemy) {
  return isPompfer(enemy) ? ATTACK_RANGE + PLAYER_RADIUS : RUNNER_DUEL_RANGE + PLAYER_RADIUS
}

function directMalBlockers(runner) {
  const mal = TEAMS[runner.team].attackMal
  return state.players.filter((enemy) => {
    if (enemy.team === runner.team || isInactive(enemy)) return false
    const ahead = (enemy.x - runner.x) * (mal.x - runner.x) + (enemy.y - runner.y) * (mal.y - runner.y)
    return ahead > 0 && distanceToSegment(enemy, runner, mal) <= enemyReachRadius(enemy)
  })
}

function retreatPointForRunner(runner, blockers) {
  const friendlySafety = friendlyPompferSafetyPoint(runner, blockers)
  if (friendlySafety) return friendlySafety

  const team = TEAMS[runner.team]
  const awayFromMal = normalize(runner.x - team.attackMal.x, runner.y - team.attackMal.y)
  let avoidX = 0
  let avoidY = 0

  for (const blocker of blockers) {
    const d = distance(runner, blocker) || 1
    const strength = clamp((210 - d) / 210, 0.18, 1)
    avoidX += ((runner.x - blocker.x) / d) * strength
    avoidY += ((runner.y - blocker.y) / d) * strength
  }

  const retreat = normalize(awayFromMal.x * 1.15 + avoidX, awayFromMal.y * 1.15 + avoidY)
  const fallback = runner.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
  return {
    x: runner.x + (retreat.x || fallback.x) * 150,
    y: runner.y + (retreat.y || fallback.y) * 150,
  }
}

function friendlyPompferSafetyPoint(runner, blockers) {
  const team = TEAMS[runner.team]
  const candidates = activeTeamPompfers(runner.team)
    .map((friend) => {
      const toOwnSide = normalize(team.mal.x - friend.x, team.mal.y - friend.y)
      const point = {
        x: friend.x + toOwnSide.x * 46,
        y: friend.y + toOwnSide.y * 46,
      }
      const nearestBlockerDistance = blockers.reduce((best, blocker) => Math.min(best, distance(point, blocker)), Infinity)
      return {
        point,
        score: distance(runner, point) - nearestBlockerDistance * 0.55,
        nearestBlockerDistance,
      }
    })
    .filter((candidate) => candidate.nearestBlockerDistance > ATTACK_RANGE + PLAYER_RADIUS)
    .sort((a, b) => a.score - b.score)

  return candidates[0]?.point ?? null
}

function teammateAvoidance(player) {
  let x = 0
  let y = 0

  for (const other of state.players) {
    if (other === player || other.team !== player.team) continue
    const d = distance(player, other)
    if (d <= 0.01 || d > 92) continue
    const strength = (92 - d) / 92
    x += ((player.x - other.x) / d) * strength
    y += ((player.y - other.y) / d) * strength
  }

  return { x, y }
}

function callPerceivedBy(player, caller) {
  return player === caller || Math.random() * 100 < player.wahrnehmung
}

function callLabel(type) {
  if (type === 'malschutz') return 'Malschutz!'
  if (type === 'hilfmir') return 'Hilf mir!'
  if (type === 'doppelpin') return 'Doppelpin!'
  return 'Mitkommen!'
}

function setCallIntent(player, type, caller, duration = CALL_DURATION) {
  player.callType = type
  player.callSource = caller
  player.callTimer = duration
}

function clearCallIntent(player) {
  if (player.callType === 'doppelpin') player.doublePinTrapTarget = null
  player.callTimer = 0
  player.callType = null
  player.callSource = null
}

function issueCall(caller, type, recipients) {
  caller.callCooldown = CALL_COOLDOWN
  caller.callBubbleText = callLabel(type)
  caller.callBubbleTimer = CALL_BUBBLE_DURATION
  for (const recipient of recipients) {
    if (recipient.team !== caller.team || isInactive(recipient)) continue
    if (callPerceivedBy(recipient, caller)) setCallIntent(recipient, type, caller)
  }
}

function issueDoppelpinCall(caller, teammate, target) {
  caller.callCooldown = CALL_COOLDOWN
  caller.callBubbleText = callLabel('doppelpin')
  caller.callBubbleTimer = CALL_BUBBLE_DURATION

  if (!callPerceivedBy(teammate, caller)) return

  caller.doublePinTrapTarget = target
  setCallIntent(caller, 'doppelpin', caller, DOUBLE_PIN_TRAP_DURATION)
  teammate.doublePinReleaseTarget = target
  setCallIntent(teammate, 'doppelpin', caller, DOUBLE_PIN_TRAP_DURATION)
}

function callTargetFor(player) {
  if (player.callTimer <= 0 || !player.callType) return null

  if (player.callType === 'malschutz') {
    const carrier = state.jugg.carrier
    const ownMal = TEAMS[player.team].mal

    if (
      isPompfer(player) &&
      carrier &&
      carrier.team !== player.team &&
      isRunner(carrier) &&
      distance(player, ownMal) < distance(carrier, ownMal)
    ) {
      clearCallIntent(player)
      player.angle = Math.atan2(carrier.y - player.y, carrier.x - player.x)
      return null
    }

    return ownMal
  }

  if (player.callType === 'mitkommen') {
    const caller = player.callSource
    if (!caller || state.jugg.carrier !== caller || isInactive(caller)) return null
    return supportPoint(player, caller)
  }

  if (player.callType === 'hilfmir') {
    const caller = player.callSource
    const target = caller?.grappledBy || caller?.grappleTarget
    if (!target || isInactive(target)) return null
    return target
  }

  return null
}

function enemiesInRunnerLane(runner) {
  const target = TEAMS[runner.team].attackMal
  const forward = normalize(target.x - runner.x, target.y - runner.y)
  const perpendicular = { x: -forward.y, y: forward.x }

  return state.players.filter((player) => {
    if (player.team === runner.team || isInactive(player)) return false
    const dx = player.x - runner.x
    const dy = player.y - runner.y
    const ahead = dx * forward.x + dy * forward.y
    const lateral = Math.abs(dx * perpendicular.x + dy * perpendicular.y)
    return ahead > 0 && ahead < CALL_CORRIDOR_LENGTH && lateral < CALL_CORRIDOR_WIDTH
  })
}

function bestMitkommenRecipient(runner) {
  return activeTeamPompfers(runner.team)
    .filter((player) => player.callTimer <= 0)
    .sort((a, b) => distance(a, runner) - distance(b, runner))[0]
}

function bestHilfMirRecipient(runner) {
  const threat = runner.grappledBy || runner.grappleTarget || runner
  return activeTeamPompfers(runner.team)
    .filter((player) => player.callTimer <= 0)
    .sort((a, b) => distance(a, threat) - distance(b, threat))[0]
}

function doppelpinOpportunity(caller) {
  if (!isPompfer(caller) || isInactive(caller) || !caller.pinTarget || caller.callCooldown > 0) return null
  if (caller.callType === 'doppelpin' || caller.doublePinTrapTarget || caller.doublePinReleaseTarget) return null

  return state.players
    .filter((teammate) => {
      if (teammate === caller || teammate.team !== caller.team || !isPompfer(teammate) || isInactive(teammate)) return false
      if (teammate.callType === 'doppelpin' || teammate.doublePinTrapTarget) return false
      if (!teammate.pinTarget || teammate.doublePinReleaseTarget || teammate.doublePinReleasePause > 0) return false
      const target = teammate.pinTarget
      return (
        target !== caller.pinTarget &&
        target.team !== caller.team &&
        isPompfer(target) &&
        target.pinnedBy === teammate &&
        target.penaltyStones <= 1 &&
        distance(caller, target) <= DOUBLE_PIN_CALL_RANGE
      )
    })
    .map((teammate) => ({ teammate, target: teammate.pinTarget, distance: distance(caller, teammate.pinTarget) }))
    .sort((a, b) => a.distance - b.distance)[0]
}

function emitDoppelpinCalls() {
  for (const caller of state.players) {
    const opportunity = doppelpinOpportunity(caller)
    if (!opportunity) continue
    issueDoppelpinCall(caller, opportunity.teammate, opportunity.target)
  }
}

function shouldCallMalschutz(team) {
  const carrier = state.jugg.carrier
  if (!carrier || carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false

  return carrierThreatensMal(team, carrier)
}

function carrierThreatensMal(team, carrier) {
  if (!carrier || carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false

  const ownMal = TEAMS[team].mal
  const ownHalf = team === 'blue' ? carrier.x < FIELD.center.x : carrier.x > FIELD.center.x
  const towardMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
  const progress = carrier.vx * towardMal.x + carrier.vy * towardMal.y

  return ownHalf && progress > 20
}

function emitCalls() {
  const carrier = state.jugg.carrier

  const grapplingRunners = state.players.filter(
    (player) => isRunner(player) && !isInactive(player) && isGrappling(player) && player.callCooldown <= 0,
  )
  for (const runner of grapplingRunners) {
    const recipient = bestHilfMirRecipient(runner)
    if (recipient) issueCall(runner, 'hilfmir', [recipient])
  }

  if (carrier && isRunner(carrier) && !isInactive(carrier) && carrier.callCooldown <= 0) {
    const blockers = enemiesInRunnerLane(carrier)
    const recipient = blockers.length === 1 ? bestMitkommenRecipient(carrier) : null
    if (recipient) {
      issueCall(carrier, 'mitkommen', [recipient])
    }
  }

  emitDoppelpinCalls()

  for (const team of Object.keys(TEAMS)) {
    if (state.teamCallCooldowns[team] > 0) continue
    if (!shouldCallMalschutz(team)) continue
    const caller = state.players
      .filter((player) => player.team === team && player.callCooldown <= 0)
      .sort((a, b) => distance(a, state.jugg.carrier) - distance(b, state.jugg.carrier))[0]

    if (!caller) continue
    issueCall(caller, 'malschutz', state.players.filter((player) => player.team === team))
    state.teamCallCooldowns[team] = CALL_COOLDOWN
  }
}

function stopDistanceFor(player, target) {
  if (target === state.jugg) return isRunner(player) ? 0 : 46
  if (!target || !target.radius) return 18
  if (isPompfer(player) && target.team !== player.team && !isInactive(target)) return ATTACK_RANGE * 0.78
  if (isPompfer(player) && target.team !== player.team && isInactive(target)) return PIN_RANGE * 0.7
  if (isRunner(player) && target.team !== player.team) return RUNNER_DUEL_RANGE * 0.72
  return PLAYER_RADIUS * 2.4
}

function pinOrbitPoint(player) {
  const target = player.pinTarget
  if (!target) return player
  const enemy = nearestEnemy(player, (other) => !isInactive(other)).target
  if (!enemy) return null

  const radial = normalize(player.x - target.x, player.y - target.y)
  const fallback = player.team === 'blue' ? { x: 0, y: -1 } : { x: 0, y: 1 }
  const rx = radial.x || fallback.x
  const ry = radial.y || fallback.y
  const leftTangent = { x: -ry, y: rx }
  const rightTangent = { x: ry, y: -rx }
  const currentDistance = distance(player, enemy)
  const leftPoint = { x: player.x + leftTangent.x * 96, y: player.y + leftTangent.y * 96 }
  const rightPoint = { x: player.x + rightTangent.x * 96, y: player.y + rightTangent.y * 96 }
  const leftGain = currentDistance - distance(leftPoint, enemy)
  const rightGain = currentDistance - distance(rightPoint, enemy)
  const currentGain = player.pinOrbitDirection === 1 ? leftGain : rightGain
  const oppositeGain = player.pinOrbitDirection === 1 ? rightGain : leftGain

  if (currentGain <= 2 && oppositeGain <= 2) return null
  if (oppositeGain > currentGain + 10) player.pinOrbitDirection *= -1

  const tangent = player.pinOrbitDirection === 1 ? leftTangent : rightTangent

  return {
    x: player.x + tangent.x * 96,
    y: player.y + tangent.y * 96,
  }
}

function doublePinTrapPoint(player) {
  const pinned = player.pinTarget
  const trapTarget = player.doublePinTrapTarget
  if (!pinned || !trapTarget) return null

  const towardTrap = normalize(trapTarget.x - pinned.x, trapTarget.y - pinned.y)
  const fallback = normalize(trapTarget.x - player.x, trapTarget.y - player.y)
  const sideX = towardTrap.x || fallback.x || (player.team === 'blue' ? 1 : -1)
  const sideY = towardTrap.y || fallback.y

  return {
    x: pinned.x + sideX * PIN_ORBIT_MAX_RADIUS,
    y: pinned.y + sideY * PIN_ORBIT_MAX_RADIUS,
  }
}

function updateAi(player) {
  const team = TEAMS[player.team]
  const ownCarrier = state.jugg.carrier?.team === player.team
  const enemyCarrier = state.jugg.carrier && state.jugg.carrier.team !== player.team
  let target = { x: state.jugg.x, y: state.jugg.y }
  let faceTarget = target
  const nearestActiveEnemy = nearestEnemy(player, (other) => !isInactive(other))
  const callTarget = callTargetFor(player)
  const rushTarget = openingRushTarget(player)

  if (state.jugg.carrier !== player) player.retreatingWithJugg = false

  if (player.pinTarget && player.callType === 'hilfmir' && callTarget) {
    player.pinTarget = null
    target = callTarget
    faceTarget = callTarget
    if (target.radius && distance(player, target) < 68) attack(player, target)
  } else if (player.pinTarget && player.callType === 'doppelpin' && player.doublePinTrapTarget) {
    const trapTarget = player.doublePinTrapTarget
    const trapPoint = doublePinTrapPoint(player)
    target = trapPoint && distance(player, trapPoint) > 9 ? trapPoint : player
    faceTarget = trapTarget
    if (!isInactive(trapTarget) && distance(player, trapTarget) < ATTACK_RANGE + 8) {
      attack(player, trapTarget)
    }
  } else if (player.pinTarget) {
    target = pinOrbitPoint(player) || player
    faceTarget = player.pinTarget
    if (nearestActiveEnemy.target && nearestActiveEnemy.distance < 68) {
      target = nearestActiveEnemy.target
      faceTarget = nearestActiveEnemy.target
      attack(player, target)
    }
  } else if (player.grappleTarget) {
    target = player.grappleTarget
  } else if (callTarget) {
    target = callTarget
    if (player.callType === 'hilfmir' && isPompfer(player) && target.radius && distance(player, target) < 68) {
      attack(player, target)
    }
  } else if (rushTarget) {
    target = rushTarget
    if (isPompfer(player) && distance(player, rushTarget) < 68) attack(player, rushTarget)
  } else if (isRunner(player)) {

    if (state.jugg.carrier === player) {
      const blockers = directMalBlockers(player)
      player.retreatingWithJugg = blockers.length > 0
      target = blockers.length > 0 ? retreatPointForRunner(player, blockers) : team.attackMal
    } else if (enemyCarrier) {
      target = state.jugg.carrier
    } else {
      target = state.jugg
    }
  } else {
    const inactive = nearestClaimablePinTarget(player)
    const enemy = nearestActiveEnemy

    if (inactive.target && inactive.distance < 132 && !enemyCarrier) {
      target = inactive.target
    } else if (enemyCarrier) {
      const carrier = state.jugg.carrier
      const pressureRank = carrierPressureRank(player, carrier)
      if (pressureRank >= 0 && pressureRank < CARRIER_PRESSURE_COUNT) {
        target = flankPoint(carrier, player)
      } else {
        const opposite = oppositePlayer(player)
        const oppositeIsRelevant = opposite && !isInactive(opposite) && distance(opposite, carrier) < 260
        target = oppositeIsRelevant ? opposite : laneBlockPoint(player, carrier)
      }
    } else if (ownCarrier && state.jugg.carrier.retreatingWithJugg) {
      target = enemy.target && enemy.distance < 220 ? enemy.target : player
    } else if (ownCarrier) {
      const carrier = state.jugg.carrier
      target = supportPoint(player, carrier)
    } else if (enemy.target && enemy.distance < 188) {
      target = enemy.target
    } else {
      const lane = Number(player.id.slice(-1)) - 2.5
      target = {
        x: state.jugg.x + (player.team === 'blue' ? -96 : 96),
        y: state.jugg.y + lane * 70,
      }
    }

    if (enemy.target && enemy.distance < 68) attack(player, enemy.target)
  }

  if (!player.pinTarget) faceTarget = target
  facePoint(player, faceTarget)

  if (player.attackWindup > 0 || isGrappling(player)) {
    if (isGrappling(player)) {
      player.vx = 0
      player.vy = 0
    }
    return
  }

  if (player.pinTarget && target === player) {
    player.vx = 0
    player.vy = 0
    return
  }

  if (!player.pinTarget && distance(player, target) <= stopDistanceFor(player, target)) {
    player.vx = 0
    player.vy = 0
    return
  }

  const desired = normalize(target.x - player.x, target.y - player.y)
  const avoid = teammateAvoidance(player)
  const direction = normalize(desired.x + avoid.x * 0.95, desired.y + avoid.y * 0.95)
  const carrierBoost = state.jugg.carrier === player ? 1.13 : 1
  const pinSlowdown = player.pinTarget ? 0.18 : 1
  const speed = player.speed * carrierBoost * pinSlowdown

  player.vx = direction.x * speed
  player.vy = direction.y * speed
}

function updateInactivePlayer(player, dt) {
  player.vx = 0
  player.vy = 0
  player.attack = 0
  player.attackWindup = 0
  player.attackTarget = null
  player.doubleWindow = 0
  player.callTimer = 0
  player.callType = null
  player.callSource = null
  player.doublePinTrapTarget = null
  player.attackCooldown = Math.max(0, player.attackCooldown - dt)

  if (player.recoveryDashQueued && player.penaltyStones <= 0 && !player.pinnedBy && player.pinLock <= 0) {
    player.recoveryDashQueued = false
    startRecoveryDash(player)
  }
}

function updateRecoveryDash(player, dt) {
  player.recoveryDashTimer = Math.max(0, player.recoveryDashTimer - dt)
  player.attack = 0
  player.attackWindup = 0
  player.attackTarget = null
  player.doubleWindow = 0
  player.callTimer = 0
  player.callType = null
  player.callSource = null
  player.doublePinTrapTarget = null
  player.vx = player.recoveryDashX * RECOVERY_DASH_SPEED
  player.vy = player.recoveryDashY * RECOVERY_DASH_SPEED
  if (player.vx || player.vy) player.angle = Math.atan2(player.vy, player.vx)
}

function movePinningPlayer(player, dt) {
  const target = player.pinTarget
  if (!target) return false
  if (Math.hypot(player.vx, player.vy) < 1) {
    player.vx = 0
    player.vy = 0
    return false
  }

  const dx = player.x - target.x
  const dy = player.y - target.y
  const radius = Math.hypot(dx, dy) || PIN_ORBIT_MIN_RADIUS
  const radial = normalize(dx, dy)
  const fallback = player.team === 'blue' ? { x: 0, y: -1 } : { x: 0, y: 1 }
  const rx = radial.x || fallback.x
  const ry = radial.y || fallback.y
  const tangent = { x: -ry * player.pinOrbitDirection, y: rx * player.pinOrbitDirection }
  const desiredAlongCircle = player.vx * tangent.x + player.vy * tangent.y
  const orbitSpeed = Math.max(Math.abs(desiredAlongCircle), player.speed * PIN_ORBIT_SPEED_FACTOR)
  const direction = desiredAlongCircle < -1 ? -1 : 1
  const orbitTurn = player.pinOrbitDirection * direction
  const angleStep = (orbitSpeed * orbitTurn * dt) / clamp(radius, PIN_ORBIT_MIN_RADIUS, PIN_ORBIT_MAX_RADIUS)
  const nextAngle = Math.atan2(dy, dx) + angleStep
  const nextRadius = clamp(radius, PIN_ORBIT_MIN_RADIUS, PIN_ORBIT_MAX_RADIUS)

  player.pinOrbitDirection = orbitTurn
  player.x = target.x + Math.cos(nextAngle) * nextRadius
  player.y = target.y + Math.sin(nextAngle) * nextRadius
  player.vx = 0
  player.vy = 0
  constrainToField(player, player.radius)
  return true
}

function movePlayer(player, dt) {
  if (isGrappling(player)) {
    player.vx = 0
    player.vy = 0
    return
  }

  if (player.attackWindup <= 0 && movePinningPlayer(player, dt)) return

  player.x += player.vx * dt
  player.y += player.vy * dt
  constrainToField(player, player.radius)
}

function separatePlayers() {
  for (let i = 0; i < state.players.length; i += 1) {
    for (let j = i + 1; j < state.players.length; j += 1) {
      const a = state.players[i]
      const b = state.players[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const overlap = a.radius + b.radius - d
      if (overlap <= 0) continue
      const nx = dx / d
      const ny = dy / d
      const aMobility = a.pinnedBy || a.pinTarget || isGrappling(a) ? 0 : isInactive(a) ? 0.25 : 1
      const bMobility = b.pinnedBy || b.pinTarget || isGrappling(b) ? 0 : isInactive(b) ? 0.25 : 1
      const totalMobility = aMobility + bMobility
      if (totalMobility <= 0) continue
      const aMove = aMobility / totalMobility
      const bMove = bMobility / totalMobility
      a.x -= nx * overlap * aMove
      a.y -= ny * overlap * aMove
      b.x += nx * overlap * bMove
      b.y += ny * overlap * bMove
    }
  }
}

function hitChance(attacker, target) {
  let chance = attacker.technik / (attacker.technik + target.technik)
  if (isRunner(target)) chance += RUNNER_TARGET_BONUS
  if (attacker.attackWhileMoving) chance -= RUNNING_ATTACK_PENALTY
  return clamp(chance, 0.02, 0.98)
}

function techniqueContestChance(challenger, defender) {
  return challenger.technik / (challenger.technik + defender.technik)
}

function findStrikeTarget(attacker) {
  let best = null
  let bestScore = Infinity

  if (attacker.attackTarget && attacker.attackTarget.team !== attacker.team && !isInactive(attacker.attackTarget)) {
    const target = attacker.attackTarget
    const d = distance(attacker, target)
    const range = ATTACK_RANGE + (isRunner(target) ? RUNNER_STRIKE_RANGE_BONUS : 0)
    const hitAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x)
    const arc = Math.abs(Math.atan2(Math.sin(hitAngle - attacker.angle), Math.cos(hitAngle - attacker.angle)))
    if (d < range && (arc < ATTACK_ARC || d < CLOSE_STRIKE_RANGE || isRunner(target))) return target
  }

  for (const target of state.players) {
    if (target.team === attacker.team || isInactive(target)) continue
    const d = distance(attacker, target)
    const range = ATTACK_RANGE + (isRunner(target) ? RUNNER_STRIKE_RANGE_BONUS : 0)
    const hitAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x)
    const arc = Math.abs(Math.atan2(Math.sin(hitAngle - attacker.angle), Math.cos(hitAngle - attacker.angle)))
    const inArc = arc < ATTACK_ARC || d < CLOSE_STRIKE_RANGE
    const score = d - (isRunner(target) ? 24 : 0)
    if (d < range && inArc && score < bestScore) {
      best = target
      bestScore = score
    }
  }

  return best
}

function resolveStrikeEvents(events) {
  const hits = []

  for (const attacker of events) {
    if (!isPompfer(attacker)) continue
    const target = findStrikeTarget(attacker)
    attacker.attackTarget = null
    if (!target) continue

    if (Math.random() <= hitChance(attacker, target)) {
      hits.push({ attacker, target })
    }
  }

  for (const hit of hits) {
    queueInactive(hit.target, HIT_STONES)
    burst(hit.target.x, hit.target.y, TEAMS[hit.attacker.team].color, 8)
  }
}

function resolvePins() {
  const previousPinned = new Map()
  const assignedPinners = new Set()
  const assignedTargets = new Set()

  for (const player of state.players) {
    if (player.pinnedBy) previousPinned.set(player, player.pinnedBy)
    player.pinnedBy = null
    player.pinClaimedBy = null
    player.pinTarget = null
  }

  for (const [target, pinner] of previousPinned) {
    if (
      !isPompfer(pinner) ||
      isInactive(pinner) ||
      pinner.callType === 'hilfmir' ||
      pinner.doublePinReleasePause > 0 ||
      target.team === pinner.team ||
      distance(pinner, target) > PIN_RANGE
    ) {
      continue
    }

    target.pinnedBy = pinner
    target.pinClaimedBy = pinner
    target.pinWasActive = true
    pinner.pinTarget = target
    assignedPinners.add(pinner)
    assignedTargets.add(target)
  }

  for (const pinner of state.players) {
    if (!isPompfer(pinner) || isInactive(pinner)) continue
    if (pinner.callType === 'hilfmir') continue
    if (pinner.doublePinReleasePause > 0 || pinner.doublePinTrapTarget) continue
    if (assignedPinners.has(pinner)) continue

    let best = null
    let bestDistance = Infinity
    for (const target of state.players) {
      if (target.team === pinner.team || !canReceiveNewPin(target) || assignedTargets.has(target)) continue
      const d = distance(pinner, target)
      if (d <= PIN_RANGE && d < bestDistance) {
        best = target
        bestDistance = d
      }
    }

    if (best) {
      best.pinnedBy = pinner
      best.pinClaimedBy = pinner
      best.pinWasActive = true
      pinner.pinTarget = best
      assignedPinners.add(pinner)
      assignedTargets.add(best)
    }
  }

  for (const [target] of previousPinned) {
    if (!target.pinnedBy && target.penaltyStones <= 0) {
      target.pinLock = 1
    }
  }

  for (const pinner of state.players) {
    if (pinner.pinTarget?.pinnedBy !== pinner) pinner.pinTarget = null
  }
}

function resolveRunnerGrapples() {
  for (const player of state.players) {
    if (!player.grappleTarget) continue
    const target = player.grappleTarget
    if (
      state.jugg.carrier !== target ||
      player.team === target.team ||
      isInactive(player) ||
      isInactive(target) ||
      distance(player, target) > RUNNER_GRAPPLE_BREAK_RANGE
    ) {
      releaseGrapple(player)
      continue
    }

    const angle = Math.atan2(target.y - player.y, target.x - player.x)
    player.vx = 0
    player.vy = 0
    player.angle = angle
    target.vx = 0
    target.vy = 0
    target.angle = angle + Math.PI
  }

  const carrier = state.jugg.carrier
  if (!carrier || !isRunner(carrier) || isInactive(carrier) || carrier.grappledBy) return

  const defender = state.players.find(
    (player) =>
      player.team !== carrier.team &&
      isRunner(player) &&
      !isInactive(player) &&
      !player.grappleTarget &&
      carrierThreatensMal(player.team, carrier) &&
      distance(player, carrier) <= RUNNER_GRAPPLE_RANGE,
  )

  if (!defender) return

  defender.grappleTarget = carrier
  carrier.grappledBy = defender
  defender.vx = 0
  defender.vy = 0
  carrier.vx = 0
  carrier.vy = 0
  state.message = `${TEAMS[defender.team].name} klammert`
  state.messageTimer = 0.8
  burst(carrier.x, carrier.y, TEAMS[defender.team].color, 12)
}

function resolveRunnerDuels() {
  const carrier = state.jugg.carrier
  if (!carrier || !isRunner(carrier) || isInactive(carrier) || carrier.grappledBy || carrier.duelCooldown > 0) return

  const challenger = state.players.find(
    (player) =>
      player.team !== carrier.team &&
      isRunner(player) &&
      !isInactive(player) &&
      player.duelCooldown <= 0 &&
      distance(player, carrier) <= RUNNER_DUEL_RANGE,
  )

  if (!challenger) return

  carrier.duelCooldown = RUNNER_DUEL_COOLDOWN
  challenger.duelCooldown = RUNNER_DUEL_COOLDOWN

  const challengerWins = Math.random() <= techniqueContestChance(challenger, carrier)
  const winner = challengerWins ? challenger : carrier
  const loser = challengerWins ? carrier : challenger
  const angle = Math.atan2(loser.y - winner.y, loser.x - winner.x)

  if (challengerWins) {
    state.jugg.carrier = challenger
    challenger.holdOffset = 0
    state.message = `${TEAMS[challenger.team].name} erobert den Jugg`
    state.messageTimer = 0.9
  }

  winner.vx += Math.cos(angle + Math.PI) * 38
  winner.vy += Math.sin(angle + Math.PI) * 38
  loser.vx += Math.cos(angle) * 92
  loser.vy += Math.sin(angle) * 92
  burst(state.jugg.x, state.jugg.y, TEAMS[winner.team].color, challengerWins ? 14 : 8)
}

function updateJugg(dt) {
  const jugg = state.jugg
  jugg.cooldown = Math.max(0, jugg.cooldown - dt)

  if (jugg.carrier) {
    const carrier = jugg.carrier
    carrier.holdOffset += dt * 8
    jugg.x = carrier.x + Math.cos(carrier.angle) * 23
    jugg.y = carrier.y + Math.sin(carrier.angle) * 23 + Math.sin(carrier.holdOffset) * 2
    jugg.vx = carrier.vx
    jugg.vy = carrier.vy
    resolveRunnerGrapples()
    resolveRunnerDuels()
    return
  }

  jugg.x += jugg.vx * dt
  jugg.y += jugg.vy * dt
  jugg.vx *= Math.pow(0.08, dt)
  jugg.vy *= Math.pow(0.08, dt)

  constrainToField(jugg, JUGG_RADIUS, true)

  for (const player of state.players) {
    if (isInactive(player)) continue
    const d = distance(player, jugg)

    if (isRunner(player) && jugg.cooldown <= 0 && d <= player.radius + JUGG_RADIUS + 8) {
      jugg.carrier = player
      jugg.vx = 0
      jugg.vy = 0
      burst(jugg.x, jugg.y, TEAMS[player.team].color, 6)
      break
    }

    if (isPompfer(player) && d < player.radius + JUGG_RADIUS + 8) {
      const push = normalize(jugg.x - player.x, jugg.y - player.y)
      jugg.vx += push.x * 92
      jugg.vy += push.y * 92
    }
  }
}

function checkScoring() {
  const carrier = state.jugg.carrier
  if (!carrier || !isRunner(carrier) || isInactive(carrier)) return
  if (carrier.grappledBy) {
    if (distance(carrier, TEAMS[carrier.team].attackMal) < FIELD.malRadius + carrier.radius) {
      state.message = 'Jugg umkaempft'
      state.messageTimer = 0.6
    }
    return
  }

  const mal = TEAMS[carrier.team].attackMal
  if (distance(carrier, mal) < FIELD.malRadius + carrier.radius) {
    state.score[carrier.team] += 1
    state.message = `${TEAMS[carrier.team].name} punktet`
    state.messageTimer = 2
    burst(mal.x, mal.y, TEAMS[carrier.team].color, 28)

    if (state.score[carrier.team] >= MATCH_POINT) {
      state.running = false
      state.message = `${TEAMS[carrier.team].name} gewinnt`
      state.messageTimer = 99
      state.jugg.carrier = null
      hud.startBtn.textContent = 'Neues Match'
      return
    }

    resetRound(state.message)
  }
}

function updateTimers(dt) {
  if (!state.running || state.paused) return
  state.timeLeft = Math.max(0, state.timeLeft - dt)
  state.roundTime += dt
  state.stoneTimer += dt
  while (state.stoneTimer >= STONE_SECONDS) {
    state.stoneTimer -= STONE_SECONDS
    state.stoneCount += 1
    advanceGlobalStone()
  }
  state.messageTimer = Math.max(0, state.messageTimer - dt)

  if (state.timeLeft <= 0) {
    state.running = false
    state.message = state.score.blue === state.score.red ? 'Unentschieden' : state.score.blue > state.score.red ? 'Blau gewinnt' : 'Rot gewinnt'
    state.messageTimer = 99
  }
}

function burst(x, y, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 80 + Math.random() * 160
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7,
      color,
    })
  }
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vx *= 0.94
    particle.vy *= 0.94
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
}

function update(dt) {
  if (!state.running || state.paused) {
    updateParticles(dt)
    return
  }

  updateTimers(dt)
  state.teamCallCooldowns.blue = Math.max(0, state.teamCallCooldowns.blue - dt)
  state.teamCallCooldowns.red = Math.max(0, state.teamCallCooldowns.red - dt)
  emitCalls()

  const strikeEvents = []

  for (const player of state.players) {
    player.attack = Math.max(0, player.attack - dt)
    player.doubleWindow = Math.max(0, player.doubleWindow - dt)
    player.attackCooldown = Math.max(0, player.attackCooldown - dt)
    player.duelCooldown = Math.max(0, player.duelCooldown - dt)
    player.callCooldown = Math.max(0, player.callCooldown - dt)
    player.callTimer = Math.max(0, player.callTimer - dt)
    player.callBubbleTimer = Math.max(0, player.callBubbleTimer - dt)
    player.doublePinReleasePause = Math.max(0, player.doublePinReleasePause - dt)
    if (player.callBubbleTimer <= 0) player.callBubbleText = ''
    if (player.callTimer <= 0) {
      clearCallIntent(player)
    }
    if (player.attackWindup > 0) {
      player.attackWindup = Math.max(0, player.attackWindup - dt)
      if (player.attackWindup <= 0) {
        strikeEvents.push(player)
        player.attackCooldown = ATTACK_COOLDOWN
      }
    } else {
      if (player.attack <= 0) player.attackWhileMoving = false

      if (player.pendingInactiveStones > 0 && player.doubleWindow > 0) {
        player.vx = 0
        player.vy = 0
      } else if (player.pendingInactiveStones > 0) {
        makeInactive(player, player.pendingInactiveStones)
      } else if (isInactive(player)) {
        updateInactivePlayer(player, dt)
      } else if (isRecoveryDashing(player)) {
        updateRecoveryDash(player, dt)
      } else {
        updateAi(player, dt)
      }
    }

    movePlayer(player, dt)
  }

  separatePlayers()
  resolveStrikeEvents(strikeEvents)
  resolvePins()
  updateJugg(dt)
  checkScoring()
  updateParticles(dt)
}

function drawField() {
  ctx.clearRect(0, 0, FIELD.width, FIELD.height)
  ctx.fillStyle = '#0d1315'
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)

  const grass = ctx.createLinearGradient(0, 0, FIELD.width, FIELD.height)
  grass.addColorStop(0, '#204b3d')
  grass.addColorStop(0.55, '#286144')
  grass.addColorStop(1, '#1e443c')

  ctx.save()
  drawFieldPath()
  ctx.fillStyle = grass
  ctx.fill()
  ctx.clip()

  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = 2
  for (let meterX = 0; meterX <= FIELD.lengthMeters; meterX += 5) {
    const top = fieldPoint(meterX, 0)
    const bottom = fieldPoint(meterX, FIELD.widthMeters)
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(bottom.x, bottom.y)
    ctx.stroke()
  }
  for (let meterY = 0; meterY <= FIELD.widthMeters; meterY += 5) {
    const left = fieldPoint(0, meterY)
    const right = fieldPoint(FIELD.lengthMeters, meterY)
    ctx.beginPath()
    ctx.moveTo(left.x, left.y)
    ctx.lineTo(right.x, right.y)
    ctx.stroke()
  }

  ctx.setLineDash([14, 18])
  ctx.strokeStyle = 'rgba(244,241,224,0.62)'
  ctx.lineWidth = 3
  const middleTop = fieldPoint(20, 1.2)
  const middleBottom = fieldPoint(20, 18.8)
  ctx.beginPath()
  ctx.moveTo(middleTop.x, middleTop.y)
  ctx.lineTo(middleBottom.x, middleBottom.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(244,241,224,0.88)'
  ctx.lineWidth = 5
  drawFieldPath()
  ctx.stroke()

  ctx.strokeStyle = 'rgba(240,214,106,0.9)'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  drawGroundLine(0)
  drawGroundLine(FIELD.lengthMeters)
  ctx.restore()

  drawMal(TEAMS.blue.mal, TEAMS.blue.color, 'B')
  drawMal(TEAMS.red.mal, TEAMS.red.color, 'R')
}

function drawFieldPath() {
  ctx.beginPath()
  ctx.moveTo(FIELD_POLYGON[0].x, FIELD_POLYGON[0].y)
  for (let i = 1; i < FIELD_POLYGON.length; i += 1) {
    ctx.lineTo(FIELD_POLYGON[i].x, FIELD_POLYGON[i].y)
  }
  ctx.closePath()
}

function drawGroundLine(meterX) {
  const top = fieldPoint(meterX, 5)
  const bottom = fieldPoint(meterX, 15)
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(bottom.x, bottom.y)
  ctx.stroke()
}

function drawMal(mal, color, label) {
  ctx.save()
  ctx.translate(mal.x, mal.y)
  ctx.fillStyle = 'rgba(13,18,23,0.32)'
  ctx.beginPath()
  ctx.arc(0, 0, FIELD.malRadius + 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(0, 0, FIELD.malRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.font = '700 18px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 1)
  ctx.restore()
}

function drawJugg() {
  const { x, y } = state.jugg
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 12
  ctx.fillStyle = '#f0d66a'
  ctx.beginPath()
  ctx.ellipse(x, y, 15, 10, 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#5a3f16'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#7b5420'
  ctx.beginPath()
  ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPinLine(player) {
  if (!player.pinTarget || player.pinTarget.pinnedBy !== player) return
  ctx.save()
  ctx.strokeStyle = 'rgba(240,214,106,0.92)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(player.x, player.y)
  ctx.lineTo(player.pinTarget.x, player.pinTarget.y)
  ctx.stroke()
  ctx.restore()
}

function drawGrappleLine(player) {
  if (!player.grappleTarget) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255,247,215,0.88)'
  ctx.lineWidth = 4
  ctx.setLineDash([5, 6])
  ctx.beginPath()
  ctx.moveTo(player.x, player.y)
  ctx.lineTo(player.grappleTarget.x, player.grappleTarget.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawPlayer(player) {
  const team = TEAMS[player.team]
  const inactive = isInactive(player)

  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.rotate(player.angle)

  if (player.attack > 0) {
    ctx.fillStyle = player.team === 'blue' ? 'rgba(33,168,163,0.24)' : 'rgba(221,97,74,0.24)'
    ctx.beginPath()
    ctx.moveTo(8, 0)
    ctx.arc(8, 0, 64, -0.62, 0.62)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(0,0,0,0.24)'
  ctx.beginPath()
  ctx.ellipse(0, 9, player.radius * 0.95, player.radius * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  if (inactive) {
    ctx.rotate(-player.angle)
    ctx.fillStyle = 'rgba(7, 10, 12, 0.38)'
    ctx.beginPath()
    ctx.ellipse(0, 4, player.radius + 7, player.radius - 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.rotate(player.angle)
  }

  ctx.fillStyle = inactive ? '#6f7782' : team.color
  ctx.strokeStyle = player.pinnedBy || player.grappledBy || player.grappleTarget ? '#f0d66a' : team.dark
  ctx.lineWidth = player.pinnedBy || player.grappledBy || player.grappleTarget ? 5 : 3
  ctx.beginPath()
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = inactive ? '#c6ced8' : '#11181d'
  ctx.beginPath()
  ctx.moveTo(player.radius + 7, 0)
  ctx.lineTo(4, -7)
  ctx.lineTo(4, 7)
  ctx.closePath()
  ctx.fill()

  if (isPompfer(player)) {
    ctx.strokeStyle = '#e7dfc6'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(14, -17)
    ctx.lineTo(48, -31)
    ctx.stroke()
  } else {
    ctx.fillStyle = '#f0d66a'
    ctx.beginPath()
    ctx.arc(-7, -7, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  if (inactive) {
    const label = player.pinnedBy ? 'P' : player.penaltyStones > 0 ? `${player.countedStones}/${player.penaltyTotalStones}` : '.'
    ctx.rotate(-player.angle)
    ctx.fillStyle = '#fff7d7'
    ctx.font = '800 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(label, 0, -29)
  }

  ctx.restore()
}

function drawHoverMarker() {
  if (!state.paused || !state.hover.player) return

  const player = state.hover.player
  ctx.save()
  ctx.strokeStyle = '#fff7d7'
  ctx.lineWidth = 4
  ctx.setLineDash([7, 7])
  ctx.beginPath()
  ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(255,247,215,0.12)'
  ctx.beginPath()
  ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1)
    ctx.globalAlpha = alpha
    ctx.fillStyle = particle.color
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, 3 + alpha * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawCallBubble(player) {
  if (player.callBubbleTimer <= 0 || !player.callBubbleText) return

  const alpha = clamp(player.callBubbleTimer / CALL_BUBBLE_DURATION, 0, 1)
  const text = player.callBubbleText
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha * 1.4)
  ctx.font = '800 18px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const paddingX = 13
  const paddingY = 9
  const width = ctx.measureText(text).width + paddingX * 2
  const height = 34
  const x = clamp(player.x, width / 2 + 8, FIELD.width - width / 2 - 8)
  const y = clamp(player.y - player.radius - 34, height / 2 + 8, FIELD.height - height / 2 - 8)
  const left = x - width / 2
  const top = y - height / 2

  ctx.fillStyle = 'rgba(255,247,215,0.96)'
  ctx.strokeStyle = TEAMS[player.team].dark
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(left, top, width, height, 8)
  ctx.fill()
  ctx.stroke()

  const tailX = clamp(player.x, left + 12, left + width - 12)
  const tailY = top + height
  ctx.beginPath()
  ctx.moveTo(tailX - 8, tailY - 2)
  ctx.lineTo(tailX + 8, tailY - 2)
  ctx.lineTo(player.x, Math.min(player.y - player.radius - 4, tailY + 14))
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#11181d'
  ctx.fillText(text, x, y + 1)
  ctx.restore()
}

function drawOverlay() {
  if (state.running && state.messageTimer <= 0) return

  ctx.save()
  ctx.fillStyle = 'rgba(8,12,15,0.2)'
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)
  ctx.fillStyle = '#fff7d7'
  ctx.font = '800 54px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.message, FIELD.width / 2, FIELD.height / 2 - 8)

  if (!state.running && state.timeLeft > 0) {
    ctx.font = '600 24px system-ui'
    ctx.fillStyle = 'rgba(255,247,215,0.84)'
    ctx.fillText('Start druecken', FIELD.width / 2, FIELD.height / 2 + 44)
  }
  ctx.restore()
}

function draw() {
  drawField()

  const sortedPlayers = [...state.players].sort((a, b) => a.y - b.y)
  for (const player of sortedPlayers) drawPinLine(player)
  for (const player of sortedPlayers) drawGrappleLine(player)
  for (const player of sortedPlayers) drawPlayer(player)
  drawHoverMarker()
  drawJugg()
  drawParticles()
  drawOverlay()
  for (const player of sortedPlayers) drawCallBubble(player)
}

function formatClock(seconds) {
  const whole = Math.ceil(seconds)
  const minutes = Math.floor(whole / 60).toString().padStart(2, '0')
  const rest = (whole % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

function updateMiniMap() {
  const dots = state.players
    .map((player) => {
      const x = (player.x / FIELD.width) * 100
      const y = (player.y / FIELD.height) * 100
      const role = isRunner(player) ? ' runner' : ''
      const inactive = isInactive(player) ? ' inactive' : ''
      return `<i class="${player.team}${role}${inactive}" style="left:${x}%;top:${y}%"></i>`
    })
    .join('')
  const jugg = `<b style="left:${(state.jugg.x / FIELD.width) * 100}%;top:${(state.jugg.y / FIELD.height) * 100}%"></b>`
  hud.miniMap.innerHTML = `${dots}${jugg}`
}

function updateHud() {
  const possession = state.jugg.carrier ? `${TEAMS[state.jugg.carrier.team].name} Laeufer` : 'frei'
  const pinCount = state.players.filter((player) => player.pinnedBy).length
  const inactiveCount = state.players.filter((player) => isInactive(player)).length

  hud.blueScore.textContent = state.score.blue
  hud.redScore.textContent = state.score.red
  hud.clock.textContent = formatClock(state.timeLeft)
  hud.matchState.textContent = state.paused ? 'Pause' : state.running ? 'Autobattler live' : state.message
  hud.possession.textContent = possession
  hud.pins.textContent = pinCount
  hud.inactive.textContent = inactiveCount
  hud.stone.textContent = state.stoneCount
  updateMiniMap()
}

function canvasPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
    y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
  }
}

function hoveredPlayerAt(point) {
  let best = null
  let bestDistance = Infinity

  for (const player of state.players) {
    const d = distance(point, player)
    if (d <= player.radius + 18 && d < bestDistance) {
      best = player
      bestDistance = d
    }
  }

  return best
}

function updatePlayerTooltip() {
  if (!state.paused || !state.hover.active) {
    state.hover.player = null
    hud.playerTooltip.hidden = true
    return
  }

  const player = hoveredPlayerAt(state.hover)
  state.hover.player = player

  if (!player) {
    hud.playerTooltip.hidden = true
    return
  }

  const skill = skillForPlayer(player)
  const wrapRect = arenaWrap.getBoundingClientRect()
  const tooltipWidth = 190
  const left = clamp(state.hover.clientX - wrapRect.left + 14, 10, wrapRect.width - tooltipWidth - 10)
  const top = clamp(state.hover.clientY - wrapRect.top + 14, 10, wrapRect.height - 132)
  const inactive = isInactive(player)
  const statusDetail = player.pinnedBy ? 'Pin' : player.grappledBy ? 'geklammert' : player.grappleTarget ? 'klammert' : '-'

  hud.playerTooltip.style.left = `${left}px`
  hud.playerTooltip.style.top = `${top}px`
  hud.playerTooltip.innerHTML = `
    <header>
      <span>${TEAMS[player.team].name}</span>
      <strong>${roleLabel(playerIndex(player))}</strong>
    </header>
    <div><span>Technik</span><strong>${player.technik}</strong><small>${skill.technik} SP</small></div>
    <div><span>Geschwindigkeit</span><strong>${player.geschwindigkeit}</strong><small>${skill.geschwindigkeit} SP</small></div>
    <div><span>Wahrnehmung</span><strong>${player.wahrnehmung}%</strong><small>${skill.wahrnehmung} SP</small></div>
    <div><span>Status</span><strong>${inactive ? 'inaktiv' : 'aktiv'}</strong><small>${statusDetail}</small></div>
  `
  hud.playerTooltip.hidden = false
}

function loop(time) {
  const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0)
  state.lastTime = time
  update(dt)
  draw()
  updateHud()
  requestAnimationFrame(loop)
}

function bindInput() {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault()
    if (event.code === 'KeyP') togglePause()
  })

  hud.startBtn.addEventListener('click', startMatch)
  hud.pauseBtn.addEventListener('click', togglePause)
  hud.resetBtn.addEventListener('click', resetMatch)
  canvas.addEventListener('pointermove', (event) => {
    const point = canvasPointFromEvent(event)
    state.hover.active = true
    state.hover.x = point.x
    state.hover.y = point.y
    state.hover.clientX = event.clientX
    state.hover.clientY = event.clientY
    updatePlayerTooltip()
  })
  canvas.addEventListener('pointerleave', () => {
    state.hover.active = false
    state.hover.player = null
    hud.playerTooltip.hidden = true
  })
  hud.skillList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-player]')
    if (!button) return
    setBlueSkill(Number(button.dataset.player), button.dataset.skill, Number(button.dataset.delta))
  })
}

resetMatch()
bindInput()
renderSkillPanel()
requestAnimationFrame(loop)
