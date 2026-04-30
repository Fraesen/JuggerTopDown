import './style.css'
import { createRenderer } from './game/renderer.js'
import { createDecisionEngine } from './game/decisions.js'
import {
  ATTACK_COOLDOWN,
  ATTACK_DURATION,
  DOUBLE_HIT_WINDOW,
  DOUBLE_PIN_RELEASE_PAUSE,
  FIELD,
  HIT_STONES,
  JUGG_RADIUS,
  MATCH_POINT,
  MATCH_SECONDS,
  PIN_ORBIT_MAX_RADIUS,
  PIN_ORBIT_MIN_RADIUS,
  PIN_ORBIT_SPEED_FACTOR,
  PIN_RANGE,
  POSITION_LABELS,
  PLAYER_POSITIONS,
  PLAYER_RADIUS,
  PLAYER_SKILLS,
  RECOVERY_DASH_DURATION,
  RECOVERY_DASH_SPEED,
  RUNNER_DUEL_COOLDOWN,
  RUNNER_DUEL_RANGE,
  RUNNER_GRAPPLE_BREAK_RANGE,
  RUNNER_GRAPPLE_RANGE,
  RUNNER_JUGG_CONTEST_COOLDOWN,
  RUNNER_JUGG_CONTEST_PRESSURE_RANGE,
  RUNNING_ATTACK_SPEED_THRESHOLD,
  SKILL_POINTS_PER_PLAYER,
  START_POSITIONS,
  STONE_SECONDS,
  TEAMS,
  fieldPoint,
} from './game/config.js'
import { clamp, constrainToField, distance, facePoint, normalize, pointInPolygon } from './game/geometry.js'
import {
  canReceiveNewPin,
  createPlayer,
  isGrappling,
  isInactive,
  isPompfer,
  isRecoveryDashing,
  isRunner,
  playerIndex,
  playerPositionSlot,
  playerSpeed,
  roleLabel,
  skillForPlayer,
  statsFromSkill,
} from './game/players.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc, isShieldBlockFacing, pompfeFor } from './game/pompfen.js'

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

        <div class="speed-control" aria-label="Spielgeschwindigkeit">
          <button type="button" data-speed="0.25">0,25x</button>
          <button type="button" data-speed="0.5">0,5x</button>
          <button type="button" data-speed="1">1x</button>
          <button type="button" data-speed="2">2x</button>
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
            <strong>Nahpompfen pinnen Inaktive</strong>
            <span class="pompfer-dot"></span>
            <strong>Pompfen: Stab, Q-Tip, Schild und Kette</strong>
            <span class="technik-dot"></span>
            <strong>Schilde blocken frontal besser</strong>
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
  speedButtons: [...document.querySelectorAll('[data-speed]')],
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2]

const state = {
  running: false,
  paused: false,
  lastTime: 0,
  playbackSpeed: 1,
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
    contest: null,
    cooldown: 0,
  },
}

const CHAIN_STRIKE_VISUAL_DURATION = 0.52

function applyBlueSkills() {
  for (const player of state.players) {
    if (player.team !== 'blue') continue
    const index = playerIndex(player)
    const stats = statsFromSkill(PLAYER_SKILLS.blue[index])
    player.technik = stats.technik
    player.geschwindigkeit = stats.geschwindigkeit
    player.wahrnehmung = stats.wahrnehmung
    player.speed = playerSpeed(player.role, stats.geschwindigkeit)
  }
}

