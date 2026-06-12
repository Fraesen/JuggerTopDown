import { createDecisionEngine } from './decisions.js'
import { createChainVisuals } from './chainVisuals.js'
import {
  FIELD,
  STONE_SECONDS,
  TEAMS,
} from './config.js'
import { distance } from './geometry.js'
import {
  isInactive,
  isRecoveryDashing,
  isQuick,
} from './players.js'
import { ROUND_BREAK_STONES } from './state.js'
import { createParticleSystem } from './particles.js'
import { advanceAttackWindup, advancePlayerTimers } from './playerTimers.js'
import { createCombatStateSystem } from './simulation/combatState.js'
import { createCinemaIntegration } from './simulation/cinemaIntegration.js'
import { createMatchLifecycle } from './simulation/lifecycle.js'
import { createMovementSystem } from './simulation/movement.js'
import { createJuggCombatSystem } from './simulation/juggCombat.js'
import { createTeamSetupSystem } from './simulation/teamSetup.js'
import { t, teamLabel } from '../i18n/index.js'

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
  
  let lifecycle
  function roundBreakStonesLeft() {
    return lifecycle.roundBreakStonesLeft()
  }

  function isRoundBreakLocked() {
    return lifecycle.isRoundBreakLocked()
  }

  function shouldPreviewSetupAtGroundLine() {
    return lifecycle.shouldPreviewSetupAtGroundLine()
  }

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
  
  const cinemaIntegration = createCinemaIntegration({
    state,
    hud,
    cinema,
    headless,
    rng,
    updateHud,
    createSimulation,
  })
  const {
    analyzeCinemaScenes,
    prepareCinemaPrecompute,
    setCinemaMode,
    setPlaybackSpeed,
  } = cinemaIntegration

  lifecycle = createMatchLifecycle({
    state,
    hud,
    cinema,
    headless,
    rng,
    updateHud,
    updatePlayerTooltip,
    applyNextTeamStrategies,
    renderSkillPanel,
    resetNextTeamStrategies,
    prepareCinemaPrecompute,
    onRoundBreakStarted,
    onRoundStarted,
  })
  const {
    awardScore,
    beginRoundBreak,
    deterministicSnapshot,
    resetMatch,
    resetRound,
    setMatchSeed,
    startMatch,
    syncPvpRoundBreak,
    togglePause,
  } = lifecycle
  
  let combatState
  function attack(player, target = null) {
    return combatState.attack(player, target)
  }

  function startRecoveryDash(player) {
    return combatState.startRecoveryDash(player)
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

  combatState = createCombatStateSystem({
    state,
    cinema,
    burst,
    chainVisualStrikeRadius,
    distanceToSegmentWithT,
    releaseGrapple,
    getDecision: () => decision,
    CHAIN_BLOCKER_PADDING,
  })
  const {
    advanceGlobalStone,
    announceDouble,
    canDoubleAgainst,
    cancelAttack,
    chainAttackBlocked,
    defensiveBindingActiveFor,
    hitChance,
    makeInactive,
    nearbyActiveEnemyPayload,
    playerPoint,
    queueDoubleParticipant,
    queueInactive,
  } = combatState
  
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
      awardScore(quick, () => burst(mal.x, mal.y, TEAMS[quick.team].color, 28))
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
