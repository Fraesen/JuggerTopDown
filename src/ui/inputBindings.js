export function bindAppInput({
  state,
  hud,
  canvas,
  pvpClient,
  pvpSession,
  pvpSetup,
  formationPresets,
  actions,
}) {
  let draggedFormationPlayer = null
  const {
    applySeedFromInput,
    canvasPointFromEvent,
    closeTacticalDrawer,
    goHome,
    hidePlayerTooltip,
    handleResetClick,
    openProfileNameDialog,
    saveProfileName,
    scheduleSeedCinemaPreview,
    selectPvpTeam,
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
    closeChangelogModal,
  } = actions

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault()
    if (event.code === 'KeyP') togglePause()
  })

  hud.botGameBtn.addEventListener('click', startBotGame)
  hud.openFormationBtn.addEventListener('click', showFormationManager)
  hud.createGameBtn.addEventListener('click', pvpSession.openCreateGameModal)
  hud.joinGameBtn.addEventListener('click', pvpSession.openJoinGameModal)
  hud.refreshPublicRoomsBtn.addEventListener('click', () => pvpClient.listPublicRooms())
  hud.publicRoomList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-public-room]')
    if (button) pvpSession.joinPublicRoom(button.dataset.publicRoom)
  })
  hud.homeNavBtn.addEventListener('click', goHome)
  hud.formationNavBtn.addEventListener('click', showFormationManager)
  hud.docsNavBtn.addEventListener('click', showDocs)
  hud.changelogNavBtn.addEventListener('click', showChangelog)
  hud.drawerToggle.addEventListener('click', toggleTacticalDrawer)
  hud.drawerClose.addEventListener('click', closeTacticalDrawer)
  hud.languageSelect.addEventListener('change', () => {
    setLanguage(hud.languageSelect.value)
    syncLanguageUi()
  })
  hud.themeSelect.addEventListener('change', () => setTheme(hud.themeSelect.value))
  hud.profileNameBtn.addEventListener('click', openProfileNameDialog)
  hud.profileForm.addEventListener('submit', saveProfileName)
  hud.changelogModalClose.addEventListener('click', closeChangelogModal)
  hud.changelogModalConfirm.addEventListener('click', closeChangelogModal)
  hud.pvpModalClose.addEventListener('click', pvpSession.closeModal)
  hud.pvpModal.addEventListener('click', (event) => {
    if (event.target.closest('[data-pvp-home]')) {
      goHome()
      return
    }
    if (event.target === hud.pvpModal && state.app.mode === 'pvpLobby') pvpSession.closeModal()
    formationPresets.handlePresetClick(event)
    const finishSkillButton = event.target.closest('[data-finish-skill-setup]')
    if (finishSkillButton) pvpSetup.finishInitialSkillSetup()
    const teamButton = event.target.closest('[data-team-choice]')
    if (teamButton) selectPvpTeam(teamButton.dataset.teamChoice)
    pvpSetup.handleTeamConfigClick(event)
  })
  hud.pvpModal.addEventListener('change', pvpSetup.handleTeamConfigChange)
  hud.pvpModal.addEventListener('submit', (event) => {
    const createForm = event.target.closest('[data-create-form]')
    if (createForm) {
      event.preventDefault()
      pvpSession.createRoom(createForm)
      return
    }
    const form = event.target.closest('[data-join-form]')
    if (!form) return
    event.preventDefault()
    const code = form.querySelector('[name="roomCode"]').value.trim().toUpperCase()
    pvpSession.joinRoom(code)
  })
  hud.pvpStatusPanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-team-choice]')
    if (button && state.app.mode !== 'pvpMatch') selectPvpTeam(button.dataset.teamChoice)
  })
  hud.roundSetupOverlay.addEventListener('change', pvpSetup.handleTeamConfigChange)
  hud.roundSetupOverlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-round-setup]')) pvpSetup.closeRoundSetupOverlay()
    formationPresets.handlePresetClick(event)
    pvpSetup.handleTeamConfigClick(event)
  })
  bindFormationDrag(hud.skillList)
  bindFormationDrag(hud.pvpModal)
  bindFormationDrag(hud.roundSetupOverlay)
  bindFormationDrag(hud.formationManagerFormation)
  hud.formationBackBtn.addEventListener('click', goHome)
  hud.formationManagerPresets.addEventListener('click', formationPresets.handlePresetClick)
  hud.formationManagerPresets.addEventListener('change', pvpSetup.handleTeamConfigChange)
  hud.botFormationPresets.addEventListener('click', formationPresets.handlePresetClick)
  hud.botFormationPresets.addEventListener('change', pvpSetup.handleTeamConfigChange)
  hud.formationManagerFormation.addEventListener('click', (event) => {
    if (event.target.closest('input[data-player-name]')) return
    if (!event.target.closest('button[data-position], button[data-player][data-skill]')) return
    pvpSetup.handleTeamConfigClick(event)
    formationPresets.renderManager()
  })
  hud.formationManagerFormation.addEventListener('change', (event) => {
    if (formationPresets.handleNameChange(event)) return
    pvpSetup.handleTeamConfigChange(event)
    formationPresets.renderManager()
  })
  hud.formationManagerFormation.addEventListener('input', formationPresets.handleNameInput)

  hud.startBtn.addEventListener('click', startMatch)
  hud.pauseBtn.addEventListener('click', togglePause)
  hud.resetBtn.addEventListener('click', handleResetClick)
  hud.rematchBtn?.addEventListener('click', pvpSession.requestRematch)
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
    pvpSetup.handleTeamConfigClick(event)
  })
  hud.skillList.addEventListener('change', pvpSetup.handleTeamConfigChange)

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
        formationPresets.renderManager()
        pvpSetup.rerenderPreparationModal()
        pvpSetup.rerenderRoundSetupOverlay()
      }
      clearFormationDragState()
    })

    container.addEventListener('dragend', clearFormationDragState)
  }

  function clearFormationDragState() {
    draggedFormationPlayer = null
    document.querySelectorAll('.dragging, .drag-over').forEach((element) => {
      element.classList.remove('dragging', 'drag-over')
    })
  }
}
