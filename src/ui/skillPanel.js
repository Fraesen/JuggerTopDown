import {
  PLAYER_POSITIONS,
  PLAYER_STRATEGIES,
  PLAYER_SKILLS,
  POSITION_LABELS,
  SKILL_POINTS_PER_PLAYER,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from '../game/config.js'
import { roleLabel, statsFromSkill } from '../game/players.js'
import { POMPFEN_OPTIONS, pompfeLabel } from '../game/pompfen.js'
import {
  TEAM_STRATEGY_OPTIONS,
  normalizeTeamStrategy,
  playerStrategyLabel,
  playerTechniqueOptionsForIndex,
  teamStrategyLabel,
} from '../game/strategies.js'
import { positionText, t } from '../i18n/index.js'

export const BLUE_POMPFEN_OPTIONS = POMPFEN_OPTIONS

export function renderBlueSkillPanel(container, state) {
  renderTeamSkillPanel(container, state, { team: 'blue' })
}

export function renderTeamSkillPanel(
  container,
  state,
  { team = 'blue', editable = true, editSkills = editable, editPositions = editable, editLoadout = editable, editStrategies = editable } = {},
) {
  const chainOwner = TEAM_LOADOUTS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
  const currentTeamStrategy = normalizeTeamStrategy(state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team])
  const locked = Boolean(state.roundBreakLocked || !editable)
  const strategyLocked = locked || !editStrategies
  const strategyControl = editStrategies ? `
    <article class="skill-row strategy-row">
      <header>
        <span>${t('formation.teamStrategyNext')}</span>
        <strong>${strategyLocked ? t('status.locked') : teamStrategyLabel(currentTeamStrategy)}</strong>
      </header>
      <label class="position-control">
        <span>${t('formation.strategy')}</span>
        <select data-team-strategy ${strategyLocked ? 'disabled' : ''}>
          ${TEAM_STRATEGY_OPTIONS.map(
            (option) => `<option value="${option.id}" ${currentTeamStrategy === option.id ? 'selected' : ''}>${teamStrategyLabel(option.id)}</option>`,
          ).join('')}
        </select>
      </label>
    </article>
  ` : ''

  const skillRows = PLAYER_SKILLS[team]
    .map((skill, index) => {
      const stats = statsFromSkill(skill)
      const spent = skill.technik + skill.geschwindigkeit + skill.wahrnehmung
      const techniqueOptions = playerTechniqueOptionsForIndex(index)
      const currentTechnique = techniqueOptions.some((option) => option.id === PLAYER_STRATEGIES[team][index])
        ? PLAYER_STRATEGIES[team][index]
        : techniqueOptions[0].id

      return `
        <article class="skill-row">
          <header>
            <span>${roleLabel(index)}</span>
            <strong>${spent}/${SKILL_POINTS_PER_PLAYER}</strong>
          </header>
          ${renderLoadoutControls(team, index, chainOwner, currentTechnique, techniqueOptions, {
            positionLocked: locked || !editPositions,
            loadoutLocked: locked || !editLoadout,
            strategyLocked: locked || !editStrategies,
            showPosition: editPositions,
            showLoadout: editLoadout,
            showStrategy: editStrategies,
          })}
          ${renderSkillControl(index, 'technik', t('skill.technik.short'), skill, stats.technik, locked || !editSkills)}
          ${renderSkillControl(index, 'geschwindigkeit', t('skill.geschwindigkeit.short'), skill, stats.geschwindigkeit, locked || !editSkills)}
          ${renderSkillControl(index, 'wahrnehmung', t('skill.wahrnehmung.short'), skill, `${stats.wahrnehmung}%`, locked || !editSkills)}
        </article>
      `
    })
    .join('')

  container.innerHTML = strategyControl + skillRows
}

