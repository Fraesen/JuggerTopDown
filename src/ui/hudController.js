import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, CAMERA_ZOOM_STEP } from '../game/state.js'
import { FIELD, POSITION_LABELS, TEAM_STRATEGIES, TEAMS } from '../game/config.js'
import { clamp, distance } from '../game/geometry.js'
import { isInactive, isPompfer, isRunner, playerIndex, playerPositionSlot, roleLabel, skillForPlayer } from '../game/players.js'
import { pompfeFor } from '../game/pompfen.js'
import { playerStrategy, playerStrategyLabel, teamStrategyLabel } from '../game/strategies.js'

export function createHudController({ state, hud, canvas, arenaWrap }) {
  function formatClock(seconds) {
    const whole = Math.ceil(seconds)
    const minutes = Math.floor(whole / 60).toString().padStart(2, '0')
    const rest = (whole % 60).toString().padStart(2, '0')
    return `${minutes}:${rest}`
  }

  function updateMiniMap() {
    const camera = state.camera
    const cameraLeft = (camera.x / FIELD.width) * 100
    const cameraTop = (camera.y / FIELD.height) * 100
    const cameraWidth = (1 / camera.zoom) * 100
    const cameraHeight = (1 / camera.zoom) * 100
    const cameraBox = `<em class="camera-view" style="left:${cameraLeft}%;top:${cameraTop}%;width:${cameraWidth}%;height:${cameraHeight}%"></em>`
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
    hud.miniMap.innerHTML = `${cameraBox}${dots}${jugg}`
  }

  function updateHud() {
    const possession = state.jugg.carrier ? `${TEAMS[state.jugg.carrier.team].name} Laeufer` : 'frei'
    const pinCount = state.players.filter((player) => player.pinnedBy).length
    const inactiveCount = state.players.filter((player) => isInactive(player)).length

    hud.blueScore.textContent = state.score.blue
    hud.redScore.textContent = state.score.red
    hud.clock.textContent = formatClock(state.timeLeft)
    hud.matchState.textContent = state.paused ? 'Pause' : state.roundBreakTimer > 0 ? 'Strategiepause' : state.running ? 'Autobattler live' : state.message
    hud.possession.textContent = possession
    hud.pins.textContent = pinCount
    hud.inactive.textContent = inactiveCount
    hud.stone.textContent = state.stoneCount
    updateMiniMap()
  }

  function canvasScreenPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    }
  }

  function canvasPointFromEvent(event) {
    const point = canvasScreenPointFromEvent(event)
    return {
      x: state.camera.x + point.x / state.camera.zoom,
      y: state.camera.y + point.y / state.camera.zoom,
    }
  }

  function clampCamera() {
    const visibleWidth = FIELD.width / state.camera.zoom
    const visibleHeight = FIELD.height / state.camera.zoom
    state.camera.x = clamp(state.camera.x, 0, FIELD.width - visibleWidth)
    state.camera.y = clamp(state.camera.y, 0, FIELD.height - visibleHeight)
  }

  function zoomCameraAt(event) {
    event.preventDefault()
    const screen = canvasScreenPointFromEvent(event)
    const before = {
      x: state.camera.x + screen.x / state.camera.zoom,
      y: state.camera.y + screen.y / state.camera.zoom,
    }
    const factor = event.deltaY < 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP
    const nextZoom = clamp(state.camera.zoom * factor, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
    if (Math.abs(nextZoom - state.camera.zoom) < 0.001) return

    state.camera.zoom = nextZoom
    state.camera.x = before.x - screen.x / state.camera.zoom
    state.camera.y = before.y - screen.y / state.camera.zoom
    clampCamera()
    updatePlayerTooltip()
    updateHud()
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
      <div><span>Strategie</span><strong>${playerStrategyLabel(playerStrategy(player))}</strong><small>${teamStrategyLabel(TEAM_STRATEGIES[player.team])}</small></div>
      <div><span>Status</span><strong>${inactive ? 'inaktiv' : 'aktiv'}</strong><small>${statusDetail}</small></div>
    `
    hud.playerTooltip.hidden = false
  }

  function hidePlayerTooltip() {
    state.hover.player = null
    hud.playerTooltip.hidden = true
  }

  return {
    canvasPointFromEvent,
    hidePlayerTooltip,
    updateHud,
    updatePlayerTooltip,
    zoomCameraAt,
  }
}
