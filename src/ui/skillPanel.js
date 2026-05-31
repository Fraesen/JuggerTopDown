import {
  PLAYER_POSITIONS,
  PLAYER_SKILLS,
  SKILL_POINTS_PER_PLAYER,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from '../game/config.js'
import { roleLabel, statsFromSkill } from '../game/players.js'
import { POMPFEN_OPTIONS, pompfeLabel } from '../game/pompfen.js'
import {
  TEAM_STRATEGY_OPTIONS,
  normalizeTeamStrategy,
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
  { team = 'blue', editable = true, editSkills = editable, editPositions = editable, editLoadout = editable, editStrategies = editable, playerNames = [] } = {},
) {
  const openCards = new Set(
    [...(container.querySelectorAll?.('details[data-player-card][open]') ?? [])]
      .map((card) => `${card.dataset.team}:${card.dataset.player}`),
  )
  const chainOwner = TEAM_LOADOUTS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
  const currentTeamStrategy = normalizeTeamStrategy(state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team])
  const locked = Boolean(state.roundBreakLocked || !editable)
  const strategyLocked = locked || !editStrategies
  const strategyControl = editStrategies ? `
    <article class="skill-row strategy-row team-playbook-card">
      <header class="player-card-header">
        <div>
          <span>${t('bench.teamPlan')}</span>
          <strong>${t('formation.teamStrategyNext')}</strong>
        </div>
        <small>${strategyLocked ? t('status.locked') : teamStrategyLabel(currentTeamStrategy)}</small>
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

  const orderedPlayerIndexes = [
    0,
    ...PLAYER_SKILLS[team]
      .map((_, index) => index)
      .filter((index) => index > 0)
      .sort((a, b) => PLAYER_POSITIONS[team][a] - PLAYER_POSITIONS[team][b]),
  ]

  const skillRows = orderedPlayerIndexes
    .map((index) => {
      const skill = PLAYER_SKILLS[team][index]
      const stats = statsFromSkill(skill)
      const spent = skill.technik + skill.geschwindigkeit + skill.wahrnehmung
      const isRunner = index === 0
      const loadoutSummary = isRunner ? roleLabel(index) : pompfeLabel(TEAM_LOADOUTS[team][index])
      const slot = PLAYER_POSITIONS[team][index] ?? index
      const draggable = !isRunner && editPositions && !locked
      const slotLabel = draggable ? positionText(slot) : ''
      const open = openCards.has(`${team}:${index}`)
      const playerName = playerNameFor(index, playerNames)

      return `
        ${slotLabel ? `<div class="position-lane-label">${slotLabel}</div>` : ''}
        <details class="skill-row player-card ${isRunner ? 'runner-card' : 'pompfer-card'} ${draggable ? 'draggable-card' : ''}" data-player-card data-player="${index}" data-slot="${slot}" data-team="${team}" ${draggable ? 'draggable="true"' : ''} ${open ? 'open' : ''}>
          <summary class="player-card-header">
            ${draggable ? '<span class="drag-handle" aria-hidden="true"></span>' : ''}
            <div>
              <span>${escapeHtml(playerName)}</span>
              <strong>${loadoutSummary}</strong>
            </div>
            <small>${spent}/${SKILL_POINTS_PER_PLAYER}</small>
          </summary>
          <div class="player-card-body">
            ${renderLoadoutControls(team, index, chainOwner, {
              positionLocked: locked || !editPositions,
              loadoutLocked: locked || !editLoadout,
              showPosition: editPositions,
              showLoadout: editLoadout,
            })}
            <div class="stat-stack">
              ${renderSkillControl(index, 'technik', t('skill.technik'), skill, stats.technik, locked || !editSkills)}
              ${renderSkillControl(index, 'geschwindigkeit', t('skill.geschwindigkeit'), skill, stats.geschwindigkeit, locked || !editSkills)}
              ${renderSkillControl(index, 'wahrnehmung', t('skill.wahrnehmung'), skill, `${stats.wahrnehmung}%`, locked || !editSkills)}
            </div>
          </div>
        </details>
      `
    })
    .join('')

  container.innerHTML = strategyControl + skillRows
}

export function renderFormationPanel(container, state, { team = 'blue', editable = true, editNames = false, editSkills = false, playerNames = [] } = {}) {
  const openCards = new Set(
    [...(container.querySelectorAll?.('details[data-player-card][open]') ?? [])]
      .map((card) => `${card.dataset.team}:${card.dataset.player}`),
  )
  const currentTeamStrategy = normalizeTeamStrategy(state.nextTeamStrategies[team] ?? TEAM_STRATEGIES[team])
  const chainOwner = TEAM_LOADOUTS[team].findIndex((candidate, candidateIndex) => candidateIndex > 0 && candidate === 'chain')
  const locked = Boolean(state.roundBreakLocked || !editable)
  const skillLocked = locked || !editSkills
  const orderedPlayerIndexes = [
    0,
    ...PLAYER_SKILLS[team]
      .map((_, index) => index)
      .filter((index) => index > 0)
      .sort((a, b) => PLAYER_POSITIONS[team][a] - PLAYER_POSITIONS[team][b]),
  ]
  const rows = orderedPlayerIndexes
    .map((index) => {
      const skill = PLAYER_SKILLS[team][index]
      const stats = statsFromSkill(skill)
      const spent = skill.technik + skill.geschwindigkeit + skill.wahrnehmung
      const slot = PLAYER_POSITIONS[team][index] ?? index
      const draggable = index > 0 && !locked
      const playerName = playerNameFor(index, playerNames)
      const open = openCards.has(`${team}:${index}`)
      const tagName = editSkills ? 'details' : 'article'
      const headerTagName = editSkills ? 'summary' : 'header'
      const detailsAttrs = editSkills ? ` ${open ? 'open' : ''}` : ''
      const skillControls = editSkills ? `
        <div class="player-card-body formation-card-body">
          <div class="stat-stack">
            ${renderSkillControl(index, 'technik', t('skill.technik'), skill, stats.technik, skillLocked)}
            ${renderSkillControl(index, 'geschwindigkeit', t('skill.geschwindigkeit'), skill, stats.geschwindigkeit, skillLocked)}
            ${renderSkillControl(index, 'wahrnehmung', t('skill.wahrnehmung'), skill, `${stats.wahrnehmung}%`, skillLocked)}
          </div>
        </div>
      ` : ''
      const playerIdentity = editSkills ? `
        <div class="formation-card-title">
          ${editNames ? `
            <label class="player-name-control">
              <input type="text" data-player-name="${index}" maxlength="24" value="${escapeHtml(playerName)}" aria-label="${escapeHtml(roleLabel(index))}" />
            </label>
          ` : `<strong>${escapeHtml(playerName)}</strong>`}
          ${index > 0 ? `<b>${pompfeLabel(TEAM_LOADOUTS[team][index])}</b>` : ''}
        </div>
      ` : editNames ? `
        <label class="player-name-control">
          <input type="text" data-player-name="${index}" maxlength="24" value="${escapeHtml(playerName)}" aria-label="${escapeHtml(roleLabel(index))}" />
        </label>
      ` : `<span>${escapeHtml(playerName)}</span>`

      return `
        ${draggable ? `<div class="position-lane-label">${positionText(slot)}</div>` : ''}
        <${tagName} class="formation-row formation-player-card ${draggable ? 'draggable-formation-row draggable-card' : ''}" data-player-card data-player="${index}" data-slot="${slot}" data-team="${team}" ${draggable ? 'draggable="true"' : ''}${detailsAttrs}>
          <${headerTagName}>
            ${draggable ? '<span class="drag-handle" aria-hidden="true"></span>' : ''}
            ${playerIdentity}
            ${editSkills ? '' : `<strong>${index === 0 ? t('role.runner') : positionText(PLAYER_POSITIONS[team][index])}</strong>`}
            ${editSkills ? `<small><span>${spent}/${SKILL_POINTS_PER_PLAYER}</span><b>${t('formation.skillToggle')}</b></small>` : ''}
          </${headerTagName}>
          <div class="loadout-controls">
            ${
              index > 0
                ? renderPompferControls(team, index, chainOwner, {
                    positionLocked: locked,
                    loadoutLocked: locked,
                  })
                : ''
            }
          </div>
          ${skillControls}
        </${tagName}>
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

function playerNameFor(index, playerNames) {
  return String(playerNames[index] || roleLabel(index))
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderLoadoutControls(team, index, chainOwner, locks) {
  const pompferControls = index > 0 ? renderPompferControls(team, index, chainOwner, locks) : ''
  if (!pompferControls) return ''
  return `
    <div class="loadout-controls">
      ${pompferControls}
    </div>
  `
}

function renderPompferControls(team, index, chainOwner, locks) {
  return `
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
  const fill = Math.round((skill[key] / SKILL_POINTS_PER_PLAYER) * 100)
  return `
    <div class="skill-control stat-control" style="--stat-fill: ${fill}%">
      <span>${label}<small>${displayValue}</small></span>
      <button type="button" data-player="${index}" data-skill="${key}" data-delta="-1" ${locked || skill[key] <= 0 ? 'disabled' : ''}>-</button>
      <strong>${skill[key]}</strong>
      <button type="button" data-player="${index}" data-skill="${key}" data-delta="1" ${locked || !canIncrease ? 'disabled' : ''}>+</button>
    </div>
  `
}
