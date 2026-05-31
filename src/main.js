import './style.css'
import { createCinemaDirector } from './game/cinema.js'
import { createMenuCinema } from './game/menuCinema.js'
import { MATCH_SECONDS, STONE_SECONDS } from './game/config.js'
import { createRenderer } from './game/renderer.js'
import { ROUND_BREAK_LOCK_STONES, SIMULATION_STEP_SECONDS, createInitialState } from './game/state.js'
import { createSimulation } from './game/simulation.js'
import { createPvpClient } from './net/pvpClient.js'
import { mountAppShell } from './ui/appShell.js'
import { createHudController } from './ui/hudController.js'
import { renderFormationPanel, renderTeamSkillPanel } from './ui/skillPanel.js'
import { readStoredArray, readStoredString, writeStoredJson, writeStoredString } from './ui/persistence.js'
import { applyTranslations, setLanguage, t, teamLabel } from './i18n/index.js'
import { getTheme, setTheme, themeOptionsHtml } from './ui/themes.js'

const { canvas, ctx, arenaWrap, hud } = mountAppShell()

const state = createInitialState()
const PLAYER_NAME_STORAGE_KEY = 'juggerTopDown.playerName'
const FORMATION_PRESETS_STORAGE_KEY = 'juggerTopDown.formationPresets'

const renderer = createRenderer({ ctx, state })
const hudController = createHudController({ state, hud, canvas, arenaWrap })
const { canvasPointFromEvent, hidePlayerTooltip, updateHud, updatePlayerTooltip, zoomCameraAt } = hudController
const cinema = createCinemaDirector({ state })
const menuCinema = createMenuCinema({
  canvas: hud.menuCinemaCanvas,
  appMode: () => state.app.mode,
})
let pvpClient = null
let pvpPrepModalKey = ''
let roundSetupOverlayKey = ''
let draggedFormationPlayer = null
let seedPreviewTimer = null
let formationPresetSurfaceKey = ''
let formationPlayerNames = []
let formationPresetFeedback = ''
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
  onRoundStarted: () => {
    if (state.app.mode === 'bot') logMenuCinemaReelSnippet()
  },
  getPlayerNames: (team) => (team === 'blue' ? currentFormationPlayerNames() : []),
})
const {
  applyTeamConfig,
  analyzeCinemaScenes,
  exportTeamConfig,
  reportFrameError,
  resetMatch,
  renderSkillPanel,
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
    menuCinema.update(rawDt)
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
    syncFormationPresetSurfaces()
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
  hud.openFormationBtn.addEventListener('click', showFormationManager)
  hud.createGameBtn.addEventListener('click', openCreateGameModal)
  hud.joinGameBtn.addEventListener('click', openJoinGameModal)
  hud.refreshPublicRoomsBtn.addEventListener('click', () => pvpClient.listPublicRooms())
  hud.publicRoomList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-public-room]')
    if (button) joinPublicRoom(button.dataset.publicRoom)
  })
  hud.homeNavBtn.addEventListener('click', goHome)
  hud.formationNavBtn.addEventListener('click', showFormationManager)
  hud.docsNavBtn.addEventListener('click', showDocs)
  hud.drawerToggle.addEventListener('click', toggleTacticalDrawer)
  hud.drawerClose.addEventListener('click', closeTacticalDrawer)
  hud.languageSelect.addEventListener('change', () => {
    setLanguage(hud.languageSelect.value)
    syncLanguageUi()
  })
  hud.themeSelect.addEventListener('change', () => setTheme(hud.themeSelect.value))
  hud.profileNameBtn.addEventListener('click', openProfileNameDialog)
  hud.profileForm.addEventListener('submit', saveProfileName)
  hud.pvpModalClose.addEventListener('click', closePvpModal)
  hud.pvpModal.addEventListener('click', (event) => {
    if (event.target === hud.pvpModal && state.app.mode === 'pvpLobby') closePvpModal()
    handleFormationPresetClick(event)
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
  hud.roundSetupOverlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-round-setup]')) closeRoundSetupOverlay()
    handleFormationPresetClick(event)
    handleTeamConfigClick(event)
  })
  bindFormationDrag(hud.skillList)
  bindFormationDrag(hud.pvpModal)
  bindFormationDrag(hud.roundSetupOverlay)
  bindFormationDrag(hud.formationManagerFormation)
  hud.formationBackBtn.addEventListener('click', goHome)
  hud.formationManagerPresets.addEventListener('click', handleFormationPresetClick)
  hud.formationManagerPresets.addEventListener('change', handleTeamConfigChange)
  hud.botFormationPresets.addEventListener('click', handleFormationPresetClick)
  hud.botFormationPresets.addEventListener('change', handleTeamConfigChange)
  hud.formationManagerFormation.addEventListener('click', (event) => {
    if (event.target.closest('input[data-player-name]')) return
    if (!event.target.closest('button[data-position], button[data-player][data-skill]')) return
    handleTeamConfigClick(event)
    renderFormationManager()
  })
  hud.formationManagerFormation.addEventListener('change', (event) => {
    if (handleFormationPlayerNameChange(event)) return
    handleTeamConfigChange(event)
    renderFormationManager()
  })
  hud.formationManagerFormation.addEventListener('input', handleFormationPlayerNameInput)

  hud.startBtn.addEventListener('click', startMatch)
  hud.pauseBtn.addEventListener('click', togglePause)
  hud.resetBtn.addEventListener('click', handleResetClick)
  hud.rematchBtn?.addEventListener('click', requestPvpRematch)
  hud.seedInput.addEventListener('change', applySeedFromInput)
  hud.seedInput.addEventListener('input', scheduleSeedCinemaPreview)
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

