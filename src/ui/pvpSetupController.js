import { STONE_SECONDS } from '../game/config.js'
import { ROUND_BREAK_LOCK_STONES } from '../game/state.js'
import { t, teamLabel } from '../i18n/index.js'
import { renderFormationPanel, renderTeamSkillPanel } from './skillPanel.js'
import { escapeHtml } from './html.js'

export function createPvpSetupController({
  state,
  hud,
  pvpClient,
  formationPresets,
  currentPlayerName,
  simulationActions,
  updateHud,
  renderSkillPanel,
}) {
  const {
    exportTeamConfig,
    setBluePompfe,
    setBluePosition,
    setBlueSkill,
    setBlueTeamStrategy,
  } = simulationActions
  let prepModalKey = ''
  let roundSetupOverlayKey = ''

  function handleTeamConfigClick(event) {
    const positionButton = event.target.closest('button[data-position]')
    if (positionButton) {
      setBluePosition(Number(positionButton.dataset.player), Number(positionButton.dataset.position))
      rerenderPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const button = event.target.closest('button[data-player]')
    if (!button || !button.dataset.skill) return
    setBlueSkill(Number(button.dataset.player), button.dataset.skill, Number(button.dataset.delta))
    rerenderPreparationModal()
    rerenderRoundSetupOverlay()
  }

  function handleTeamConfigChange(event) {
    const teamStrategySelect = event.target.closest('select[data-team-strategy]')
    if (teamStrategySelect) {
      setBlueTeamStrategy(teamStrategySelect.value)
      rerenderPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const positionSelect = event.target.closest('select[data-position]')
    if (positionSelect) {
      setBluePosition(Number(positionSelect.dataset.player), Number(positionSelect.value))
      rerenderPreparationModal()
      rerenderRoundSetupOverlay()
      return
    }

    const pompfeSelect = event.target.closest('select[data-pompfe]')
    if (pompfeSelect) {
      setBluePompfe(Number(pompfeSelect.dataset.player), pompfeSelect.value)
      rerenderPreparationModal()
      rerenderRoundSetupOverlay()
    }

    const presetSelect = event.target.closest('select[data-formation-preset]')
    if (presetSelect) formationPresets.syncLoadButtons(presetSelect.closest('.formation-presets'))
  }

  function finishInitialSkillSetup() {
    state.pvp.setupSkillSaved = true
    state.pvp.statusText = t('status.prepareFormation')
    pvpClient?.sendTeamConfig(exportTeamConfig(state.pvp.localTeam))
    rerenderPreparationModal()
    updateHud()
  }

  function renderModal() {
    if (state.pvp.modal === 'forfeitWin') {
      renderForfeitWinModal()
      return
    }
    if (state.app.mode === 'pvpMatch' && state.pvp.modal !== 'teamSetup') {
      hideModal()
      return
    }
    if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') {
      renderPreparationModal()
      return
    }
    const isCreate = state.pvp.modal === 'create'
    hud.pvpModal.hidden = false
    hud.pvpModal.classList.remove('setup-modal')
    hud.pvpModalClose.hidden = false
    hud.pvpModalTitle.textContent = isCreate ? t('modal.createTitle') : t('modal.joinTitle')
    hud.pvpModalBody.innerHTML = isCreate ? createRoomModalHtml() : joinRoomModalHtml()
  }

  function renderForfeitWinModal() {
    hud.pvpModal.hidden = false
    hud.pvpModal.classList.remove('setup-modal')
    hud.pvpModalClose.hidden = true
    hud.pvpModalTitle.textContent = t('modal.pvpForfeitTitle')
    hud.pvpModalBody.innerHTML = `
      <div class="modal-body-grid">
        <p class="modal-status">${t('modal.pvpForfeitBody')}</p>
        <p class="modal-status">${t('status.opponentLeftWin')}</p>
        <button class="primary" type="button" data-pvp-home>${t('modal.backToHome')}</button>
      </div>
    `
  }

  function hideModal() {
    state.pvp.modal = null
    prepModalKey = ''
    hud.pvpModal.hidden = true
    hud.pvpModal.classList.remove('setup-modal')
    hud.pvpModalClose.hidden = false
  }

  function hideBackdrop() {
    hud.pvpModal.hidden = true
  }

  function syncPreparationUi() {
    syncPreparationModal()
    syncRoundSetupOverlay()
    syncRoundCountdownOverlay()
  }

  function syncPreparationModal() {
    const desiredModal = state.app.mode === 'pvpSetup' ? 'teamSetup' : null

    if (!desiredModal) {
      if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') hideModal()
      return
    }

    state.pvp.modal = desiredModal
    const key = `${desiredModal}:${state.pvp.setupSkillSaved}:${state.roundBreakLocked}:${state.pvp.localTeam}:${state.pvp.teamVersions[state.pvp.localTeam]}:${state.pvp.teamVersions[state.pvp.opponentTeam]}`
    if (key === prepModalKey && !hud.pvpModal.hidden) {
      updatePreparationCountdown()
      return
    }
    prepModalKey = key
    renderPreparationModal()
  }

  function rerenderPreparationModal() {
    if (state.pvp.modal !== 'teamSetup' && state.pvp.modal !== 'roundSetup') return
    prepModalKey = ''
    renderPreparationModal()
  }

  function closeRoundSetupOverlay() {
    state.roundSetupOpen = false
    hud.roundSetupOverlay.hidden = true
    roundSetupOverlayKey = ''
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
            <strong id="round-setup-title">${roundSetupHeadline(stonesLeft)}</strong>
          </div>
          <b id="round-setup-stones">${t('setup.stones', { count: stonesLeft })}</b>
          <button type="button" data-close-round-setup>${t('controls.done')}</button>
        </header>
        ${state.app.mode === 'pvpMatch' ? formationPresets.controlsHtml({ allowSave: false }) : state.app.mode === 'bot' ? formationPresets.controlsHtml({ allowSave: false }) : ''}
        <div id="round-formation-list" class="formation-list"></div>
      </section>
    `
    renderFormationPanel(hud.roundSetupOverlay.querySelector('#round-formation-list'), state, {
      team,
      editable: true,
      playerNames: formationPresets.currentPlayerNames(),
    })
  }

  function updateRoundSetupOverlayCountdown(stonesLeft) {
    const counter = hud.roundSetupOverlay.querySelector('#round-setup-stones')
    if (counter) counter.textContent = t('setup.stones', { count: stonesLeft })
    const title = hud.roundSetupOverlay.querySelector('#round-setup-title')
    if (title) title.textContent = roundSetupHeadline(stonesLeft)
  }

  function roundSetupHeadline(stonesLeft) {
    return state.roundBreakLabel
      ? t('match.strategyBreakWithStones', { label: state.roundBreakLabel, stones: stonesLeft })
      : t('setup.nextFormation')
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

  function updatePreparationCountdown() {
    const countdown = hud.pvpModalBody.querySelector('#pvp-modal-countdown')
    if (!countdown) return
    const secondsLeft = state.pvp.modal === 'teamSetup' ? Math.ceil(state.pvp.setupRemaining) : Math.ceil(state.roundBreakTimer)
    countdown.textContent = `${secondsLeft}s`
  }

  function renderPreparationModal() {
    const isInitialSetup = state.pvp.modal === 'teamSetup'
    const team = state.pvp.localTeam
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
          ${formationPresets.controlsHtml({ allowSave: false })}
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
        playerNames: formationPresets.currentPlayerNames(),
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
        ${formationPresets.controlsHtml({ allowSave: false })}
      </div>
    `

    const localContainer = hud.pvpModalBody.querySelector('#pvp-modal-local-team')
    renderFormationPanel(localContainer, state, {
      team,
      editable: isInitialSetup || (!locked && state.roundBreakTimer > 0),
      playerNames: formationPresets.currentPlayerNames(),
    })
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

  function roundSetupTeam() {
    return state.app.mode === 'pvpMatch' ? state.pvp.localTeam : 'blue'
  }

  function resetRenderState() {
    prepModalKey = ''
    roundSetupOverlayKey = ''
  }

  return {
    closeRoundSetupOverlay,
    finishInitialSkillSetup,
    handleTeamConfigChange,
    handleTeamConfigClick,
    hideBackdrop,
    hideModal,
    renderModal,
    renderPublicRooms,
    resetRenderState,
    rerenderPreparationModal,
    rerenderRoundSetupOverlay,
    syncPreparationUi,
  }
}