export function renderFormationPanel(container, state, { team = 'blue', editable = true } = {}) {
  const currentTeamStrategy = normalizeTeamStrategy(state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team])
  const chainOwner = TEAM_LOADOUTS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
  const locked = Boolean(state.roundBreakLocked || !editable)
  const rows = PLAYER_SKILLS[team]
    .map((_, index) => {
      const techniqueOptions = playerTechniqueOptionsForIndex(index)
      const currentTechnique = techniqueOptions.some((option) => option.id === PLAYER_STRATEGIES[team][index])
        ? PLAYER_STRATEGIES[team][index]
        : techniqueOptions[0].id

      return `
        <article class="formation-row">
          <header>
            <span>${roleLabel(index)}</span>
            <strong>${index === 0 ? t('role.runner') : positionText(PLAYER_POSITIONS[team][index])}</strong>
          </header>
          <div class="loadout-controls">
            ${
              index > 0
                ? renderPompferControls(team, index, chainOwner, {
                    positionLocked: locked,
                    loadoutLocked: locked,
                  })
                : ''
            }
            <label class="position-control">
              <span>${t('formation.strategy')}</span>
              <select data-player="${index}" data-player-strategy ${locked ? 'disabled' : ''}>
                ${techniqueOptions
                  .map((option) => `<option value="${option.id}" ${currentTechnique === option.id ? 'selected' : ''}>${playerStrategyLabel(option.id)}</option>`)
                  .join('')}
              </select>
            </label>
          </div>
        </article>
      `
    })
    .join('')

  container.innerHTML = `
    <article class="formation-row strategy-row">
      <header>
        <span>${t('formation.teamStrategy')}</span>
        <strong>${locked ? t('status.locked') : teamStrategyLabel(currentTeamStrategy)}</strong>
      </header>
      <label class="position-control">
        <span>${t('formation.strategy')}</span>
        <select data-team-strategy ${locked ? 'disabled' : ''}>
          ${TEAM_STRATEGY_OPTIONS.map(
            (option) => `<option value="${option.id}" ${currentTeamStrategy === option.id ? 'selected' : ''}>${teamStrategyLabel(option.id)}</option>`,
          ).join('')}
        </select>
      </label>
    </article>
    ${rows}
  `
}

function renderLoadoutControls(team, index, chainOwner, currentTechnique, techniqueOptions, locks) {
  const pompferControls = index > 0 ? renderPompferControls(team, index, chainOwner, locks) : ''
  const strategyControl = locks.showStrategy ? `
    <label class="position-control">
      <span>${t('formation.strategy')}</span>
      <select data-player="${index}" data-player-strategy ${locks.strategyLocked ? 'disabled' : ''}>
        ${techniqueOptions
          .map((option) => `<option value="${option.id}" ${currentTechnique === option.id ? 'selected' : ''}>${playerStrategyLabel(option.id)}</option>`)
          .join('')}
      </select>
    </label>
  ` : ''
  if (!pompferControls && !strategyControl) return ''
  return `
    <div class="loadout-controls">
      ${pompferControls}
      ${strategyControl}
    </div>
  `
}

function renderPompferControls(team, index, chainOwner, locks) {
  return `
    ${locks.showPosition === false ? '' : `<label class="position-control">
      <span>${t('formation.position')}</span>
      <select data-player="${index}" data-position ${locks.positionLocked ? 'disabled' : ''}>
        ${Object.keys(POSITION_LABELS)
          .map((slot) => `<option value="${slot}" ${PLAYER_POSITIONS[team][index] === Number(slot) ? 'selected' : ''}>${positionText(slot)}</option>`)
          .join('')}
      </select>
    </label>`}
    ${locks.showLoadout === false ? '' : `<label class="position-control">
      <span>${t('formation.pompfe')}</span>
      <select data-player="${index}" data-pompfe ${locks.loadoutLocked ? 'disabled' : ''}>
        ${POMPFEN_OPTIONS.map((option) => {
          const disabled = option === 'chain' && chainOwner > 0 && chainOwner !== index
          return `<option value="${option}" ${TEAM_LOADOUTS[team][index] === option ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${pompfeLabel(option)}</option>`
        }).join('')}
      </select>
    </label>`}
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