function requestPvpRematch() {
  if (state.app.mode !== 'pvpMatch') return
  state.pvp.statusText = t('status.rematchRequested')
  pvpClient?.requestRematch()
  updateHud()
}

function handleResetClick() {
  if (state.app.mode.startsWith('pvp')) return
  resetMatch()
}

function bindFormationDrag(container) {
  container.addEventListener('dragstart', (event) => {
    if (event.target.closest('input, select, button, textarea')) return
    const card = event.target.closest('[data-player-card][draggable="true"]')
    if (!card || Number(card.dataset.player) <= 0) return
    draggedFormationPlayer = Number(card.dataset.player)
    if ('open' in card) card.open = false
    card.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(draggedFormationPlayer))
  })

  container.addEventListener('dragover', (event) => {
    const target = event.target.closest('[data-player-card][data-slot]')
    if (!target || Number(target.dataset.player) <= 0 || draggedFormationPlayer === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    target.classList.add('drag-over')
  })

  container.addEventListener('dragleave', (event) => {
    event.target.closest('[data-player-card]')?.classList.remove('drag-over')
  })

  container.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-player-card][data-slot]')
    if (!target || Number(target.dataset.player) <= 0 || draggedFormationPlayer === null) return
    event.preventDefault()
    const targetSlot = Number(target.dataset.slot)
    if (Number.isFinite(targetSlot)) {
      setBluePosition(draggedFormationPlayer, targetSlot)
      renderFormationManager()
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
    }
    clearFormationDragState()
  })

  container.addEventListener('dragend', clearFormationDragState)
}

function logMenuCinemaReelSnippet() {
  const blue = exportTeamConfig('blue')
  const red = exportTeamConfig('red')
  const reel = {
    seed: state.matchSeed,
    durationSeconds: 18,
    blueStrategy: blue.teamStrategy,
    redStrategy: red.teamStrategy,
    loadouts: {
      blue: blue.loadout,
      red: red.loadout,
    },
    positions: {
      blue: blue.positions,
      red: red.positions,
    },
    skills: {
      blue: blue.skills,
      red: red.skills,
    },
  }
  console.info(`[MenuCinema] Runde als Reel kopieren:\n${JSON.stringify(reel, null, 2)},`)
}

function scheduleSeedCinemaPreview() {
  window.clearTimeout(seedPreviewTimer)
  seedPreviewTimer = window.setTimeout(() => {
    applySeedFromInput({ previewOnly: true })
  }, 350)
}

