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
