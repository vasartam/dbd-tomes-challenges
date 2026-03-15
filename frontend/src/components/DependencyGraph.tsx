'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { ChallengeInfo, Dependency } from '../types'
import { getNodeType } from '../types'

interface Props {
  challenges: ChallengeInfo[]
  dependencies: Dependency[]
  selectedChallenge: ChallengeInfo | null
  onSelectChallenge: (challenge: ChallengeInfo | null) => void
}

interface NodePosition {
  id: number
  x: number
  y: number
  vx: number
  vy: number
}

interface Transform {
  x: number
  y: number
  scale: number
}

// Obsidian-like color palette
const ROLE_COLORS: Record<string, string> = {
  survivor: '#4ade80',  // green
  killer:   '#f87171',  // red
  shared:   '#60a5fa',  // blue
}

const NODE_COLORS: Record<string, string> = {
  prologue: '#c084fc',  // purple
  epilogue: '#fb923c',  // orange
  reward:   '#fbbf24',  // amber
  challenge: '#60a5fa', // blue
}

const NODE_RADIUS = 26

// DBD challenge icons (saved locally from Fandom wiki)
const ICON_URLS: Record<string, string> = {
  survivor: '/icons/survivor.webp',   // ChallengeIcon_survivor
  killer:   '/icons/killer.webp',     // ChallengeIcon_killer
  shared:   '/icons/shared.webp',     // ChallengeIcon_shared
  prologue: '/icons/prologue.webp',   // ChallengeIcon_purpleGlyph
  epilogue: '/icons/epilogue.webp',   // ChallengeIcon_orangeGlyph
  reward:   '/icons/reward.webp',     // ChallengeIcon_yellowGlyph
}

// Preload images
const iconCache = new Map<string, HTMLImageElement>()
if (typeof window !== 'undefined') {
  for (const [key, url] of Object.entries(ICON_URLS)) {
    const img = new Image()
    img.src = url
    iconCache.set(key, img)
  }
}
const LABEL_MAX_WIDTH = 120
const LABEL_LINE_HEIGHT = 13
const SIM_FRAMES = 150

function getNodeColor(c: ChallengeInfo): string {
  const t = getNodeType(c.name)
  if (t !== 'challenge') return NODE_COLORS[t]
  return ROLE_COLORS[c.role] ?? ROLE_COLORS.shared
}

function getIconKey(c: ChallengeInfo): string {
  const t = getNodeType(c.name)
  return t === 'challenge' ? (c.role || 'shared') : t
}