function logSeedCinemaPreview(seed) {
  try {
    const scenes = analyzeCinemaScenes({ seed, fresh: true })
    const summaries = scenes.map((scene) => ({
      type: scene.type,
      title: scene.title,
      startAt: Number((scene.startAt ?? 0).toFixed(2)),
      endAt: Number((scene.endAt ?? 0).toFixed(2)),
      priority: scene.priority,
      participants: scene.participantIds,
    }))
    const label = scenes.length === 1 ? 'Cinemaeinsatz' : 'Cinemaeinsätze'
    console.info(`[MenuCinema] Seed "${seed}": ${scenes.length} ${label} vorgeplant`, summaries)
    if (scenes.length > 0) logMenuCinemaReelSnippet()
  } catch (error) {
    console.error('[MenuCinema] Seed konnte nicht vorgeplant werden', error)
  }
}

function clearFormationDragState() {
  draggedFormationPlayer = null
  document.querySelectorAll('.dragging, .drag-over').forEach((element) => {
    element.classList.remove('dragging', 'drag-over')
  })
}

function toggleTacticalDrawer() {
  const open = hud.gameShell.classList.toggle('tactics-open')
  hud.gameShell.classList.toggle('drawer-collapsed', !open)
  hud.drawerToggle.setAttribute('aria-expanded', String(open))
}

function closeTacticalDrawer() {
  hud.gameShell.classList.remove('tactics-open')
  hud.gameShell.classList.add('drawer-collapsed')
  hud.drawerToggle.setAttribute('aria-expanded', 'false')
}

function closeRoundSetupOverlay() {
  state.roundSetupOpen = false
  hud.roundSetupOverlay.hidden = true
  roundSetupOverlayKey = ''
}

function syncLanguageUi() {
  applyTranslations(document)
  if (hud.themeSelect) {
    hud.themeSelect.innerHTML = themeOptionsHtml()
    hud.themeSelect.value = getTheme()
  }
  const docsShell = hud.docsView?.querySelector('.docs-shell')
  if (docsShell) docsShell.innerHTML = t('docs.html')
  renderSkillPanel()
  renderPublicRooms()
  if (state.pvp.modal) renderPvpModal()
  rerenderPvpPreparationModal()
  rerenderRoundSetupOverlay()
  updatePlayerTooltip()
  updateHud()
}

function handleTeamConfigClick(event) {
  const positionButton = event.target.closest('button[data-position]')
  if (positionButton) {
    setBluePosition(Number(positionButton.dataset.player), Number(positionButton.dataset.position))
    rerenderPvpPreparationModal()
    rerenderRoundSetupOverlay()
    return
  }

  const button = event.target.closest('button[data-player]')
  if (!button || !button.dataset.skill) return
  setBlueSkill(Number(button.dataset.player), button.dataset.skill, Number(button.dataset.delta))
  rerenderPvpPreparationModal()
  rerenderRoundSetupOverlay()
}

function handleFormationPresetClick(event) {
  const saveButton = event.target.closest('[data-save-formation-preset]')
  if (saveButton) {
    saveFormationPreset()
    return
  }
  const loadButton = event.target.closest('[data-load-formation-preset]')
  if (loadButton) loadSelectedFormationPreset(loadButton.dataset.loadFormationPreset)
}

function saveFormationPreset() {
  const name = normalizePresetName(hud.formationPresetName?.value || window.prompt('Name der Aufstellung?', currentPresetName()))
  if (!name) return
  const team = editablePvpFormationTeam()
  const config = exportTeamConfig(team)
  const presets = formationPresets().filter((preset) => preset.name !== name)
  presets.unshift({
    name,
    skills: config.skills,
    loadout: config.loadout,
    positions: config.positions,
    teamStrategy: config.teamStrategy,
    playerNames: collectFormationPlayerNames(),
  })
  writeStoredJson(FORMATION_PRESETS_STORAGE_KEY, presets.slice(0, 12))
  showFormationPresetFeedback(t('formation.saveSuccess'))
  renderFormationPresetSurfaces()
  rerenderPvpPreparationModal()
  rerenderRoundSetupOverlay()
}

