import { createDecisionEngine } from '../decisions.js'
import { createCinemaDirector } from '../cinema.js'
import { CHAIN_STRIKE_VISUAL_DURATION, createChainVisuals } from '../chainVisuals.js'
import {
  ATTACK_DURATION,
  DOUBLE_HIT_WINDOW,
  DOUBLE_PIN_RELEASE_PAUSE,
  FIELD,
  HIT_STONES,
  MATCH_POINT,
  MATCH_SECONDS,
  MOVEMENT_SPEED_FACTOR,
  RECOVERY_DASH_DURATION,
  RECOVERY_DASH_SPEED,
  RUNNING_ATTACK_SPEED_THRESHOLD,
  STONE_SECONDS,
  TEAM_STRATEGIES,
  TEAMS,
} from '../config.js'
import { clamp, distance, normalize } from '../geometry.js'
import {
  createPlayer,
  isInactive,
  isPompfer,
  isRecoveryDashing,
  isQuick,
  playerIndex,
} from '../players.js'
import { isShieldBlockFacing, pompfeFor } from '../pompfen.js'
import {
  AGGRESSIVE_DOUBLE_WINDOW_FACTOR,
  DEFENSIVE_HIT_MODIFIER,
  doubleWindowFactorFor,
  isAggressiveStrategyPlayer,
  isDefensiveStrategyPlayer,
  normalizeTeamStrategy,
} from '../strategies.js'
import {
  PLAYBACK_SPEEDS,
  ROUND_BREAK_LOCK_STONES,
  ROUND_BREAK_SECONDS,
  ROUND_BREAK_STONES,
  SIMULATION_STEP_SECONDS,
  createInitialState,
} from '../state.js'
import { createSeededRng } from '../rng.js'
import { createParticleSystem } from '../particles.js'
import { advanceAttackWindup, advancePlayerTimers } from '../playerTimers.js'
import { createMovementSystem } from './movement.js'
import { createJuggCombatSystem } from './juggCombat.js'
import { createTeamSetupSystem } from './teamSetup.js'
import { cloneStateForCinemaPrecompute, createHeadlessHud } from '../cinemaPrecomputeState.js'
import { t, teamLabel } from '../../i18n/index.js'

const CINEMA_PRECOMPUTE_SECONDS = MATCH_SECONDS

