import { createDecisionEngine } from './decisions.js'
import {
  ATTACK_COOLDOWN,
  ATTACK_DURATION,
  CHAIN_HIT_STONES,
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
  START_POSITIONS,
  STONE_SECONDS,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
  TEAMS,
  PLAYER_STRATEGIES,
  fieldPoint,
} from './config.js'
import { clamp, closestPointOnSegment, constrainToField, distance, fieldBoundaryInwardNormal, nearestFieldBoundary, normalize, pointInPolygon } from './geometry.js'
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
  statsFromSkill,
} from './players.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc, isShieldBlockFacing, pompfeFor } from './pompfen.js'
import { BLUE_POMPFEN_OPTIONS, renderBlueSkillPanel, playerTechniqueOptionsForIndex } from '../ui/skillPanel.js'
import {
  AGGRESSIVE_DOUBLE_WINDOW_FACTOR,
  DEFENSIVE_HIT_MODIFIER,
  FLANK_DURATION,
  FLANK_TRIGGER_ROUND_TIME,
  doubleWindowFactorFor,
  isAggressiveStrategyPlayer,
  isDefensiveStrategyPlayer,
  normalizeTeamStrategy,
} from './strategies.js'
import { PLAYBACK_SPEEDS, ROUND_BREAK_SECONDS } from './state.js'
import { createSeededRng } from './rng.js'