function loadSelectedFormationPreset(name) {
  const presetName = normalizePresetName(name)
  const preset = formationPresets().find((candidate) => candidate.name === presetName)
  if (!preset) return
  const team = editablePvpFormationTeam()
  const version = (state.pvp.teamVersions[team] ?? 0) + 1
  applyTeamConfig({
    team,
    version,
    skills: canLoadPresetSkills() ? preset.skills : undefined,
    loadout: preset.loadout,
    positions: preset.positions,
    teamStrategy: preset.teamStrategy,
  })
  renderFormationPlayerNames(preset.playerNames)
  if (hud.formationPresetName) hud.formationPresetName.value = preset.name
  if (state.app.mode.startsWith('pvp')) pvpClient?.sendTeamConfig(exportTeamConfig(team))
  showFormationPresetFeedback(t('formation.loadSuccess'))
  renderFormationManager()
  renderSkillPanel()
  renderFormationPresetSurfaces()
  rerenderPvpPreparationModal()
  rerenderRoundSetupOverlay()
}

function formationPresets() {
  return readStoredArray(FORMATION_PRESETS_STORAGE_KEY).filter((preset) => preset?.name)
}

function formationPresetControlsHtml({ allowSave = true, showFeedback = false } = {}) {
  const presets = formationPresets()
  return `
    <div class="formation-presets">
      <select data-formation-preset ${presets.length ? '' : 'disabled'}>
      ${presets.length
          ? presets.map((preset) => `<option value="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</option>`).join('')
          : `<option>${t('formation.noPresets')}</option>`}
      </select>
      <button type="button" data-load-formation-preset="${escapeHtml(presets[0]?.name ?? '')}" ${presets.length ? '' : 'disabled'}>${t('formation.loadPreset')}</button>
      ${allowSave ? `<button type="button" data-save-formation-preset>${t('formation.savePreset')}</button>` : ''}
      ${showFeedback && formationPresetFeedback ? `<p class="formation-preset-feedback">${escapeHtml(formationPresetFeedback)}</p>` : ''}
    </div>
  `
}

function showFormationPresetFeedback(message) {
  formationPresetFeedback = message
}

function syncFormationPresetLoadButtons(container) {
  const select = container.querySelector('[data-formation-preset]')
  const button = container.querySelector('[data-load-formation-preset]')
  if (select && button) button.dataset.loadFormationPreset = select.value
}

function editablePvpFormationTeam() {
  return state.app.mode === 'pvpMatch' || state.app.mode === 'pvpSetup' ? state.pvp.localTeam : 'blue'
}

function canLoadPresetSkills() {
  return state.app.mode === 'formation' || state.app.mode === 'bot' || state.app.mode === 'pvpSetup'
}

function collectFormationPlayerNames() {
  const inputs = hud.formationManagerFormation?.querySelectorAll?.('[data-player-name]')
  if (!inputs?.length) return currentFormationPlayerNames()
  return [...inputs].map((input) => normalizePlayerName(input.value))
}

function renderFormationPlayerNames(names = []) {
  formationPlayerNames = Array.from({ length: 5 }, (_, index) => normalizePlayerName(names[index] || defaultFormationPlayerName(index)))
}

function currentFormationPlayerNames() {
  return Array.from({ length: 5 }, (_, index) => normalizePlayerName(formationPlayerNames[index] || defaultFormationPlayerName(index)))
}

function defaultFormationPlayerName(index) {
  return index === 0 ? t('role.quick') : t('role.pompfer', { index })
}

function handleFormationPlayerNameInput(event) {
  const input = event.target.closest('input[data-player-name]')
  if (!input) return
  formationPlayerNames[Number(input.dataset.playerName)] = input.value
}

function handleFormationPlayerNameChange(event) {
  const input = event.target.closest('input[data-player-name]')
  if (!input) return false
  const index = Number(input.dataset.playerName)
  formationPlayerNames[index] = normalizePlayerName(input.value) || defaultFormationPlayerName(index)
  input.value = formationPlayerNames[index]
  renderFormationManager()
  return true
}

function renderFormationPresetSurfaces() {
  if (hud.formationManagerPresets) hud.formationManagerPresets.innerHTML = formationPresetControlsHtml({ showFeedback: true })
  if (hud.botFormationPresets) {
    const show = state.app.mode === 'bot' && (!state.running || state.roundBreakTimer > 0)
    hud.botFormationPresets.hidden = !show
    hud.botFormationPresets.innerHTML = show ? formationPresetControlsHtml({ allowSave: false }) : ''
  }
}

function syncFormationPresetSurfaces() {
  const key = `${state.app.mode}:${state.running}:${Math.ceil(state.roundBreakTimer)}:${formationPresets().length}`
  if (key === formationPresetSurfaceKey) return
  formationPresetSurfaceKey = key
  renderFormationPresetSurfaces()
}

function renderFormationManager() {
  if (!hud.formationView || state.app.mode !== 'formation') return
  if (!hud.formationPresetName.value) hud.formationPresetName.value = currentPresetName()
  renderFormationPresetSurfaces()
  if (!formationPlayerNames.length) renderFormationPlayerNames(formationPresets()[0]?.playerNames)
  renderFormationPanel(hud.formationManagerFormation, state, {
    team: 'blue',
    editable: true,
    editNames: true,
    editSkills: true,
    playerNames: currentFormationPlayerNames(),
  })
}

function currentPresetName() {
  const date = new Date()
  return `Aufstellung ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

