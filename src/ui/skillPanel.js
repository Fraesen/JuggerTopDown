import {
  PLAYER_POSITIONS,
  PLAYER_STRATEGIES,
  PLAYER_SKILLS,
  POSITION_LABELS,
  SKILL_POINTS_PER_PLAYER,
  TEAM_LOADOUTS,
} from '../game/config.js'
import { roleLabel, statsFromSkill } from '../game/players.js'
import { POMPFEN } from '../game/pompfen.js'
import {
  PLAYER_STRATEGY_OPTIONS,
  RUNNER_STRATEGY_OPTIONS,
  TEAM_STRATEGY_OPTIONS,
  normalizeTeamStrategy,
  teamStrategyLabel,
} from '../game/strategies.js'

export const BLUE_POMPFEN_OPTIONS = ['shield', 'qtip', 'staff', 'chain']

export function playerTechniqueOptionsForIndex(index) {
  return index === 0 ? RUNNER_STRATEGY_OPTIONS : PLAYER_STRATEGY_OPTIONS
}

export function renderBlueSkillPanel(container, state) {
  const chainOwner = TEAM_LOADOUTS.blue.findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
  const currentTeamStrategy = normalizeTeamStrategy(state.nextTeamStrategies.blue)
  const locked = Boolean(state.roundBreakLocked)
  const strategyControl = `
    <article class="skill-row strategy-row">
      <header>
        <span>Teamstrategie naechster Zug</span>
        <strong>${locked ? 'Gesperrt' : teamStrategyLabel(currentTeamStrategy)}</strong>
      </header>
      <label class="position-control">
        <span>Strategie</span>
        <select data-team-strategy ${locked ? 'disabled' : ''}>
          ${TEAM_STRATEGY_OPTIONS.map(
            (option) => `<option value="${option.id}" ${currentTeamStrategy === option.id ? 'selected' : ''}>${option.label}</option>`,
          ).join('')}
        </select>
      </label>
    </article>
  `

  const skillRows = PLAYER_SKILLS.blue
    .map((skill, index) => {
      const stats = statsFromSkill(skill)
      const spent = skill.technik + skill.geschwindigkeit + skill.wahrnehmung
      const techniqueOptions = playerTechniqueOptionsForIndex(index)
      const currentTechnique = techniqueOptions.some((option) => option.id === PLAYER_STRATEGIES.blue[index])
        ? PLAYER_STRATEGIES.blue[index]
        : techniqueOptions[0].id

      return `
        <article class="skill-row">
          <header>
            <span>${roleLabel(index)}</span>
            <strong>${spent}/${SKILL_POINTS_PER_PLAYER}</strong>
          </header>
          ${renderLoadoutControls(index, chainOwner, currentTechnique, techniqueOptions, locked)}
          ${renderSkillControl(index, 'technik', 'T', skill, stats.technik, locked)}
          ${renderSkillControl(index, 'geschwindigkeit', 'G', skill, stats.geschwindigkeit, locked)}
          ${renderSkillControl(index, 'wahrnehmung', 'W', skill, `${stats.wahrnehmung}%`, locked)}
        </article>
      `
    })
    .join('')

  container.innerHTML = strategyControl + skillRows
}

function renderLoadoutControls(index, chainOwner, currentTechnique, techniqueOptions, locked) {
  return `
    <div class="loadout-controls">
      ${index > 0 ? renderPompferControls(index, chainOwner, locked) : ''}
      <label class="position-control">
        <span>Strategie</span>
        <select data-player="${index}" data-player-strategy ${locked ? 'disabled' : ''}>
          ${techniqueOptions
            .map((option) => `<option value="${option.id}" ${currentTechnique === option.id ? 'selected' : ''}>${option.label}</option>`)
            .join('')}
        </select>
      </label>
    </div>
  `
}

function renderPompferControls(index, chainOwner, locked) {
  return `
    <label class="position-control">
      <span>Position</span>
      <select data-player="${index}" data-position ${locked ? 'disabled' : ''}>
        ${Object.entries(POSITION_LABELS)
          .map(([slot, label]) => `<option value="${slot}" ${PLAYER_POSITIONS.blue[index] === Number(slot) ? 'selected' : ''}>${label}</option>`)
          .join('')}
      </select>
    </label>
    <label class="position-control">
      <span>Pompfe</span>
      <select data-player="${index}" data-pompfe ${locked ? 'disabled' : ''}>
        ${BLUE_POMPFEN_OPTIONS.map((option) => {
          const disabled = option === 'chain' && chainOwner > 0 && chainOwner !== index
          return `<option value="${option}" ${TEAM_LOADOUTS.blue[index] === option ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${POMPFEN[option].label}</option>`
        }).join('')}
      </select>
    </label>
  `
}

function renderSkillControl(index, key, label, skill, displayValue, locked) {
  const donors = ['technik', 'geschwindigkeit', 'wahrnehmung'].filter((candidate) => candidate !== key)
  const canIncrease = donors.some((candidate) => skill[candidate] > 0)
  return `
    <div class="skill-control">
      <span>${label}</span>
      <button type="button" data-player="${index}" data-skill="${key}" data-delta="-1" ${locked || skill[key] <= 0 ? 'disabled' : ''}>-</button>
      <strong>${skill[key]}</strong>
      <button type="button" data-player="${index}" data-skill="${key}" data-delta="1" ${locked || !canIncrease ? 'disabled' : ''}>+</button>
      <small>${displayValue}</small>
    </div>
  `
}