function applyBluePositions({ resetSpawns = false } = {}) {
  for (const player of state.players) {
    if (player.team !== 'blue') continue
    const index = playerIndex(player)
    const slot = PLAYER_POSITIONS.blue[index] ?? index
    player.positionSlot = slot

    if (resetSpawns) {
      const spawn = START_POSITIONS.blue[slot]
      player.x = spawn.x
      player.y = spawn.y
      player.vx = 0
      player.vy = 0
      player.angle = 0
      player.openingComplete = false
    }
  }
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

function setBluePosition(index, slot) {
  if (index <= 0 || slot <= 0 || slot >= PLAYER_POSITIONS.blue.length) return
  const currentSlot = PLAYER_POSITIONS.blue[index]
  if (currentSlot === slot) return

  const swapIndex = PLAYER_POSITIONS.blue.findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === slot)
  PLAYER_POSITIONS.blue[index] = slot
  if (swapIndex > 0) PLAYER_POSITIONS.blue[swapIndex] = currentSlot

  applyBluePositions({ resetSpawns: !state.running })
  renderSkillPanel()
  updateHud()
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
      const positionControl =
        index > 0
          ? `
          <label class="position-control">
            <span>Position</span>
            <select data-player="${index}" data-position>
              ${Object.entries(POSITION_LABELS)
                .map(
                  ([slot, label]) =>
                    `<option value="${slot}" ${PLAYER_POSITIONS.blue[index] === Number(slot) ? 'selected' : ''}>${label}</option>`,
                )
                .join('')}
            </select>
          </label>
        `
          : ''
      return `
        <article class="skill-row">
          <header>
            <span>${roleLabel(index)}</span>
            <strong>${spent}/${SKILL_POINTS_PER_PLAYER}</strong>
          </header>
          ${positionControl}
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
  state.jugg.contest = null
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

function setPlaybackSpeed(speed) {
  if (!PLAYBACK_SPEEDS.includes(speed)) return
  state.playbackSpeed = speed
  for (const button of hud.speedButtons) {
    const active = Number(button.dataset.speed) === speed
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  }
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
  state.jugg.contest = null
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

  if (player.pompfe === 'chain') {
    const chainTarget = player.attackTarget
    player.chainStrikeTimer = CHAIN_STRIKE_VISUAL_DURATION
    player.chainStrikeDuration = CHAIN_STRIKE_VISUAL_DURATION
    player.chainStrikeTarget = chainTarget
    player.chainStrikeX = chainTarget?.x ?? player.x + Math.cos(player.angle) * 94
    player.chainStrikeY = chainTarget?.y ?? player.y + Math.sin(player.angle) * 94
  }
}

function startRecoveryDash(player) {
  const nearbyEnemy = decision.nearestEnemy(player, () => true).target
  const awayFromEnemy = nearbyEnemy ? normalize(player.x - nearbyEnemy.x, player.y - nearbyEnemy.y) : { x: 0, y: 0 }
  const forward = { x: Math.cos(player.angle), y: Math.sin(player.angle) }
  const direction = normalize(awayFromEnemy.x * 1.4 + forward.x * 0.45, awayFromEnemy.y * 1.4 + forward.y * 0.45)
  const fallback = player.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
  const speedFactor = clamp(player.speed / 195, 0.82, 1.24)

  player.recoveryDashTimer = RECOVERY_DASH_DURATION
  player.recoveryDashSpeed = RECOVERY_DASH_SPEED * speedFactor
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
    if (pinner.callType === 'doppelpin') decision.clearCallIntent(pinner)
  }
}

function makeInactive(player, stones = HIT_STONES) {
  if (isInactive(player) && player.penaltyStones >= stones) return
  releaseGrapple(player)
  if (state.jugg.carrier === player) dropJugg(player)
  if (state.jugg.contest?.runners.includes(player)) {
    state.jugg.contest = null
    state.jugg.cooldown = 0.28
  }
  player.penaltyStones = stones
  player.penaltyTotalStones = stones
  player.pendingInactiveStones = 0
  player.attackWindup = 0
  player.attackTarget = null
  player.attackWhileMoving = false
  player.doubleWindow = 0
  player.chainStrikeTimer = 0
  player.chainStrikeTarget = null
  player.attack = 0
  player.countedStones = 0
  player.pinLock = 0
  player.pinnedBy = null
  player.pinClaimedBy = null
  player.pinWasActive = false
  player.recoveryDashQueued = false
  player.recoveryDashTimer = 0
  player.recoveryDashSpeed = 0
  player.recoveryDashX = 0
  player.recoveryDashY = 0
  player.runnerJuggRetreatTimer = 0
  player.runnerJuggRetreatX = 0
  player.runnerJuggRetreatY = 0
  player.callTimer = 0
  player.callType = null
  player.callSource = null
  player.callContext = null
  player.callBubbleTimer = 0
  player.callBubbleText = ''
  player.callMissTimer = 0
  player.doublePinTrapTarget = null
  player.doublePinReleaseTarget = null
  player.doublePinReleasePause = 0
  player.vx = 0
  player.vy = 0
}

function announceDouble(attacker, target) {
  if (!attacker || !target) return
  for (const player of [attacker, target]) {
    player.callBubbleText = 'Doppel!'
    player.callBubbleTimer = 0.95
  }
}

function queueDoubleParticipant(player, stones) {
  if (!player || isInactive(player)) return

  if (player.attackWindup > 0 || player.doubleWindow > 0) {
    player.pendingInactiveStones = Math.max(player.pendingInactiveStones, stones)
    player.vx = 0
    player.vy = 0
    if (state.jugg.carrier === player) dropJugg(player)
    return
  }

  makeInactive(player, stones)
}

function queueInactive(player, stones = HIT_STONES, source = null) {
  if ((player.attackWindup > 0 || player.doubleWindow > 0) && !isInactive(player)) {
    if (source && source !== player && !isInactive(source)) {
      announceDouble(source, player)
      queueDoubleParticipant(source, stones)
    }
    queueDoubleParticipant(player, stones)
    return
  }

  makeInactive(player, stones)
}

const decision = createDecisionEngine({ state, attack })
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
  player.callContext = null
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
  player.callContext = null
  player.doublePinTrapTarget = null
  const dashSpeed = player.recoveryDashSpeed || RECOVERY_DASH_SPEED
  player.vx = player.recoveryDashX * dashSpeed
  player.vy = player.recoveryDashY * dashSpeed
  if (player.vx || player.vy) player.angle = Math.atan2(player.vy, player.vx)
}

function updateRunnerJuggRetreat(player, dt) {
  player.runnerJuggRetreatTimer = Math.max(0, player.runnerJuggRetreatTimer - dt)
  player.vx = player.runnerJuggRetreatX * player.speed * 0.92
  player.vy = player.runnerJuggRetreatY * player.speed * 0.92
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

function canEnterFromOutsideStart(player) {
  if (pointInPolygon(player)) return false
  const leftGroundLine = fieldPoint(0, FIELD.widthMeters / 2).x
  const rightGroundLine = fieldPoint(FIELD.lengthMeters, FIELD.widthMeters / 2).x
  return (player.team === 'blue' && player.x < leftGroundLine && player.vx > 0) || (player.team === 'red' && player.x > rightGroundLine && player.vx < 0)
}

function inactiveRunnerSlowdown(player) {
  if (!isRunner(player) || isInactive(player)) return 1
  const nearbyInactive = state.players.filter((other) => other !== player && isInactive(other) && distance(player, other) < player.radius + other.radius + 10).length
  if (nearbyInactive <= 0) return 1
  return clamp(1 - nearbyInactive * 0.22, 0.38, 1)
}

function isRunnerInJuggContest(player) {
  return Boolean(state.jugg.contest?.runners.includes(player))
}

function movePlayer(player, dt) {
  if (isRunnerInJuggContest(player)) {
    player.vx = 0
    player.vy = 0
    return
  }

  if (isGrappling(player)) {
    player.vx = 0
    player.vy = 0
    return
  }

  if (player.attackWindup <= 0 && movePinningPlayer(player, dt)) return

  const slowdown = inactiveRunnerSlowdown(player)
  player.x += player.vx * dt * slowdown
  player.y += player.vy * dt * slowdown
  if (!canEnterFromOutsideStart(player)) constrainToField(player, player.radius)
}

function canPassThroughInactive(a, b) {
  return (isRunner(a) && !isInactive(a) && isInactive(b)) || (isRunner(b) && !isInactive(b) && isInactive(a))
}

function separatePlayers() {
  for (let i = 0; i < state.players.length; i += 1) {
    for (let j = i + 1; j < state.players.length; j += 1) {
      const a = state.players[i]
      const b = state.players[j]
      if (canPassThroughInactive(a, b)) continue
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
  const profile = pompfeFor(attacker)
  const shieldBonus = isShieldBlockFacing(target, attacker) ? pompfeFor(target).shieldBlockBonus : 0
  let chance = attacker.technik / (attacker.technik + target.technik + shieldBonus)
  if (isRunner(target)) chance += profile.runnerHitBonus
  if (attacker.attackWhileMoving) chance -= profile.runningAttackPenalty
  return clamp(chance, 0.02, 0.98)
}

function techniqueContestChance(challenger, defender) {
  return challenger.technik / (challenger.technik + defender.technik)
}

function runnerJuggReach() {
  return PLAYER_RADIUS + JUGG_RADIUS + 8
}

function runnerJuggContestResult(a, b) {
  const aChance = techniqueContestChance(a, b)
  const bChance = techniqueContestChance(b, a)
  const aHits = Math.random() <= aChance
  const bHits = Math.random() <= bChance

  if (aHits && !bHits) return a
  if (bHits && !aHits) return b
  if (aHits && bHits) return 'held'
  return null
}

function nearbyEnemyPompferPressure(runner) {
  return decision.nearestEnemy(runner, (other) => isPompfer(other) && !isInactive(other))
}

function retreatRunnerFromPressure(runner, threat) {
  const ownMal = TEAMS[runner.team].mal
  const awayFromThreat = threat ? normalize(runner.x - threat.x, runner.y - threat.y) : { x: 0, y: 0 }
  const towardHome = normalize(ownMal.x - runner.x, ownMal.y - runner.y)
  const fallback = runner.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
  const direction = normalize(awayFromThreat.x * 1.35 + towardHome.x * 0.75, awayFromThreat.y * 1.35 + towardHome.y * 0.75)
  runner.runnerJuggRetreatTimer = 0.5
  runner.runnerJuggRetreatX = direction.x || fallback.x
  runner.runnerJuggRetreatY = direction.y || fallback.y
  runner.vx = runner.runnerJuggRetreatX * runner.speed * 0.92
  runner.vy = runner.runnerJuggRetreatY * runner.speed * 0.92
  runner.angle = Math.atan2(runner.vy, runner.vx)
  runner.duelCooldown = Math.max(runner.duelCooldown, RUNNER_DUEL_COOLDOWN * 0.7)
}

function assignJuggCarrier(runner, message = null) {
  state.jugg.carrier = runner
  state.jugg.contest = null
  state.jugg.vx = 0
  state.jugg.vy = 0
  runner.holdOffset = 0
  if (message) {
    state.message = message
    state.messageTimer = 0.7
  }
  burst(state.jugg.x, state.jugg.y, TEAMS[runner.team].color, 8)
}

function startRunnerJuggContest(a, b) {
  state.jugg.carrier = null
  state.jugg.contest = {
    runners: [a, b],
    cooldown: RUNNER_JUGG_CONTEST_COOLDOWN,
  }
  state.jugg.vx = 0
  state.jugg.vy = 0
  for (const runner of [a, b]) {
    runner.vx = 0
    runner.vy = 0
    runner.duelCooldown = Math.max(runner.duelCooldown, RUNNER_JUGG_CONTEST_COOLDOWN)
  }
  state.message = 'Jugg umkaempft'
  state.messageTimer = 0.55
}

function findStrikeTarget(attacker) {
  let best = null
  let bestScore = Infinity

  if (attacker.attackTarget && attacker.attackTarget.team !== attacker.team && !isInactive(attacker.attackTarget)) {
    const target = attacker.attackTarget
    const range = attackRangeFor(attacker, target)
    if (isInAttackArc(attacker, target, range)) return target
  }

  for (const target of state.players) {
    if (target.team === attacker.team || isInactive(target)) continue
    const d = distance(attacker, target)
    const range = attackRangeFor(attacker, target)
    const inArc = isInAttackArc(attacker, target, range)
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
    queueInactive(hit.target, HIT_STONES, hit.attacker)
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
      !canPinWithPompfe(pinner) ||
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
    if (!isPompfer(pinner) || !canPinWithPompfe(pinner) || isInactive(pinner)) continue
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

function carrierThreatensMal(team, carrier) {
  if (!carrier || carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false

  const ownMal = TEAMS[team].mal
  const ownHalf = team === 'blue' ? carrier.x < FIELD.center.x : carrier.x > FIELD.center.x
  const towardMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
  const progress = carrier.vx * towardMal.x + carrier.vy * towardMal.y

  return ownHalf && progress > 20
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

function updateRunnerJuggContest(dt) {
  const contest = state.jugg.contest
  if (!contest) return false

  const [a, b] = contest.runners
  if (!a || !b || isInactive(a) || isInactive(b) || distance(a, b) > RUNNER_DUEL_RANGE * 1.6) {
    state.jugg.contest = null
    state.jugg.cooldown = 0.18
    return false
  }

  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  state.jugg.x = midX
  state.jugg.y = midY
  state.jugg.vx = 0
  state.jugg.vy = 0

  contest.cooldown = Math.max(0, contest.cooldown - dt)
  for (const runner of contest.runners) {
    runner.vx = 0
    runner.vy = 0
    runner.angle = Math.atan2(state.jugg.y - runner.y, state.jugg.x - runner.x)
  }

  if (contest.cooldown > 0) return true

  const pressured = contest.runners
    .map((runner) => ({ runner, pressure: nearbyEnemyPompferPressure(runner) }))
    .filter(({ pressure }) => pressure.target && pressure.distance < RUNNER_JUGG_CONTEST_PRESSURE_RANGE)

  if (pressured.length > 0) {
    state.jugg.contest = null
    state.jugg.cooldown = 0.32
    state.message = 'Laeufer loesen'
    state.messageTimer = 0.55
    for (const { runner, pressure } of pressured) retreatRunnerFromPressure(runner, pressure.target)
    return true
  }

  const result = runnerJuggContestResult(a, b)
  if (result === 'held') {
    contest.cooldown = RUNNER_JUGG_CONTEST_COOLDOWN
    state.message = 'Jugg festgehalten'
    state.messageTimer = 0.55
    return true
  }

  if (result) {
    assignJuggCarrier(result, `${TEAMS[result.team].name} sichert den Jugg`)
    return true
  }

  contest.cooldown = RUNNER_JUGG_CONTEST_COOLDOWN * 0.65
  return true
}

function resolveFreeJuggRunnerPickup() {
  if (state.jugg.cooldown > 0 || state.jugg.carrier || state.jugg.contest) return

  const runners = state.players
    .filter((player) => isRunner(player) && !isInactive(player) && distance(player, state.jugg) <= runnerJuggReach())
    .sort((a, b) => distance(a, state.jugg) - distance(b, state.jugg))

  if (runners.length <= 0) return

  const first = runners[0]
  const opponent = runners.find((runner) => runner.team !== first.team)

  if (!opponent) {
    assignJuggCarrier(first)
    return
  }

  const result = runnerJuggContestResult(first, opponent)
  if (result === 'held') {
    startRunnerJuggContest(first, opponent)
  } else if (result) {
    assignJuggCarrier(result)
  } else {
    state.jugg.cooldown = RUNNER_JUGG_CONTEST_COOLDOWN * 0.55
  }
}

function updateJugg(dt) {
  const jugg = state.jugg
  jugg.cooldown = Math.max(0, jugg.cooldown - dt)

  if (updateRunnerJuggContest(dt)) return

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

  resolveFreeJuggRunnerPickup()
  if (jugg.carrier || jugg.contest) return

  for (const player of state.players) {
    if (isInactive(player)) continue
    const d = distance(player, jugg)

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
  try {
    decision.emitCalls()
  } catch (error) {
    reportFrameError('Calls', error)
  }

  const strikeEvents = []

  for (const player of state.players) {
    try {
      player.attack = Math.max(0, player.attack - dt)
      player.doubleWindow = Math.max(0, player.doubleWindow - dt)
      player.attackCooldown = Math.max(0, player.attackCooldown - dt)
      player.chainStrikeTimer = Math.max(0, player.chainStrikeTimer - dt)
      if (player.chainStrikeTimer <= 0) player.chainStrikeTarget = null
      player.duelCooldown = Math.max(0, player.duelCooldown - dt)
      player.callCooldown = Math.max(0, player.callCooldown - dt)
      player.callTimer = Math.max(0, player.callTimer - dt)
      player.callBubbleTimer = Math.max(0, player.callBubbleTimer - dt)
      player.callMissTimer = Math.max(0, player.callMissTimer - dt)
      player.doublePinReleasePause = Math.max(0, player.doublePinReleasePause - dt)
      if (player.callBubbleTimer <= 0) player.callBubbleText = ''
      if (player.callTimer <= 0) {
        decision.clearCallIntent(player)
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
        } else if (isRunnerInJuggContest(player)) {
          player.vx = 0
          player.vy = 0
        } else if (player.runnerJuggRetreatTimer > 0) {
          updateRunnerJuggRetreat(player, dt)
        } else if (isRecoveryDashing(player)) {
          updateRecoveryDash(player, dt)
        } else {
          decision.updateAi(player, dt)
        }
      }

      movePlayer(player, dt)
    } catch (error) {
      player.vx = 0
      player.vy = 0
      reportFrameError(`Spieler ${player.id}`, error)
    }
  }

  try {
    separatePlayers()
    resolveStrikeEvents(strikeEvents)
    resolvePins()
    updateJugg(dt)
    checkScoring()
    updateParticles(dt)
  } catch (error) {
    reportFrameError('Simulation', error)
  }
}

function reportFrameError(area, error) {
  const detail = error instanceof Error ? error.message : String(error)
  const message = `${area}: ${detail}`
  if (state.message !== message) {
    console.error(message, error)
    state.message = message
    state.messageTimer = 2
  }
}

const renderer = createRenderer({ ctx, state })
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
  const positionLabel = isPompfer(player) ? POSITION_LABELS[playerPositionSlot(player)] : 'Mitte'
  const pompfe = isPompfer(player) ? pompfeFor(player) : null

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
    <div><span>Pompfe</span><strong>${pompfe ? pompfe.label : 'Jugg'}</strong><small>${pompfe ? `${pompfe.lengthCm} cm / ${pompfe.reachCm} cm` : player.pompfe}</small></div>
    <div><span>Position</span><strong>${positionLabel}</strong><small>${isPompfer(player) ? `Slot ${playerPositionSlot(player)}` : 'Laeufer'}</small></div>
    <div><span>Status</span><strong>${inactive ? 'inaktiv' : 'aktiv'}</strong><small>${statusDetail}</small></div>
  `
  hud.playerTooltip.hidden = false
}

function loop(time) {
  const rawDt = Math.min(0.033, (time - state.lastTime) / 1000 || 0)
  const dt = state.running && !state.paused ? rawDt * state.playbackSpeed : rawDt
  state.lastTime = time
  try {
    update(dt)
    renderer.draw()
    updateHud()
  } catch (error) {
    reportFrameError('Frame', error)
  }
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
  for (const button of hud.speedButtons) {
    button.addEventListener('click', () => setPlaybackSpeed(Number(button.dataset.speed)))
  }
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
  hud.skillList.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-position]')
    if (!select) return
    setBluePosition(Number(select.dataset.player), Number(select.value))
  })
}

resetMatch()
bindInput()
renderSkillPanel()
setPlaybackSpeed(state.playbackSpeed)
requestAnimationFrame(loop)
