import { t, teamLabel } from '../i18n/index.js'

export function createPvpSessionController({
  state,
  pvpClient,
  pvpSetup,
  currentPlayerName,
  simulationActions,
  updateHud,
}) {
  const {
    applyTeamConfig,
    renderSkillPanel,
    resetMatch,
    setCinemaMode,
    setMatchSeed,
    setPlaybackSpeed,
    startMatch,
    syncPvpRoundBreak,
  } = simulationActions

  function requestRematch() {
    if (state.app.mode !== 'pvpMatch') return
    state.pvp.statusText = t('status.rematchRequested')
    pvpClient?.requestRematch()
    updateHud()
  }

  function openCreateGameModal() {
    resetState()
    state.app.mode = 'pvpLobby'
    state.pvp.modal = 'create'
    state.pvp.role = 'host'
    state.pvp.localTeam = 'blue'
    state.pvp.opponentTeam = 'red'
    state.pvp.statusText = t('status.chooseRoomOptions')
    pvpSetup.renderModal()
    updateHud()
  }

  function openJoinGameModal() {
    resetState()
    state.app.mode = 'pvpLobby'
    state.pvp.modal = 'join'
    state.pvp.role = 'guest'
    state.pvp.localTeam = 'red'
    state.pvp.opponentTeam = 'blue'
    state.pvp.statusText = t('status.enterCode')
    pvpSetup.renderModal()
    updateHud()
  }

  function closeModal() {
    if (state.pvp.modal === 'teamSetup' || state.pvp.modal === 'roundSetup') return
    if (state.app.mode === 'pvpLobby') {
      pvpClient.leaveRoom()
      resetState()
      state.app.mode = 'menu'
      pvpSetup.renderPublicRooms()
      pvpClient.connect()
    }
    pvpSetup.hideBackdrop()
    updateHud()
  }

  function joinRoom(code) {
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      state.pvp.error = t('modal.invalidCode')
      pvpSetup.renderModal()
      return
    }
    state.pvp.roomCode = code
    state.pvp.error = ''
    state.pvp.statusText = t('status.connectingRoom')
    pvpSetup.renderModal()
    pvpClient.joinRoom(code, { playerName: currentPlayerName() })
  }

  function joinPublicRoom(code) {
    resetState()
    state.app.mode = 'pvpLobby'
    state.pvp.modal = 'join'
    state.pvp.role = 'guest'
    state.pvp.localTeam = 'red'
    state.pvp.opponentTeam = 'blue'
    joinRoom(String(code ?? '').trim().toUpperCase())
  }

  function createRoom(form) {
    state.pvp.createPublic = Boolean(form.querySelector('[name="isPublic"]')?.checked)
    state.pvp.error = ''
    state.pvp.statusText = t('status.createRoom')
    pvpSetup.renderModal()
    pvpClient.createRoom({ isPublic: state.pvp.createPublic, playerName: currentPlayerName() })
  }

  function selectTeam(team) {
    if (!['blue', 'red'].includes(team)) return
    state.pvp.localTeam = team
    state.pvp.opponentTeam = team === 'blue' ? 'red' : 'blue'
    if (state.pvp.roomCode || state.pvp.playerId) pvpClient.selectTeam(team)
    pvpSetup.renderModal()
    renderSkillPanel()
    updateHud()
  }

  function resetState() {
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
    pvpSetup?.resetRenderState()
  }

  function handleStatus(status) {
    state.pvp.connectionStatus = status
    if (status === 'error' || status === 'closed') {
      state.pvp.statusText = t('status.noPvpServer')
      state.pvp.error = t('status.serverMissing')
    } else if (status === 'open') {
      state.pvp.statusText = t('status.connected')
      state.pvp.error = ''
    }
    if (state.pvp.modal && state.app.mode !== 'pvpMatch') pvpSetup.renderModal()
    updateHud()
  }

  function handleEvent(message) {
    updateServerTimeOffset(message)
    if (!acceptServerSequence(message)) return
    switch (message.type) {
      case 'public_rooms':
        state.pvp.publicRooms = Array.isArray(message.rooms) ? message.rooms : []
        pvpSetup.renderPublicRooms()
        break
      case 'room_created':
        applyRoomState(message)
        state.pvp.createPublic = Boolean(message.isPublic)
        state.pvp.statusText = t('status.waitingSecondPlayer')
        state.pvp.error = ''
        pvpSetup.renderModal()
        break
      case 'join_failed':
        state.pvp.error = message.message || t('modal.joinFailed')
        pvpSetup.renderModal()
        break
      case 'room_state':
      case 'player_joined':
      case 'player_left':
        applyRoomState(message)
        pvpSetup.renderModal()
        break
      case 'team_selected':
        applyTeamSelection(message)
        break
      case 'team_config_changed':
        if (message.config) applyTeamConfig(message.config, { remote: true })
        break
      case 'setup_started':
        startSetup(message)
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
        handleServerError(message)
        break
      default:
        break
    }
    updateHud()
  }

  function handleServerError(message) {
    if (message.code === 'unknown_type' && String(message.message || '').includes('round_break_report')) {
      state.pvp.error = t('status.pvpServerOutdatedDetail')
      state.pvp.statusText = t('status.pvpServerOutdated')
      pvpSetup.hideModal()
      return
    }
    state.pvp.error = message.message || t('modal.pvpError')
    if (state.app.mode !== 'pvpMatch') pvpSetup.renderModal()
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
    if (wasConnected && !state.pvp.connected && state.app.mode === 'pvpMatch') applyForfeitWin()
    if (wasConnected && !state.pvp.connected && state.app.mode === 'pvpSetup') {
      state.running = false
      state.paused = true
      state.pvp.statusText = t('status.pvpConnectionLost')
      state.pvp.error = t('status.otherPlayerLeft')
    }
  }

  function applyForfeitWin() {
    const winner = state.pvp.localTeam
    const loser = state.pvp.opponentTeam
    state.running = false
    state.paused = true
    state.roundBreakTimer = 0
    state.roundBreakLabel = ''
    state.roundBreakLocked = false
    state.roundSetupOpen = false
    state.score[winner] = 3
    state.score[loser] = Math.min(state.score[loser] ?? 0, 2)
    state.timeLeft = 0
    state.message = t('match.teamWins', { team: teamLabel(winner) })
    state.messageTimer = 2.5
    state.pvp.statusText = t('status.opponentLeftWin')
    state.pvp.error = ''
    state.pvp.modal = 'forfeitWin'
    pvpSetup.resetRenderState()
    pvpSetup.renderModal()
  }

  function applyTeamSelection(message) {
    if (message.playerId && message.playerId === state.pvp.playerId && message.team) selectLocalTeamFromServer(message.team)
    if (message.localTeam) selectLocalTeamFromServer(message.localTeam)
    pvpSetup.renderModal()
    renderSkillPanel()
  }

  function selectLocalTeamFromServer(team) {
    if (!['blue', 'red'].includes(team)) return
    state.pvp.localTeam = team
    state.pvp.opponentTeam = team === 'blue' ? 'red' : 'blue'
  }

  function startSetup(message) {
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
    pvpSetup.rerenderPreparationModal()
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
    pvpSetup.hideModal()
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

  return {
    closeModal,
    createRoom,
    handleEvent,
    handleStatus,
    joinPublicRoom,
    joinRoom,
    openCreateGameModal,
    openJoinGameModal,
    requestRematch,
    resetState,
    selectTeam,
  }
}
