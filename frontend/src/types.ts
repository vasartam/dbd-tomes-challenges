export interface Tome {
  id: number
  archive_key: string
  name: string | null
  start_ts: number | null
  end_ts: number | null
}

export interface TomeWithPages extends Tome {
  pages: Page[]
}

export interface Page {
  id: number
  tome_id: number
  level_number: number
}

export interface PageWithChallenges extends Page {
  challenges: Challenge[]
}

export interface Reward {
  type: string
  id: string
  amount: number
}

// Тип узла в древовидной структуре
export type ChallengeNodeType = 'prologue' | 'epilogue' | 'challenge' | 'reward'

// Определить тип узла по названию
export function getNodeType(name: string | null): ChallengeNodeType {
  if (!name) return 'challenge'
  const lowerName = name.toLowerCase()
  if (lowerName === 'prologue' || lowerName === 'пролог') return 'prologue'
  if (lowerName === 'epilogue' || lowerName === 'эпилог') return 'epilogue'
  if (lowerName === 'reward' || lowerName === 'награда') return 'reward'
  return 'challenge'
}

// Цвета для типов узлов
export const NODE_TYPE_COLORS: Record<ChallengeNodeType, string> = {
  prologue: '#9C27B0',  // фиолетовый
  epilogue: '#FF9800', // оранжевый
  reward: '#FFD700',   // золотой
  challenge: '#2196F3', // синий
}

export interface Challenge {
  id: number
  page_id: number
  challenge_key: string
  node_index: number
  name: string | null
  role: 'survivor' | 'killer' | 'shared' | string
  objective: string | null
  rewards: Reward[]
  // joined fields from list_challenges
  level_number?: number
  archive_key?: string
  tome_name?: string | null
}

export interface Dependency {
  a_id: number
  b_id: number
}

export interface ChallengeInfo {
  id: number
  challenge_key: string
  name: string | null
  role: string
  objective: string | null
  // Позиция на графе (мировые координаты)
  pos_x: number | null
  pos_y: number | null
  icon_url: string | null
}

export interface PageDependencies {
  challenges: ChallengeInfo[]
  dependencies: Dependency[]
}

// Статус выполнения страницы/тома
export interface PageCompletionStatus {
  page_id: number
  level_number: number
  is_complete: boolean
  total_challenges: number
  completed_challenges: number
}

export interface TomeCompletionStatus {
  archive_key: string
  name: string | null
  is_complete: boolean
  pages: PageCompletionStatus[]
}

export interface ProgressRecord {
  challenge_key: string
  completed: boolean
  updated_at: string
  challenge_name: string | null
  role: string
  level_number: number
  archive_key: string
  tome_name: string | null
}

export type ChallengeStatus = 'completed' | 'available' | 'locked'