function normalizePresetName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 32)
}

function finishInitialSkillSetup() {
  state.pvp.setupSkillSaved = true
  state.pvp.statusText = t('status.prepareFormation')
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

    const pompfeSelect = event.target.closest('select[data-pompfe]')
    if (pompfeSelect) {
      setBluePompfe(Number(pompfeSelect.dataset.player), pompfeSelect.value)
      rerenderPvpPreparationModal()
      rerenderRoundSetupOverlay()
    }

    const presetSelect = event.target.closest('select[data-formation-preset]')
    if (presetSelect) {
      syncFormationPresetLoadButtons(presetSelect.closest('.formation-presets'))
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
  renderFormationPresetSurfaces()
  updateHud()
}

function showFormationManager() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  resetPvpState()
  state.app.mode = 'formation'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  state.running = false
  state.paused = false
  resetMatch()
  renderFormationPlayerNames(formationPresets()[0]?.playerNames)
  renderFormationManager()
  updateHud()
}

function initializePlayerName() {
  const savedName = normalizePlayerName(readStoredString(PLAYER_NAME_STORAGE_KEY))
  if (savedName) {
    state.pvp.playerName = savedName
    updateProfileNameButton()
    return
  }
  state.pvp.playerName = ''
  openProfileNameDialog()
}

function openProfileNameDialog() {
  hud.profileNameInput.value = state.pvp.playerName || ''
  hud.profileModal.hidden = false
  setTimeout(() => hud.profileNameInput.focus(), 0)
}

function saveProfileName(event) {
  event.preventDefault()
  const name = normalizePlayerName(hud.profileNameInput.value)
  if (!name) {
    hud.profileNameInput.focus()
    return
  }
  state.pvp.playerName = name
  writeStoredString(PLAYER_NAME_STORAGE_KEY, name)
  hud.profileModal.hidden = true
  updateProfileNameButton()
  if (state.app.mode.startsWith('pvp') || state.pvp.modal) renderPvpModal()
  updateHud()
}

function updateProfileNameButton() {
  if (hud.profileNameBtn) hud.profileNameBtn.textContent = state.pvp.playerName || 'Name'
}

function normalizePlayerName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
}