export function createSimulation({ state, hud, updateHud, updatePlayerTooltip }) {
  const rng = state.rng
  const CHAIN_STRIKE_VISUAL_DURATION = 0.52
  const CHAIN_HIT_COOLDOWN_MULTIPLIER = 2
  const CHAIN_BLOCKER_PADDING = 8
  const CHAIN_BAND_END_CLEARANCE = 0.84
  const CHAIN_BAND_VISUAL = {
    handleX: 12,
    handleY: -12,
    orbitRadius: 58,
  }
  
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
  
    applyBluePositions({ resetSpawns: shouldPreviewSetupAtGroundLine() })
    renderSkillPanel()
    updateHud()
  }
  
  function setBluePompfe(index, pompfe) {
    if (index <= 0 || !BLUE_POMPFEN_OPTIONS.includes(pompfe)) return
    if (pompfe === 'chain') {
      const existingChainIndex = TEAM_LOADOUTS.blue.findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
      if (existingChainIndex > 0 && existingChainIndex !== index) {
        renderSkillPanel()
        return
      }
    }
  
    TEAM_LOADOUTS.blue[index] = pompfe
    const player = state.players.find((candidate) => candidate.team === 'blue' && playerIndex(candidate) === index)
    if (player) {
      player.pompfe = pompfe
      player.pompfeLabel = pompfeFor(player).label
      player.attack = 0
      player.attackWindup = 0
      player.attackTarget = null
      player.attackCooldown = 0
      player.doubleWindow = 0
      player.chainStrikeTimer = 0
      player.chainStrikeTarget = null
      for (const target of state.players) {
        if (target.pinnedBy === player) {
          target.pinnedBy = null
          target.pinClaimedBy = null
        }
      }
      player.pinTarget = null
    }
  
    renderSkillPanel()
    updatePlayerTooltip()
  }
  
  function resetStrategyState(player) {
    player.strategyTriggered = false
    player.defensiveStrategyDone = false
    player.flankTimer = 0
    player.overzahlDefenseTimer = 0
  }
  
  function applyNextTeamStrategies({ resetOpening = false } = {}) {
    for (const team of Object.keys(TEAM_STRATEGIES)) {
      TEAM_STRATEGIES[team] = normalizeTeamStrategy(state.nextTeamStrategies[team])
    }
  
    for (const player of state.players) {
      if (resetOpening) player.openingComplete = false
      resetStrategyState(player)
    }
  }
  
  function resetNextTeamStrategies() {
    state.nextTeamStrategies.blue = 'standard'
    state.nextTeamStrategies.red = 'standard'
  }
  
  function setBlueTeamStrategy(strategy) {
    state.nextTeamStrategies.blue = normalizeTeamStrategy(strategy)
    if (!state.running) {
      TEAM_STRATEGIES.blue = state.nextTeamStrategies.blue
      for (const player of state.players) {
        if (player.team !== 'blue') continue
        player.openingComplete = false
        resetStrategyState(player)
      }
    }
    renderSkillPanel()
    updatePlayerTooltip()
  }
  
  function setBluePlayerStrategy(index, strategy) {
    const availableStrategies = playerTechniqueOptionsForIndex(index)
    if (!availableStrategies.some((option) => option.id === strategy)) strategy = availableStrategies[0]?.id ?? 'none'
    PLAYER_STRATEGIES.blue[index] = strategy
    const player = state.players.find((candidate) => candidate.team === 'blue' && playerIndex(candidate) === index)
    if (player) {
      player.strategy = strategy
      resetStrategyState(player)
    }
    renderSkillPanel()
    updatePlayerTooltip()
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
    renderBlueSkillPanel(hud.skillList, state)
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

  function shouldPreviewSetupAtGroundLine() {
    return !state.running || state.roundBreakTimer > 0
  }

  function resetTeamsToGroundLinePreview() {
    setupTeams()
    resetJugg()
    state.roundTime = 0
    state.teamCallCooldowns.blue = 0
    state.teamCallCooldowns.red = 0
    state.jugg.cooldown = 0.45
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
    applyNextTeamStrategies({ resetOpening: true })
    setupTeams()
    resetJugg()
    state.roundBreakTimer = 0
    state.roundTime = 0
    state.message = message
    state.messageTimer = 1.5
  }
  
  function beginRoundBreak(message) {
    resetNextTeamStrategies()
    resetTeamsToGroundLinePreview()
    state.roundBreakTimer = ROUND_BREAK_SECONDS
    state.roundBreakLabel = message
    state.message = `${message} - Strategiepause ${ROUND_BREAK_SECONDS}`
    state.messageTimer = ROUND_BREAK_SECONDS
    state.jugg.carrier = null
    state.jugg.contest = null
    for (const player of state.players) {
      player.vx = 0
      player.vy = 0
    }
    renderSkillPanel()
  }
  
  function resetMatch() {
    const nextRng = createSeededRng(state.matchSeed)
    rng.seed = nextRng.seed
    rng.state = nextRng.state
    state.rng = rng
    state.frameAccumulator = 0
    resetNextTeamStrategies()
    TEAM_STRATEGIES.blue = 'standard'
    TEAM_STRATEGIES.red = 'standard'
    state.score.blue = 0
    state.score.red = 0
    state.timeLeft = MATCH_SECONDS
    state.running = false
    state.paused = false
    state.roundBreakTimer = 0
    state.roundBreakLabel = ''
    state.camera.x = 0
    state.camera.y = 0
    state.camera.zoom = 1
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

  function setMatchSeed(seed) {
    state.matchSeed = String(seed)
    const nextRng = createSeededRng(state.matchSeed)
    rng.seed = nextRng.seed
    rng.state = nextRng.state
    state.rng = rng
  }

  function deterministicSnapshot() {
    return {
      matchSeed: state.matchSeed,
      rng: rng.snapshot(),
      roundTime: state.roundTime,
      stoneCount: state.stoneCount,
      timeLeft: state.timeLeft,
    }
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
    if (!state.running) applyNextTeamStrategies({ resetOpening: true })
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
    } else {
      player.attackTarget = null
    }
    player.attackWhileMoving = Math.hypot(player.vx, player.vy) > RUNNING_ATTACK_SPEED_THRESHOLD
    player.attack = ATTACK_DURATION
    player.attackWindup = ATTACK_DURATION
    player.doubleWindow = DOUBLE_HIT_WINDOW * doubleWindowFactorFor(player)
  
    if (player.pompfe === 'chain') {
      const chainTarget = player.attackTarget
      const visualRange = chainVisualStrikeRadius(player)
      player.chainStrikeTimer = CHAIN_STRIKE_VISUAL_DURATION
      player.chainStrikeDuration = CHAIN_STRIKE_VISUAL_DURATION
      player.chainStrikeTarget = chainTarget
      player.chainStrikeX = chainTarget?.x ?? player.x + Math.cos(player.angle) * visualRange
      player.chainStrikeY = chainTarget?.y ?? player.y + Math.sin(player.angle) * visualRange
    }
  }

  function cancelAttack(player) {
    player.attack = 0
    player.attackWindup = 0
    player.attackTarget = null
    player.attackWhileMoving = false
    player.doubleWindow = 0
    player.chainStrikeTimer = 0
    player.chainStrikeDuration = 0
    player.chainStrikeTarget = null
    player.chainStrikeX = 0
    player.chainStrikeY = 0
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
    cancelAttack(player)
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
    player.overzahlDefenseTimer = 0
    player.flankTimer = 0
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
  
    if (canDouble(player)) {
      player.pendingInactiveStones = Math.max(player.pendingInactiveStones, stones)
      player.vx = 0
      player.vy = 0
      if (state.jugg.carrier === player) dropJugg(player)
      return
    }
  
    makeInactive(player, stones)
  }
  
  function canDouble(player) {
    return !isInactive(player) && player.attackCooldown <= 0 && (player.attackWindup > 0 || player.doubleWindow > 0)
  }
  
  function canDoubleAgainst(player, source = null) {
    if (!canDouble(player)) return false
    if (player.attackWindup > 0) return true
    if (source && isAggressiveStrategyPlayer(source)) {
      return player.doubleWindow > DOUBLE_HIT_WINDOW * (1 - AGGRESSIVE_DOUBLE_WINDOW_FACTOR)
    }
    return true
  }
  
  function oppositePlayerFor(player) {
    const enemyTeam = player.team === 'blue' ? 'red' : 'blue'
    const index = playerIndex(player)
    return state.players.find((other) => other.team === enemyTeam && playerIndex(other) === index)
  }
  
  function enemyRunnerInOwnHalfFor(player) {
    const enemyRunner = state.players.find((other) => other.team !== player.team && isRunner(other) && !isInactive(other))
    if (!enemyRunner) return false
    return player.team === 'blue' ? enemyRunner.x < FIELD.center.x : enemyRunner.x > FIELD.center.x
  }
  
  function defensiveBindingActiveFor(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false
    const opponent = oppositePlayerFor(player)
    if ((opponent && isInactive(opponent)) || enemyRunnerInOwnHalfFor(player)) {
      player.defensiveStrategyDone = true
      return false
    }
    return Boolean(opponent && !isInactive(opponent))
  }
  
  function queueInactive(player, stones = HIT_STONES, source = null) {
    if (canDoubleAgainst(player, source)) {
      if (source && source !== player && canDoubleAgainst(source, player)) {
        announceDouble(source, player)
        queueDoubleParticipant(source, stones)
      }
      queueDoubleParticipant(player, stones)
      return
    }
  
    makeInactive(player, stones)
  }
  
  const decision = createDecisionEngine({ state, attack, rng })
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
    player.overzahlDefenseTimer = 0
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
    player.overzahlDefenseTimer = 0
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
  
  function distanceToSegmentWithT(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared <= 0.001) return { distance: distance(point, start), t: 0 }
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    const x = start.x + dx * t
    const y = start.y + dy * t
    return {
      distance: Math.hypot(point.x - x, point.y - y),
      t,
    }
  }
  
  function chainPhaseForPlayer(player) {
    const idNumber = Number(player.id.split('-')[1]) || 0
    return idNumber * 1.37 + (player.team === 'blue' ? 0 : Math.PI)
  }
  
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }
  
  function chainOrbitBall(player) {
    const speed = Math.hypot(player.vx, player.vy)
    const phase = chainPhaseForPlayer(player)
    const direction = player.team === 'blue' ? 1 : -1
    const frequency = speed > 20 ? 7.2 : 5.4
    const angle = state.roundTime * frequency * direction + phase
    const pulse = Math.sin(state.roundTime * 4 + phase) * 3
    const radius = CHAIN_BAND_VISUAL.orbitRadius + pulse
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  }
  
  function chainVisualStrikeRadius(player) {
    return Math.max(CHAIN_BAND_VISUAL.orbitRadius, pompfeFor(player).attackRange - 8)
  }
  
  function chainStrikeBall(player) {
    const target = player.chainStrikeTarget
    const strikeRadius = chainVisualStrikeRadius(player)
    const targetX = target?.x ?? player.chainStrikeX ?? player.x + Math.cos(player.angle) * strikeRadius
    const targetY = target?.y ?? player.chainStrikeY ?? player.y + Math.sin(player.angle) * strikeRadius
    const dx = targetX - player.x
    const dy = targetY - player.y
    const cos = Math.cos(-player.angle)
    const sin = Math.sin(-player.angle)
    const localX = dx * cos - dy * sin
    const localY = dx * sin + dy * cos
    const localDistance = Math.hypot(localX, localY) || 1
    const radius = clamp(localDistance, CHAIN_BAND_VISUAL.orbitRadius * 0.85, strikeRadius)
    return {
      x: (localX / localDistance) * radius,
      y: (localY / localDistance) * radius,
    }
  }
  
  function chainBallLocal(player) {
    const orbit = chainOrbitBall(player)
    const duration = player.chainStrikeDuration || 0
    const progress = duration > 0 && player.chainStrikeTimer > 0 ? clamp(1 - player.chainStrikeTimer / duration, 0, 1) : 1
    if (progress >= 1) return orbit
  
    const target = chainStrikeBall(player)
    let mix = 0
    if (progress < 0.4) {
      mix = easeInOut(progress / 0.4)
    } else if (progress < 0.78) {
      mix = 1 - easeInOut((progress - 0.4) / 0.38)
    }
  
    return {
      x: orbit.x + (target.x - orbit.x) * mix,
      y: orbit.y + (target.y - orbit.y) * mix,
    }
  }
  
  function localToWorld(player, point) {
    const cos = Math.cos(player.angle)
    const sin = Math.sin(player.angle)
    return {
      x: player.x + point.x * cos - point.y * sin,
      y: player.y + point.x * sin + point.y * cos,
    }
  }
  
  function chainBandSegment(player) {
    return {
      start: localToWorld(player, { x: CHAIN_BAND_VISUAL.handleX, y: CHAIN_BAND_VISUAL.handleY }),
      end: localToWorld(player, chainBallLocal(player)),
    }
  }
  
  function capPlayerVelocity(player, maxSpeed = player.speed * 1.2) {
    const currentSpeed = Math.hypot(player.vx, player.vy)
    if (currentSpeed <= maxSpeed || currentSpeed <= 0.001) return
    const scale = maxSpeed / currentSpeed
    player.vx *= scale
    player.vy *= scale
  }
  
  function constrainMovingPlayer(player) {
    const beforeX = player.x
    const beforeY = player.y
    const intendedVx = player.vx
    const intendedVy = player.vy
    const nearest = nearestFieldBoundary(player)
    constrainToField(player, player.radius)
    const wasConstrained = Math.abs(player.x - beforeX) > 0.001 || Math.abs(player.y - beforeY) > 0.001
    if (!wasConstrained) return
  
    const inward = fieldBoundaryInwardNormal(nearest)
    const outwardVelocity = player.vx * inward.x + player.vy * inward.y
    if (outwardVelocity < 0) {
      player.vx -= outwardVelocity * inward.x
      player.vy -= outwardVelocity * inward.y
    }

    const tangent = normalize(nearest.b.x - nearest.a.x, nearest.b.y - nearest.a.y)
    const tangentVelocity = player.vx * tangent.x + player.vy * tangent.y
    const intendedTangentVelocity = intendedVx * tangent.x + intendedVy * tangent.y
    if (Math.abs(tangentVelocity) < 12 && Math.abs(intendedTangentVelocity) > 18) {
      const sign = Math.sign(intendedTangentVelocity)
      const slideSpeed = Math.min(player.speed * 0.36, Math.abs(intendedTangentVelocity) * 0.55)
      player.vx = tangent.x * sign * slideSpeed + inward.x * 8
      player.vy = tangent.y * sign * slideSpeed + inward.y * 8
    }
  
    player.vx *= 0.82
    player.vy *= 0.82
    const maxSpeed = isRecoveryDashing(player) ? (player.recoveryDashSpeed || RECOVERY_DASH_SPEED) : player.speed * 1.15
    capPlayerVelocity(player, maxSpeed)
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
    if (!canEnterFromOutsideStart(player)) constrainMovingPlayer(player)
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
  
  function resolveChainBandCollisions() {
    const chainPlayers = state.players.filter((player) => player.pompfe === 'chain' && player.chainStrikeTimer > 0 && !isInactive(player))
    if (chainPlayers.length <= 0) return
  
    for (const chainPlayer of chainPlayers) {
      const segment = chainBandSegment(chainPlayer)
      const sx = segment.end.x - segment.start.x
      const sy = segment.end.y - segment.start.y
      const segmentLength = Math.hypot(sx, sy)
      if (segmentLength < 24) continue
  
      for (const player of state.players) {
        if (player === chainPlayer) continue
        const bandHit = distanceToSegmentWithT(player, segment.start, segment.end)
        if (bandHit.t >= CHAIN_BAND_END_CLEARANCE) continue
        const closest = closestPointOnSegment(player, segment.start, segment.end)
        const dx = player.x - closest.x
        const dy = player.y - closest.y
        const d = bandHit.distance
        const bandRadius = player.radius + CHAIN_BLOCKER_PADDING
        const overlap = bandRadius - d
        if (overlap <= 0) continue
  
        const fallback = { x: -sy / segmentLength, y: sx / segmentLength }
        const nx = d > 0.001 ? dx / d : fallback.x
        const ny = d > 0.001 ? dy / d : fallback.y
        const mobility = player.pinnedBy || isGrappling(player) ? 0 : isInactive(player) ? 0.25 : 1
        if (mobility <= 0) continue
  
        player.x += nx * overlap * mobility
        player.y += ny * overlap * mobility
        const intoBand = player.vx * nx + player.vy * ny
        if (intoBand < 0) {
          player.vx -= intoBand * nx
          player.vy -= intoBand * ny
        }
        constrainToField(player, player.radius)
      }
    }
  }
  
  function hitChance(attacker, target) {
    if (attacker.pompfe !== 'chain' && target.pompfe === 'chain' && isPompfer(attacker) && isPompfer(target)) return 1
  
    const profile = pompfeFor(attacker)
    const backHit = isBackHit(attacker, target)
    const shieldBonus = !backHit && isShieldBlockFacing(target, attacker) ? pompfeFor(target).shieldBlockBonus : 0
    let chance = attacker.technik / (attacker.technik + target.technik + shieldBonus)
    if (isRunner(target)) chance += profile.runnerHitBonus
    if (attacker.attackWhileMoving) chance -= profile.runningAttackPenalty
    if (hasDefensiveStance(attacker)) chance -= DEFENSIVE_HIT_MODIFIER
    if (hasDefensiveStance(target)) chance -= DEFENSIVE_HIT_MODIFIER
    if (backHit) chance *= 2
    return clamp(chance, 0.02, 0.98)
  }

  function hasDefensiveStance(player) {
    return player.overzahlDefenseTimer > 0 || (isDefensiveStrategyPlayer(player) && !player.defensiveStrategyDone)
  }
  
  function isBackHit(attacker, target) {
    const hitAngle = Math.atan2(attacker.y - target.y, attacker.x - target.x)
    const rearAngle = target.angle + Math.PI
    const rearDelta = Math.abs(Math.atan2(Math.sin(hitAngle - rearAngle), Math.cos(hitAngle - rearAngle)))
    return rearDelta < 1.05
  }
  
  function chainAttackBlocked(attacker, target) {
    if (attacker.pompfe !== 'chain') return false
  
    const start = { x: attacker.x, y: attacker.y }
    const end = { x: target.x, y: target.y }
    for (const blocker of state.players) {
      if (blocker === attacker || blocker === target) continue
      const hit = distanceToSegmentWithT(blocker, start, end)
      if (hit.t <= 0.08 || hit.t >= 0.96) continue
      if (hit.distance <= blocker.radius + CHAIN_BLOCKER_PADDING) return true
    }
  
    return false
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
    const aHits = rng.chance(aChance)
    const bHits = rng.chance(bChance)
  
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
      if (isInAttackArc(attacker, target, range) && !chainAttackBlocked(attacker, target)) return target
    }
  
    for (const target of state.players) {
      if (target.team === attacker.team || isInactive(target)) continue
      const d = distance(attacker, target)
      const range = attackRangeFor(attacker, target)
      const inArc = isInAttackArc(attacker, target, range)
      const score = d - (isRunner(target) ? 24 : 0)
      if (d < range && inArc && !chainAttackBlocked(attacker, target) && score < bestScore) {
        best = target
        bestScore = score
      }
    }
  
    return best
  }
  
  function triggerFlankStrategy(attacker, target) {
    if (!attacker || !target || attacker.strategy !== 'flank' || attacker.strategyTriggered) return
    if (!isPompfer(attacker) || state.roundTime > FLANK_TRIGGER_ROUND_TIME) return
    if (canDoubleAgainst(target, attacker)) return
  
    attacker.strategyTriggered = true
    attacker.flankTimer = FLANK_DURATION
    attacker.callBubbleText = 'Umlaufen!'
    attacker.callBubbleTimer = 1
  }
  
  function resolveStrikeEvents(events) {
    const hits = []
  
    for (const attacker of events) {
      if (!isPompfer(attacker)) continue
      const target = findStrikeTarget(attacker)
      attacker.attackTarget = null
      if (!target) continue
  
      if (rng.chance(hitChance(attacker, target))) {
        hits.push({ attacker, target })
      }
    }

    const reciprocalHits = new Set()
    for (const hit of hits) {
      if (hits.some((other) => other.attacker === hit.target && other.target === hit.attacker)) {
        reciprocalHits.add(hit)
      }
    }
  
    for (const hit of hits) {
      const penaltyStones = hit.attacker.pompfe === 'chain' ? CHAIN_HIT_STONES : HIT_STONES
      const targetCanDouble = canDoubleAgainst(hit.target, hit.attacker)
      if (hit.attacker.pompfe === 'chain') {
        hit.attacker.attackCooldown = Math.max(hit.attacker.attackCooldown, ATTACK_COOLDOWN * CHAIN_HIT_COOLDOWN_MULTIPLIER)
      }
      if (hit.target.pompfe === 'chain') {
        cancelAttack(hit.target)
      }
      triggerFlankStrategy(hit.attacker, hit.target)
      if (!reciprocalHits.has(hit) && !targetCanDouble) {
        decision.tryIssueOverzahlCall(hit.attacker, hit.target)
      }
      queueInactive(hit.target, penaltyStones, hit.attacker)
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
        defensiveBindingActiveFor(pinner) ||
        pinner.flankTimer > 0 ||
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
      if (defensiveBindingActiveFor(pinner)) continue
      if (pinner.flankTimer > 0) continue
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
  
    const challengerWins = rng.chance(techniqueContestChance(challenger, carrier))
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
  
      beginRoundBreak(state.message)
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
  
  function updateRoundBreak(dt) {
    if (state.roundBreakTimer <= 0) return false
    const realDt = dt / Math.max(state.playbackSpeed, 0.001)
    state.roundBreakTimer = Math.max(0, state.roundBreakTimer - realDt)
    const seconds = Math.ceil(state.roundBreakTimer)
    state.message = seconds > 0 ? `${state.roundBreakLabel} - Strategiepause ${seconds}` : 'Neuer Zug'
    state.messageTimer = 0.4
  
    for (const player of state.players) {
      player.vx = 0
      player.vy = 0
    }
  
    if (state.roundBreakTimer <= 0) {
      state.roundBreakLabel = ''
      resetRound('Neuer Zug')
    }
  
    updateParticles(dt)
    return true
  }
  
  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = rng.range(0, Math.PI * 2)
      const speed = rng.range(80, 240)
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rng.range(0.35, 0.7),
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
  
    if (updateRoundBreak(dt)) return
  
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
        player.flankTimer = Math.max(0, player.flankTimer - dt)
        player.overzahlDefenseTimer = Math.max(0, player.overzahlDefenseTimer - dt)
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
      resolveChainBandCollisions()
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
  return {
    reportFrameError,
    resetMatch,
    renderSkillPanel,
    deterministicSnapshot,
    setBluePompfe,
    setBluePlayerStrategy,
    setBluePosition,
    setBlueSkill,
    setBlueTeamStrategy,
    setMatchSeed,
    setPlaybackSpeed,
    startMatch,
    togglePause,
    update,
  }
}
