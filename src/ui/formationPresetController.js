import { t } from '../i18n/index.js'
import { readStoredArray, writeStoredJson } from './persistence.js'
import { escapeHtml } from './html.js'

const FORMATION_PRESETS_STORAGE_KEY = 'juggerTopDown.formationPresets'
const PLAYER_COUNT = 5

export function createFormationPresetController({
  state,
  hud,
  pvpClient,
  simulationActions,
  renderFormationPanel,
  renderSkillPanel,
  onPresetChanged = () => {},
}) {
  const { applyTeamConfig, exportTeamConfig } = simulationActions
  let surfaceKey = ''
  let playerNames = []
  let feedback = ''

  function handlePresetClick(event) {
    const saveButton = event.target.closest('[data-save-formation-preset]')
    if (saveButton) {
      savePreset()
      return
    }
    const loadButton = event.target.closest('[data-load-formation-preset]')
    if (loadButton) loadPreset(loadButton.dataset.loadFormationPreset)
  }

  function savePreset() {
    const name = normalizePresetName(hud.formationPresetName?.value || window.prompt('Name der Aufstellung?', currentPresetName()))
    if (!name) return
    const team = editableTeam()
    const config = exportTeamConfig(team)
    const nextPresets = presets().filter((preset) => preset.name !== name)
    nextPresets.unshift({
      name,
      skills: config.skills,
      loadout: config.loadout,
      positions: config.positions,
      teamStrategy: config.teamStrategy,
      playerNames: collectPlayerNames(),
    })
    writeStoredJson(FORMATION_PRESETS_STORAGE_KEY, nextPresets.slice(0, 12))
    feedback = t('formation.saveSuccess')
    renderSurfaces()
    onPresetChanged()
  }

  function loadPreset(name) {
    const presetName = normalizePresetName(name)
    const preset = presets().find((candidate) => candidate.name === presetName)
    if (!preset) return
    const team = editableTeam()
    const version = (state.pvp.teamVersions[team] ?? 0) + 1
    applyTeamConfig({
      team,
      version,
      skills: canLoadSkills() ? preset.skills : undefined,
      loadout: preset.loadout,
      positions: preset.positions,
      teamStrategy: preset.teamStrategy,
    })
    renderPlayerNames(preset.playerNames)
    if (hud.formationPresetName) hud.formationPresetName.value = preset.name
    if (state.app.mode.startsWith('pvp')) pvpClient?.sendTeamConfig(exportTeamConfig(team))
    feedback = t('formation.loadSuccess')
    renderManager()
    renderSkillPanel()
    renderSurfaces()
    onPresetChanged()
  }

  function presets() {
    return readStoredArray(FORMATION_PRESETS_STORAGE_KEY).filter((preset) => preset?.name)
  }

  function controlsHtml({ allowSave = true, showFeedback = false } = {}) {
    const currentPresets = presets()
    return `
      <div class="formation-presets">
        <select data-formation-preset ${currentPresets.length ? '' : 'disabled'}>
        ${currentPresets.length
            ? currentPresets.map((preset) => `<option value="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</option>`).join('')
            : `<option>${t('formation.noPresets')}</option>`}
        </select>
        <button type="button" data-load-formation-preset="${escapeHtml(currentPresets[0]?.name ?? '')}" ${currentPresets.length ? '' : 'disabled'}>${t('formation.loadPreset')}</button>
        ${allowSave ? `<button type="button" data-save-formation-preset>${t('formation.savePreset')}</button>` : ''}
        ${showFeedback && feedback ? `<p class="formation-preset-feedback">${escapeHtml(feedback)}</p>` : ''}
      </div>
    `
  }

  function syncLoadButtons(container) {
    const select = container?.querySelector('[data-formation-preset]')
    const button = container?.querySelector('[data-load-formation-preset]')
    if (select && button) button.dataset.loadFormationPreset = select.value
  }

  function editableTeam() {
    return state.app.mode === 'pvpMatch' || state.app.mode === 'pvpSetup' ? state.pvp.localTeam : 'blue'
  }

  function canLoadSkills() {
    return state.app.mode === 'formation' || state.app.mode === 'bot' || state.app.mode === 'pvpSetup'
  }

  function collectPlayerNames() {
    const inputs = hud.formationManagerFormation?.querySelectorAll?.('[data-player-name]')
    if (!inputs?.length) return currentPlayerNames()
    return [...inputs].map((input) => normalizePlayerName(input.value))
  }

  function renderPlayerNames(names = []) {
    playerNames = Array.from({ length: PLAYER_COUNT }, (_, index) => normalizePlayerName(names[index] || defaultPlayerName(index)))
  }

  function currentPlayerNames() {
    return Array.from({ length: PLAYER_COUNT }, (_, index) => normalizePlayerName(playerNames[index] || defaultPlayerName(index)))
  }

  function defaultPlayerName(index) {
    return index === 0 ? t('role.quick') : t('role.pompfer', { index })
  }

  function handleNameInput(event) {
    const input = event.target.closest('input[data-player-name]')
    if (!input) return
    playerNames[Number(input.dataset.playerName)] = input.value
  }

  function handleNameChange(event) {
    const input = event.target.closest('input[data-player-name]')
    if (!input) return false
    const index = Number(input.dataset.playerName)
    playerNames[index] = normalizePlayerName(input.value) || defaultPlayerName(index)
    input.value = playerNames[index]
    renderManager()
    return true
  }

  function renderSurfaces() {
    if (hud.formationManagerPresets) hud.formationManagerPresets.innerHTML = controlsHtml({ showFeedback: true })
    if (hud.botFormationPresets) {
      const show = state.app.mode === 'bot' && (!state.running || state.roundBreakTimer > 0)
      hud.botFormationPresets.hidden = !show
      hud.botFormationPresets.innerHTML = show ? controlsHtml({ allowSave: false }) : ''
    }
  }

  function syncSurfaces() {
    const key = `${state.app.mode}:${state.running}:${Math.ceil(state.roundBreakTimer)}:${presets().length}`
    if (key === surfaceKey) return
    surfaceKey = key
    renderSurfaces()
  }

  function renderManager() {
    if (!hud.formationView || state.app.mode !== 'formation') return
    if (!hud.formationPresetName.value) hud.formationPresetName.value = currentPresetName()
    renderSurfaces()
    if (!playerNames.length) renderPlayerNames(presets()[0]?.playerNames)
    renderFormationPanel(hud.formationManagerFormation, state, {
      team: 'blue',
      editable: true,
      editNames: true,
      editSkills: true,
      playerNames: currentPlayerNames(),
    })
  }

  function currentPresetName() {
    const date = new Date()
    return `Aufstellung ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  }

  function normalizePresetName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 32)
  }

  function normalizePlayerName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
  }

  return {
    controlsHtml,
    currentPlayerNames,
    handleNameChange,
    handleNameInput,
    handlePresetClick,
    presets,
    renderManager,
    renderPlayerNames,
    renderSurfaces,
    syncLoadButtons,
    syncSurfaces,
  }
}
