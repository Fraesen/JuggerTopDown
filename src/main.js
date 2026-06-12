import './style.css'
import { createCinemaDirector } from './game/cinema.js'
import { createMenuCinema } from './game/menuCinema.js'
import { MATCH_SECONDS } from './game/config.js'
import { createRenderer } from './game/renderer.js'
import { SIMULATION_STEP_SECONDS, createInitialState } from './game/state.js'
import { createSimulation } from './game/simulation.js'
import { createPvpClient } from './net/pvpClient.js'
import { createPvpSessionController } from './net/pvpSessionController.js'
import { mountAppShell } from './ui/appShell.js'
import { createFormationPresetController } from './ui/formationPresetController.js'
import { createHudController } from './ui/hudController.js'
import { bindAppInput } from './ui/inputBindings.js'
import { createPvpSetupController } from './ui/pvpSetupController.js'
import { renderFormationPanel } from './ui/skillPanel.js'
import { createProfileChangelogController } from './ui/profileChangelogController.js'
import { applyTranslations, setLanguage, t } from './i18n/index.js'
import { getTheme, setTheme, themeOptionsHtml } from './ui/themes.js'

const { canvas, ctx, arenaWrap, hud } = mountAppShell()

const state = createInitialState()

const renderer = createRenderer({ ctx, state })
const hudController = createHudController({ state, hud, canvas, arenaWrap })
const { canvasPointFromEvent, hidePlayerTooltip, updateHud, updatePlayerTooltip, zoomCameraAt } = hudController
const cinema = createCinemaDirector({ state })
const menuCinema = createMenuCinema({
  canvas: hud.menuCinemaCanvas,
  appMode: () => state.app.mode,
})
let pvpClient = null
let formationPresetController = null
let pvpSetupController = null
let pvpSessionController = null
let seedPreviewTimer = null
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
  getPlayerNames: (team) => {
    const playerNames = formationPresetController?.currentPlayerNames() ?? []
    if (state.app.mode.startsWith('pvp')) return team === state.pvp.localTeam ? playerNames : []
    return team === 'blue' ? playerNames : []
  },
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
  onEvent: (message) => pvpSessionController?.handleEvent(message),
  onStatus: (status) => pvpSessionController?.handleStatus(status),
})

formationPresetController = createFormationPresetController({
  state,
  hud,
  pvpClient,
  simulationActions: {
    applyTeamConfig,
    exportTeamConfig,
  },
  renderFormationPanel,
  renderSkillPanel,
  onPresetChanged: () => {
    pvpSetupController?.rerenderPreparationModal()
    pvpSetupController?.rerenderRoundSetupOverlay()
  },
})

pvpSetupController = createPvpSetupController({
  state,
  hud,
  pvpClient,
  formationPresets: formationPresetController,
  currentPlayerName: () => currentPlayerName(),
  simulationActions: {
    exportTeamConfig,
    setBluePompfe,
    setBluePosition,
    setBlueSkill,
    setBlueTeamStrategy,
  },
  updateHud,
  renderSkillPanel,
})

pvpSessionController = createPvpSessionController({
  state,
  pvpClient,
  pvpSetup: pvpSetupController,
  currentPlayerName: () => currentPlayerName(),
  simulationActions: {
    applyTeamConfig,
    renderSkillPanel,
    resetMatch,
    setCinemaMode,
    setMatchSeed,
    setPlaybackSpeed,
    startMatch,
    syncPvpRoundBreak,
  },
  updateHud,
})

const profileChangelog = createProfileChangelogController({
  state,
  hud,
  updateHud,
  onProfileSaved: () => {
    if (state.app.mode.startsWith('pvp') || state.pvp.modal) pvpSetupController.renderModal()
  },
})
const {
  closeChangelogModal,
  currentPlayerName,
  initializePlayerName,
  markChangelogPageSeen,
  maybeOpenChangelogModal,
  openChangelogModal,
  openProfileNameDialog,
  renderChangelogPage,
  saveProfileName,
  updateProfileNameButton,
} = profileChangelog
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
    pvpSetupController.syncPreparationUi()
    formationPresetController.syncSurfaces()
  } catch (error) {
    reportFrameError('Frame', error)
  }
  requestAnimationFrame(loop)
}

function handleResetClick() {
  if (state.app.mode.startsWith('pvp')) return
  resetMatch()
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

function syncLanguageUi() {
  applyTranslations(document)
  if (hud.themeSelect) {
    hud.themeSelect.innerHTML = themeOptionsHtml()
    hud.themeSelect.value = getTheme()
  }
  const docsShell = hud.docsView?.querySelector('.docs-shell')
  if (docsShell) docsShell.innerHTML = t('docs.html')
  renderChangelogPage()
  if (!hud.changelogModal.hidden) openChangelogModal()
  renderSkillPanel()
  pvpSetupController.renderPublicRooms()
  if (state.pvp.modal) pvpSetupController.renderModal()
  pvpSetupController.rerenderPreparationModal()
  pvpSetupController.rerenderRoundSetupOverlay()
  updatePlayerTooltip()
  updateHud()
}

function startBotGame() {
  pvpSessionController.resetState()
  state.app.mode = 'bot'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  resetMatch()
  renderSkillPanel()
  formationPresetController.renderSurfaces()
  updateHud()
}

function showFormationManager() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  pvpSessionController.resetState()
  state.app.mode = 'formation'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  state.running = false
  state.paused = false
  resetMatch()
  formationPresetController.renderPlayerNames(formationPresetController.presets()[0]?.playerNames)
  formationPresetController.renderManager()
  updateHud()
}

function goHome() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  pvpSessionController.resetState()
  state.app.mode = 'menu'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  resetMatch()
  renderSkillPanel()
  pvpSetupController.renderPublicRooms()
  formationPresetController.renderSurfaces()
  pvpClient?.connect()
  updateHud()
}

function showDocs() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  pvpSessionController.resetState()
  state.app.mode = 'docs'
  hud.pvpModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  state.running = false
  state.paused = false
  updateHud()
}

function showChangelog() {
  if (state.app.mode.startsWith('pvp')) pvpClient?.leaveRoom()
  pvpSessionController.resetState()
  state.app.mode = 'changelog'
  hud.pvpModal.hidden = true
  hud.changelogModal.hidden = true
  hud.roundSetupOverlay.hidden = true
  hud.roundCountdownOverlay.hidden = true
  state.running = false
  state.paused = false
  renderChangelogPage()
  markChangelogPageSeen()
  updateHud()
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
bindAppInput({
  state,
  hud,
  canvas,
  pvpClient,
  pvpSession: pvpSessionController,
  pvpSetup: pvpSetupController,
  formationPresets: formationPresetController,
  actions: {
    applySeedFromInput,
    canvasPointFromEvent,
    closeChangelogModal,
    closeTacticalDrawer,
    goHome,
    handleResetClick,
    hidePlayerTooltip,
    openProfileNameDialog,
    saveProfileName,
    scheduleSeedCinemaPreview,
    selectPvpTeam: pvpSessionController.selectTeam,
    setBluePosition,
    setCinemaMode,
    setLanguage,
    setPlaybackSpeed,
    setTheme,
    showChangelog,
    showDocs,
    showFormationManager,
    startBotGame,
    startMatch,
    syncLanguageUi,
    togglePause,
    toggleTacticalDrawer,
    updatePlayerTooltip,
    zoomCameraAt,
  },
})
initializePlayerName()
renderSkillPanel()
pvpSetupController.renderPublicRooms()
setPlaybackSpeed(state.playbackSpeed)
pvpClient.connect()
requestAnimationFrame(loop)
