import assert from 'node:assert/strict'
import { ATTACK_COOLDOWN } from '../../src/game/config.js'
import { advanceAttackWindup, advancePlayerTimers } from '../../src/game/playerTimers.js'

const player = {
  attack: 1,
  doubleWindow: 1,
  attackCooldown: 1,
  chainStrikeTimer: 0.2,
  chainStrikeTarget: { id: 'red-1' },
  duelCooldown: 1,
  callCooldown: 1,
  callTimer: 0.2,
  callBubbleTimer: 0.2,
  callBubbleText: 'Malschutz!',
  callMissTimer: 1,
  overzahlDefenseTimer: 1,
  doublePinReleasePause: 1,
}

let expiredCallFor = null
advancePlayerTimers(player, 0.25, { onCallExpired: (expiredPlayer) => { expiredCallFor = expiredPlayer } })

assert.equal(player.chainStrikeTimer, 0)
assert.equal(player.chainStrikeTarget, null)
assert.equal(player.callBubbleText, '')
assert.equal(expiredCallFor, player)
assert.equal(player.attack, 0.75)

const windupPlayer = { attackWindup: 0.1, attackCooldown: 0 }
assert.equal(advanceAttackWindup(windupPlayer, 0.05), false)
assert.equal(windupPlayer.attackCooldown, 0)
assert.equal(advanceAttackWindup(windupPlayer, 0.05), true)
assert.equal(windupPlayer.attackCooldown, ATTACK_COOLDOWN)

console.log('player-timer tests passed')
