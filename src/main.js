import './style.css'
import { createCinemaDirector } from './game/cinema.js'
import { MATCH_SECONDS, STONE_SECONDS, TEAMS } from './game/config.js'
import { createRenderer } from './game/renderer.js'
import { ROUND_BREAK_LOCK_STONES, SIMULATION_STEP_SECONDS, createInitialState } from './game/state.js'
import { createSimulation } from './game/simulation.js'
import { createPvpClient } from './net/pvpClient.js'
import { mountAppShell } from './ui/appShell.js'
import { createHudController } from './ui/hudController.js'
import { renderFormationPanel, renderTeamSkillPanel } from './ui/skillPanel.js'

const { canvas, ctx, arenaWrap, hud } = mountAppShell()

const state = createInitialState()

const renderer = createRenderer({ ctx, state })
const hudController = createHudController({ state, hud, canvas, arenaWrap })
const { canvasPointFromEvent, hidePlayerTooltip, updateHud, updatePlayerTooltip, zoomCameraAt } = hudController
const cinema = createCinemaDirector({ state })
let pvpClient = null
let pvpPrepModalKey = ''
let roundSetupOverlayKey = ''
const simulation = createSimulation({
  state,
  hud,
  updateHud,
  updatePlayerTooltip,
  cinema,
  onLocalTeamConfigChanged: (config) => {
    if (state.app.mode.startsWith('pvp')) pvpClient?.sendTeamConfig(config)
  },
  onRoundBreakStarted: (payload) => {
    if (state.app.mode === 'pvpMatch') pvpClient?.reportRoundBreak(payload)
  },
})
const {
  applyTeamConfig,
  exportTeamConfig,
  reportFrameError,
  resetMatch,
  renderSkillPanel,
  syncPvpRoundBreak,
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
  const elapsedDt = (time - state.lastTime) / 1000 || 0
  const inPvpMatch = state.app.mode === 'pvpMatch'
  const rawDt = Math.min(inPvpMatch ? MATCH_SECONDS : 0.033, elapsedDt)
  state.lastTime = time
  try {
    if (state.running && !state.paused) {
      cinema.update(rawDt)
      const playbackSpeed = state.cinema.enabled ? state.cinema.playbackSpeed : state.playbackSpeed
      const accumulatorLimit = inPvpMatch ? MATCH_SECONDS : SIMULATION_STEP_SECONDS * 12
      state.frameAccumulator = Math.min(state.frameAccumulator + rawDt * playbackSpeed, accumulatorLimit)
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
    syncPreparationUi()
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
  hud.refreshPublicRoomsBtn.addEventListener('click', () => pvpClient.listPublicRooms())
  hud.publicRoomList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-public-room]')
    if (button) joinPublicRoom(button.dataset.publicRoom)
  })
  hud.homeNavBtn.addEventListener('click', goHome)
  hud.docsNavBtn.addEventListener('click', showDocs)
  hud.pvpModalClose.addEventListener('click', closePvpModal)
  hud.pvpModal.addEventListener('click', (event) => {
    if (event.target === hud.pvpModal && state.app.mode === 'pvpLobby') closePvpModal()
    const finishSkillButton = event.target.closest('[data-finish-skill-setup]')
    if (finishSkillButton) finishInitialSkillSetup()
    const teamButton = event.target.closest('[data-team-choice]')
    if (teamButton) selectPvpTeam(teamButton.dataset.teamChoice)
    handleTeamConfigClick(event)
  })
  hud.pvpModal.addEventListener('change', handleTeamConfigChange)
  hud.pvpModal.addEventListener('submit', (event) => {
    const createForm = event.target.closest('[data-create-form]')
    if (createForm) {
      event.preventDefault()
      createPvpRoom(createForm)
      return
    }
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
  hud.roundSetupOverlay.addEventListener('change', handleTeamConfigChange)

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
    handleTeamConfigClick(event)
  })
  hud.skillList.addEventListener('change', handleTeamConfigChange)
}

function handleTeamConfigClick(event) {
  const button = event.target.closest('button[data-player]')
  if (!button || !button.dataset.skill) return
  setBlueSkill(Number(button.dataset.player), button.dataset.skill, Number(button.dataset.delta))
  rerenderPvpPreparationModal()
  rerenderRoundSetupOverlay()
}

