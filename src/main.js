import './style.css'
import { createCinemaDirector } from './game/cinema.js'
import { createRenderer } from './game/renderer.js'
import { SIMULATION_STEP_SECONDS, createInitialState } from './game/state.js'
import { createSimulation } from './game/simulation.js'
import { mountAppShell } from './ui/appShell.js'
import { createHudController } from './ui/hudController.js'

const { canvas, ctx, arenaWrap, hud } = mountAppShell()

const state = createInitialState()

const renderer = createRenderer({ ctx, state })
const hudController = createHudController({ state, hud, canvas, arenaWrap })
const { canvasPointFromEvent, hidePlayerTooltip, updateHud, updatePlayerTooltip, zoomCameraAt } = hudController
const cinema = createCinemaDirector({ state })
const simulation = createSimulation({ state, hud, updateHud, updatePlayerTooltip, cinema })
const {
  reportFrameError,
  resetMatch,
  renderSkillPanel,
  setCinemaMode,
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
} = simulation
function loop(time) {
  const rawDt = Math.min(0.033, (time - state.lastTime) / 1000 || 0)
  state.lastTime = time
  try {
    if (state.running && !state.paused) {
      cinema.update(rawDt)
      const playbackSpeed = state.cinema.enabled ? state.cinema.playbackSpeed : state.playbackSpeed
      state.frameAccumulator = Math.min(state.frameAccumulator + rawDt * playbackSpeed, SIMULATION_STEP_SECONDS * 12)
      while (state.frameAccumulator >= SIMULATION_STEP_SECONDS) {
        update(SIMULATION_STEP_SECONDS)
        state.frameAccumulator -= SIMULATION_STEP_SECONDS
      }
    } else {
      state.frameAccumulator = 0
      update(rawDt)
    }
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
  hud.seedInput.addEventListener('change', applySeedFromInput)
  hud.seedInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    hud.seedInput.blur()
    applySeedFromInput()
  })
  for (const button of hud.speedButtons) {
    button.addEventListener('click', () => {
      if (!state.cinema.enabled) setPlaybackSpeed(Number(button.dataset.speed))
    })
  }
  hud.cinemaToggle.addEventListener('change', () => setCinemaMode(hud.cinemaToggle.checked))
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
    hidePlayerTooltip()
  })
  canvas.addEventListener('wheel', (event) => {
    if (state.cinema.enabled) {
      event.preventDefault()
      return
    }
    zoomCameraAt(event)
  }, { passive: false })
  hud.skillList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-player]')
    if (!button) return
    setBlueSkill(Number(button.dataset.player), button.dataset.skill, Number(button.dataset.delta))
  })
  hud.skillList.addEventListener('change', (event) => {
    const teamStrategySelect = event.target.closest('select[data-team-strategy]')
    if (teamStrategySelect) {
      setBlueTeamStrategy(teamStrategySelect.value)
      return
    }

    const positionSelect = event.target.closest('select[data-position]')
    if (positionSelect) {
      setBluePosition(Number(positionSelect.dataset.player), Number(positionSelect.value))
      return
    }

    const playerStrategySelect = event.target.closest('select[data-player-strategy]')
    if (playerStrategySelect) {
      setBluePlayerStrategy(Number(playerStrategySelect.dataset.player), playerStrategySelect.value)
      return
    }

    const pompfeSelect = event.target.closest('select[data-pompfe]')
    if (pompfeSelect) setBluePompfe(Number(pompfeSelect.dataset.player), pompfeSelect.value)
  })
}

function applySeedFromInput() {
  const seed = hud.seedInput.value.trim() || state.matchSeed
  const changed = seed !== state.matchSeed
  setMatchSeed(seed, { resetRng: !state.running })
  if (!state.running && changed) resetMatch()
  updateHud()
}

resetMatch()
bindInput()
renderSkillPanel()
setPlaybackSpeed(state.playbackSpeed)
requestAnimationFrame(loop)
