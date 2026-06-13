import {
  PLAYER_POSITIONS,
  PLAYER_SKILLS,
  START_POSITIONS,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from '../config.js'
import { playerIndex, playerSpeed, statsFromSkill } from '../players.js'
import { POMPFEN_OPTIONS, pompfeLabel } from '../pompfen.js'
import { renderTeamSkillPanel } from '../../ui/skillPanel.js'
import { normalizeTeamStrategy } from '../strategies.js'
import {
  createDefaultTeamConfig,
  exportTeamConfigSnapshot,
  normalizeLoadoutConfig,
  normalizePositionConfig,
  normalizeSkillConfig,
} from '../teamConfig.js'
import { t, teamLabel } from '../../i18n/index.js'

export function createTeamSetupSystem({
  state,
  hud,
  headless,
  updateHud,
  updatePlayerTooltip,
  onLocalTeamConfigChanged,
  getPlayerNames,
  isRoundBreakLocked,
  shouldPreviewSetupAtGroundLine,
}) {
  function editableTeam() {
    return state.app.mode === 'pvpSetup' || state.app.mode === 'pvpMatch' || state.app.mode === 'pvpLobby' ? state.pvp.localTeam : 'blue'
  }

  function opponentTeam() {
    return editableTeam() === 'blue' ? 'red' : 'blue'
  }

  function canEditTeam(team) {
    if (team !== editableTeam()) return false
    if (state.app.mode === 'pvpMatch') return state.roundBreakTimer > 0 && !isRoundBreakLocked()
    if (state.app.mode === 'pvpSetup') return !isRoundBreakLocked()
    return !isRoundBreakLocked()
  }

  function applyTeamSkills(team) {
    for (const player of state.players) {
      if (player.team !== team) continue
      const index = playerIndex(player)
      const stats = statsFromSkill(PLAYER_SKILLS[team][index])
      player.technik = stats.technik
      player.geschwindigkeit = stats.geschwindigkeit
      player.wahrnehmung = stats.wahrnehmung
      player.speed = playerSpeed(player.role, stats.geschwindigkeit)
    }
  }
  
  function applyTeamPositions(team, { resetSpawns = false } = {}) {
    for (const player of state.players) {
      if (player.team !== team) continue
      const index = playerIndex(player)
      const slot = PLAYER_POSITIONS[team][index] ?? index
      player.positionSlot = slot
  
      if (resetSpawns) {
        const spawn = START_POSITIONS[team][slot]
        player.x = spawn.x
        player.y = spawn.y
        player.vx = 0
        player.vy = 0
        player.angle = team === 'blue' ? 0 : Math.PI
        player.openingComplete = false
      }
    }
  }
  
  function releaseGrapple(player) {
    if (player.grappleTarget) {
      player.grappleTarget.grappledBy = null
      player.grappleTarget = null
    }
    if (player.grappledBy) {
      player.grappledBy.grappleTarget = null
      player.grappledBy = null
    }
  }
  
  function setBluePosition(index, slot) {
    const team = editableTeam()
    if (!canEditTeam(team)) return
    if (index <= 0 || slot <= 0 || slot >= PLAYER_POSITIONS[team].length) return
    const currentSlot = PLAYER_POSITIONS[team][index]
    if (currentSlot === slot) return
  
    const swapIndex = PLAYER_POSITIONS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === slot)
    PLAYER_POSITIONS[team][index] = slot
    if (swapIndex > 0) PLAYER_POSITIONS[team][swapIndex] = currentSlot
  
    applyTeamPositions(team, { resetSpawns: shouldPreviewSetupAtGroundLine() })
    notifyLocalTeamConfigChanged(team)
    renderSkillPanel()
    updateHud()
  }
  
  function setBluePompfe(index, pompfe) {
    const team = editableTeam()
    if (!canEditTeam(team)) return
    if (index <= 0 || !POMPFEN_OPTIONS.includes(pompfe)) return
    if (pompfe === 'chain') {
      const existingChainIndex = TEAM_LOADOUTS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
      if (existingChainIndex > 0 && existingChainIndex !== index) {
        renderSkillPanel()
        return
      }
    }
  
    TEAM_LOADOUTS[team][index] = pompfe
    const player = state.players.find((candidate) => candidate.team === team && playerIndex(candidate) === index)
    if (player) {
      player.pompfe = pompfe
      player.pompfeLabel = pompfeLabel(player.pompfe)
      player.attack = 0
      player.attackWindup = 0
      player.attackTarget = null
      player.attackCooldown = 0
      player.doubleWindow = 0
      player.chainStrikeTimer = 0
      player.chainStrikeTarget = null
      player.chainGuardTarget = null
      for (const target of state.players) {
        if (target.pinnedBy === player) {
          target.pinnedBy = null
          target.pinClaimedBy = null
        }
      }
      player.pinTarget = null
    }
  
    notifyLocalTeamConfigChanged(team)
    renderSkillPanel()
    updatePlayerTooltip()
  }
  
  function resetStrategyState(player) {
    player.defensiveStrategyDone = false
    player.overzahlDefenseTimer = 0
  }
  
  function applyNextTeamStrategies({ resetOpening = false } = {}) {
    for (const team of Object.keys(TEAM_STRATEGIES)) {
      TEAM_STRATEGIES[team] = normalizeTeamStrategy(state.nextTeamStrategies[team])
    }
  
    for (const player of state.players) {
      if (resetOpening) player.openingComplete = false
      resetStrategyState(player)
    }
  }
  
  function resetNextTeamStrategies({ toDefaults = false } = {}) {
    for (const team of Object.keys(state.nextTeamStrategies)) {
      state.nextTeamStrategies[team] = toDefaults ? 'standard' : normalizeTeamStrategy(TEAM_STRATEGIES[team])
    }
  }
  
  function setBlueTeamStrategy(strategy) {
    const team = editableTeam()
    if (!canEditTeam(team)) return
    state.nextTeamStrategies[team] = normalizeTeamStrategy(strategy)
    if (!state.running) {
      TEAM_STRATEGIES[team] = state.nextTeamStrategies[team]
      for (const player of state.players) {
        if (player.team !== team) continue
        player.openingComplete = false
        resetStrategyState(player)
      }
    }
    notifyLocalTeamConfigChanged(team)
    renderSkillPanel()
    updatePlayerTooltip()
  }
  
  function setBlueSkill(index, key, delta) {
    const team = editableTeam()
    if (!canEditTeam(team)) return
    if (state.app.mode === 'pvpMatch') return
    const skill = PLAYER_SKILLS[team][index]
    const keys = ['technik', 'geschwindigkeit', 'wahrnehmung']
    const otherKeys = keys.filter((candidate) => candidate !== key)
  
    if (delta > 0) {
      const donor = otherKeys.sort((a, b) => skill[b] - skill[a])[0]
      if (skill[donor] <= 0) return
      skill[key] += 1
      skill[donor] -= 1
    } else {
      if (skill[key] <= 0) return
      const receiver = otherKeys.sort((a, b) => skill[a] - skill[b])[0]
      skill[key] -= 1
      skill[receiver] += 1
    }
  
    applyTeamSkills(team)
    notifyLocalTeamConfigChanged(team)
    renderSkillPanel()
  }
  
  function renderSkillPanel() {
    const team = editableTeam()
    const enemyTeam = opponentTeam()
    const editSetup = state.app.mode !== 'pvpMatch'
    const editFormation = state.app.mode !== 'pvpSetup' || canEditTeam(team)
    if (hud.skillPanelTitle) {
      hud.skillPanelTitle.textContent = state.app.mode.startsWith('pvp')
        ? t('panel.localTeam', { team: teamLabel(team) })
        : t('panel.skillTitle', { team: teamLabel('blue') })
    }
    renderTeamSkillPanel(hud.skillList, state, {
      team,
      editable: canEditTeam(team),
      editSkills: editSetup,
      editLoadout: editSetup,
      editPositions: editFormation,
      editStrategies: editFormation,
      playerNames: getPlayerNames?.(team) ?? [],
    })
    if (hud.opponentSkillPanel && hud.opponentSkillList) {
      const showOpponent = false
      hud.opponentSkillPanel.hidden = !showOpponent
      if (hud.opponentTeamLabel) hud.opponentTeamLabel.textContent = teamLabel(enemyTeam)
      if (showOpponent) renderTeamSkillPanel(hud.opponentSkillList, state, { team: enemyTeam, editable: false })
    }
  }

  function exportTeamConfig(team) {
    return exportTeamConfigSnapshot(state, team)
  }

  function notifyLocalTeamConfigChanged(team) {
    if (headless || team !== state.pvp.localTeam || !state.app.mode.startsWith('pvp')) return
    state.pvp.teamVersions[team] = (state.pvp.teamVersions[team] ?? 0) + 1
    onLocalTeamConfigChanged?.(exportTeamConfig(team))
  }

  function applyTeamConfig(config, { remote = false } = {}) {
    const team = config?.team
    if (!team || !PLAYER_SKILLS[team]) return
    const rawVersion = Number(config.version ?? 0)
    const incomingVersion = Number.isFinite(rawVersion) ? rawVersion : 0
    if (remote && incomingVersion < (state.pvp.teamVersions[team] ?? 0)) return
    state.pvp.teamVersions[team] = Math.max(state.pvp.teamVersions[team] ?? 0, incomingVersion)

    if (Array.isArray(config.skills)) {
      const defaultSkills = createDefaultTeamConfig(team).skills
      config.skills.forEach((skill, index) => {
        if (!PLAYER_SKILLS[team][index]) return
        PLAYER_SKILLS[team][index] = normalizeSkillConfig(skill, defaultSkills[index])
      })
    }
    if (Array.isArray(config.positions)) PLAYER_POSITIONS[team].splice(0, PLAYER_POSITIONS[team].length, ...normalizePositionConfig(team, config.positions))
    if (Array.isArray(config.loadout)) TEAM_LOADOUTS[team].splice(0, TEAM_LOADOUTS[team].length, ...normalizeLoadoutConfig(team, config.loadout))
    if (config.teamStrategy) state.nextTeamStrategies[team] = normalizeTeamStrategy(config.teamStrategy)

    applyTeamSkills(team)
    applyTeamPositions(team, { resetSpawns: shouldPreviewSetupAtGroundLine() })
    for (const player of state.players) {
      if (player.team !== team) continue
      const index = playerIndex(player)
      player.pompfe = TEAM_LOADOUTS[team][index] ?? player.pompfe
      player.pompfeLabel = pompfeLabel(player.pompfe)
      resetStrategyState(player)
    }
    renderSkillPanel()
    updatePlayerTooltip()
    updateHud()
  }


  return {
    applyNextTeamStrategies,
    applyTeamConfig,
    applyTeamPositions,
    applyTeamSkills,
    canEditTeam,
    editableTeam,
    exportTeamConfig,
    notifyLocalTeamConfigChanged,
    opponentTeam,
    releaseGrapple,
    renderSkillPanel,
    resetNextTeamStrategies,
    resetStrategyState,
    setBluePompfe,
    setBluePosition,
    setBlueSkill,
    setBlueTeamStrategy,
  }
}