// Wrap text into lines that fit maxWidth
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export default function DependencyGraph({ challenges, dependencies, selectedChallenge, onSelectChallenge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 520 })
  const [positions, setPositions] = useState<Map<number, NodePosition>>(new Map())
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const animationRef = useRef<number | null>(null)
  const isDraggingCanvas = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  // Observe container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) setCanvasSize({ width: w, height: Math.max(480, Math.round(w * 0.6)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { width, height } = canvasSize

  // Initialize positions when challenges or canvas size changes
  useEffect(() => {
    const map = new Map<number, NodePosition>()
    const prologues = challenges.filter(c => getNodeType(c.name) === 'prologue')
    const epilogues = challenges.filter(c => getNodeType(c.name) === 'epilogue')
    const others    = challenges.filter(c => { const t = getNodeType(c.name); return t !== 'prologue' && t !== 'epilogue' })

    prologues.forEach((c, i) => {
      map.set(c.id, { id: c.id, x: width / (prologues.length + 1) * (i + 1), y: 60, vx: 0, vy: 0 })
    })
    epilogues.forEach((c, i) => {
      map.set(c.id, { id: c.id, x: width / (epilogues.length + 1) * (i + 1), y: height - 60, vx: 0, vy: 0 })
    })
    others.forEach((c, i) => {
      const cols = Math.ceil(Math.sqrt(others.length))
      const col = i % cols
      const row = Math.floor(i / cols)
      const sx = width / (cols + 1)
      const sy = (height - 160) / (Math.ceil(others.length / cols) + 1)
      map.set(c.id, { id: c.id, x: sx * (col + 1), y: 110 + sy * (row + 1), vx: 0, vy: 0 })
    })
    setPositions(map)
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [challenges, width, height])

  // Force simulation
  const simulate = useCallback(() => {
    setPositions(prev => {
      const next = new Map(prev)

      // Repulsion
      for (const [id1, n1] of next) {
        for (const [id2, n2] of next) {
          if (id1 >= id2) continue
          const dx = n2.x - n1.x, dy = n2.y - n1.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDist = NODE_RADIUS * 4.5
          if (dist < minDist) {
            const f = (minDist - dist) / dist * 0.4
            n1.vx -= dx * f; n1.vy -= dy * f
            n2.vx += dx * f; n2.vy += dy * f
          }
        }
      }

      // Attraction along edges
      for (const dep of dependencies) {
        const p = next.get(dep.parent_id), c = next.get(dep.child_id)
        if (!p || !c) continue
        const dx = c.x - p.x, dy = c.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const target = 120
        const f = (dist - target) / dist * 0.08
        p.vx += dx * f; p.vy += dy * f
        c.vx -= dx * f; c.vy -= dy * f
      }

      // Center gravity (weak)
      for (const [, n] of next) {
        n.vx += (width / 2 - n.x) * 0.002
        n.vy += (height / 2 - n.y) * 0.002
      }

      // Apply + dampen + clamp
      for (const [, n] of next) {
        n.x += n.vx; n.y += n.vy
        n.vx *= 0.85; n.vy *= 0.85
        n.x = Math.max(NODE_RADIUS + 10, Math.min(width - NODE_RADIUS - 10, n.x))
        n.y = Math.max(NODE_RADIUS + 10, Math.min(height - NODE_RADIUS - 10, n.y))
      }

      return next
    })
  }, [dependencies, width, height])

  useEffect(() => {
    let frame = 0
    const run = () => {
      if (frame < SIM_FRAMES) { simulate(); frame++; animationRef.current = requestAnimationFrame(run) }
    }
    run()
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current) }
  }, [simulate])

  // Render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x: tx, y: ty, scale } = transform

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    // Grid dots (Obsidian style)
    const gridStep = 40
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    const startX = Math.floor(-tx / scale / gridStep) * gridStep
    const startY = Math.floor(-ty / scale / gridStep) * gridStep
    const endX = startX + width / scale + gridStep
    const endY = startY + height / scale + gridStep
    for (let gx = startX; gx < endX; gx += gridStep) {
      for (let gy = startY; gy < endY; gy += gridStep) {
        ctx.beginPath()
        ctx.arc(gx, gy, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Edges
    for (const dep of dependencies) {
      const p = positions.get(dep.parent_id), c = positions.get(dep.child_id)
      if (!p || !c) continue

      const isRelated = selectedChallenge?.id === dep.parent_id || selectedChallenge?.id === dep.child_id
      const lineColor = isRelated ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.15)'
      const lineWidth = isRelated ? 2 : 1

      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth / scale
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(c.x, c.y)
      ctx.stroke()

      // Arrow
      const angle = Math.atan2(c.y - p.y, c.x - p.x)
      const ar = NODE_RADIUS + 4
      const ax = c.x - Math.cos(angle) * ar
      const ay = c.y - Math.sin(angle) * ar
      const aLen = 7 / scale
      ctx.fillStyle = lineColor
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - aLen * Math.cos(angle - Math.PI / 6), ay - aLen * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(ax - aLen * Math.cos(angle + Math.PI / 6), ay - aLen * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fill()
    }

    // Nodes
    ctx.font = `${12 / scale}px Inter, system-ui, sans-serif`

    for (const challenge of challenges) {
      const pos = positions.get(challenge.id)
      if (!pos) continue

      const color = getNodeColor(challenge)
      const isSelected = selectedChallenge?.id === challenge.id
      const isHovered = hoveredId === challenge.id
      const r = isSelected ? NODE_RADIUS + 4 : isHovered ? NODE_RADIUS + 2 : NODE_RADIUS

      // Glow
      if (isSelected || isHovered) {
        ctx.shadowColor = isSelected ? 'rgba(250,204,21,0.9)' : color
        ctx.shadowBlur = isSelected ? 24 : 14
      }

      // Node circle background
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? 'rgba(251,191,36,0.25)' : `${color}33`
      ctx.fill()

      // Ring border
      ctx.strokeStyle = isSelected ? '#fbbf24' : isHovered ? '#fff' : color
      ctx.lineWidth = (isSelected ? 3 : 2) / scale
      ctx.stroke()

      ctx.shadowBlur = 0

      // Icon image
      const iconKey = getIconKey(challenge)
      const img = iconCache.get(iconKey)
      const iconSize = (r * 1.4)
      if (img?.complete && img.naturalWidth > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r - 2 / scale, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, pos.x - iconSize / 2, pos.y - iconSize / 2, iconSize, iconSize)
        ctx.restore()
      }

      // Label below node
      const label = challenge.name || challenge.challenge_key
      const lines = wrapText(ctx, label, LABEL_MAX_WIDTH / scale)
      const lineH = LABEL_LINE_HEIGHT / scale
      const labelY = pos.y + r + 6 / scale

      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      lines.slice(0, 3).forEach((line, i) => {
        // Shadow for readability
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillText(line, pos.x + 0.5 / scale, labelY + i * lineH + 0.5 / scale)
        // Text
        ctx.fillStyle = isSelected ? '#fbbf24' : isHovered ? '#fff' : 'rgba(255,255,255,0.85)'
        ctx.fillText(line, pos.x, labelY + i * lineH)
      })
    }

    // Legend
    ctx.restore()

    const legends = [
      { color: NODE_COLORS.prologue, label: 'Prologue' },
      { color: ROLE_COLORS.survivor, label: 'Survivor' },
      { color: ROLE_COLORS.killer, label: 'Killer' },
      { color: ROLE_COLORS.shared, label: 'Any' },
      { color: NODE_COLORS.epilogue, label: 'Epilogue' },
    ]
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    legends.forEach((leg, i) => {
      const lx = 14, ly = 16 + i * 20
      ctx.beginPath()
      ctx.arc(lx, ly, 5, 0, Math.PI * 2)
      ctx.fillStyle = leg.color
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(leg.label, lx + 10, ly)
    })

    // Hint
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('Scroll to zoom · Drag to pan', width - 8, height - 8)
  }, [positions, challenges, dependencies, selectedChallenge, hoveredId, transform, width, height])

  // Screen → world coordinates
  const toWorld = useCallback((mx: number, my: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = (mx - rect.left)
    const sy = (my - rect.top)
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale,
    }
  }, [transform])

  const hitTest = useCallback((wx: number, wy: number): ChallengeInfo | null => {
    let closest: ChallengeInfo | null = null
    let minDist = NODE_RADIUS + 8
    for (const c of challenges) {
      const pos = positions.get(c.id)
      if (!pos) continue
      const d = Math.sqrt((pos.x - wx) ** 2 + (pos.y - wy) ** 2)
      if (d < minDist) { minDist = d; closest = c }
    }
    return closest
  }, [challenges, positions])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTransform(prev => {
      const newScale = Math.max(0.2, Math.min(4, prev.scale * delta))
      const ratio = newScale / prev.scale
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * ratio,
        y: my - (my - prev.y) * ratio,
      }
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)
    const hit = hitTest(wx, wy)
    if (!hit) {
      isDraggingCanvas.current = true
      dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
    }
  }, [toWorld, hitTest, transform])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingCanvas.current) {
      setTransform(prev => ({
        ...prev,
        x: dragStart.current.tx + (e.clientX - dragStart.current.mx),
        y: dragStart.current.ty + (e.clientY - dragStart.current.my),
      }))
      return
    }
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)
    const hit = hitTest(wx, wy)
    setHoveredId(hit?.id ?? null)
  }, [toWorld, hitTest])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDraggingCanvas.current) {
      isDraggingCanvas.current = false
      return
    }
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)
    onSelectChallenge(hitTest(wx, wy))
  }, [toWorld, hitTest, onSelectChallenge])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredId(null); isDraggingCanvas.current = false }}
        style={{ borderRadius: 10, cursor: hoveredId ? 'pointer' : isDraggingCanvas.current ? 'grabbing' : 'grab', display: 'block', width: '100%' }}
      />
    </div>
  )
}
