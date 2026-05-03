import './style.css'
import { createCinemaDirector } from './game/cinema.js'
import { createRenderer } from './game/renderer.js'
import { SIMULATION_STEP_SECONDS, createInitialState } from './game/state.js'
import { createSimulation } from './game/simulation.js'
import { createPvpClient } from './net/pvpClient.js'
import { mountAppShell } from './ui/appShell.js'
import { createHudController } from './ui/hudController.js'

const { canvas, ctx, arenaWrap, hud } = mountAppShell()

const state = createInitialState()

const renderer = createRenderer({ ctx, state })
const hudController = createHudController({ state, hud, canvas, arenaWrap })
const { canvasPointFromEvent, hidePlayerTooltip, updateHud, updatePlayerTooltip, zoomCameraAt } = hudController
const cinema = createCinemaDirector({ state })
let pvpClient = null
const simulation = createSimulation({
  state,
  hud,
  updateHud,
  updatePlayerTooltip,
  cinema,
  onLocalTeamConfigChanged: (config) => {
    if (state.app.mode.startsWith('pvp')) pvpClient?.sendTeamConfig(config)
  },
})
const {
  applyTeamConfig,
  exportTeamConfig,
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

pvpClient = createPvpClient({
  onEvent: handlePvpEvent,
  onStatus: handlePvpStatus,
})
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

  hud.botGameBtn.addEventListener('click', startBotGame)
  hud.createGameBtn.addEventListener('click', openCreateGameModal)
  hud.joinGameBtn.addEventListener('click', openJoinGameModal)
  hud.pvpModalClose.addEventListener('click', closePvpModal)
  hud.pvpModal.addEventListener('click', (event) => {
    if (event.target === hud.pvpModal) closePvpModal()
    const teamButton = event.target.closest('[data-team-choice]')
    if (teamButton) selectPvpTeam(teamButton.dataset.teamChoice)
  })
  hud.pvpModal.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-join-form]')
    if (!form) return
    event.preventDefault()
    const code = form.querySelector('[name="roomCode"]').value.trim().toUpperCase()
    joinPvpRoom(code)
  })
  hud.pvpStatusPanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-team-choice]')
    if (button && state.app.mode !== 'pvpMatch') selectPvpTeam(button.dataset.teamChoice)
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

function startBotGame() {
  resetPvpState()
  state.app.mode = 'bot'
  hud.pvpModal.hidden = true
  resetMatch()
  renderSkillPanel()
  updateHud()
}

function openCreateGameModal() {
  resetPvpState()
  state.app.mode = 'pvpLobby'
  state.pvp.modal = 'create'
  state.pvp.role = 'host'
  state.pvp.localTeam = 'blue'
  state.pvp.opponentTeam = 'red'
  state.pvp.statusText = 'Verbinde mit PvP-Server...'
  renderPvpModal()
  pvpClient.createRoom()
  updateHud()
}

function openJoinGameModal() {
  resetPvpState()
  state.app.mode = 'pvpLobby'
  state.pvp.modal = 'join'
  state.pvp.role = 'guest'
  state.pvp.localTeam = 'red'
  state.pvp.opponentTeam = 'blue'
  state.pvp.statusText = 'Code eingeben'
  renderPvpModal()
  updateHud()
}

function closePvpModal() {
  if (state.app.mode === 'pvpLobby') {
    pvpClient.leaveRoom()
    resetPvpState()
    state.app.mode = 'menu'
  }
  hud.pvpModal.hidden = true
  updateHud()
}

function joinPvpRoom(code) {
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    state.pvp.error = 'Bitte einen 5-stelligen Code aus A-Z und 0-9 eingeben.'
    renderPvpModal()
    return
  }
  state.pvp.roomCode = code
  state.pvp.error = ''
  state.pvp.statusText = 'Verbinde mit Raum...'
  renderPvpModal()
  pvpClient.joinRoom(code)
}

