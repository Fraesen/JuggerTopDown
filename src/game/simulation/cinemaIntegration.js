import { createCinemaDirector } from '../cinema.js'
import { cloneStateForCinemaPrecompute, createHeadlessHud } from '../cinemaPrecomputeState.js'
import { MATCH_SECONDS, STONE_SECONDS } from '../config.js'
import { createInitialState, PLAYBACK_SPEEDS, SIMULATION_STEP_SECONDS } from '../state.js'
import { normalizeTeamStrategy } from '../strategies.js'
import { TEAM_STRATEGIES } from '../config.js'

const CINEMA_PRECOMPUTE_SECONDS = MATCH_SECONDS

export function createCinemaIntegration({
  state,
  hud,
  cinema,
  headless,
  rng,
  updateHud,
  createSimulation,
}) {
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

  return {
    analyzeCinemaScenes,
    prepareCinemaPrecompute,
    setCinemaMode,
    setPlaybackSpeed,
  }
}
