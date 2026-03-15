'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import type { ChallengeInfo, Dependency, ChallengeStatus } from '../types'
import { getNodeType } from '../types'
import { langStore } from '../stores'

const NODE_RADIUS = 26

const ROLE_COLORS: Record<string, string> = {
  survivor: '#4ade80',
  killer:   '#f87171',
  shared:   '#60a5fa',
}

const NODE_COLORS: Record<string, string> = {
  prologue:  '#c084fc',
  epilogue:  '#fb923c',
  reward:    '#fbbf24',
  challenge: '#60a5fa',
}

const ICON_URLS: Record<string, string> = {
  survivor: '/challenge_icons/ChallengeIcon_survivor.png',
  killer:   '/challenge_icons/ChallengeIcon_killer.png',
  shared:   '/challenge_icons/ChallengeIcon_survivorKiller.png',
  prologue: '/challenge_icons/IconHelp_archivesGeneral.png',
  epilogue: '/challenge_icons/IconHelp_archivesGeneral.png',
  reward:   '/challenge_icons/IconHelp_archivesLog.png',
}

const iconCache = new Map<string, HTMLImageElement>()
if (typeof window !== 'undefined') {
  for (const [key, url] of Object.entries(ICON_URLS)) {
    const img = new Image()
    img.src = url
    iconCache.set(key, img)
  }
}

function getOrLoadImage(url: string, onLoad?: () => void): HTMLImageElement {
  if (iconCache.has(url)) return iconCache.get(url)!
  const img = new Image()
  img.onload = onLoad ?? null
  img.src = url
  iconCache.set(url, img)
  return img
}

const LABEL_MAX_WIDTH = 130
const LABEL_LINE_HEIGHT = 15

function getNodeColor(c: ChallengeInfo): string {
  const t = getNodeType(c.name)
  if (t !== 'challenge') return NODE_COLORS[t]
  return ROLE_COLORS[c.role] ?? ROLE_COLORS.shared
}

function getIconKey(c: ChallengeInfo): string {
  const t = getNodeType(c.name)
  return t === 'challenge' ? (c.role || 'shared') : t
}

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

interface NodePos { x: number; y: number }
interface Transform { x: number; y: number; scale: number }

const FIT_PADDING = 60

function computeFitTransform(map: Map<number, NodePos>, w: number, h: number): Transform {
  if (map.size === 0) return { x: 0, y: 0, scale: 1 }
  const xs = [...map.values()].map(p => p.x)
  const ys = [...map.values()].map(p => p.y)
  const minX = Math.min(...xs) - NODE_RADIUS
  const maxX = Math.max(...xs) + NODE_RADIUS
  const minY = Math.min(...ys) - NODE_RADIUS
  const maxY = Math.max(...ys) + NODE_RADIUS + 40 // место для подписей
  const contentW = maxX - minX || 1
  const contentH = maxY - minY || 1
  const scale = Math.min(
    (w - FIT_PADDING * 2) / contentW,
    (h - FIT_PADDING * 2) / contentH,
    1.5, // не увеличиваем слишком сильно
  )
  const tx = (w - contentW * scale) / 2 - minX * scale
  const ty = (h - contentH * scale) / 2 - minY * scale
  return { x: tx, y: ty, scale }
}

interface Props {
  challenges: ChallengeInfo[]
  dependencies: Dependency[]
  mode: 'admin' | 'view'
  // Режим админа
  onToggleLink?: (a: ChallengeInfo, b: ChallengeInfo) => void
  onMoveChallenge?: (id: number, gridColumn: number, gridRow: number) => void
  // Режим просмотра
  getStatus?: (challenge: ChallengeInfo) => ChallengeStatus
  onChallengeClick?: (challenge: ChallengeInfo) => void
}

