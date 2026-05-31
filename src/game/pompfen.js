import { t } from '../i18n/index.js'
export { POMPFEN_OPTIONS } from './rules/teamSchema.js'

const POMPFEN_RANGE_PIXELS_PER_CM = 70 / 110
const POMPFEN_VISUAL_PIXELS_PER_CM = 0.42

function rangePixels(centimeters) {
  return Math.round(centimeters * POMPFEN_RANGE_PIXELS_PER_CM)
}

function visualLength(reachCm) {
  return Math.round(reachCm * POMPFEN_VISUAL_PIXELS_PER_CM)
}

function oneSidedVisual({ reachCm, startX = 14, startY = -17, angle = -0.34, lineWidth = 5, gripLength = 19, accent = false }) {
  const length = visualLength(reachCm)
  return {
    kind: 'one_sided',
    startX,
    startY,
    endX: startX + length,
    endY: startY + Math.round(Math.sin(angle) * length),
    lineWidth,
    gripStartX: startX - 2,
    gripStartY: startY + 5,
    gripEndX: startX + gripLength,
    gripEndY: startY - 2,
    accent,
  }
}

function qtipVisual(reachCm) {
  const length = visualLength(reachCm)
  return {
    kind: 'double_ended',
    backEndX: -Math.round(length * 0.72),
    backEndY: Math.round(length * 0.3),
    gripBackX: -14,
    gripBackY: 7,
    gripFrontX: 16,
    gripFrontY: -6,
    frontEndX: Math.round(length * 0.92),
    frontEndY: -Math.round(length * 0.38),
    lineWidth: 5,
    gripWidth: 6,
  }
}

function shieldVisual() {
  return {
    kind: 'shield',
    shieldX: 13,
    shieldY: -21,
    shieldWidth: 18,
    shieldHeight: 42,
    shieldRadius: 7,
    strike: oneSidedVisual({ reachCm: 85, startX: 14, startY: -14, angle: -0.37, lineWidth: 4, gripLength: 13 }),
  }
}

function meleeProfile({
  id,
  labelKey,
  lengthCm,
  reachCm,
  attackArc,
  rearAttackArc = 0,
  closeStrikeRange = 46,
  quickRangeBonusCm = Math.round(reachCm * 0.2),
  runningAttackPenalty = 0.25,
  shieldBlockBonus = 0,
  visual,
}) {
  return {
    id,
    labelKey,
    kind: 'melee',
    lengthCm,
    reachCm,
    attackRange: rangePixels(reachCm),
    attackArc,
    rearAttackArc,
    closeStrikeRange,
    quickRangeBonus: rangePixels(quickRangeBonusCm),
    quickHitBonus: 0.75,
    runningAttackPenalty,
    shieldBlockBonus,
    canPin: true,
    visual,
  }
}

export const POMPFEN = {
  shield: meleeProfile({
    id: 'shield',
    labelKey: 'pompfe.shield',
    lengthCm: 85,
    reachCm: 85,
    attackArc: 0.82,
    closeStrikeRange: 42,
    quickRangeBonusCm: 17,
    runningAttackPenalty: 0.18,
    shieldBlockBonus: 35,
    visual: shieldVisual(),
  }),
  longpompfe: meleeProfile({
    id: 'longpompfe',
    labelKey: 'pompfe.longpompfe',
    lengthCm: 200,
    reachCm: 140,
    attackArc: 0.84,
    closeStrikeRange: 46,
    quickRangeBonusCm: 28,
    visual: oneSidedVisual({ reachCm: 140, startY: -18, angle: -0.29, gripLength: 25, accent: true }),
  }),
  staff: meleeProfile({
    id: 'staff',
    labelKey: 'pompfe.staff',
    lengthCm: 180,
    reachCm: 110,
    attackArc: 0.95,
    closeStrikeRange: 46,
    quickRangeBonusCm: 22,
    visual: oneSidedVisual({ reachCm: 110 }),
  }),
  qtip: meleeProfile({
    id: 'qtip',
    labelKey: 'pompfe.qtip',
    lengthCm: 200,
    reachCm: 140,
    attackArc: 0.9,
    rearAttackArc: 0.72,
    closeStrikeRange: 48,
    quickRangeBonusCm: 28,
    visual: qtipVisual(140),
  }),
  chain: {
    id: 'chain',
    labelKey: 'pompfe.chain',
    kind: 'chain',
    lengthCm: 320,
    reachCm: 320,
    attackRange: rangePixels(320),
    minAttackRange: 48,
    attackArc: 1.55,
    rearAttackArc: 0,
    closeStrikeRange: 0,
    quickRangeBonus: 0,
    quickHitBonus: 0.75,
    runningAttackPenalty: 0.3,
    shieldBlockBonus: 0,
    canPin: false,
    visual: {
      kind: 'chain',
      handleX: 12,
      handleY: -12,
      orbitRadius: 58,
      ballRadius: 10,
    },
  },
}

export function pompfeFor(player = {}) {
  return POMPFEN[player.pompfe] ?? POMPFEN.staff
}

export function pompfeVisualFor(pompfe) {
  const profile = typeof pompfe === 'string' ? POMPFEN[pompfe] : pompfe?.visual ? pompfe : pompfeFor(pompfe)
  return profile?.visual ?? POMPFEN.staff.visual
}

export function pompfeLabel(pompfe) {
  const profile = typeof pompfe === 'string' ? POMPFEN[pompfe] : pompfe
  return profile ? t(profile.labelKey) : t('pompfe.staff')
}

export function attackRangeFor(attacker, target) {
  const profile = pompfeFor(attacker)
  return profile.attackRange + (target?.role === 'quick' ? profile.quickRangeBonus : 0)
}

export function maxPompfeAttackRange(target = null) {
  return Math.max(...Object.values(POMPFEN).map((profile) => profile.attackRange + (target?.role === 'quick' ? profile.quickRangeBonus : 0)))
}

export function attackArcFor(attacker) {
  const profile = pompfeFor(attacker)
  return profile.id === 'chain' ? profile.attackArc * 0.62 : profile.attackArc
}

export function isInAttackArc(attacker, target, range = attackRangeFor(attacker, target)) {
  const profile = pompfeFor(attacker)
  const d = Math.hypot(target.x - attacker.x, target.y - attacker.y)
  if (d >= range) return false
  if (profile.minAttackRange && d < profile.minAttackRange) return false

  const hitAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x)
  const frontDelta = Math.abs(Math.atan2(Math.sin(hitAngle - attacker.angle), Math.cos(hitAngle - attacker.angle)))
  if (frontDelta < attackArcFor(attacker) || d < profile.closeStrikeRange) return true

  if (!profile.rearAttackArc) return false
  const rearAngle = attacker.angle + Math.PI
  const rearDelta = Math.abs(Math.atan2(Math.sin(hitAngle - rearAngle), Math.cos(hitAngle - rearAngle)))
  return rearDelta < profile.rearAttackArc
}

export function canPinWithPompfe(player) {
  return Boolean(pompfeFor(player).canPin)
}

export function isShieldBlockFacing(defender, attacker) {
  if (defender.pompfe !== 'shield') return false
  const hitAngle = Math.atan2(attacker.y - defender.y, attacker.x - defender.x)
  const facingDelta = Math.abs(Math.atan2(Math.sin(hitAngle - defender.angle), Math.cos(hitAngle - defender.angle)))
  return facingDelta < 1.35
}
