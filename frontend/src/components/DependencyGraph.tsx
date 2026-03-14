import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { ChallengeInfo, Dependency } from '../types'
import { getNodeType, NODE_TYPE_COLORS } from '../types'

interface Props {
  challenges: ChallengeInfo[]
  dependencies: Dependency[]
  selectedChallenge: ChallengeInfo | null
  onSelectChallenge: (challenge: ChallengeInfo | null) => void
  width?: number
  height?: number
}

interface NodePosition {
  id: number
  x: number
  y: number
  vx: number
  vy: number
}

// Цвета для ролей
const ROLE_COLORS: Record<string, string> = {
  survivor: '#4CAF50',  // зелёный
  killer: '#F44336',    // красный
  shared: '#2196F3',    // синий
}

// Получить цвет узла по типу и роли
function getNodeColor(challenge: ChallengeInfo): string {
  const nodeType = getNodeType(challenge.name)

  // Специальные узлы используют свои цвета
  if (nodeType === 'prologue') return NODE_TYPE_COLORS.prologue
  if (nodeType === 'epilogue') return NODE_TYPE_COLORS.epilogue
  if (nodeType === 'reward') return NODE_TYPE_COLORS.reward

  // Обычные задания — по роли
  return ROLE_COLORS[challenge.role] || ROLE_COLORS.shared
}

