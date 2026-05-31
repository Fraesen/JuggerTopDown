import {
  PLAYER_RADIUS,
  PLAYER_POSITIONS,
  MOVEMENT_SPEED_FACTOR,
  PIN_MIN_COUNTED_STONES,
  PLAYER_SKILLS,
  SPEED_BASE,
  SPEED_PER_POINT,
  START_POSITIONS,
  TEAM_LOADOUTS,
  TECHNIK_BASE,
  TECHNIK_PER_POINT,
  WAHRNEHMUNG_BASE,
  WAHRNEHMUNG_PER_POINT,
} from './config.js'
import { pompfeLabel } from './pompfen.js'
import { roleText } from '../i18n/index.js'

export function isRunner(player) {
  return player.role === 'runner'
}

export function isPompfer(player) {
  return player.role !== 'runner'
}

export function isGrappled(player) {
  return Boolean(player.grappledBy)
}

export function isGrappling(player) {
  return Boolean(player.grappleTarget || player.grappledBy)
}

export function isInactive(player) {
  return player.penaltyStones > 0 || player.pinLock > 0 || Boolean(player.pinnedBy)
}

export function canReceiveNewPin(player) {
  return player.penaltyStones > 0 && player.countedStones >= PIN_MIN_COUNTED_STONES && !player.pinnedBy && player.pinLock <= 0
}

export function isRecoveryDashing(player) {
  return player.recoveryDashTimer > 0
}

export function statsFromSkill(skill) {
  return {
    technik: TECHNIK_BASE + skill.technik * TECHNIK_PER_POINT,
    geschwindigkeit: SPEED_BASE + skill.geschwindigkeit * SPEED_PER_POINT,
    wahrnehmung: WAHRNEHMUNG_BASE + skill.wahrnehmung * WAHRNEHMUNG_PER_POINT,
  }
}

export function roleLabel(index) {
  return roleText(index)
}

export function playerIndex(player) {
  return Number(player.id.split('-')[1])
}

export function playerPositionSlot(player) {
  return player.positionSlot ?? playerIndex(player)
}

const SHARED_MOVEMENT_BASE = 124
const SPEED_RATING_FACTOR = 1.16

export function playerSpeed(role, geschwindigkeit) {
  const speedPoints = Math.max(0, (geschwindigkeit - SPEED_BASE) / SPEED_PER_POINT)
  const runnerSkillBonus = role === 'runner' ? 5 : 0
  return (SHARED_MOVEMENT_BASE + geschwindigkeit * SPEED_RATING_FACTOR + runnerSkillBonus) * MOVEMENT_SPEED_FACTOR
}

export function skillForPlayer(player) {
  return PLAYER_SKILLS[player.team][playerIndex(player)]
}

export function createPlayer(team, index, role) {
  const stats = statsFromSkill(PLAYER_SKILLS[team][index])
  const positionSlot = PLAYER_POSITIONS[team][index] ?? index
  const spawn = START_POSITIONS[team][positionSlot]
  const pompfe = TEAM_LOADOUTS[team][index] ?? (role === 'runner' ? 'runner' : 'staff')

  return {
    id: `${team}-${index}`,
    team,
    role,
    positionSlot,
    pompfe,
    pompfeLabel: pompfeLabel(pompfe),
    defensiveStrategyDone: false,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: team === 'blue' ? 0 : Math.PI,
    radius: PLAYER_RADIUS,
    technik: stats.technik,
    geschwindigkeit: stats.geschwindigkeit,
    wahrnehmung: stats.wahrnehmung,
    speed: playerSpeed(role, stats.geschwindigkeit),
    openingComplete: false,
    retreatingWithJugg: false,
    sidePressureSide: null,
    sidePressureFailedSide: null,
    attack: 0,
    attackTarget: null,
    attackWindup: 0,
    attackWhileMoving: false,
    doubleWindow: 0,
    attackCooldown: 0,
    chainStrikeTimer: 0,
    chainStrikeDuration: 0,
    chainStrikeTarget: null,
    chainStrikeX: 0,
    chainStrikeY: 0,
    duelCooldown: 0,
    grappleTarget: null,
    grappledBy: null,
    callCooldown: 0,
    callTimer: 0,
    callType: null,
    callSource: null,
    callContext: null,
    callBubbleTimer: 0,
    callBubbleText: '',
    callMissTimer: 0,
    overzahlDefenseTimer: 0,
    pendingInactiveStones: 0,
    holdOffset: 0,
    penaltyStones: 0,
    penaltyTotalStones: 0,
    countedStones: 0,
    pinnedBy: null,
    pinTarget: null,
    pinClaimedBy: null,
    pinOrbitDirection: team === 'blue' ? 1 : -1,
    pinLock: 0,
    pinWasActive: false,
    doublePinTrapTarget: null,
    doublePinReleaseTarget: null,
    doublePinReleasePause: 0,
    recoveryDashQueued: false,
    recoveryDashTimer: 0,
    recoveryDashSpeed: 0,
    recoveryDashX: 0,
    recoveryDashY: 0,
    runnerJuggRetreatTimer: 0,
    runnerJuggRetreatX: 0,
    runnerJuggRetreatY: 0,
  }
}