function currentPlayerName() {
  if (!state.pvp.playerName) initializePlayerName()
  return state.pvp.playerName || 'Spieler'
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
  renderFormationPresetSurfaces()
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
  state.pvp.statusText = t('status.chooseRoomOptions')
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
  state.pvp.statusText = t('status.enterCode')
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
    state.pvp.error = t('modal.invalidCode')
    renderPvpModal()
    return
  }
  state.pvp.roomCode = code
  state.pvp.error = ''
  state.pvp.statusText = t('status.connectingRoom')
  renderPvpModal()
  pvpClient.joinRoom(code, { playerName: currentPlayerName() })
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
  state.pvp.statusText = t('status.createRoom')
  renderPvpModal()
  pvpClient.createRoom({ isPublic: state.pvp.createPublic, playerName: currentPlayerName() })
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
  hud.pvpModalTitle.textContent = isCreate ? t('modal.createTitle') : t('modal.joinTitle')
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
  const show = (state.app.mode === 'bot' || state.app.mode === 'pvpMatch') && state.roundBreakTimer > 0 && !state.roundBreakLocked && state.roundSetupOpen
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
          <span>${state.app.mode === 'pvpMatch' ? teamLabel(team) : teamLabel('blue')}</span>
          <strong>${t('setup.nextFormation')}</strong>
        </div>
        <b id="round-setup-stones">${t('setup.stones', { count: stonesLeft })}</b>
        <button type="button" data-close-round-setup>${t('controls.done')}</button>
      </header>
      ${state.app.mode === 'pvpMatch' ? formationPresetControlsHtml({ allowSave: false }) : state.app.mode === 'bot' ? formationPresetControlsHtml({ allowSave: false }) : ''}
      <div id="round-formation-list" class="formation-list"></div>
    </section>
  `
  renderFormationPanel(hud.roundSetupOverlay.querySelector('#round-formation-list'), state, { team, editable: true })
}

function updateRoundSetupOverlayCountdown(stonesLeft) {
  const counter = hud.roundSetupOverlay.querySelector('#round-setup-stones')
  if (counter) counter.textContent = t('setup.stones', { count: stonesLeft })
}

function syncRoundCountdownOverlay() {
  const stonesLeft = Math.ceil(state.roundBreakTimer / STONE_SECONDS)
  const showCountdown = state.roundBreakTimer > 0 && state.roundBreakLocked
  const showJugger = state.roundBreakTimer <= 0 && state.message === t('match.newRound') && state.messageTimer > 0.85
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
  hud.pvpModalTitle.textContent = showInitialSkillStep ? t('setup.skillTeam') : isInitialSetup ? t('setup.prepareFormation') : t('setup.adjustFormation')

  if (showInitialSkillStep) {
    hud.pvpModalBody.innerHTML = `
      <div class="pvp-setup-modal">
        <div class="pvp-setup-status">
          <div>
            <span>${teamLabel(team)}</span>
            <strong>${t('setup.skillsAndLoadout')}</strong>
          </div>
          <b id="pvp-modal-countdown">${secondsLeft}s</b>
        </div>
        ${formationPresetControlsHtml({ allowSave: false })}
        <div id="pvp-modal-local-team" class="skill-list pvp-skill-setup-grid"></div>
        <button class="primary pvp-setup-save" type="button" data-finish-skill-setup>${t('setup.saveSkills')}</button>
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
          <span>${teamLabel(team)}</span>
          <strong>${locked ? t('status.locked') : t('setup.nextFormation')}</strong>
        </div>
        <b id="pvp-modal-countdown">${secondsLeft}s</b>
      </div>
      <div id="pvp-modal-local-team" class="formation-list"></div>
      ${formationPresetControlsHtml({ allowSave: false })}
    </div>
  `

  const localContainer = hud.pvpModalBody.querySelector('#pvp-modal-local-team')
  renderFormationPanel(localContainer, state, { team, editable: isInitialSetup || (!locked && state.roundBreakTimer > 0) })
}

function createRoomModalHtml() {
  if (!state.pvp.roomCode && !state.pvp.playerId) {
    return `
      <form data-create-form class="modal-body-grid">
        <label class="checkbox-row">
          <input name="isPublic" type="checkbox" ${state.pvp.createPublic ? 'checked' : ''} />
          <span>${t('modal.publicRoom')}</span>
        </label>
        <button class="primary" type="submit">${t('modal.createRoom')}</button>
        <p class="modal-status">Name: ${escapeHtml(currentPlayerName())}</p>
        <p class="modal-status">${state.pvp.statusText || t('status.chooseRoomOptions')}</p>
        ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
        ${teamChoiceHtml()}
      </form>
    `
  }
  return `
    <div class="modal-body-grid">
      <div class="room-code">${state.pvp.roomCode || '-----'}</div>
      <p class="modal-status">${state.pvp.createPublic ? t('status.publicListed') : t('status.privateRoom')}</p>
      ${pvpPlayersHtml()}
      <p class="modal-status">${state.pvp.connected ? t('status.playersConnected') : state.pvp.statusText || t('status.waitingSecondPlayer')}</p>
      ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
      ${teamChoiceHtml()}
    </div>
  `
}

function joinRoomModalHtml() {
  return `
    <form data-join-form>
      <input name="roomCode" maxlength="5" pattern="[A-Za-z0-9]{5}" autocomplete="off" placeholder="${t('modal.codePlaceholder')}" value="${state.pvp.roomCode}" />
      <button class="primary" type="submit">${t('modal.join')}</button>
      <p class="modal-status">Name: ${escapeHtml(currentPlayerName())}</p>
      <p class="modal-status">${state.pvp.statusText || t('modal.enterFiveCharCode')}</p>
      ${state.pvp.error ? `<p class="modal-error">${state.pvp.error}</p>` : ''}
      ${teamChoiceHtml()}
    </form>
  `
}

function pvpPlayersHtml() {
  const players = Array.isArray(state.pvp.players) ? state.pvp.players : []
  if (!players.length) return ''
  return `
    <div class="pvp-player-list">
      ${players
        .map((player) => {
          const local = player.playerId === state.pvp.playerId
          const label = local ? t('pvp.yourTeamColor') : t('pvp.opponentTeamColor')
          return `<span>${label}</span><strong>${teamLabel(player.team)}</strong>`
        })
        .join('')}
    </div>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function teamChoiceHtml() {
  return `
    <div class="pvp-team-choice">
      <button type="button" data-team-choice="blue" class="${state.pvp.localTeam === 'blue' ? 'active' : ''}">${teamLabel('blue')}</button>
      <button type="button" data-team-choice="red" class="${state.pvp.localTeam === 'red' ? 'active' : ''}">${teamLabel('red')}</button>
    </div>
  `
}