function selectPvpTeam(team) {
  if (!['blue', 'red'].includes(team)) return
  state.pvp.localTeam = team
  state.pvp.opponentTeam = team === 'blue' ? 'red' : 'blue'
  if (state.pvp.roomCode || state.pvp.playerId) pvpClient.selectTeam(team)
  renderPvpModal()
  renderSkillPanel()
  updateHud()
}

function renderPvpModal() {
  const isCreate = state.pvp.modal === 'create'
  hud.pvpModal.hidden = false
  hud.pvpModalTitle.textContent = isCreate ? 'Spiel erstellen' : 'Spiel beitreten'
  hud.pvpModalBody.innerHTML = isCreate ? createRoomModalHtml() : joinRoomModalHtml()
}

function createRoomModalHtml() {
  return `
    <div class="modal-body-grid">
      <div class="room-code">${state.pvp.roomCode || '-----'}</div>
      <p class="modal-status">${state.pvp.connected ? 'Spieler verbunden' : state.pvp.statusText || 'Warte auf zweiten Spieler'}</p>
      ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
      ${teamChoiceHtml()}
    </div>
  `
}

function joinRoomModalHtml() {
  return `
    <form data-join-form>
      <input name="roomCode" maxlength="5" pattern="[A-Za-z0-9]{5}" autocomplete="off" placeholder="Code" value="${state.pvp.roomCode}" />
      <button class="primary" type="submit">Beitreten</button>
      <p class="modal-status">${state.pvp.statusText || '5-stelligen Code eingeben'}</p>
      ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
      ${teamChoiceHtml()}
    </form>
  `
}

function teamChoiceHtml() {
  return `
    <div class="pvp-team-choice">
      <button type="button" data-team-choice="blue" class="${state.pvp.localTeam === 'blue' ? 'active' : ''}">Blau</button>
      <button type="button" data-team-choice="red" class="${state.pvp.localTeam === 'red' ? 'active' : ''}">Rot</button>
    </div>
  `
}

function resetPvpState() {
  state.pvp.modal = null
  state.pvp.roomCode = ''
  state.pvp.connected = false
  state.pvp.connectionStatus = 'idle'
  state.pvp.statusText = ''
  state.pvp.error = ''
  state.pvp.role = null
  state.pvp.playerId = null
  state.pvp.localTeam = 'blue'
  state.pvp.opponentTeam = 'red'
  state.pvp.players = []
  state.pvp.setupEndsAt = null
  state.pvp.setupRemaining = 0
  state.pvp.lastServerSeq = 0
  state.pvp.teamVersions.blue = 0
  state.pvp.teamVersions.red = 0
}

function handlePvpStatus(status) {
  state.pvp.connectionStatus = status
  if (status === 'error' || status === 'closed') {
    state.pvp.statusText = 'Keine Verbindung zum PvP-Server'
    state.pvp.error = 'Der Spring-Boot-WebSocket ist noch nicht erreichbar.'
  } else if (status === 'open') {
    state.pvp.statusText = 'Verbunden'
    state.pvp.error = ''
  }
  if (state.pvp.modal) renderPvpModal()
  updateHud()
}

function handlePvpEvent(message) {
  if (!acceptServerSequence(message)) return
  switch (message.type) {
    case 'room_created':
      applyRoomState(message)
      state.pvp.statusText = 'Warte auf zweiten Spieler'
      state.pvp.error = ''
      renderPvpModal()
      break
    case 'join_failed':
      state.pvp.error = message.message || 'Beitritt fehlgeschlagen'
      renderPvpModal()
      break
    case 'room_state':
    case 'player_joined':
    case 'player_left':
      applyRoomState(message)
      renderPvpModal()
      break
    case 'team_selected':
      applyTeamSelection(message)
      break
    case 'team_config_changed':
      if (message.config) applyTeamConfig(message.config, { remote: true })
      break
    case 'setup_started':
      startPvpSetup(message)
      break
    case 'match_start':
      startPvpMatch(message)
      break
    case 'error':
      state.pvp.error = message.message || 'PvP-Fehler'
      renderPvpModal()
      break
    default:
      break
  }
  updateHud()
}

