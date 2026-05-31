import { ATTACK_COOLDOWN } from './config.js'

export function advancePlayerTimers(player, dt, { onCallExpired = () => {} } = {}) {
  player.attack = Math.max(0, player.attack - dt)
  player.doubleWindow = Math.max(0, player.doubleWindow - dt)
  player.attackCooldown = Math.max(0, player.attackCooldown - dt)
  player.chainStrikeTimer = Math.max(0, player.chainStrikeTimer - dt)
  if (player.chainStrikeTimer <= 0) player.chainStrikeTarget = null
  player.duelCooldown = Math.max(0, player.duelCooldown - dt)
  player.callCooldown = Math.max(0, player.callCooldown - dt)
  player.callTimer = Math.max(0, player.callTimer - dt)
  player.callBubbleTimer = Math.max(0, player.callBubbleTimer - dt)
  player.callMissTimer = Math.max(0, player.callMissTimer - dt)
  player.overzahlDefenseTimer = Math.max(0, player.overzahlDefenseTimer - dt)
  player.doublePinReleasePause = Math.max(0, player.doublePinReleasePause - dt)

  if (player.callBubbleTimer <= 0) player.callBubbleText = ''
  if (player.callTimer <= 0) onCallExpired(player)
}

export function advanceAttackWindup(player, dt) {
  if (player.attackWindup <= 0) return false

  player.attackWindup = Math.max(0, player.attackWindup - dt)
  if (player.attackWindup > 0) return false

  player.attackCooldown = ATTACK_COOLDOWN
  return true
}
