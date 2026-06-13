import assert from 'node:assert/strict'
import { FIELD, fieldPoint } from '../../src/game/config.js'
import { canPinTargetForJuggState } from '../../src/game/pinRules.js'
import { createPlayer } from '../../src/game/players.js'

function stateWithFreeJugg(point) {
  return {
    jugg: {
      x: point.x,
      y: point.y,
      quick: null,
      contest: null,
    },
  }
}

function inactive(player) {
  player.penaltyStones = 2
  player.countedStones = 3
  return player
}

{
  const pinner = createPlayer('blue', 1, 'pompfer')
  const quick = inactive(createPlayer('red', 0, 'quick'))
  quick.x = fieldPoint(20, 10).x
  quick.y = fieldPoint(20, 10).y

  assert.equal(
    canPinTargetForJuggState(pinner, quick, stateWithFreeJugg({ x: quick.x + 5 * FIELD.scale, y: quick.y })),
    true,
    'enemy quick may be pinned when the free jugg is within five meters',
  )
}

{
  const pinner = createPlayer('blue', 1, 'pompfer')
  const quick = inactive(createPlayer('red', 0, 'quick'))
  quick.x = fieldPoint(22, 10).x
  quick.y = fieldPoint(22, 10).y

  assert.equal(
    canPinTargetForJuggState(pinner, quick, stateWithFreeJugg(fieldPoint(3, 10))),
    true,
    'enemy quick may be pinned when the free jugg lies in the own third',
  )
}

{
  const pinner = createPlayer('blue', 1, 'pompfer')
  const quick = inactive(createPlayer('red', 0, 'quick'))
  quick.x = fieldPoint(22, 10).x
  quick.y = fieldPoint(22, 10).y

  assert.equal(
    canPinTargetForJuggState(pinner, quick, stateWithFreeJugg(fieldPoint(30, 10))),
    false,
    'enemy quick may not be pinned when the free jugg is neither nearby nor in the own third',
  )
}

{
  const pinner = createPlayer('blue', 1, 'pompfer')
  const quick = inactive(createPlayer('red', 0, 'quick'))
  const state = stateWithFreeJugg({ x: quick.x, y: quick.y })
  state.jugg.quick = createPlayer('blue', 0, 'quick')

  assert.equal(
    canPinTargetForJuggState(pinner, quick, state),
    false,
    'enemy quick may not be pinned when the jugg is carried',
  )
}

{
  const pinner = createPlayer('blue', 1, 'pompfer')
  const pompfer = inactive(createPlayer('red', 2, 'pompfer'))

  assert.equal(
    canPinTargetForJuggState(pinner, pompfer, stateWithFreeJugg(fieldPoint(20, 10))),
    true,
    'enemy pompfers keep the normal pin rules',
  )
}

console.log('pin-rule tests passed')