function acceptServerSequence(message) {
  if (typeof message.serverSeq !== 'number') return true
  if (message.serverSeq <= state.pvp.lastServerSeq) return false
  state.pvp.lastServerSeq = message.serverSeq
  return true
}

function applyRoomState(message) {
  const wasConnected = state.pvp.connected
  state.pvp.roomCode = message.roomCode || state.pvp.roomCode
  state.pvp.playerId = message.playerId || state.pvp.playerId
  state.pvp.players = message.players || state.pvp.players
  if (Array.isArray(message.players)) {
    state.pvp.connected = message.players.filter((player) => player.connected !== false).length >= 2
  } else if (typeof message.connected === 'boolean') {
    state.pvp.connected = message.connected
  }
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  if (Array.isArray(message.teamConfigs)) message.teamConfigs.forEach((config) => applyTeamConfig(config, { remote: true }))
  if (wasConnected && !state.pvp.connected && (state.app.mode === 'pvpSetup' || state.app.mode === 'pvpMatch')) {
    state.running = false
    state.paused = true
    state.pvp.statusText = 'PvP-Verbindung unterbrochen'
    state.pvp.error = 'Der zweite Spieler ist nicht mehr verbunden.'
  }
}

function applyTeamSelection(message) {
  if (message.playerId && message.playerId === state.pvp.playerId && message.team) selectLocalTeamFromServer(message.team)
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  renderPvpModal()
  renderSkillPanel()
}

function selectLocalTeamFromServer(team) {
  if (!['blue', 'red'].includes(team)) return
  state.pvp.localTeam = team
  state.pvp.opponentTeam = team === 'blue' ? 'red' : 'blue'
}

function startPvpSetup(message) {
  state.app.mode = 'pvpSetup'
  state.pvp.modal = null
  hud.pvpModal.hidden = true
  state.pvp.connected = true
  state.pvp.statusText = '20 Sekunden Teamsetup'
  state.pvp.setupEndsAt = serverDeadline(message.setupEndsAt, message.durationMs ?? 20000)
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  setCinemaMode(false)
  setPlaybackSpeed(1)
  resetMatch()
  if (Array.isArray(message.teamConfigs)) message.teamConfigs.forEach((config) => applyTeamConfig(config, { remote: true }))
  renderSkillPanel()
}

function startPvpMatch(message) {
  const startAt = parseServerTimestamp(message.startAt)
  if (startAt && startAt - Date.now() > 50) {
    state.app.mode = 'pvpSetup'
    state.pvp.statusText = 'Match startet gleich'
    setTimeout(() => startPvpMatch({ ...message, startAt: null }), startAt - Date.now())
    return
  }
  state.app.mode = 'pvpMatch'
  state.pvp.setupEndsAt = null
  state.pvp.statusText = 'PvP Match'
  hud.pvpModal.hidden = true
  setCinemaMode(false)
  setPlaybackSpeed(1)
  if (message.seed) setMatchSeed(message.seed, { resetRng: true })
  resetMatch()
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  if (Array.isArray(message.teamConfigs)) message.teamConfigs.forEach((config) => applyTeamConfig(config, { remote: true }))
  startMatch()
  renderSkillPanel()
}

function serverDeadline(serverValue, fallbackMs) {
  const parsedValue = parseServerTimestamp(serverValue)
  if (parsedValue) return parsedValue
  return Date.now() + fallbackMs
}

function parseServerTimestamp(serverValue) {
  if (typeof serverValue === 'number') return serverValue
  const parsed = Date.parse(serverValue)
  return Number.isFinite(parsed) ? parsed : null
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
