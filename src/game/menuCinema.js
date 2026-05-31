import { createCinemaDirector } from './cinema.js'
import {
  FIELD,
  PLAYER_POSITIONS,
  PLAYER_SKILLS,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from './config.js'
import { createHeadlessHud } from './cinemaPrecomputeState.js'
import { createRenderer } from './renderer.js'
import { SIMULATION_STEP_SECONDS, createInitialState } from './state.js'
import { createSimulation } from './simulation.js'

export const MENU_CINEMA_REELS = [
  {
    seed: 'close-field-standard-aggressive-243',
    durationSeconds: 22,
    blueStrategy: 'standard',
    redStrategy: 'aggressive',
    loadouts: {
      blue: ['quick', 'staff', 'chain', 'qtip', 'shield'],
      red: ['quick', 'qtip', 'staff', 'chain', 'shield'],
    },
    positions: {
      blue: [0, 4, 2, 1, 3],
      red: [0, 3, 1, 4, 2],
    },
  },
  {
    seed: 'close-field-aggressive-defensive-661',
    durationSeconds: 18,
    blueStrategy: 'aggressive',
    redStrategy: 'defensive',
    loadouts: {
      blue: ['quick', 'shield', 'qtip', 'staff', 'chain'],
      red: ['quick', 'shield', 'qtip', 'staff', 'chain'],
    },
    positions: {
      blue: [0, 4, 2, 1, 3],
      red: [0, 3, 1, 4, 2],
    },
  },
  {
    seed: 'duel-spark-defensive-aggressive-533',
    durationSeconds: 18,
    blueStrategy: 'defensive',
    redStrategy: 'aggressive',
    loadouts: {
      blue: ['quick', 'shield', 'qtip', 'staff', 'chain'],
      red: ['quick', 'shield', 'qtip', 'staff', 'chain'],
    },
    positions: {
      blue: [0, 4, 2, 1, 3],
      red: [0, 3, 1, 4, 2],
    },
  },
  {
    seed: 'quick-chaos-standard-standard-51',
    durationSeconds: 18,
    blueStrategy: 'standard',
    redStrategy: 'standard',
    loadouts: {
      blue: ['quick', 'chain', 'qtip', 'staff', 'shield'],
      red: ['quick', 'shield', 'chain', 'staff', 'qtip'],
    },
    positions: {
      blue: [0, 4, 2, 1, 3],
      red: [0, 3, 1, 4, 2],
    },
  },
]

const MENU_ACTIVE_MODES = new Set(['menu', 'pvpLobby'])
const MAX_FRAME_SECONDS = 0.05
const MENU_CAMERA_MAX_ZOOM = 1.55
const STATIC_PREVIEW_SECONDS = 5

export function createMenuCinema({ canvas, appMode }) {
  if (!canvas) return { update: () => {}, reset: () => {} }

  const ctx = canvas.getContext('2d')
  const reducedMotionQuery = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

  let reelIndex = 0
  let reelElapsed = 0
  let frameAccumulator = 0
  let preview = null
  let staticFrameDrawn = false

  reducedMotionQuery?.addEventListener?.('change', () => {
    staticFrameDrawn = false
    resetCurrentReel()
  })

  function update(realDt) {
    const mode = appMode?.()
    if (!MENU_ACTIVE_MODES.has(mode)) {
      staticFrameDrawn = false
      return
    }

    ensurePreview()
    if (!preview) return

    if (reducedMotionQuery?.matches) {
      if (!staticFrameDrawn) {
        advanceSimulation(STATIC_PREVIEW_SECONDS)
        preview.renderer.draw()
        staticFrameDrawn = true
      }
      return
    }

    staticFrameDrawn = false
    const dt = Math.min(MAX_FRAME_SECONDS, realDt || SIMULATION_STEP_SECONDS)
    preview.cinema.update(dt)
    const playbackSpeed = preview.state.cinema.enabled ? preview.state.cinema.playbackSpeed : preview.state.playbackSpeed
    advanceSimulation(dt * playbackSpeed)
    applyMenuCameraTreatment(preview.state)
    preview.state.messageTimer = 0
    preview.renderer.draw()

    reelElapsed += dt
    if (reelElapsed >= activeReel().durationSeconds) nextReel()
  }

  function advanceSimulation(seconds) {
    frameAccumulator += seconds
    withTeamDefaults(activeReel(), () => {
      while (frameAccumulator >= SIMULATION_STEP_SECONDS) {
        preview.simulation.update(SIMULATION_STEP_SECONDS)
        frameAccumulator -= SIMULATION_STEP_SECONDS
      }
    })
  }

  function ensurePreview() {
    if (preview) return
    try {
      preview = createPreviewForReel(activeReel())
      reelElapsed = 0
      frameAccumulator = 0
    } catch (error) {
      console.error('[MenuCinema] Preview konnte nicht gestartet werden', error)
      preview = null
    }
  }

  function createPreviewForReel(reel) {
    return withTeamDefaults(reel, () => {
      const state = createInitialState(reel.seed)
      state.app.mode = 'bot'
      state.playbackSpeed = 1

      const cinema = createCinemaDirector({ state, debug: false })
      const renderer = createRenderer({ ctx, state })
      const simulation = createSimulation({
        state,
        hud: createHeadlessHud(),
        updateHud: () => {},
        updatePlayerTooltip: () => {},
        cinema,
        headless: true,
      })

      simulation.resetMatch()
      simulation.setCinemaMode(true)
      simulation.startMatch()
      state.messageTimer = 0

      return { cinema, renderer, simulation, state }
    })
  }

  function nextReel() {
    reelIndex = (reelIndex + 1) % MENU_CINEMA_REELS.length
    resetCurrentReel()
  }

  function resetCurrentReel() {
    preview = null
    reelElapsed = 0
    frameAccumulator = 0
    ensurePreview()
  }

  function activeReel() {
    return MENU_CINEMA_REELS[reelIndex]
  }

  return {
    reset: resetCurrentReel,
    update,
  }
}

function applyMenuCameraTreatment(state) {
  const camera = state.camera
  if (!camera || camera.zoom <= MENU_CAMERA_MAX_ZOOM) return
  const currentVisibleWidth = FIELD.width / camera.zoom
  const currentVisibleHeight = FIELD.height / camera.zoom
  const centerX = camera.x + currentVisibleWidth / 2
  const centerY = camera.y + currentVisibleHeight / 2
  const zoom = MENU_CAMERA_MAX_ZOOM
  const visibleWidth = FIELD.width / zoom
  const visibleHeight = FIELD.height / zoom
  camera.zoom = zoom
  camera.x = clamp(centerX - visibleWidth / 2, 0, FIELD.width - visibleWidth)
  camera.y = clamp(centerY - visibleHeight / 2, 0, FIELD.height - visibleHeight)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function withTeamDefaults(reel, callback) {
  const snapshot = snapshotTeamDefaults()
  applyReelDefaults(reel)
  try {
    return callback()
  } finally {
    restoreTeamDefaults(snapshot)
  }
}

function snapshotTeamDefaults() {
  return {
    loadouts: cloneTeamArray(TEAM_LOADOUTS),
    playerPositions: cloneTeamArray(PLAYER_POSITIONS),
    playerSkills: {
      blue: PLAYER_SKILLS.blue.map((skill) => ({ ...skill })),
      red: PLAYER_SKILLS.red.map((skill) => ({ ...skill })),
    },
    teamStrategies: { ...TEAM_STRATEGIES },
  }
}

function applyReelDefaults(reel) {
  if (reel.blueStrategy) TEAM_STRATEGIES.blue = reel.blueStrategy
  if (reel.redStrategy) TEAM_STRATEGIES.red = reel.redStrategy
  applyTeamArrayOverride(TEAM_LOADOUTS, reel.loadouts)
  applyTeamArrayOverride(PLAYER_POSITIONS, reel.positions)
  applySkillOverride(PLAYER_SKILLS, reel.skills)
}

function restoreTeamDefaults(snapshot) {
  restoreTeamArray(TEAM_LOADOUTS, snapshot.loadouts)
  restoreTeamArray(PLAYER_POSITIONS, snapshot.playerPositions)
  restoreSkillArray(PLAYER_SKILLS, snapshot.playerSkills)
  TEAM_STRATEGIES.blue = snapshot.teamStrategies.blue
  TEAM_STRATEGIES.red = snapshot.teamStrategies.red
}

function cloneTeamArray(source) {
  return {
    blue: [...source.blue],
    red: [...source.red],
  }
}

function applyTeamArrayOverride(target, override = {}) {
  for (const team of ['blue', 'red']) {
    if (Array.isArray(override[team])) target[team].splice(0, target[team].length, ...override[team])
  }
}

function restoreTeamArray(target, snapshot) {
  for (const team of ['blue', 'red']) {
    target[team].splice(0, target[team].length, ...snapshot[team])
  }
}

function applySkillOverride(target, override = {}) {
  for (const team of ['blue', 'red']) {
    if (!Array.isArray(override[team])) continue
    for (const [index, skill] of override[team].entries()) {
      if (target[team][index] && skill) target[team][index] = { ...target[team][index], ...skill }
    }
  }
}

function restoreSkillArray(target, snapshot) {
  for (const team of ['blue', 'red']) {
    target[team].splice(0, target[team].length, ...snapshot[team].map((skill) => ({ ...skill })))
  }
}
