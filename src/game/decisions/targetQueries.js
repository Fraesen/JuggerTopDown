import { FIELD } from '../config.js'
import { distance } from '../geometry.js'
import { canReceiveNewPin, isInactive, isPompfer, isQuick, playerIndex } from '../players.js'
import { canPinTargetForJuggState } from '../pinRules.js'
import { canPinWithPompfe } from '../pompfen.js'
import { isDefensiveStrategyPlayer } from '../strategies.js'

export function createTargetQueries({ state }) {
  function nearestEnemy(player, filter = () => true) {
    let best = null
    let bestDistance = Infinity
    for (const other of state.players) {
      if (other.team === player.team || !filter(other)) continue
      const d = distance(player, other)
      if (d < bestDistance) {
        best = other
        bestDistance = d
      }
    }
    return { target: best, distance: bestDistance }
  }

  function nearestInactiveEnemy(player) {
    return nearestEnemy(player, (other) => isInactive(other))
  }

  function nearestUnpinnedInactiveEnemy(player) {
    return nearestEnemy(player, (other) => isInactive(other) && !other.pinnedBy)
  }

  function activeTeamPompfers(team) {
    return state.players.filter((player) => player.team === team && isPompfer(player) && !isInactive(player))
  }

  function canSeekNewPin(player) {
    return (
      isPompfer(player) &&
      canPinWithPompfe(player) &&
      !isInactive(player) &&
      !player.pinTarget &&
      !defensiveBindingActive(player) &&
      player.callType !== 'hilfmir' &&
      player.doublePinReleasePause <= 0 &&
      !player.doublePinTrapTarget
    )
  }

  function pinPriorityCompare(a, b, target) {
    const distanceDiff = distance(a, target) - distance(b, target)
    if (Math.abs(distanceDiff) > 0.01) return distanceDiff
    return playerIndex(a) - playerIndex(b)
  }

  function bestPinnerForTarget(target, team) {
    return activeTeamPompfers(team)
      .filter((player) => canSeekNewPin(player))
      .sort((a, b) => pinPriorityCompare(a, b, target))[0]
  }

  function nearestClaimablePinTarget(player) {
    return nearestEnemy(
      player,
      (other) => canReceiveNewPin(other) && canPinTargetForJuggState(player, other, state) && bestPinnerForTarget(other, player.team) === player,
    )
  }

  function bestPinApproacherForTarget(target, team) {
    return activeTeamPompfers(team)
      .filter((player) => canSeekNewPin(player) && canPinWithPompfe(player))
      .sort((a, b) => pinPriorityCompare(a, b, target))[0]
  }

  function nearestApproachablePinTarget(player) {
    return nearestEnemy(
      player,
      (other) =>
        other.penaltyStones > 0 &&
        !other.pinnedBy &&
        canPinTargetForJuggState(player, other, state) &&
        bestPinApproacherForTarget(other, player.team) === player,
    )
  }

  function isChain(player) {
    return player.pompfe === 'chain'
  }

  function vulnerableOpposingChain(player) {
    const opposite = oppositePlayer(player)
    if (!opposite || !isPompfer(opposite) || opposite.pompfe !== 'chain') return null
    if (isInactive(opposite) || opposite.attackCooldown <= 0) return null
    return opposite
  }

  function oppositePlayer(player) {
    const index = playerIndex(player)
    const enemyTeam = player.team === 'blue' ? 'red' : 'blue'
    return state.players.find((other) => other.team === enemyTeam && playerIndex(other) === index)
  }

  function enemyQuickInOwnHalf(player) {
    const enemyQuick = state.players.find((other) => other.team !== player.team && isQuick(other) && !isInactive(other))
    if (!enemyQuick) return false
    return player.team === 'blue' ? enemyQuick.x < FIELD.center.x : enemyQuick.x > FIELD.center.x
  }

  function defensiveBindingActive(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false

    const opponent = oppositePlayer(player)
    if ((opponent && isInactive(opponent)) || enemyQuickInOwnHalf(player)) {
      player.defensiveStrategyDone = true
      return false
    }

    return Boolean(opponent && !isInactive(opponent))
  }

  return {
    activeTeamPompfers,
    defensiveBindingActive,
    isChain,
    nearestApproachablePinTarget,
    nearestClaimablePinTarget,
    nearestEnemy,
    nearestInactiveEnemy,
    nearestUnpinnedInactiveEnemy,
    oppositePlayer,
    vulnerableOpposingChain,
  }
}