export default function DependencyGraph({
  challenges,
  dependencies,
  selectedChallenge,
  onSelectChallenge,
  width = 600,
  height = 400,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [positions, setPositions] = useState<Map<number, NodePosition>>(new Map())
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const animationRef = useRef<number | null>(null)

  // Инициализация позиций
  useEffect(() => {
    const newPositions = new Map<number, NodePosition>()

    // Группируем по типу
    const prologues = challenges.filter(c => getNodeType(c.name) === 'prologue')
    const epilogues = challenges.filter(c => getNodeType(c.name) === 'epilogue')
    const others = challenges.filter(c => {
      const t = getNodeType(c.name)
      return t !== 'prologue' && t !== 'epilogue'
    })

    // Прологи сверху
    prologues.forEach((c, i) => {
      const spacing = width / (prologues.length + 1)
      newPositions.set(c.id, {
        id: c.id,
        x: spacing * (i + 1),
        y: 50,
        vx: 0,
        vy: 0,
      })
    })

    // Эпилоги снизу
    epilogues.forEach((c, i) => {
      const spacing = width / (epilogues.length + 1)
      newPositions.set(c.id, {
        id: c.id,
        x: spacing * (i + 1),
        y: height - 50,
        vx: 0,
        vy: 0,
      })
    })

    // Остальные в центре
    others.forEach((c, i) => {
      const cols = Math.ceil(Math.sqrt(others.length))
      const row = Math.floor(i / cols)
      const col = i % cols
      const spacingX = width / (cols + 1)
      const spacingY = (height - 150) / (Math.ceil(others.length / cols) + 1)

      newPositions.set(c.id, {
        id: c.id,
        x: spacingX * (col + 1),
        y: 100 + spacingY * (row + 1),
        vx: 0,
        vy: 0,
      })
    })

    setPositions(newPositions)
  }, [challenges, width, height])

  // Простая симуляция для улучшения позиций
  const simulate = useCallback(() => {
    setPositions(prev => {
      const next = new Map(prev)
      const nodeRadius = 20

      // Силы: отталкивание между узлами
      for (const [id1, n1] of next) {
        for (const [id2, n2] of next) {
          if (id1 >= id2) continue
          const dx = n2.x - n1.x
          const dy = n2.y - n1.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDist = nodeRadius * 3

          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.5
            const fx = dx * force
            const fy = dy * force
            n1.vx -= fx
            n1.vy -= fy
            n2.vx += fx
            n2.vy += fy
          }
        }
      }

      // Притяжение по связям
      for (const dep of dependencies) {
        const parent = next.get(dep.parent_id)
        const child = next.get(dep.child_id)
        if (!parent || !child) continue

        const dx = child.x - parent.x
        const dy = child.y - parent.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const targetDist = 80
        const force = (dist - targetDist) / dist * 0.1

        parent.vx += dx * force
        parent.vy += dy * force
        child.vx -= dx * force
        child.vy -= dy * force
      }

      // Применить скорости и границы
      for (const [, node] of next) {
        node.x += node.vx
        node.y += node.vy
        node.vx *= 0.9
        node.vy *= 0.9

        // Границы
        node.x = Math.max(nodeRadius, Math.min(width - nodeRadius, node.x))
        node.y = Math.max(nodeRadius, Math.min(height - nodeRadius, node.y))
      }

      return next
    })
  }, [dependencies, width, height])

  // Запуск симуляции
  useEffect(() => {
    let frame = 0
    const maxFrames = 100

    const animate = () => {
      if (frame < maxFrames) {
        simulate()
        frame++
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [simulate])

  // Рендеринг на canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Очистка
    ctx.clearRect(0, 0, width, height)

    // Фон
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)

    // Рёбра
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1.5
    for (const dep of dependencies) {
      const parent = positions.get(dep.parent_id)
      const child = positions.get(dep.child_id)
      if (!parent || !child) continue

      // Подсветка если связано с выбранным
      const isRelated = selectedChallenge?.id === dep.parent_id || selectedChallenge?.id === dep.child_id
      ctx.strokeStyle = isRelated ? '#4CAF50' : '#444'
      ctx.lineWidth = isRelated ? 2 : 1.5

      ctx.beginPath()
      ctx.moveTo(parent.x, parent.y)
      ctx.lineTo(child.x, child.y)
      ctx.stroke()

      // Стрелка
      const angle = Math.atan2(child.y - parent.y, child.x - parent.x)
      const arrowLen = 8
      const arrowX = child.x - Math.cos(angle) * 25
      const arrowY = child.y - Math.sin(angle) * 25

      ctx.beginPath()
      ctx.moveTo(arrowX, arrowY)
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
      )
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
      )
      ctx.closePath()
      ctx.fillStyle = isRelated ? '#4CAF50' : '#444'
      ctx.fill()
    }

    // Узлы
    for (const challenge of challenges) {
      const pos = positions.get(challenge.id)
      if (!pos) continue

      const nodeType = getNodeType(challenge.name)
      const color = getNodeColor(challenge)
      const isSelected = selectedChallenge?.id === challenge.id
      const isHovered = hoveredId === challenge.id
      const radius = isSelected ? 24 : isHovered ? 22 : 18

      // Круг
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#4CAF50' : color
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Текст
      ctx.fillStyle = '#fff'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const label = nodeType === 'prologue' ? '▶' :
                   nodeType === 'epilogue' ? '🏁' :
                   nodeType === 'reward' ? '🎁' :
                   (challenge.name?.substring(0, 8) || '?')
      ctx.fillText(label, pos.x, pos.y)
    }

    // Легенда
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const legends = [
      { color: NODE_TYPE_COLORS.prologue, label: 'Пролог' },
      { color: ROLE_COLORS.survivor, label: 'Выживший' },
      { color: ROLE_COLORS.killer, label: 'Убийца' },
      { color: ROLE_COLORS.shared, label: 'Любой' },
      { color: NODE_TYPE_COLORS.epilogue, label: 'Эпилог' },
    ]

    legends.forEach((leg, i) => {
      ctx.fillStyle = leg.color
      ctx.beginPath()
      ctx.arc(15, 15 + i * 18, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#888'
      ctx.fillText(leg.label, 28, 10 + i * 18)
    })
  }, [positions, challenges, dependencies, selectedChallenge, hoveredId, width, height])

  // Обработка клика
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Найти ближайший узел
    let closest: ChallengeInfo | null = null
    let minDist = Infinity

    for (const challenge of challenges) {
      const pos = positions.get(challenge.id)
      if (!pos) continue

      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2)
      if (dist < 25 && dist < minDist) {
        minDist = dist
        closest = challenge
      }
    }

    onSelectChallenge(closest)
  }

  // Обработка движения мыши
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let hovered: number | null = null

    for (const challenge of challenges) {
      const pos = positions.get(challenge.id)
      if (!pos) continue

      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2)
      if (dist < 20) {
        hovered = challenge.id
        break
      }
    }

    setHoveredId(hovered)
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredId(null)}
      style={{ borderRadius: 8, cursor: 'pointer' }}
    />
  )
}
