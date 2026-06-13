import {
  FIELD,
  MATCH_POINT,
  MATCH_SECONDS,
  STONE_SECONDS,
  TEAM_STRATEGIES,
} from '../config.js'
import { createPlayer } from '../players.js'
import { createSeededRng } from '../rng.js'
import { ROUND_BREAK_LOCK_STONES, ROUND_BREAK_SECONDS, ROUND_BREAK_STONES } from '../state.js'
import { t, teamLabel } from '../../i18n/index.js'

export function createMatchLifecycle({
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
}) {
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
    TEAM_STRATEGIES.blue = 'standard'
    TEAM_STRATEGIES.red = 'standard'
    resetNextTeamStrategies({ toDefaults: true })
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

  function awardScore(quick, burst) {
    state.score[quick.team] += 1
    state.message = t('match.teamScores', { team: teamLabel(quick.team) })
    state.messageTimer = 2
    burst()

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

  return {
    awardScore,
    beginRoundBreak,
    deterministicSnapshot,
    isRoundBreakLocked,
    resetJugg,
    resetMatch,
    resetRound,
    roundBreakStonesLeft,
    setMatchSeed,
    setupTeams,
    shouldPreviewSetupAtGroundLine,
    startMatch,
    syncPvpRoundBreak,
    togglePause,
  }
}
