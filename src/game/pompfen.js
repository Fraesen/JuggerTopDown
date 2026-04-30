const POMPFEN_RANGE_PIXELS_PER_CM = 70 / 110

function rangePixels(centimeters) {
  return Math.round(centimeters * POMPFEN_RANGE_PIXELS_PER_CM)
}

export const POMPFEN = {
  staff: {
    id: 'staff',
    label: 'Stab',
    lengthCm: 180,
    reachCm: 110,
    attackRange: rangePixels(110),
    attackArc: 0.95,
    rearAttackArc: 0,
    closeStrikeRange: 46,
    runnerRangeBonus: rangePixels(22),
    runnerHitBonus: 0.75,
    runningAttackPenalty: 0.25,
    shieldBlockBonus: 0,
  },
  qtip: {
    id: 'qtip',
    label: 'Q-Tip',
    kind: 'melee',
    lengthCm: 200,
    reachCm: 140,
    attackRange: rangePixels(140),
    attackArc: 0.9,
    rearAttackArc: 0.72,
    closeStrikeRange: 48,
    runnerRangeBonus: rangePixels(28),
    runnerHitBonus: 0.75,
    runningAttackPenalty: 0.25,
    shieldBlockBonus: 0,
  },
  chain: {
    id: 'chain',
    label: 'Kette',
    kind: 'chain',
    lengthCm: 320,
    reachCm: 320,
    attackRange: rangePixels(320),
    minAttackRange: 48,
    attackArc: 1.55,
    rearAttackArc: 0,
    closeStrikeRange: 0,
    runnerRangeBonus: 0,
    runnerHitBonus: 0.75,
    runningAttackPenalty: 0.3,
    shieldBlockBonus: 0,
    canPin: false,
  },
  shield: {
    id: 'shield',
    label: 'Schild',
    kind: 'melee',
    lengthCm: 85,
    reachCm: 85,
    attackRange: 58,
    attackArc: 0.82,
    rearAttackArc: 0,
    closeStrikeRange: 42,
    runnerRangeBonus: 10,
    runnerHitBonus: 0.75,
    runningAttackPenalty: 0.18,
    shieldBlockBonus: 35,
  },
}

POMPFEN.staff.kind = 'melee'
POMPFEN.staff.canPin = true
POMPFEN.qtip.canPin = true
POMPFEN.shield.canPin = true

export function pompfeFor(player) {
  return POMPFEN[player.pompfe] ?? POMPFEN.staff
}

export function attackRangeFor(attacker, target) {
  const profile = pompfeFor(attacker)
  return profile.attackRange + (target?.role === 'runner' ? profile.runnerRangeBonus : 0)
}

export function maxPompfeAttackRange(target = null) {
  return Math.max(...Object.values(POMPFEN).map((profile) => profile.attackRange + (target?.role === 'runner' ? profile.runnerRangeBonus : 0)))
}

export function isInAttackArc(attacker, target, range = attackRangeFor(attacker, target)) {
  const profile = pompfeFor(attacker)
  const d = Math.hypot(target.x - attacker.x, target.y - attacker.y)
  if (d >= range) return false
  if (profile.minAttackRange && d < profile.minAttackRange) return false

  const hitAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x)
  const frontDelta = Math.abs(Math.atan2(Math.sin(hitAngle - attacker.angle), Math.cos(hitAngle - attacker.angle)))
  if (frontDelta < profile.attackArc || d < profile.closeStrikeRange) return true

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