export default observer(function DependencyGraph({
  challenges, dependencies, mode,
  onToggleLink, onMoveChallenge,
  getStatus, onChallengeClick,
}: Props) {
  const t = (key: string) => langStore.t(key)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 520 })
  const [positions,  setPositions]  = useState<Map<number, NodePos>>(new Map())
  const [hoveredId,  setHoveredId]  = useState<number | null>(null)
  const [iconLoadTick, setIconLoadTick] = useState(0)
  const [transform,  setTransform]  = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [selectedForLink, setSelectedForLink] = useState<ChallengeInfo | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  // Реф для хранения исходных позиций (из БД) — нужен для пересчёта fit при ресайзе
  const initialPositionsRef = useRef<Map<number, NodePos>>(new Map())

  // Рефы для drag-событий (не нужны в state — не тригерят рендер)
  const isDraggingCanvas = useRef(false)
  const dragStart        = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })
  const draggingNode     = useRef<{ id: number; startX: number; startY: number } | null>(null)
  const dragMoved        = useRef(false)

  // Отслеживаем размер контейнера
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

  // Инициализируем позиции при смене набора заданий
  const challengeIdsKey = challenges.map(c => c.id).join(',')
  useEffect(() => {
    const map = new Map<number, NodePos>()
    const cols = Math.ceil(Math.sqrt(challenges.length)) || 1
    const fallbackW = 800, fallbackH = 520
    challenges.forEach((c, i) => {
      if (c.pos_x != null && c.pos_y != null) {
        // Позиция сохранена — используем напрямую
        map.set(c.id, { x: c.pos_x, y: c.pos_y })
      } else {
        // Авто-расстановка в сетку если координаты не заданы
        const col = i % cols
        const row = Math.floor(i / cols)
        map.set(c.id, {
          x: (col + 1) * (fallbackW / (cols + 1)),
          y: 80 + (row + 1) * ((fallbackH - 160) / (Math.ceil(challenges.length / cols) + 1)),
        })
      }
    })
    setPositions(map)
    initialPositionsRef.current = map
    setSelectedForLink(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeIdsKey])

  // Подгоняем масштаб и позицию при смене заданий или размера холста
  useEffect(() => {
    const map = initialPositionsRef.current
    if (map.size === 0) return
    setTransform(computeFitTransform(map, width, height))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeIdsKey, width, height])

  // ── Отрисовка ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x: tx, y: ty, scale } = transform

    ctx.clearRect(0, 0, width * dpr, height * dpr)
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, width * dpr, height * dpr)

    // Внешний save: только DPR-масштаб — легенда и хинт рисуются внутри него
    ctx.save()
    ctx.scale(dpr, dpr)

    // Внутренний save: мировой трансформ для графа
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    // Точки сетки в стиле Obsidian
    const gridStep = 40
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    const startX = Math.floor(-tx / scale / gridStep) * gridStep
    const startY = Math.floor(-ty / scale / gridStep) * gridStep
    for (let gx = startX; gx < startX + width / scale + gridStep; gx += gridStep) {
      for (let gy = startY; gy < startY + height / scale + gridStep; gy += gridStep) {
        ctx.beginPath()
        ctx.arc(gx, gy, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Рёбра (ненаправленные)
    for (const dep of dependencies) {
      const a = positions.get(dep.a_id), b = positions.get(dep.b_id)
      if (!a || !b) continue

      const isHighlighted =
        selectedForLink?.id === dep.a_id || selectedForLink?.id === dep.b_id ||
        hoveredId === dep.a_id || hoveredId === dep.b_id

      ctx.strokeStyle = isHighlighted ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.15)'
      ctx.lineWidth   = (isHighlighted ? 2 : 1) / scale
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // Узлы
    ctx.font = `${14 / scale}px Inter, system-ui, sans-serif`

    for (const challenge of challenges) {
      const pos = positions.get(challenge.id)
      if (!pos) continue

      const color            = getNodeColor(challenge)
      const isHovered        = hoveredId === challenge.id
      const isSelectedLink   = selectedForLink?.id === challenge.id
      const status           = mode === 'view' ? getStatus?.(challenge) : undefined
      const isCompleted      = status === 'completed'
      const isLocked         = status === 'locked'

      const r = isSelectedLink ? NODE_RADIUS + 4 : isHovered ? NODE_RADIUS + 2 : NODE_RADIUS

      // Свечение
      if (isSelectedLink) {
        ctx.shadowColor = 'rgba(250,204,21,0.9)'
        ctx.shadowBlur  = 24
      } else if (isHovered) {
        ctx.shadowColor = color
        ctx.shadowBlur  = 14
      }

      // Заливка круга — цвет не меняется при выполнении
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
      ctx.fillStyle = isLocked ? `${color}15` : `${color}33`
      ctx.fill()

      // Обводка — цвет не меняется при выполнении
      ctx.strokeStyle = isSelectedLink ? '#fbbf24'
        : isHovered ? '#fff'
        : isLocked  ? `${color}44`
        : color
      ctx.lineWidth = (isSelectedLink ? 3 : 2) / scale
      ctx.stroke()

      ctx.shadowBlur = 0

      // Иконка: приоритет challenge icon_url, иначе иконка роли
      const challengeImg = challenge.icon_url
        ? getOrLoadImage(challenge.icon_url, () => setIconLoadTick(t => t + 1))
        : undefined
      const roleImg      = iconCache.get(getIconKey(challenge))
      const img          = (challengeImg?.complete && challengeImg.naturalWidth > 0) ? challengeImg : roleImg
      const iconSize     = r * 1.8
      if (img?.complete && img.naturalWidth > 0) {
        ctx.save()
        ctx.globalAlpha = isLocked ? 0.25 : 1
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r - 2 / scale, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, pos.x - iconSize / 2, pos.y - iconSize / 2, iconSize, iconSize)
        ctx.restore()
      }

      // Галочка для выполненных заданий
      if (isCompleted) {
        const cs = 8 / scale
        const cy = pos.y - r + 6 / scale
        ctx.save()
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth   = 2.5 / scale
        ctx.lineCap     = 'round'
        ctx.lineJoin    = 'round'
        // Рисуем галочку поверх иконки в правом верхнем углу узла
        const bx = pos.x + r * 0.55, by = pos.y - r * 0.55
        const bs = 7 / scale
        ctx.beginPath()
        ctx.arc(bx, by, bs, 0, Math.PI * 2)
        ctx.fillStyle = '#14532d'
        ctx.fill()
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth   = 1.5 / scale
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(bx - bs * 0.4, by)
        ctx.lineTo(bx - bs * 0.05, by + bs * 0.4)
        ctx.lineTo(bx + bs * 0.45, by - bs * 0.35)
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth   = 1.8 / scale
        ctx.stroke()
        ctx.restore()
        void cs; void cy
      }

      // Подпись под узлом
      ctx.globalAlpha = isLocked ? 0.35 : 1
      const label  = challenge.name || challenge.challenge_key
      const lines  = wrapText(ctx, label, LABEL_MAX_WIDTH / scale)
      const lineH  = LABEL_LINE_HEIGHT / scale
      const labelY = pos.y + r + 6 / scale

      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      lines.slice(0, 3).forEach((line, i) => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillText(line, pos.x + 0.5 / scale, labelY + i * lineH + 0.5 / scale)
        ctx.fillStyle = isSelectedLink ? '#fbbf24'
          : isHovered ? '#fff'
          : 'rgba(255,255,255,0.85)'
        ctx.fillText(line, pos.x, labelY + i * lineH)
      })
      ctx.globalAlpha = 1

      // Индикатор выбранного для связи
      if (mode === 'admin' && isSelectedLink) {
        ctx.font      = `bold ${12 / scale}px Inter, system-ui, sans-serif`
        ctx.fillStyle = '#fbbf24'
        ctx.fillText('●●●', pos.x, pos.y - r - 8 / scale)
        ctx.font = `${14 / scale}px Inter, system-ui, sans-serif`
      }
    }

    ctx.restore()  // снимаем мировой трансформ, DPR-масштаб остаётся

    // Легенда
    const legends = [
      { color: NODE_COLORS.prologue, label: t('challenge.prologue') },
      { color: ROLE_COLORS.survivor, label: t('challenge.survivor') },
      { color: ROLE_COLORS.killer,   label: t('challenge.killer') },
      { color: ROLE_COLORS.shared,   label: t('challenge.shared') },
      { color: NODE_COLORS.epilogue, label: t('challenge.epilogue') },
    ]
    ctx.font          = '13px Inter, system-ui, sans-serif'
    ctx.textAlign     = 'left'
    ctx.textBaseline  = 'middle'
    legends.forEach((leg, i) => {
      const lx = 14, ly = 16 + i * 20
      ctx.beginPath()
      ctx.arc(lx, ly, 5, 0, Math.PI * 2)
      ctx.fillStyle = leg.color
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(leg.label, lx + 10, ly)
    })

    // Подсказка
    ctx.font      = '12px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'right'
    const hint = mode === 'admin'
      ? (selectedForLink
          ? 'Нажмите другое задание для связи · Esc — отмена'
          : 'Клик — выбрать · Зажать — переместить · Скролл — зум · Тащить фон — панорама')
      : 'Клик — отметить · Скролл — зум · Тащить фон — панорама'
    ctx.fillText(hint, width - 8, height - 8)

    ctx.restore()  // снимаем DPR-масштаб
  }, [positions, challenges, dependencies, hoveredId, transform, width, height, dpr, mode, selectedForLink, getStatus, iconLoadTick, langStore.lang])

  // ── Утилиты ──────────────────────────────────────────────────────────────────
  const toWorld = useCallback((mx: number, my: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (mx - rect.left  - transform.x) / transform.scale,
      y: (my - rect.top   - transform.y) / transform.scale,
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

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  // Используем нативный addEventListener с passive: false, чтобы e.preventDefault()
  // блокировал глобальный скролл страницы (React вешает wheel как passive по умолчанию)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx   = e.clientX - rect.left
      const my   = e.clientY - rect.top
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setTransform(prev => {
        const newScale = Math.max(0.2, Math.min(4, prev.scale * delta))
        const ratio    = newScale / prev.scale
        return { scale: newScale, x: mx - (mx - prev.x) * ratio, y: my - (my - prev.y) * ratio }
      })
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [])

  // ── Mouse events ─────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)
    const hit = hitTest(wx, wy)
    if (hit) {
      // Начинаем потенциальное перетаскивание узла (или просто клик)
      draggingNode.current = { id: hit.id, startX: wx, startY: wy }
      dragMoved.current    = false
    } else {
      // Начинаем перетаскивание холста
      isDraggingCanvas.current = true
      dragStart.current        = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
    }
  }, [toWorld, hitTest, transform])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY)

    if (draggingNode.current) {
      const dx = wx - draggingNode.current.startX
      const dy = wy - draggingNode.current.startY
      if (Math.sqrt(dx * dx + dy * dy) > 4) dragMoved.current = true

      // Перемещаем узел только в режиме админа
      if (dragMoved.current && mode === 'admin') {
        const id = draggingNode.current.id
        setPositions(prev => {
          const next = new Map(prev)
          next.set(id, { x: wx, y: wy })
          return next
        })
      }
      return
    }

    if (isDraggingCanvas.current) {
      setTransform(prev => ({
        ...prev,
        x: dragStart.current.tx + (e.clientX - dragStart.current.mx),
        y: dragStart.current.ty + (e.clientY - dragStart.current.my),
      }))
      return
    }

    // Обновляем hover и тултип
    const hit = hitTest(wx, wy)
    setHoveredId(hit?.id ?? null)

    if (hit) {
      const rect = canvasRef.current!.getBoundingClientRect()
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    } else {
      setTooltipPos(null)
    }
  }, [toWorld, hitTest, mode])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Завершение перетаскивания холста
    if (isDraggingCanvas.current) {
      isDraggingCanvas.current = false
      return
    }

    if (!draggingNode.current) return
    const { id } = draggingNode.current
    const moved  = dragMoved.current
    draggingNode.current = null
    dragMoved.current    = false

    if (moved && mode === 'admin') {
      // Сохраняем мировые координаты узла напрямую
      const pos = positions.get(id)
      if (pos && onMoveChallenge) {
        onMoveChallenge(id, pos.x, pos.y)
      }
      return
    }

    // Это был клик
    const clicked = challenges.find(c => c.id === id)
    if (!clicked) return

    if (mode === 'admin') {
      // Логика создания/удаления связи
      if (!selectedForLink) {
        setSelectedForLink(clicked)
      } else if (selectedForLink.id === clicked.id) {
        setSelectedForLink(null)
      } else {
        onToggleLink?.(selectedForLink, clicked)
        setSelectedForLink(null)
      }
    } else {
      // Режим просмотра: отметить/снять задание
      onChallengeClick?.(clicked)
    }
  }, [challenges, mode, positions, selectedForLink, onToggleLink, onMoveChallenge, onChallengeClick])

  // Esc — отмена выбора
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedForLink(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Tooltip ───────────────────────────────────────────────────────────────────
  const hoveredChallenge = hoveredId !== null ? challenges.find(c => c.id === hoveredId) : null

  const tooltipOnLeft = tooltipPos ? tooltipPos.x > width - 270 : false

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width * dpr}
        height={height * dpr}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredId(null)
          setTooltipPos(null)
          isDraggingCanvas.current = false
          if (!dragMoved.current) draggingNode.current = null
        }}
        style={{
          borderRadius: 10,
          display: 'block',
          width: '100%',
          height,
          cursor: draggingNode.current && dragMoved.current
            ? 'grabbing'
            : hoveredId !== null
              ? 'pointer'
              : isDraggingCanvas.current
                ? 'grabbing'
                : 'grab',
        }}
      />

      {/* Тултип при наведении */}
      {hoveredChallenge && tooltipPos && (
        <div style={{
          position:       'absolute',
          left:           tooltipOnLeft ? tooltipPos.x - 256 : tooltipPos.x + 16,
          top:            Math.max(0, tooltipPos.y - 8),
          background:     'rgba(17,24,39,0.96)',
          border:         '1px solid rgba(255,255,255,0.12)',
          borderRadius:   8,
          padding:        '10px 14px',
          maxWidth:       240,
          pointerEvents:  'none',
          zIndex:         10,
          backdropFilter: 'blur(8px)',
          boxShadow:      '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>
            {hoveredChallenge.name || hoveredChallenge.challenge_key}
          </div>
          {hoveredChallenge.role && getNodeType(hoveredChallenge.name) === 'challenge' && (
            <div style={{ fontSize: 11, color: getNodeColor(hoveredChallenge), marginBottom: 6 }}>
              {t(`challenge.${hoveredChallenge.role}`) || hoveredChallenge.role}
            </div>
          )}
          {hoveredChallenge.objective && (
            <div
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: hoveredChallenge.objective.slice(0, 300) }}
            />
          )}
          {mode === 'view' && getStatus && (
            <div style={{
              marginTop: 8,
              fontSize:  11,
              color: getStatus(hoveredChallenge) === 'completed' ? 'rgba(255,255,255,0.5)'
                : getStatus(hoveredChallenge) === 'available'   ? 'rgba(255,255,255,0.5)'
                : '#f87171',
            }}>
              {getStatus(hoveredChallenge) === 'completed' ? '✓ Выполнено'
                : getStatus(hoveredChallenge) === 'available' ? 'Доступно'
                : '🔒 Заблокировано'}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