function finishInitialSkillSetup() {
  state.pvp.setupSkillSaved = true
  state.pvp.statusText = 'Aufstellung vorbereiten'
  pvpClient?.sendTeamConfig(exportTeamConfig(state.pvp.localTeam))
  rerenderPvpPreparationModal()
  updateHud()
}

function handleTeamConfigChange(event) {
    const teamStrategySelect = event.target.closest('select[data-team-strategy]')
    if (teamStrategySelect) {
      setBlueTeamStrategy(teamStrategySelect.value)
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const positionSelect = event.target.closest('select[data-position]')
    if (positionSelect) {
      setBluePosition(Number(positionSelect.dataset.player), Number(positionSelect.value))
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const playerStrategySelect = event.target.closest('select[data-player-strategy]')
    if (playerStrategySelect) {
      setBluePlayerStrategy(Number(playerStrategySelect.dataset.player), playerStrategySelect.value)
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const pompfeSelect = event.target.closest('select[data-pompfe]')
    if (pompfeSelect) {
      setBluePompfe(Number(pompfeSelect.dataset.player), pompfeSelect.value)
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
    }
}

function startBotGame() {
  resetPvpState()
  state.app.mode = 'bot'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  resetMatch()
  renderSkillPanel()
  updateHud()
}

function goHome() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  resetPvpState()
  state.app.mode = 'menu'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  resetMatch()
  renderSkillPanel()
  renderPublicRooms()
  pvpClient?.connect()
  updateHud()
}

function showDocs() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  resetPvpState()
  state.app.mode = 'docs'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  state.running = false
  state.paused = false
  updateHud()
}

function openCreateGameModal() {
  resetPvpState()
  state.app.mode = 'pvpLobby'
  state.pvp.modal = 'create'
  state.pvp.role = 'host'
  state.pvp.localTeam = 'blue'
  state.pvp.opponentTeam = 'red'
  state.pvp.statusText = 'Raumoptionen waehlen'
  renderPvpModal()
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
  if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') return
  if (state.app.mode === 'pvpLobby') {
    pvpClient.leaveRoom()
    resetPvpState()
    state.app.mode = 'menu'
    renderPublicRooms()
    pvpClient.connect()
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

function joinPublicRoom(code) {
  resetPvpState()
  state.app.mode = 'pvpLobby'
  state.pvp.modal = 'join'
  state.pvp.role = 'guest'
  state.pvp.localTeam = 'red'
  state.pvp.opponentTeam = 'blue'
  joinPvpRoom(String(code ?? '').trim().toUpperCase())
}

function createPvpRoom(form) {
  state.pvp.createPublic = Boolean(form.querySelector('[name="isPublic"]')?.checked)
  state.pvp.error = ''
  state.pvp.statusText = 'Erstelle Raum...'
  renderPvpModal()
  pvpClient.createRoom({ isPublic: state.pvp.createPublic })
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
  if (state.app.mode === 'pvpMatch' && state.pvp.modal !== 'teamSetup') {
    hidePvpModal()
    return
  }
  if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') {
    renderPvpPreparationModal()
    return
  }
  const isCreate = state.pvp.modal === 'create'
  hud.pvpModal.hidden = false
  hud.pvpModal.classList.remove('setup-modal')
  hud.pvpModalClose.hidden = false
  hud.pvpModalTitle.textContent = isCreate ? 'Spiel erstellen' : 'Spiel beitreten'
  hud.pvpModalBody.innerHTML = isCreate ? createRoomModalHtml() : joinRoomModalHtml()
}

function hidePvpModal() {
  state.pvp.modal = null
  pvpPrepModalKey = ''
  hud.pvpModal.hidden = true
  hud.pvpModal.classList.remove('setup-modal')
  hud.pvpModalClose.hidden = false
}

function syncPreparationUi() {
  syncPvpPreparationModal()
  syncRoundSetupOverlay()
  syncRoundCountdownOverlay()
}

function syncPvpPreparationModal() {
  const desiredModal =
    state.app.mode === 'pvpSetup'
      ? 'teamSetup'
      : null

  if (!desiredModal) {
    if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') {
      hidePvpModal()
    }
    return
  }

  state.pvp.modal = desiredModal
  const key = `${desiredModal}:${state.pvp.setupSkillSaved}:${state.roundBreakLocked}:${state.pvp.localTeam}:${state.pvp.teamVersions[state.pvp.localTeam]}:${state.pvp.teamVersions[state.pvp.opponentTeam]}`
  if (key === pvpPrepModalKey && !hud.pvpModal.hidden) {
    updatePvpPreparationCountdown()
    return
  }
  pvpPrepModalKey = key
  renderPvpPreparationModal()
}

function rerenderPvpPreparationModal() {
  if (state.pvp.modal !== 'teamSetup' && state.pvp.modal !== 'roundSetup') return
  pvpPrepModalKey = ''
  renderPvpPreparationModal()
}

function roundSetupTeam() {
  return state.app.mode === 'pvpMatch' ? state.pvp.localTeam : 'blue'
}

function syncRoundSetupOverlay() {
  const show = (state.app.mode === 'bot' || state.app.mode === 'pvpMatch') && state.roundBreakTimer > 0 && !state.roundBreakLocked
  hud.roundSetupOverlay.hidden = !show
  if (!show) {
    roundSetupOverlayKey = ''
    return
  }

  const team = roundSetupTeam()
  const stonesLeft = Math.ceil(state.roundBreakTimer / STONE_SECONDS)
  const key = `${state.app.mode}:${team}:${state.roundBreakLocked}:${state.pvp.teamVersions[team] ?? 0}`
  if (key === roundSetupOverlayKey) {
    updateRoundSetupOverlayCountdown(stonesLeft)
    return
  }
  roundSetupOverlayKey = key
  renderRoundSetupOverlay(team, stonesLeft)
}

function rerenderRoundSetupOverlay() {
  roundSetupOverlayKey = ''
  syncRoundSetupOverlay()
}

function renderRoundSetupOverlay(team, stonesLeft) {
  hud.roundSetupOverlay.innerHTML = `
    <section class="round-setup-card">
      <header>
        <div>
          <span>${state.app.mode === 'pvpMatch' ? TEAMS[team].name : 'Blau'}</span>
          <strong>Aufstellung nächster Zug</strong>
        </div>
        <b id="round-setup-stones">${stonesLeft} Steine</b>
      </header>
      <div id="round-formation-list" class="formation-list"></div>
    </section>
  `
  renderFormationPanel(hud.roundSetupOverlay.querySelector('#round-formation-list'), state, { team, editable: true })
}

function updateRoundSetupOverlayCountdown(stonesLeft) {
  const counter = hud.roundSetupOverlay.querySelector('#round-setup-stones')
  if (counter) counter.textContent = `${stonesLeft} Steine`
}

function syncRoundCountdownOverlay() {
  const stonesLeft = Math.ceil(state.roundBreakTimer / STONE_SECONDS)
  const showCountdown = state.roundBreakTimer > 0 && state.roundBreakLocked
  const showJugger = state.roundBreakTimer <= 0 && state.message === 'Neuer Zug' && state.messageTimer > 0.85
  if (!showCountdown && !showJugger) {
    hud.roundCountdownOverlay.hidden = true
    return
  }
  hud.roundCountdownOverlay.hidden = false
  hud.roundCountdownOverlay.textContent = showJugger ? 'Jugger!' : String(Math.min(ROUND_BREAK_LOCK_STONES, Math.max(1, stonesLeft)))
}

function updatePvpPreparationCountdown() {
  const countdown = hud.pvpModalBody.querySelector('#pvp-modal-countdown')
  if (!countdown) return
  const secondsLeft = state.pvp.modal === 'teamSetup' ? Math.ceil(state.pvp.setupRemaining) : Math.ceil(state.roundBreakTimer)
  countdown.textContent = `${secondsLeft}s`
}

function renderPvpPreparationModal() {
  const isInitialSetup = state.pvp.modal === 'teamSetup'
  const team = state.pvp.localTeam
  const opponent = state.pvp.opponentTeam
  const locked = !isInitialSetup && state.roundBreakLocked
  const secondsLeft = isInitialSetup ? Math.ceil(state.pvp.setupRemaining) : Math.ceil(state.roundBreakTimer)
  const showInitialSkillStep = isInitialSetup && !state.pvp.setupSkillSaved

  hud.pvpModal.hidden = false
  hud.pvpModal.classList.add('setup-modal')
  hud.pvpModalClose.hidden = true
  hud.pvpModalTitle.textContent = showInitialSkillStep ? 'Team skillen' : isInitialSetup ? 'Aufstellung vorbereiten' : 'Aufstellung anpassen'

  if (showInitialSkillStep) {
    hud.pvpModalBody.innerHTML = `
      <div class="pvp-setup-modal">
        <div class="pvp-setup-status">
          <div>
            <span>${TEAMS[team].name}</span>
            <strong>Skillpunkte und Pompfen</strong>
          </div>
          <b id="pvp-modal-countdown">${secondsLeft}s</b>
        </div>
        <div id="pvp-modal-local-team" class="skill-list pvp-skill-setup-grid"></div>
        <button class="primary pvp-setup-save" type="button" data-finish-skill-setup>Skillung speichern</button>
      </div>
    `
    renderTeamSkillPanel(hud.pvpModalBody.querySelector('#pvp-modal-local-team'), state, {
      team,
      editable: true,
      editSkills: true,
      editLoadout: true,
      editPositions: false,
      editStrategies: false,
    })
    return
  }

  hud.pvpModalBody.innerHTML = `
    <div class="pvp-setup-modal">
      <div class="pvp-setup-status">
        <div>
          <span>${TEAMS[team].name}</span>
          <strong>${locked ? 'Gesperrt' : 'Aufstellung naechster Zug'}</strong>
        </div>
        <b id="pvp-modal-countdown">${secondsLeft}s</b>
      </div>
      <div id="pvp-modal-local-team" class="formation-list"></div>
      <details class="collapsible-panel skill-panel">
        <summary class="panel-heading">
          <span>Gegenseite</span>
          <strong>${TEAMS[opponent].name}</strong>
        </summary>
        <div id="pvp-modal-opponent-team" class="skill-list"></div>
      </details>
    </div>
  `

  const localContainer = hud.pvpModalBody.querySelector('#pvp-modal-local-team')
  const opponentContainer = hud.pvpModalBody.querySelector('#pvp-modal-opponent-team')
  renderFormationPanel(localContainer, state, { team, editable: isInitialSetup || (!locked && state.roundBreakTimer > 0) })
  renderTeamSkillPanel(opponentContainer, state, { team: opponent, editable: false })
}

function createRoomModalHtml() {
  if (!state.pvp.roomCode && !state.pvp.playerId) {
    return `
      <form data-create-form class="modal-body-grid">
        <label class="checkbox-row">
          <input name="isPublic" type="checkbox" ${state.pvp.createPublic ? 'checked' : ''} />
          <span>Oeffentlich auf der Startseite listen</span>
        </label>
        <button class="primary" type="submit">Raum erstellen</button>
        <p class="modal-status">${state.pvp.statusText || 'Raumoptionen waehlen'}</p>
        ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
        ${teamChoiceHtml()}
      </form>
    `
  }
  return `
    <div class="modal-body-grid">
      <div class="room-code">${state.pvp.roomCode || '-----'}</div>
      <p class="modal-status">${state.pvp.createPublic ? 'Oeffentlich gelistet' : 'Privater Raum'}</p>
      <p class="modal-status">${state.pvp.connected ? 'Spielende verbunden' : state.pvp.statusText || 'Warte auf zweite Person'}</p>
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

function renderPublicRooms() {
  if (!hud.publicRoomList) return
  const rooms = Array.isArray(state.pvp.publicRooms) ? state.pvp.publicRooms : []
  const cards = rooms.map(publicRoomHtml).filter(Boolean)
  hud.publicRoomList.innerHTML = cards.length
    ? cards.join('')
    : '<p class="public-room-empty">Keine oeffentlichen Raeume offen.</p>'
}

function publicRoomHtml(room) {
  const code = String(room?.roomCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
  if (!/^[A-Z0-9]{5}$/.test(code)) return ''
  const players = Math.max(0, Math.min(Number(room.players) || 0, Number(room.maxPlayers) || 2))
  const maxPlayers = Math.max(2, Number(room.maxPlayers) || 2)
  return `
    <article class="public-room-card">
      <div>
        <strong>${code}</strong>
        <span>${players}/${maxPlayers} verbunden</span>
      </div>
      <button type="button" data-public-room="${code}">Beitreten</button>
    </article>
  `
}

function resetPvpState() {
  state.pvp.modal = null
  state.pvp.roomCode = ''
  state.pvp.connected = false
  state.pvp.connectionStatus = 'idle'
  state.pvp.statusText = ''
  state.pvp.error = ''
  state.pvp.createPublic = false
  state.pvp.role = null
  state.pvp.playerId = null
  state.pvp.localTeam = 'blue'
  state.pvp.opponentTeam = 'red'
  state.pvp.players = []
  state.pvp.setupEndsAt = null
  state.pvp.setupRemaining = 0
  state.pvp.setupSkillSaved = false
  state.pvp.serverTimeOffset = 0
  state.pvp.roundId = 1
  state.pvp.nextRoundId = 1
  state.pvp.roundBreakEndsAt = null
  state.pvp.lastServerSeq = 0
  state.pvp.teamVersions.blue = 0
  state.pvp.teamVersions.red = 0
  pvpPrepModalKey = ''
  roundSetupOverlayKey = ''
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
  if (state.pvp.modal && state.app.mode !== 'pvpMatch') renderPvpModal()
  updateHud()
}

function handlePvpEvent(message) {
  updateServerTimeOffset(message)
  if (!acceptServerSequence(message)) return
  switch (message.type) {
    case 'public_rooms':
      state.pvp.publicRooms = Array.isArray(message.rooms) ? message.rooms : []
      renderPublicRooms()
      break
    case 'room_created':
      applyRoomState(message)
      state.pvp.createPublic = Boolean(message.isPublic)
      state.pvp.statusText = 'Warte auf zweite Person'
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
    case 'round_break_started':
      syncPvpRoundBreak({
        roundId: message.roundId,
        nextRoundId: message.nextRoundId,
        label: message.label,
        score: message.score,
        breakEndsAt: serverDeadline(message.breakEndsAt, 0),
      })
      break
    case 'error':
      if (message.code === 'unknown_type' && String(message.message || '').includes('round_break_report')) {
        state.pvp.error = 'Der PvP-Server ist veraltet. Bitte Server neu starten, damit Zugpausen synchronisiert werden.'
        state.pvp.statusText = 'PvP-Server neu starten'
        hidePvpModal()
        break
      }
      state.pvp.error = message.message || 'PvP-Fehler'
      if (state.app.mode !== 'pvpMatch') renderPvpModal()
      break
    default:
      break
  }
  updateHud()
}

function updateServerTimeOffset(message) {
  if (typeof message.serverTime !== 'number') return
  state.pvp.serverTimeOffset = message.serverTime - Date.now()
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
  if (typeof message.isPublic === 'boolean') state.pvp.createPublic = message.isPublic
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
    state.pvp.error = 'Die zweite Person ist nicht mehr verbunden.'
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
  state.pvp.modal = 'teamSetup'
  state.pvp.connected = true
  state.pvp.statusText = 'Teamsetup'
  state.pvp.setupSkillSaved = false
  state.pvp.setupEndsAt = serverDeadline(message.setupEndsAt, message.durationMs ?? 60000)
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  setCinemaMode(false)
  setPlaybackSpeed(1)
  resetMatch()
  if (Array.isArray(message.teamConfigs)) message.teamConfigs.forEach((config) => applyTeamConfig(config, { remote: true }))
  renderSkillPanel()
  rerenderPvpPreparationModal()
}

function startPvpMatch(message) {
  const startAt = serverDeadline(message.startAt, 0)
  if (startAt && startAt - Date.now() > 50) {
    state.app.mode = 'pvpSetup'
    state.pvp.statusText = 'Match startet gleich'
    setTimeout(() => startPvpMatch({ ...message, startAt: null }), startAt - Date.now())
    return
  }
  state.app.mode = 'pvpMatch'
  state.pvp.setupEndsAt = null
  state.pvp.statusText = 'PvP Match'
  hidePvpModal()
  setCinemaMode(false)
  setPlaybackSpeed(1)
  if (message.seed) setMatchSeed(message.seed, { resetRng: true })
  resetMatch()
  state.pvp.roundId = Number(message.roundId) || 1
  state.pvp.nextRoundId = state.pvp.roundId
  state.pvp.roundBreakEndsAt = null
  if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
  if (Array.isArray(message.teamConfigs)) message.teamConfigs.forEach((config) => applyTeamConfig(config, { remote: true }))
  startMatch()
  renderSkillPanel()
}

function serverDeadline(serverValue, fallbackMs) {
  const parsedValue = parseServerTimestamp(serverValue)
  if (parsedValue) return parsedValue - state.pvp.serverTimeOffset
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
renderPublicRooms()
setPlaybackSpeed(state.playbackSpeed)
pvpClient.connect()
requestAnimationFrame(loop)