function renderPublicRooms() {
  if (!hud.publicRoomList) return
  const rooms = Array.isArray(state.pvp.publicRooms) ? state.pvp.publicRooms : []
  const cards = rooms.map(publicRoomHtml).filter(Boolean)
  hud.publicRoomList.innerHTML = cards.length
    ? cards.join('')
    : `<p class="public-room-empty">${t('menu.noPublicRooms')}</p>`
}

function publicRoomHtml(room) {
  const code = String(room?.roomCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
  if (!/^[A-Z0-9]{5}$/.test(code)) return ''
  const players = Math.max(0, Math.min(Number(room.players) || 0, Number(room.maxPlayers) || 2))
  const maxPlayers = Math.max(2, Number(room.maxPlayers) || 2)
  const hostName = escapeHtml(room.hostName || 'Host')
  return `
    <article class="public-room-card">
      <div>
        <strong>${code}</strong>
        <span>${hostName}</span>
        <span>${t('menu.roomPlayers', { players, maxPlayers })}</span>
      </div>
      <button type="button" data-public-room="${code}">${t('modal.join')}</button>
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
    state.pvp.statusText = t('status.noPvpServer')
    state.pvp.error = t('status.serverMissing')
  } else if (status === 'open') {
    state.pvp.statusText = t('status.connected')
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
      state.pvp.statusText = t('status.waitingSecondPlayer')
      state.pvp.error = ''
      renderPvpModal()
      break
    case 'join_failed':
      state.pvp.error = message.message || t('modal.joinFailed')
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
    case 'rematch_requested':
      state.pvp.statusText = message.playerId === state.pvp.playerId ? t('status.rematchRequested') : t('status.rematchIncoming')
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
        state.pvp.error = t('status.pvpServerOutdatedDetail')
        state.pvp.statusText = t('status.pvpServerOutdated')
        hidePvpModal()
        break
      }
      state.pvp.error = message.message || t('modal.pvpError')
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
    state.pvp.statusText = t('status.pvpConnectionLost')
    state.pvp.error = t('status.otherPlayerLeft')
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
  state.pvp.statusText = t('status.teamSetup')
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
    state.pvp.statusText = t('status.matchStartingSoon')
    setTimeout(() => startPvpMatch({ ...message, startAt: null }), startAt - Date.now())
    return
  }
  state.app.mode = 'pvpMatch'
  state.pvp.setupEndsAt = null
  state.pvp.statusText = t('status.pvpMatch')
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

function applySeedFromInput({ previewOnly = false } = {}) {
  const seed = hud.seedInput.value.trim() || state.matchSeed
  const changed = seed !== state.matchSeed
  setMatchSeed(seed, { resetRng: !state.running })
  if (!state.running && changed) resetMatch()
  if (state.app.mode === 'bot') logSeedCinemaPreview(seed)
  updateHud()
}

resetMatch()
bindInput()
initializePlayerName()
renderSkillPanel()
renderPublicRooms()
setPlaybackSpeed(state.playbackSpeed)
pvpClient.connect()
requestAnimationFrame(loop)
