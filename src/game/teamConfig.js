import {
  PLAYER_SKILLS,
  TEAM_STRATEGIES,
} from './config.js'
export {
  createDefaultTeamConfig,
  normalizeLoadoutConfig,
  normalizePositionConfig,
  normalizeSkillConfig,
  normalizeTeamConfig,
} from './rules/teamSchema.js'
import {
  normalizeLoadoutConfig,
  normalizePositionConfig,
} from './rules/teamSchema.js'

export function exportTeamConfigSnapshot(state, team) {
  return {
    team,
    version: state.pvp.teamVersions[team] ?? 0,
    skills: PLAYER_SKILLS[team].map((skill) => ({ ...skill })),
    positions: normalizePositionConfig(team),
    loadout: normalizeLoadoutConfig(team),
    teamStrategy: state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team],
  }
}
