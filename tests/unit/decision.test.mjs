import assert from 'node:assert/strict'
import { createDecisionEngine } from '../../src/game/decisions.js'
import { createPlayer } from '../../src/game/players.js'
import { attackRangeFor } from '../../src/game/pompfen.js'

function testRng() {
  return {
    chance: () => false,
    range: (min) => min,
  }
}

function baseState(players) {
  return {
    players,
    jugg: { x: 320, y: 240, vx: 0, vy: 0, quick: null, contest: null, cooldown: 0 },
    roundTime: 99,
    teamCallCooldowns: { blue: 0, red: 0 },
  }
}

function ready(player) {
  player.openingComplete = true
  player.callTimer = 0
  player.callType = null
  return player
}

{
  const chain = ready(createPlayer('blue', 4, 'pompfer'))
  const enemy = ready(createPlayer('red', 2, 'pompfer'))
  chain.pompfe = 'chain'
  chain.x = 200
  chain.y = 240
  chain.angle = Math.PI / 2
  enemy.x = chain.x + attackRangeFor(chain, enemy) * 0.84
  enemy.y = chain.y

  const state = baseState([chain, enemy])
  const decisions = createDecisionEngine({
    state,
    attack: () => {},
    rng: testRng(),
  })

  decisions.updateAi(chain, 0.1)

  assert.ok(Math.hypot(chain.vx, chain.vy) > 0, 'chain should keep closing on an active enemy at outer range')
  assert.ok(chain.vx > 0, 'chain should move toward the active enemy')
}

{
  const chain = ready(createPlayer('blue', 4, 'pompfer'))
  const inactive = ready(createPlayer('red', 1, 'pompfer'))
  const active = ready(createPlayer('red', 2, 'pompfer'))
  chain.pompfe = 'chain'
  chain.x = 200
  chain.y = 240
  chain.angle = Math.PI / 2
  inactive.x = 214
  inactive.y = 240
  inactive.penaltyStones = 2
  chain.chainGuardTarget = inactive
  active.x = chain.x + attackRangeFor(chain, active) * 0.84
  active.y = chain.y

  const state = baseState([chain, inactive, active])
  const decisions = createDecisionEngine({
    state,
    attack: () => {},
    rng: testRng(),
  })

  decisions.updateAi(chain, 0.1)

  assert.equal(chain.chainGuardTarget, null, 'chain should stop guarding inactive players when an active enemy is available')
  assert.ok(chain.vx > 0, 'chain should leave the guard point and close on the active enemy')
}

{
  const pinner = ready(createPlayer('blue', 2, 'pompfer'))
  const pinned = ready(createPlayer('red', 1, 'pompfer'))
  const active = ready(createPlayer('red', 3, 'pompfer'))
  pinner.x = 200
  pinner.y = 240
  pinned.x = 220
  pinned.y = 240
  pinned.penaltyStones = 2
  pinned.pinnedBy = pinner
  pinner.pinTarget = pinned
  active.x = 360
  active.y = 240

  const state = baseState([pinner, pinned, active])
  const decisions = createDecisionEngine({
    state,
    attack: () => {},
    rng: testRng(),
  })

  decisions.updateAi(pinner, 0.1)

  assert.equal(pinner.pinTarget, pinned, 'pompfer should keep an existing pin when an active enemy is available')
}

console.log('decision tests passed')
