import {
  CURRENT_CHANGELOG_LABEL,
  hasSeenCurrentChangelog,
  latestChangelogVersion,
  readSeenChangelogVersion,
  renderChangelogHtml,
  writeSeenChangelogVersion,
} from './changelog.js'
import { readStoredString, writeStoredString } from './persistence.js'
import { t } from '../i18n/index.js'

const PLAYER_NAME_STORAGE_KEY = 'juggerTopDown.playerName'

export function createProfileChangelogController({
  state,
  hud,
  updateHud,
  onProfileSaved = () => {},
}) {
  function initializePlayerName() {
    const savedName = normalizePlayerName(readStoredString(PLAYER_NAME_STORAGE_KEY))
    if (savedName) {
      state.pvp.playerName = savedName
      updateProfileNameButton()
      maybeOpenChangelogModal()
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
    onProfileSaved()
    maybeOpenChangelogModal()
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

  function renderChangelogPage() {
    if (!hud.changelogPageBody) return
    hud.changelogPageBody.innerHTML = renderChangelogHtml()
  }

  function maybeOpenChangelogModal() {
    if (!hud.changelogModal || !hud.profileModal.hidden || hasSeenCurrentChangelog()) return
    openChangelogModal()
  }

  function openChangelogModal() {
    const seenVersion = readSeenChangelogVersion()
    hud.changelogModal.querySelector('#changelog-modal-title').textContent = `${t('changelog.modalTitle')} (${CURRENT_CHANGELOG_LABEL})`
    hud.changelogModalBody.innerHTML = renderChangelogHtml({ onlyUnseen: true, seenVersion })
    hud.changelogModal.hidden = false
  }

  function closeChangelogModal() {
    writeSeenChangelogVersion(latestChangelogVersion())
    hud.changelogModal.hidden = true
  }

  function markChangelogPageSeen() {
    writeSeenChangelogVersion()
  }

  return {
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
  }
}
