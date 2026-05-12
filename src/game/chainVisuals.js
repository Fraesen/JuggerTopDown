import { clamp } from './geometry.js'
import { pompfeFor } from './pompfen.js'

export const CHAIN_STRIKE_VISUAL_DURATION = 0.52

const CHAIN_BAND_VISUAL = {
  handleX: 12,
  handleY: -12,
  orbitRadius: 58,
}

export function createChainVisuals({ state }) {
  function chainPhaseForPlayer(player) {
    const idNumber = Number(player.id.split('-')[1]) || 0
    return idNumber * 1.37 + (player.team === 'blue' ? 0 : Math.PI)
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  function chainOrbitBall(player) {
    const speed = Math.hypot(player.vx, player.vy)
    const phase = chainPhaseForPlayer(player)
    const direction = player.team === 'blue' ? 1 : -1
    const frequency = speed > 20 ? 7.2 : 5.4
    const angle = state.roundTime * frequency * direction + phase
    const pulse = Math.sin(state.roundTime * 4 + phase) * 3
    const radius = CHAIN_BAND_VISUAL.orbitRadius + pulse
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  }

  function chainVisualStrikeRadius(player) {
    return Math.max(CHAIN_BAND_VISUAL.orbitRadius, pompfeFor(player).attackRange - 8)
  }

  function chainStrikeBall(player) {
    const target = player.chainStrikeTarget
    const strikeRadius = chainVisualStrikeRadius(player)
    const targetX = target?.x ?? player.chainStrikeX ?? player.x + Math.cos(player.angle) * strikeRadius
    const targetY = target?.y ?? player.chainStrikeY ?? player.y + Math.sin(player.angle) * strikeRadius
    const dx = targetX - player.x
    const dy = targetY - player.y
    const cos = Math.cos(-player.angle)
    const sin = Math.sin(-player.angle)
    const localX = dx * cos - dy * sin
    const localY = dx * sin + dy * cos
    const localDistance = Math.hypot(localX, localY) || 1
    const radius = clamp(localDistance, CHAIN_BAND_VISUAL.orbitRadius * 0.85, strikeRadius)
    return {
      x: (localX / localDistance) * radius,
      y: (localY / localDistance) * radius,
    }
  }

  function chainBallLocal(player) {
    const orbit = chainOrbitBall(player)
    const duration = player.chainStrikeDuration || 0
    const progress = duration > 0 && player.chainStrikeTimer > 0 ? clamp(1 - player.chainStrikeTimer / duration, 0, 1) : 1
    if (progress >= 1) return orbit

    const target = chainStrikeBall(player)
    let mix = 0
    if (progress < 0.4) {
      mix = easeInOut(progress / 0.4)
    } else if (progress < 0.78) {
      mix = 1 - easeInOut((progress - 0.4) / 0.38)
    }

    return {
      x: orbit.x + (target.x - orbit.x) * mix,
      y: orbit.y + (target.y - orbit.y) * mix,
    }
  }

  function localToWorld(player, point) {
    const cos = Math.cos(player.angle)
    const sin = Math.sin(player.angle)
    return {
      x: player.x + point.x * cos - point.y * sin,
      y: player.y + point.x * sin + point.y * cos,
    }
  }

  function chainBandSegment(player) {
    return {
      start: localToWorld(player, { x: CHAIN_BAND_VISUAL.handleX, y: CHAIN_BAND_VISUAL.handleY }),
      end: localToWorld(player, chainBallLocal(player)),
    }
  }

  return {
    chainBandSegment,
    chainVisualStrikeRadius,
  }
}