export function createSimulation({
  state,
  hud,
  updateHud,
  updatePlayerTooltip,
  cinema = null,
  headless = false,
  onLocalTeamConfigChanged = null,
  onRoundBreakStarted = null,
  onRoundStarted = null,
  getPlayerNames = null,
}) {
  const rng = state.rng
  const CHAIN_HIT_COOLDOWN_MULTIPLIER = 2
  const CHAIN_BLOCKER_PADDING = 8
  const CHAIN_BAND_END_CLEARANCE = 0.84
  const chainVisuals = createChainVisuals({ state })
  const { chainBandSegment, chainVisualStrikeRadius } = chainVisuals
  const particles = createParticleSystem({ state, rng })
  const { burst, updateParticles } = particles
  
  const teamSetup = createTeamSetupSystem({
    state,
    hud,
    headless,
    updateHud,
    updatePlayerTooltip,
    onLocalTeamConfigChanged,
    getPlayerNames,
    isRoundBreakLocked,
    shouldPreviewSetupAtGroundLine,
  })
  const {
    applyNextTeamStrategies,
    applyTeamConfig,
    applyTeamPositions,
    applyTeamSkills,
    canEditTeam,
    editableTeam,
    exportTeamConfig,
    notifyLocalTeamConfigChanged,
    opponentTeam,
    releaseGrapple,
    renderSkillPanel,
    resetNextTeamStrategies,
    resetStrategyState,
    setBluePompfe,
    setBluePosition,
    setBlueSkill,
    setBlueTeamStrategy,
  } = teamSetup
  function roundBreakStonesLeft() {
    return Math.ceil(state.roundBreakTimer / STONE_SECONDS)
  }

  function isRoundBreakLocked() {
    return state.roundBreakTimer > 0 && roundBreakStonesLeft() <= ROUND_BREAK_LOCK_STONES
  }
  
  function setupTeams() {
    state.players = [
      createPlayer('blue', 0, 'quick'),
      createPlayer('blue', 1, 'pompfer'),
      createPlayer('blue', 2, 'pompfer'),
      createPlayer('blue', 3, 'pompfer'),
      createPlayer('blue', 4, 'pompfer'),
      createPlayer('red', 0, 'quick'),
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
    state.jugg.quick = null
    state.jugg.contest = null
    state.jugg.cooldown = 0.45
  }
  
  function resetRound(message = t('controls.start')) {
    applyNextTeamStrategies({ resetOpening: true })
    setupTeams()
    resetJugg()
    state.roundBreakTimer = 0
    state.roundBreakLocked = false
    state.roundBreakPrecomputed = false
    state.roundSetupOpen = false
    state.roundTime = 0
    state.message = message
    state.messageTimer = 1.5
    if (!headless && state.running && cinema?.isEnabled()) prepareCinemaPrecompute()
    if (!headless && state.running) onRoundStarted?.({ reason: 'new-round' })
  }
  
  function beginRoundBreak(message, { notify = true } = {}) {
    resetNextTeamStrategies()
    resetTeamsToGroundLinePreview()
    state.roundBreakTimer = ROUND_BREAK_SECONDS
    state.roundBreakLabel = message
    state.roundBreakLocked = false
    state.roundBreakPrecomputed = false
    state.roundSetupOpen = true
    state.message = t('match.strategyBreakWithStones', { label: message, stones: ROUND_BREAK_STONES })
    state.messageTimer = ROUND_BREAK_SECONDS
    state.jugg.quick = null
    state.jugg.contest = null
    for (const player of state.players) {
      player.vx = 0
      player.vy = 0
    }
    renderSkillPanel()
    if (notify && state.app.mode === 'pvpMatch') {
      onRoundBreakStarted?.({
        roundId: state.pvp.roundId,
        label: message,
        score: { ...state.score },
      })
    }
  }

  function syncPvpRoundBreak({ roundId, nextRoundId, label, score, breakEndsAt }) {
    if (state.app.mode !== 'pvpMatch') return
    const incomingRoundId = Number(roundId)
    if (Number.isFinite(incomingRoundId) && incomingRoundId < state.pvp.roundId) return
    state.pvp.roundId = Number.isFinite(incomingRoundId) ? incomingRoundId : state.pvp.roundId
    state.pvp.nextRoundId = Number.isFinite(Number(nextRoundId)) ? Number(nextRoundId) : state.pvp.roundId + 1
    state.pvp.roundBreakEndsAt = breakEndsAt ?? null
    if (score?.blue !== undefined && score?.red !== undefined) {
      state.score.blue = Number(score.blue) || 0
      state.score.red = Number(score.red) || 0
    }
    if (state.roundBreakTimer <= 0) {
      beginRoundBreak(label || t('match.point'), { notify: false })
    } else {
      state.roundBreakLabel = label || state.roundBreakLabel
      state.message = t('match.strategyBreakWithStones', { label: state.roundBreakLabel, stones: ROUND_BREAK_STONES })
    }
    renderSkillPanel()
    updateHud()
  }
  
  function resetMatch() {
    const nextRng = createSeededRng(state.matchSeed)
    rng.seed = nextRng.seed
    rng.state = nextRng.state
    state.rng = rng
    state.frameAccumulator = 0
    cinema?.reset({ preserveEnabled: true })
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
    state.roundBreakLocked = false
    state.roundBreakPrecomputed = false
    state.roundSetupOpen = false
    state.pvp.roundId = 1
    state.pvp.nextRoundId = 1
    state.pvp.roundBreakEndsAt = null
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
    hud.startBtn.textContent = t('controls.start')
    hud.pauseBtn.textContent = t('controls.pause')
    resetRound(t('match.ready'))
    updateHud()
  }

  function setMatchSeed(seed, { resetRng = !state.running } = {}) {
    state.matchSeed = String(seed || '').trim() || state.matchSeed
    if (!resetRng) return
    const nextRng = createSeededRng(state.matchSeed)
    rng.seed = nextRng.seed
    rng.state = nextRng.state
    state.rng = rng
    state.frameAccumulator = 0
    cinema?.reset({ preserveEnabled: true })
    updateHud()
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
      const active = Number(button.dataset.speed) === speed && !state.cinema.enabled
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
      button.disabled = state.cinema.enabled
    }
  }

  function setCinemaMode(enabled) {
    cinema?.setEnabled(Boolean(enabled))
    state.frameAccumulator = 0
    if (enabled) prepareCinemaPrecompute()
    updateHud()
  }

  function prepareCinemaPrecompute() {
    if (headless || !cinema?.isEnabled()) return
    const { scenes, sceneBlockAfter } = precomputeCinemaScenes()
    cinema.ingestPrecomputedScenes(scenes, { sceneBlockAfter })
  }

  function precomputeCinemaScenes() {
    const savedTeamStrategies = { ...TEAM_STRATEGIES }
    const useNextRoundStrategies = state.roundBreakTimer > 0
    if (useNextRoundStrategies) {
      for (const team of Object.keys(TEAM_STRATEGIES)) {
        TEAM_STRATEGIES[team] = normalizeTeamStrategy(state.nextTeamStrategies[team])
      }
    }

    try {
      const forkState = cloneStateForPrecompute()
      const forkCinema = createCinemaDirector({ state: forkState, debug: false })
      forkCinema.setEnabled(true)
      const forkSimulation = createSimulation({
        state: forkState,
        hud: createHeadlessHud(),
        updateHud: () => {},
        updatePlayerTooltip: () => {},
        cinema: forkCinema,
        headless: true,
      })

      forkState.running = true
      forkState.paused = false
      const startTime = forkState.roundTime
      const maxTime = startTime + CINEMA_PRECOMPUTE_SECONDS
      while (forkState.running && !forkState.roundBreakTimer && forkState.roundTime < maxTime && forkState.timeLeft > 0) {
        forkSimulation.update(SIMULATION_STEP_SECONDS)
      }

      const roundEndAt = forkState.roundBreakTimer > 0 ? forkState.roundTime : null
      const sceneBlockAfter = roundEndAt === null ? null : Math.max(0, roundEndAt - STONE_SECONDS * 3)
      const scenes = forkCinema.exportPlannedScenes().filter((scene) => !sceneTouchesBlockedEnd(scene, sceneBlockAfter))
      return { scenes, sceneBlockAfter }
    } finally {
      for (const team of Object.keys(savedTeamStrategies)) TEAM_STRATEGIES[team] = savedTeamStrategies[team]
    }
  }

  function sceneTouchesBlockedEnd(scene, sceneBlockAfter) {
    if (canPlayDuringCinemaEndPhase(scene)) return false
    return sceneBlockAfter !== null && (scene.endAt ?? scene.createdAt ?? 0) > sceneBlockAfter
  }

  function canPlayDuringCinemaEndPhase(scene) {
    return scene?.type === 'quick_jugg_against_odds' && scene.event?.type === 'score' && Boolean(scene.event?.quickId)
  }

  function cloneStateForPrecompute() {
    return cloneStateForCinemaPrecompute({ state, rng })
  }

  function analyzeCinemaScenes({ seed = null, fresh = false } = {}) {
    if (!fresh && (seed === null || String(seed) === state.matchSeed)) return precomputeCinemaScenes().scenes

    const forkState = createInitialState(String(seed ?? state.matchSeed))
    forkState.app.mode = state.app.mode
    forkState.nextTeamStrategies = { ...state.nextTeamStrategies }
    forkState.playbackSpeed = state.playbackSpeed
    const forkCinema = createCinemaDirector({ state: forkState, debug: false })
    const forkSimulation = createSimulation({
      state: forkState,
      hud: createHeadlessHud(),
      updateHud: () => {},
      updatePlayerTooltip: () => {},
      cinema: forkCinema,
      headless: true,
    })
    forkSimulation.resetMatch()
    return forkSimulation.analyzeCinemaScenes()
  }
  
  function startMatch() {
    if (state.timeLeft <= 0 || state.score.blue >= MATCH_POINT || state.score.red >= MATCH_POINT) resetMatch()
    const wasRunning = state.running
    if (!state.running) applyNextTeamStrategies({ resetOpening: true })
    state.running = true
    state.paused = false
    state.message = t('match.running')
    state.messageTimer = 1.2
    hud.startBtn.textContent = t('controls.continue')
    hud.pauseBtn.textContent = t('controls.pause')
    if (!wasRunning && cinema?.isEnabled()) prepareCinemaPrecompute()
    if (!wasRunning) onRoundStarted?.({ reason: 'match-start' })
  }
  
  function togglePause() {
    if (!state.running) return
    state.paused = !state.paused
    hud.pauseBtn.textContent = state.paused ? t('controls.continue') : t('controls.pause')
    state.message = state.paused ? t('match.pause') : t('match.running')
    state.messageTimer = 0.8
    updatePlayerTooltip()
  }
  
  function throwJugg(quick, force = 535) {
    if (state.jugg.quick !== quick || !isQuick(quick) || quick.grappledBy) return
    const aim = quick.angle
    state.jugg.quick = null
    state.jugg.x = quick.x + Math.cos(aim) * 28
    state.jugg.y = quick.y + Math.sin(aim) * 28
    state.jugg.vx = Math.cos(aim) * force + quick.vx * 0.28
    state.jugg.vy = Math.sin(aim) * force + quick.vy * 0.28
    state.jugg.cooldown = 0.32
    burst(state.jugg.x, state.jugg.y, TEAMS[quick.team].color, 10)
  }
  
  function dropJugg(quick) {
    if (state.jugg.quick !== quick) return
    state.jugg.quick = null
    state.jugg.contest = null
    state.jugg.vx = quick.vx * 0.25
    state.jugg.vy = quick.vy * 0.25
    state.jugg.cooldown = 0.58
  }

  function playerPoint(player) {
    return player ? { x: player.x, y: player.y } : null
  }

  function nearbyActiveEnemyPayload(player, radius = 190) {
    return state.players
      .filter((other) => other.team !== player.team && !isInactive(other) && distance(player, other) <= radius)
      .sort((a, b) => distance(player, a) - distance(player, b))
      .map((enemy) => ({ id: enemy.id, point: playerPoint(enemy) }))
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
    const speedFactor = clamp(player.speed / (195 * MOVEMENT_SPEED_FACTOR), 0.82, 1.24)
  
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
  
  function makeInactive(player, stones = HIT_STONES, source = null) {
    if (isInactive(player) && player.penaltyStones >= stones) return
    cinema?.recordEvent({
      type: 'madeInactive',
      playerId: player.id,
      sourceId: source?.id ?? null,
      stones,
      point: playerPoint(player),
    })
    releaseGrapple(player)
    if (state.jugg.quick === player) dropJugg(player)
    if (state.jugg.contest?.quicks.includes(player)) {
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
    player.quickJuggRetreatTimer = 0
    player.quickJuggRetreatX = 0
    player.quickJuggRetreatY = 0
    player.callTimer = 0
    player.callType = null
    player.callSource = null
    player.callContext = null
    player.callBubbleTimer = 0
    player.callBubbleText = ''
    player.callMissTimer = 0
    player.overzahlDefenseTimer = 0
    player.doublePinTrapTarget = null
    player.doublePinReleaseTarget = null
    player.doublePinReleasePause = 0
    player.vx = 0
    player.vy = 0
  }
  
  function announceDouble(attacker, target) {
    if (!attacker || !target) return
    for (const player of [attacker, target]) {
      player.callBubbleText = t('call.double')
      player.callBubbleTimer = 0.95
    }
  }
  
  function queueDoubleParticipant(player, stones) {
    if (!player || isInactive(player)) return
  
    if (canDouble(player)) {
      player.pendingInactiveStones = Math.max(player.pendingInactiveStones, stones)
      player.vx = 0
      player.vy = 0
      if (state.jugg.quick === player) dropJugg(player)
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
  
  function enemyQuickInOwnHalfFor(player) {
    const enemyQuick = state.players.find((other) => other.team !== player.team && isQuick(other) && !isInactive(other))
    if (!enemyQuick) return false
    return player.team === 'blue' ? enemyQuick.x < FIELD.center.x : enemyQuick.x > FIELD.center.x
  }
  
  function defensiveBindingActiveFor(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false
    const opponent = oppositePlayerFor(player)
    if ((opponent && isInactive(opponent)) || enemyQuickInOwnHalfFor(player)) {
      player.defensiveStrategyDone = true
      return false
    }
    return Boolean(opponent && !isInactive(opponent))
  }
  
  function queueInactive(player, stones = HIT_STONES, source = null) {
    cinema?.recordEvent({
      type: 'inactiveQueued',
      playerId: player.id,
      sourceId: source?.id ?? null,
      stones,
      point: playerPoint(player),
    })
    if (canDoubleAgainst(player, source)) {
      if (source && source !== player && canDoubleAgainst(source, player)) {
        announceDouble(source, player)
        queueDoubleParticipant(source, stones)
      }
      queueDoubleParticipant(player, stones)
      return
    }
  
    makeInactive(player, stones, source)
  }
  
  const decision = createDecisionEngine({ state, attack, rng })
  const movement = createMovementSystem({
    state,
    startRecoveryDash,
    chainBandSegment,
    CHAIN_BAND_END_CLEARANCE,
    CHAIN_BLOCKER_PADDING,
  })
  const {
    distanceToSegmentWithT,
    isQuickInJuggContest,
    movePlayer,
    resolveChainBandCollisions,
    separatePlayers,
    updateInactivePlayer,
    updateRecoveryDash,
    updateQuickJuggRetreat,
  } = movement
  function hitChance(attacker, target) {
    if (attacker.pompfe !== 'chain' && target.pompfe === 'chain' && isPompfer(attacker) && isPompfer(target)) return 1
  
    const profile = pompfeFor(attacker)
    const backHit = isBackHit(attacker, target)
    const shieldBonus = !backHit && isShieldBlockFacing(target, attacker) ? pompfeFor(target).shieldBlockBonus : 0
    let chance = attacker.technik / (attacker.technik + target.technik + shieldBonus)
    if (isQuick(target)) chance += profile.quickHitBonus
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
  
  const juggCombat = createJuggCombatSystem({
    state,
    rng,
    cinema,
    burst,
    playerPoint,
    nearbyActiveEnemyPayload,
    canDoubleAgainst,
    announceDouble,
    queueDoubleParticipant,
    queueInactive,
    cancelAttack,
    decision,
    hitChance,
    chainAttackBlocked,
    defensiveBindingActiveFor,
    releaseGrapple,
    CHAIN_HIT_COOLDOWN_MULTIPLIER,
  })
  const { resolvePins, resolveStrikeEvents, updateJugg } = juggCombat
  function checkScoring() {
    const quick = state.jugg.quick
    if (!quick || !isQuick(quick) || isInactive(quick)) return
    if (quick.grappledBy) {
      if (distance(quick, TEAMS[quick.team].attackMal) < FIELD.malRadius + quick.radius) {
        state.message = 'Jugg umkaempft'
        state.messageTimer = 0.6
      }
      return
    }
  
    const mal = TEAMS[quick.team].attackMal
    if (distance(quick, mal) < FIELD.malRadius + quick.radius) {
      cinema?.recordEvent({
        type: 'score',
        ...cinema.quickOddsPayload(quick),
      })
      state.score[quick.team] += 1
      state.message = t('match.teamScores', { team: teamLabel(quick.team) })
      state.messageTimer = 2
      burst(mal.x, mal.y, TEAMS[quick.team].color, 28)
  
      if (state.score[quick.team] >= MATCH_POINT) {
        state.running = false
        state.message = t('match.teamWins', { team: teamLabel(quick.team) })
        state.messageTimer = 99
        state.jugg.quick = null
        hud.startBtn.textContent = t('controls.newMatch')
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
      state.message = state.score.blue === state.score.red
        ? t('match.draw')
        : t('match.teamWins', { team: teamLabel(state.score.blue > state.score.red ? 'blue' : 'red') })
      state.messageTimer = 99
    }
  }
  
  function updateRoundBreak(dt) {
    if (state.roundBreakTimer <= 0) return false
    const wasLocked = state.roundBreakLocked
    const setupPaused = state.app.mode === 'bot' && state.roundSetupOpen && !state.roundBreakLocked
    if (state.app.mode === 'pvpMatch' && state.pvp.roundBreakEndsAt) {
      state.roundBreakTimer = Math.max(0, (state.pvp.roundBreakEndsAt - Date.now()) / 1000)
    } else if (!setupPaused) {
      const realDt = dt / Math.max(state.playbackSpeed, 0.001)
      state.roundBreakTimer = Math.max(0, state.roundBreakTimer - realDt)
    }
    state.roundBreakLocked = isRoundBreakLocked()
    const stonesLeft = roundBreakStonesLeft()
    state.message = stonesLeft > 0 ? t('match.strategyBreakWithStones', { label: state.roundBreakLabel, stones: stonesLeft }) : t('match.newRound')
    state.messageTimer = 0.4

    if (!wasLocked && state.roundBreakLocked) {
      state.roundBreakPrecomputed = true
      if (!headless && cinema?.isEnabled()) prepareCinemaPrecompute()
      renderSkillPanel()
      updateHud()
    }
  
    for (const player of state.players) {
      player.vx = 0
      player.vy = 0
    }
  
    if (state.roundBreakTimer <= 0) {
      state.roundBreakLabel = ''
      state.roundBreakLocked = false
      if (state.app.mode === 'pvpMatch') {
        state.pvp.roundId = state.pvp.nextRoundId || state.pvp.roundId + 1
        state.pvp.roundBreakEndsAt = null
      }
      resetRound(t('match.newRound'))
    }
  
    updateParticles(dt)
    return true
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
        advancePlayerTimers(player, dt, { onCallExpired: decision.clearCallIntent })
        if (player.attackWindup > 0) {
          if (advanceAttackWindup(player, dt)) strikeEvents.push(player)
        } else {
          if (player.attack <= 0) player.attackWhileMoving = false
  
          if (player.pendingInactiveStones > 0 && player.doubleWindow > 0) {
            player.vx = 0
            player.vy = 0
          } else if (player.pendingInactiveStones > 0) {
            makeInactive(player, player.pendingInactiveStones)
          } else if (isInactive(player)) {
            updateInactivePlayer(player, dt)
          } else if (isQuickInJuggContest(player)) {
            player.vx = 0
            player.vy = 0
          } else if (player.quickJuggRetreatTimer > 0) {
            updateQuickJuggRetreat(player, dt)
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
        reportFrameError(`Spielende ${player.id}`, error)
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
      cinema?.recordSnapshot()
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
    applyTeamConfig,
    analyzeCinemaScenes,
    exportTeamConfig,
    syncPvpRoundBreak,
    setCinemaMode,
    setBluePompfe,
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
