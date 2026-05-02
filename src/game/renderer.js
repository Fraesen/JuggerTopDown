import { CALL_BUBBLE_DURATION, FIELD, FIELD_POLYGON, JUGG_RADIUS, PLAYER_RADIUS, TEAMS, fieldPoint } from './config.js'
import { clamp } from './geometry.js'
import { isInactive, isPompfer, isRunner } from './players.js'
import { attackArcFor, pompfeFor } from './pompfen.js'

const POMPFEN_VISUALS = {
  staff: {
    startX: 14,
    startY: -17,
    endX: 56,
    endY: -32,
  },
  qtip: {
    backEndX: -42,
    backEndY: 18,
    gripBackX: -14,
    gripBackY: 7,
    gripFrontX: 16,
    gripFrontY: -6,
    frontEndX: 54,
    frontEndY: -22,
  },
  chain: {
    handleX: 12,
    handleY: -12,
    orbitRadius: 58,
    ballRadius: 10,
  },
}


export function createRenderer({ ctx, state }) {
  function phaseForPlayer(player) {
    const idNumber = Number(player.id.split('-')[1]) || 0
    return idNumber * 1.37 + (player.team === 'blue' ? 0 : Math.PI)
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  function lerp(a, b, t) {
    return a + (b - a) * t
  }

  function chainOrbitPose(player, timeOffset = 0) {
    const visual = POMPFEN_VISUALS.chain
    if (isInactive(player)) {
      return {
        handleX: visual.handleX,
        handleY: visual.handleY,
        ballX: -38,
        ballY: 20,
        angle: 2.7,
        ballRadius: visual.ballRadius,
      }
    }

    const speed = Math.hypot(player.vx, player.vy)
    const phase = phaseForPlayer(player)
    const direction = player.team === 'blue' ? 1 : -1
    const frequency = speed > 20 ? 7.2 : 5.4
    const angle = (state.roundTime + timeOffset) * frequency * direction + phase
    const pulse = Math.sin((state.roundTime + timeOffset) * 4 + phase) * 3

    return {
      handleX: visual.handleX,
      handleY: visual.handleY,
      ballX: Math.cos(angle) * (visual.orbitRadius + pulse),
      ballY: Math.sin(angle) * (visual.orbitRadius + pulse),
      angle,
      ballRadius: visual.ballRadius,
    }
  }

  function chainStrikePoint(player) {
    const visual = POMPFEN_VISUALS.chain
    const strikeRadius = Math.max(visual.orbitRadius, pompfeFor(player).attackRange - 8)
    const target = player.chainStrikeTarget
    const targetX = target?.x ?? player.chainStrikeX ?? player.x + Math.cos(player.angle) * strikeRadius
    const targetY = target?.y ?? player.chainStrikeY ?? player.y + Math.sin(player.angle) * strikeRadius
    const dx = targetX - player.x
    const dy = targetY - player.y
    const cos = Math.cos(-player.angle)
    const sin = Math.sin(-player.angle)
    const localX = dx * cos - dy * sin
    const localY = dx * sin + dy * cos
    const distance = Math.hypot(localX, localY) || 1
    const radius = clamp(distance, visual.orbitRadius * 0.85, strikeRadius)

    return {
      ballX: (localX / distance) * radius,
      ballY: (localY / distance) * radius,
    }
  }

  function chainPose(player, timeOffset = 0) {
    const orbit = chainOrbitPose(player, timeOffset)
    if (isInactive(player)) return orbit

    const duration = player.chainStrikeDuration || 0
    const strikeProgress = duration > 0 && player.chainStrikeTimer > 0 ? clamp(1 - player.chainStrikeTimer / duration, 0, 1) : 1
    const striking = strikeProgress < 1

    if (!striking) return orbit

    const target = chainStrikePoint(player)
    let mix = 0
    if (strikeProgress < 0.4) {
      mix = easeInOut(strikeProgress / 0.4)
    } else if (strikeProgress < 0.78) {
      mix = 1 - easeInOut((strikeProgress - 0.4) / 0.38)
    }

    return {
      ...orbit,
      ballX: lerp(orbit.ballX, target.ballX, mix),
      ballY: lerp(orbit.ballY, target.ballY, mix),
      strikeProgress,
    }
  }

  function drawChain(player) {
    const pose = chainPose(player)
    const inactive = isInactive(player)
    const trailCount = !inactive && player.chainStrikeTimer > 0 ? 3 : 0

    for (let i = trailCount; i > 0; i -= 1) {
      const trailPose = chainPose(player, -i * 0.035)
      const dx = trailPose.ballX - trailPose.handleX
      const dy = trailPose.ballY - trailPose.handleY
      const d = Math.hypot(dx, dy) || 1
      const controlX = (trailPose.handleX + trailPose.ballX) / 2 - (dy / d) * 14
      const controlY = (trailPose.handleY + trailPose.ballY) / 2 + (dx / d) * 14

      ctx.globalAlpha = 0.2 / i
      ctx.strokeStyle = '#f0d66a'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(trailPose.handleX, trailPose.handleY)
      ctx.quadraticCurveTo(controlX, controlY, trailPose.ballX, trailPose.ballY)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(trailPose.ballX, trailPose.ballY, pose.ballRadius - 2, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    const dx = pose.ballX - pose.handleX
    const dy = pose.ballY - pose.handleY
    const d = Math.hypot(dx, dy) || 1
    const controlOffset = inactive ? 8 : player.chainStrikeTimer > 0 ? 10 : 18
    const controlX = (pose.handleX + pose.ballX) / 2 - (dy / d) * controlOffset
    const controlY = (pose.handleY + pose.ballY) / 2 + (dx / d) * controlOffset

    ctx.strokeStyle = '#c7c0ab'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(pose.handleX, pose.handleY)
    ctx.quadraticCurveTo(controlX, controlY, pose.ballX, pose.ballY)
    ctx.stroke()

    ctx.fillStyle = '#e7dfc6'
    ctx.strokeStyle = '#4a3c1e'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(pose.ballX, pose.ballY, pose.ballRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = '#c9b663'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(5, -7)
    ctx.lineTo(pose.handleX, pose.handleY)
    ctx.stroke()
  }

  function drawField() {
    const grass = ctx.createLinearGradient(0, 0, FIELD.width, FIELD.height)
    grass.addColorStop(0, '#204b3d')
    grass.addColorStop(0.55, '#286144')
    grass.addColorStop(1, '#1e443c')
  
    ctx.save()
    drawFieldPath()
    ctx.fillStyle = grass
    ctx.fill()
    ctx.clip()
  
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.lineWidth = 2
    for (let meterX = 0; meterX <= FIELD.lengthMeters; meterX += 5) {
      const top = fieldPoint(meterX, 0)
      const bottom = fieldPoint(meterX, FIELD.widthMeters)
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.stroke()
    }
    for (let meterY = 0; meterY <= FIELD.widthMeters; meterY += 5) {
      const left = fieldPoint(0, meterY)
      const right = fieldPoint(FIELD.lengthMeters, meterY)
      ctx.beginPath()
      ctx.moveTo(left.x, left.y)
      ctx.lineTo(right.x, right.y)
      ctx.stroke()
    }
  
    ctx.setLineDash([14, 18])
    ctx.strokeStyle = 'rgba(244,241,224,0.62)'
    ctx.lineWidth = 3
    const middleTop = fieldPoint(20, 1.2)
    const middleBottom = fieldPoint(20, 18.8)
    ctx.beginPath()
    ctx.moveTo(middleTop.x, middleTop.y)
    ctx.lineTo(middleBottom.x, middleBottom.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  
    ctx.save()
    ctx.strokeStyle = 'rgba(244,241,224,0.88)'
    ctx.lineWidth = 5
    drawFieldPath()
    ctx.stroke()
  
    ctx.strokeStyle = 'rgba(240,214,106,0.9)'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    drawGroundLine(0)
    drawGroundLine(FIELD.lengthMeters)
    ctx.restore()
  
    drawMal(TEAMS.blue.mal, TEAMS.blue.color, 'B')
    drawMal(TEAMS.red.mal, TEAMS.red.color, 'R')
  }
  
  function drawFieldPath() {
    ctx.beginPath()
    ctx.moveTo(FIELD_POLYGON[0].x, FIELD_POLYGON[0].y)
    for (let i = 1; i < FIELD_POLYGON.length; i += 1) {
      ctx.lineTo(FIELD_POLYGON[i].x, FIELD_POLYGON[i].y)
    }
    ctx.closePath()
  }
  
  function drawGroundLine(meterX) {
    const top = fieldPoint(meterX, 5)
    const bottom = fieldPoint(meterX, 15)
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(bottom.x, bottom.y)
    ctx.stroke()
  }
  
  function drawMal(mal, color, label) {
    ctx.save()
    ctx.translate(mal.x, mal.y)
    ctx.fillStyle = 'rgba(13,18,23,0.32)'
    ctx.beginPath()
    ctx.arc(0, 0, FIELD.malRadius + 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(0, 0, FIELD.malRadius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = '700 18px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 0, 1)
    ctx.restore()
  }
  
  function drawJugg() {
    const { x, y } = state.jugg
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#f0d66a'
    ctx.beginPath()
    ctx.ellipse(x, y, 15, 10, 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#5a3f16'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#7b5420'
    ctx.beginPath()
    ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  
  function drawPinLine(player) {
    if (!player.pinTarget || player.pinTarget.pinnedBy !== player) return
    ctx.save()
    ctx.strokeStyle = 'rgba(240,214,106,0.92)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(player.x, player.y)
    ctx.lineTo(player.pinTarget.x, player.pinTarget.y)
    ctx.stroke()
    ctx.restore()
  }
  
  function drawGrappleLine(player) {
    if (!player.grappleTarget) return
    ctx.save()
    ctx.strokeStyle = 'rgba(255,247,215,0.88)'
    ctx.lineWidth = 4
    ctx.setLineDash([5, 6])
    ctx.beginPath()
    ctx.moveTo(player.x, player.y)
    ctx.lineTo(player.grappleTarget.x, player.grappleTarget.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  function drawJuggContestLines() {
    const contest = state.jugg.contest
    if (!contest) return

    ctx.save()
    ctx.strokeStyle = 'rgba(240,214,106,0.88)'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.setLineDash([4, 5])
    for (const runner of contest.runners) {
      ctx.beginPath()
      ctx.moveTo(runner.x, runner.y)
      ctx.lineTo(state.jugg.x, state.jugg.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.restore()
  }
  
  function drawPlayer(player) {
    const team = TEAMS[player.team]
    const inactive = isInactive(player)
  
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.rotate(player.angle)
  
    if (player.attack > 0) {
      const profile = pompfeFor(player)
      ctx.fillStyle = player.team === 'blue' ? 'rgba(33,168,163,0.24)' : 'rgba(221,97,74,0.24)'
      if (player.pompfe === 'chain') {
        const outer = profile.attackRange - 8
        const inner = profile.minAttackRange || 40
        const start = -attackArcFor(player)
        const end = attackArcFor(player)
        ctx.beginPath()
        ctx.arc(0, 0, outer, start, end)
        ctx.arc(0, 0, inner, end, start, true)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.moveTo(8, 0)
        ctx.arc(8, 0, profile.attackRange - 6, -profile.attackArc * 0.65, profile.attackArc * 0.65)
        ctx.closePath()
        ctx.fill()
      }

      if (profile.rearAttackArc) {
        ctx.beginPath()
        ctx.moveTo(-8, 0)
        ctx.arc(-8, 0, profile.attackRange - 10, Math.PI - profile.rearAttackArc * 0.55, Math.PI + profile.rearAttackArc * 0.55)
        ctx.closePath()
        ctx.fill()
      }
    }
  
    ctx.fillStyle = 'rgba(0,0,0,0.24)'
    ctx.beginPath()
    ctx.ellipse(0, 9, player.radius * 0.95, player.radius * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
  
    if (inactive) {
      ctx.rotate(-player.angle)
      ctx.fillStyle = 'rgba(7, 10, 12, 0.38)'
      ctx.beginPath()
      ctx.ellipse(0, 4, player.radius + 7, player.radius - 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.rotate(player.angle)
    }
  
    ctx.fillStyle = inactive ? '#6f7782' : team.color
    ctx.strokeStyle = player.pinnedBy || player.grappledBy || player.grappleTarget ? '#f0d66a' : team.dark
    ctx.lineWidth = player.pinnedBy || player.grappledBy || player.grappleTarget ? 5 : 3
    ctx.beginPath()
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  
    ctx.fillStyle = inactive ? '#c6ced8' : '#11181d'
    ctx.beginPath()
    ctx.moveTo(player.radius + 7, 0)
    ctx.lineTo(4, -7)
    ctx.lineTo(4, 7)
    ctx.closePath()
    ctx.fill()
  
    if (isPompfer(player)) {
      const profile = pompfeFor(player)
      if (player.pompfe === 'shield') {
        ctx.fillStyle = '#d6c36b'
        ctx.strokeStyle = '#4a3c1e'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(13, -21, 18, 42, 7)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = '#e7dfc6'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(14, -14)
        ctx.lineTo(40, -24)
        ctx.stroke()
      } else if (player.pompfe === 'qtip') {
        const visual = POMPFEN_VISUALS.qtip
        ctx.strokeStyle = '#e7dfc6'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(visual.backEndX, visual.backEndY)
        ctx.lineTo(visual.gripBackX, visual.gripBackY)
        ctx.moveTo(visual.gripFrontX, visual.gripFrontY)
        ctx.lineTo(visual.frontEndX, visual.frontEndY)
        ctx.stroke()
        ctx.strokeStyle = '#c9b663'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(visual.gripBackX, visual.gripBackY)
        ctx.lineTo(visual.gripFrontX, visual.gripFrontY)
        ctx.stroke()
      } else if (player.pompfe === 'chain') {
        drawChain(player)
      } else {
        const visual = POMPFEN_VISUALS.staff
        ctx.strokeStyle = '#e7dfc6'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(visual.startX, visual.startY)
        ctx.lineTo(visual.endX, visual.endY)
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = '#f0d66a'
      ctx.beginPath()
      ctx.arc(-7, -7, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  
    if (inactive) {
      const label = player.pinnedBy ? 'P' : player.penaltyStones > 0 ? `${player.countedStones}/${player.penaltyTotalStones}` : '.'
      ctx.rotate(-player.angle)
      ctx.fillStyle = '#fff7d7'
      ctx.font = '800 14px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(label, 0, -29)
    }
  
    ctx.restore()
  }
  
  function drawHoverMarker() {
    if (!state.paused || !state.hover.player) return
  
    const player = state.hover.player
    ctx.save()
    ctx.strokeStyle = '#fff7d7'
    ctx.lineWidth = 4
    ctx.setLineDash([7, 7])
    ctx.beginPath()
    ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,247,215,0.12)'
    ctx.beginPath()
    ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  
  function drawParticles() {
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1)
      ctx.globalAlpha = alpha
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, 3 + alpha * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  
  function drawCallBubble(player) {
    if (player.callBubbleTimer <= 0 || !player.callBubbleText) return
  
    const alpha = clamp(player.callBubbleTimer / CALL_BUBBLE_DURATION, 0, 1)
    const text = player.callBubbleText
    ctx.save()
    ctx.globalAlpha = Math.min(1, alpha * 1.4)
    ctx.font = '800 18px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
  
    const paddingX = 13
    const paddingY = 9
    const width = ctx.measureText(text).width + paddingX * 2
    const height = 34
    const x = clamp(player.x, width / 2 + 8, FIELD.width - width / 2 - 8)
    const y = clamp(player.y - player.radius - 34, height / 2 + 8, FIELD.height - height / 2 - 8)
    const left = x - width / 2
    const top = y - height / 2
  
    ctx.fillStyle = 'rgba(255,247,215,0.96)'
    ctx.strokeStyle = TEAMS[player.team].dark
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(left, top, width, height, 8)
    ctx.fill()
    ctx.stroke()
  
    const tailX = clamp(player.x, left + 12, left + width - 12)
    const tailY = top + height
    ctx.beginPath()
    ctx.moveTo(tailX - 8, tailY - 2)
    ctx.lineTo(tailX + 8, tailY - 2)
    ctx.lineTo(player.x, Math.min(player.y - player.radius - 4, tailY + 14))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  
    ctx.fillStyle = '#11181d'
    ctx.fillText(text, x, y + 1)
    ctx.restore()
  }

  function drawCallMissMarker(player) {
    if (player.callMissTimer <= 0) return

    const alpha = clamp(player.callMissTimer / (CALL_BUBBLE_DURATION * 0.85), 0, 1)
    const bob = Math.sin((1 - alpha) * Math.PI) * 7
    ctx.save()
    ctx.globalAlpha = Math.min(1, alpha * 1.5)
    ctx.font = '900 22px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 8
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(17,24,29,0.92)'
    ctx.strokeText('?', player.x, player.y - player.radius - 24 - bob)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff7d7'
    ctx.fillText('?', player.x, player.y - player.radius - 24 - bob)
    ctx.restore()
  }
  
  function drawOverlay() {
    if (state.running && state.messageTimer <= 0) return
  
    ctx.save()
    ctx.fillStyle = 'rgba(8,12,15,0.2)'
    ctx.fillRect(0, 0, FIELD.width, FIELD.height)
    ctx.fillStyle = '#fff7d7'
    ctx.font = '800 54px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(state.message, FIELD.width / 2, FIELD.height / 2 - 8)
  
    if (!state.running && state.timeLeft > 0) {
      ctx.font = '600 24px system-ui'
      ctx.fillStyle = 'rgba(255,247,215,0.84)'
      ctx.fillText('Start druecken', FIELD.width / 2, FIELD.height / 2 + 44)
    }
    ctx.restore()
  }
  
  function draw() {
    const camera = state.camera ?? { x: 0, y: 0, zoom: 1 }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, FIELD.width, FIELD.height)
    ctx.fillStyle = '#0d1315'
    ctx.fillRect(0, 0, FIELD.width, FIELD.height)
    ctx.save()
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom)
    drawField()
  
    const sortedPlayers = [...state.players].sort((a, b) => a.y - b.y)
    for (const player of sortedPlayers) drawPinLine(player)
    for (const player of sortedPlayers) drawGrappleLine(player)
    drawJuggContestLines()
    for (const player of sortedPlayers) drawPlayer(player)
    drawHoverMarker()
    drawJugg()
    drawParticles()
    for (const player of sortedPlayers) drawCallMissMarker(player)
    for (const player of sortedPlayers) drawCallBubble(player)
    ctx.restore()
    drawOverlay()
  }

  return { draw }
}
