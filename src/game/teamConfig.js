import {
  PLAYER_POSITIONS,
  PLAYER_SKILLS,
  PLAYER_STRATEGIES,
  SKILL_POINTS_PER_PLAYER,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from './config.js'
import { POMPFEN_OPTIONS } from './pompfen.js'
import { normalizeTeamStrategy, playerTechniqueOptionsForIndex } from './strategies.js'

const SKILL_KEYS = ['technik', 'geschwindigkeit', 'wahrnehmung']
const POSITION_SLOTS = [1, 2, 3, 4]

export function normalizeSkillConfig(skill, fallbackSkill) {
  const normalized = Object.fromEntries(
    SKILL_KEYS.map((key) => {
      const value = Number(skill?.[key])
      return [key, Number.isInteger(value) && value >= 0 ? value : fallbackSkill[key]]
    }),
  )
  const spent = SKILL_KEYS.reduce((sum, key) => sum + normalized[key], 0)
  return spent === SKILL_POINTS_PER_PLAYER ? normalized : { ...fallbackSkill }
}

export function normalizePositionConfig(team, source = PLAYER_POSITIONS[team]) {
  const fallback = PLAYER_POSITIONS[team] ?? [0, ...POSITION_SLOTS]
  const used = new Set([0])
  const next = [0]
  for (let index = 1; index < 5; index += 1) {
    const raw = Number(source?.[index])
    const fallbackSlot = Number(fallback[index])
    let slot = Number.isInteger(raw) && raw >= 1 && raw <= 4 && !used.has(raw) ? raw : null
    if (slot === null && Number.isInteger(fallbackSlot) && fallbackSlot >= 1 && fallbackSlot <= 4 && !used.has(fallbackSlot)) {
      slot = fallbackSlot
    }
    if (slot === null) slot = POSITION_SLOTS.find((candidate) => !used.has(candidate)) ?? index
    next[index] = slot
    used.add(slot)
  }
  return next
}

export function normalizeLoadoutConfig(team, source = TEAM_LOADOUTS[team]) {
  const fallback = TEAM_LOADOUTS[team] ?? ['runner', 'shield', 'qtip', 'staff', 'chain']
  const next = ['runner']
  let chainUsed = false
  for (let index = 1; index < 5; index += 1) {
    const fallbackPompfe = POMPFEN_OPTIONS.includes(fallback[index]) ? fallback[index] : 'staff'
    let pompfe = POMPFEN_OPTIONS.includes(source?.[index]) ? source[index] : fallbackPompfe
    if (pompfe === 'chain') {
      if (chainUsed) pompfe = fallbackPompfe === 'chain' ? 'staff' : fallbackPompfe
      chainUsed = true
    }
    next[index] = pompfe
  }
  return next
}

export function normalizePlayerStrategiesConfig(team, source = PLAYER_STRATEGIES[team]) {
  const fallback = PLAYER_STRATEGIES[team] ?? ['wide_middle', 'none', 'none', 'none', 'none']
  return Array.from({ length: 5 }, (_, index) => {
    const options = playerTechniqueOptionsForIndex(index)
    return options.some((option) => option.id === source?.[index]) ? source[index] : fallback[index] ?? options[0].id
  })
}

export function exportTeamConfigSnapshot(state, team) {
  return {
    team,
    version: state.pvp.teamVersions[team] ?? 0,
    skills: PLAYER_SKILLS[team].map((skill) => ({ ...skill })),
    positions: normalizePositionConfig(team),
    loadout: normalizeLoadoutConfig(team),
    playerStrategies: normalizePlayerStrategiesConfig(team),
    teamStrategy: state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team],
  }
}
