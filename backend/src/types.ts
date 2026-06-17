export type UserRole = 'listener' | 'broadcaster' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
}

export interface Broadcast {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  status: 'scheduled' | 'live' | 'ended'
  started_at?: string
  ended_at?: string
  broadcaster_id: string
  audio_path?: string
  created_at: string
}

export interface Sermon {
  id: string
  title: string
  description?: string
  scripture_reference?: string
  speaker?: string
  series?: string
  audio_url: string
  date: string
  duration?: number
  created_at: string
}
