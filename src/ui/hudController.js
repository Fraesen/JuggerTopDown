import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, CAMERA_ZOOM_STEP } from '../game/state.js'
import { FIELD, STONE_SECONDS, TEAM_STRATEGIES } from '../game/config.js'
import { clamp, distance } from '../game/geometry.js'
import { isInactive, isPompfer, isRunner, playerIndex, playerPositionSlot, roleLabel, skillForPlayer } from '../game/players.js'
import { pompfeFor, pompfeLabel } from '../game/pompfen.js'
import { playerStrategy, playerStrategyLabel, teamStrategyLabel } from '../game/strategies.js'
import { positionText, t, teamLabel } from '../i18n/index.js'

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
    const mode = state.app.mode
    const inPvp = mode.startsWith('pvp')
    if (hud.mainMenu) hud.mainMenu.hidden = mode !== 'menu' && mode !== 'pvpLobby'
    if (hud.gameShell) hud.gameShell.hidden = mode === 'menu' || mode === 'pvpLobby' || mode === 'docs'
    if (hud.formationView) hud.formationView.hidden = mode !== 'formation'
    if (hud.gameShell && mode === 'formation') hud.gameShell.hidden = true
    if (hud.gameShell && inPvp) {
      hud.gameShell.classList.remove('tactics-open')
      hud.gameShell.classList.add('drawer-collapsed')
    }
    if (hud.docsView) hud.docsView.hidden = mode !== 'docs'
    if (hud.homeNavBtn) hud.homeNavBtn.classList.toggle('active', mode === 'menu' || mode === 'pvpLobby')
    if (hud.formationNavBtn) hud.formationNavBtn.classList.toggle('active', mode === 'formation')
    if (hud.docsNavBtn) hud.docsNavBtn.classList.toggle('active', mode === 'docs')
    updatePvpSetupTimer()

    const possession = state.jugg.carrier ? t('possession.runner', { team: teamLabel(state.jugg.carrier.team) }) : t('status.free')
    const pinCount = state.players.filter((player) => player.pinnedBy).length
    const inactiveCount = state.players.filter((player) => isInactive(player)).length

    hud.blueScore.textContent = state.score.blue
    hud.redScore.textContent = state.score.red
    if (hud.blueTeamLabel) hud.blueTeamLabel.textContent = scoreboardLabel('blue')
    if (hud.redTeamLabel) hud.redTeamLabel.textContent = scoreboardLabel('red')
    hud.clock.textContent = mode === 'pvpSetup' ? formatClock(state.pvp.setupRemaining) : formatClock(state.timeLeft)
    hud.matchState.textContent = matchStateLabel()
    hud.possession.textContent = possession
    if (hud.possessionChip) {
      hud.possessionChip.classList.toggle('blue-possession', state.jugg.carrier?.team === 'blue')
      hud.possessionChip.classList.toggle('red-possession', state.jugg.carrier?.team === 'red')
      hud.possessionChip.classList.toggle('free-possession', !state.jugg.carrier)
    }
    hud.pins.textContent = pinCount
    hud.inactive.textContent = inactiveCount
    hud.stone.textContent = state.stoneCount
    if (hud.stoneChip) {
      const progress = state.roundBreakTimer > 0 ? 1 - ((state.roundBreakTimer % STONE_SECONDS) / STONE_SECONDS) : state.stoneTimer / STONE_SECONDS
      hud.stoneChip.style.setProperty('--stone-progress', `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`)
    }
    if (hud.seedInput && document.activeElement !== hud.seedInput) hud.seedInput.value = state.matchSeed
    if (hud.seedControl) hud.seedControl.hidden = inPvp
    if (hud.speedControl) hud.speedControl.hidden = inPvp
    if (hud.cinemaControl) hud.cinemaControl.hidden = inPvp
    if (hud.matchToolsPanel) hud.matchToolsPanel.hidden = inPvp
    if (hud.localSkillPanel) hud.localSkillPanel.hidden = inPvp
    if (hud.drawerToggle) hud.drawerToggle.hidden = inPvp
    if (hud.rematchBtn) {
      const pvpMatchOver = state.app.mode === 'pvpMatch' && (state.score.blue >= 3 || state.score.red >= 3 || (state.timeLeft <= 0 && !state.running))
      hud.rematchBtn.hidden = !pvpMatchOver
    }
    if (hud.startBtn) hud.startBtn.disabled = inPvp
    if (hud.pauseBtn) hud.pauseBtn.disabled = inPvp
    if (hud.resetBtn) hud.resetBtn.disabled = inPvp
    if (hud.cinemaToggle) {
      hud.cinemaToggle.checked = state.cinema.enabled
      hud.cinemaToggle.disabled = inPvp
    }
    for (const button of hud.speedButtons) {
      const active = Number(button.dataset.speed) === state.playbackSpeed && !state.cinema.enabled
      button.disabled = state.cinema.enabled || inPvp
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    renderPvpStatus()
    updateMiniMap()
  }

  function updatePvpSetupTimer() {
    if (!state.pvp.setupEndsAt) {
      state.pvp.setupRemaining = 0
      return
    }
    state.pvp.setupRemaining = Math.max(0, (state.pvp.setupEndsAt - Date.now()) / 1000)
  }

  function scoreboardLabel(team) {
    if (!state.app.mode.startsWith('pvp')) return teamLabel(team)
    const player = state.pvp.players.find((candidate) => candidate.team === team && candidate.connected !== false)
    const name = player?.name || (state.pvp.localTeam === team ? state.pvp.playerName : '')
    return name ? `${name} ${teamLabel(team)}` : teamLabel(team)
  }

  function matchStateLabel() {
    if (state.app.mode === 'pvpSetup') return t('match.pvpTeamSetup')
    if (state.app.mode === 'pvpMatch') return state.paused ? t('match.pause') : state.roundBreakTimer > 0 ? t('match.pvpStrategyBreak') : t('match.pvpLive')
    if (state.app.mode === 'pvpLobby') return t('match.pvpLobby')
    return state.paused ? t('match.pause') : state.roundBreakTimer > 0 ? t('match.strategyBreak') : state.running ? t('match.autobattlerLive') : translateMessage(state.message)
  }

  function translateMessage(message) {
    const messageMap = {
      Bereit: 'match.ready',
      Los: 'controls.start',
      'Spiel läuft': 'match.running',
      Pause: 'match.pause',
      Punkt: 'match.point',
      'Neuer Zug': 'match.newRound',
      Unentschieden: 'match.draw',
      'Blau gewinnt': 'match.teamWins',
      'Rot gewinnt': 'match.teamWins',
    }
    if (message === 'Blau gewinnt') return t('match.teamWins', { team: teamLabel('blue') })
    if (message === 'Rot gewinnt') return t('match.teamWins', { team: teamLabel('red') })
    return messageMap[message] ? t(messageMap[message]) : message
  }

  function renderPvpStatus() {
    if (!hud.pvpStatusPanel) return
    const show = state.app.mode === 'pvpSetup' || state.app.mode === 'pvpMatch'
    hud.pvpStatusPanel.hidden = !show
    if (!show) return
    const local = state.pvp.localTeam
    const other = local === 'blue' ? 'red' : 'blue'
    const localPlayer = state.pvp.players.find((player) => player.playerId === state.pvp.playerId)
    const opponentPlayer = state.pvp.players.find((player) => player.team === other && player.connected !== false)
    const localName = localPlayer?.name || state.pvp.playerName || teamLabel(local)
    const opponentName = opponentPlayer?.name || teamLabel(other)
    hud.pvpStatusPanel.innerHTML = `
      <header>
        <span>${state.pvp.roomCode || t('status.pvp')}</span>
        <strong>${state.app.mode === 'pvpSetup' ? `${Math.ceil(state.pvp.setupRemaining)}s` : escapeHtml(localName)}</strong>
      </header>
      <small>${state.pvp.statusText || t('status.synchronized')}</small>
      <div class="pvp-team-choice">
        <button type="button" data-team-choice="blue" class="${local === 'blue' ? 'active' : ''}" ${state.app.mode === 'pvpMatch' ? 'disabled' : ''}>${teamLabel('blue')}</button>
        <button type="button" data-team-choice="red" class="${local === 'red' ? 'active' : ''}" ${state.app.mode === 'pvpMatch' ? 'disabled' : ''}>${teamLabel('red')}</button>
      </div>
      <small>${t('panel.opponent')}: ${escapeHtml(opponentName)} (${teamLabel(other)})</small>
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
    if (state.cinema.enabled) return
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
    if (!state.hover.active) {
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
    const mouseX = state.hover.clientX - wrapRect.left
    const mouseY = state.hover.clientY - wrapRect.top
    const left = clamp(mouseX + 14, 10, wrapRect.width - tooltipWidth - 10)
    const inactive = isInactive(player)
    const statusDetail = player.pinnedBy ? t('tooltip.pin') : player.grappledBy ? t('tooltip.grappled') : player.grappleTarget ? t('tooltip.grappling') : '-'
    const positionLabel = isPompfer(player) ? positionText(playerPositionSlot(player)) : t('formation.middle')
    const pompfe = isPompfer(player) ? pompfeFor(player) : null

    hud.playerTooltip.innerHTML = `
      <header>
        <span>${teamLabel(player.team)}</span>
        <strong>${roleLabel(playerIndex(player))}</strong>
      </header>
      <div><span>${t('skill.technik')}</span><strong>${player.technik}</strong><small>${skill.technik} ${t('skill.sp')}</small></div>
      <div><span>${t('skill.geschwindigkeit')}</span><strong>${player.geschwindigkeit}</strong><small>${skill.geschwindigkeit} ${t('skill.sp')}</small></div>
      <div><span>${t('skill.wahrnehmung')}</span><strong>${player.wahrnehmung}%</strong><small>${skill.wahrnehmung} ${t('skill.sp')}</small></div>
      <div><span>${t('tooltip.pompfe')}</span><strong>${pompfe ? pompfeLabel(pompfe) : t('pompfe.jugg')}</strong><small>${pompfe ? `${pompfe.lengthCm} cm / ${pompfe.reachCm} cm` : player.pompfe}</small></div>
      <div><span>${t('tooltip.position')}</span><strong>${positionLabel}</strong><small>${isPompfer(player) ? t('formation.slot', { slot: playerPositionSlot(player) }) : t('role.runner')}</small></div>
      <div><span>${t('tooltip.strategy')}</span><strong>${playerStrategyLabel(playerStrategy(player))}</strong><small>${teamStrategyLabel(TEAM_STRATEGIES[player.team])}</small></div>
      <div><span>${t('tooltip.status')}</span><strong>${inactive ? t('status.inactive') : t('status.active')}</strong><small>${statusDetail}</small></div>
    `
    hud.playerTooltip.style.left = `${left}px`
    hud.playerTooltip.style.top = '0px'
    hud.playerTooltip.style.visibility = 'hidden'
    hud.playerTooltip.hidden = false

    const tooltipHeight = hud.playerTooltip.offsetHeight
    const belowTop = mouseY + 14
    const top = belowTop + tooltipHeight <= wrapRect.height - 10 ? belowTop : mouseY - tooltipHeight
    hud.playerTooltip.style.top = `${clamp(top, 10, Math.max(10, wrapRect.height - tooltipHeight - 10))}px`
    hud.playerTooltip.style.visibility = ''
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
