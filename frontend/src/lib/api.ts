import axios from 'axios'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const isNative = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
export const API_BASE = isNative ? 'https://www.zionite.online' : ''
export const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 15000 })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

export interface Broadcast { id: string; title: string; description?: string; scripture_reference?: string; status: string; started_at?: string; broadcaster_id: string; speaker?: string; thumbnail_url?: string }
export interface Sermon { id: string; title: string; scripture_reference?: string; speaker?: string; series?: string; duration?: number; date: string; audio_url?: string; video_url?: string; thumbnail_url?: string; is_featured?: boolean }
export interface GuestSpeaker { id: string; name: string; bio: string; photo_url: string; topic: string; date: string; is_active: boolean }
export interface EventItem { id: string; title: string; description: string; date: string; time: string; location: string; image_url: string; category?: string }
export interface MusicTrack { id: string; title: string; artist: string; album: string; genre: string; audio_url: string; cover_url: string; duration: number; lyrics: string }
export interface User { id: string; email: string; name?: string; role: string; created_at?: string }
export interface Prayer { id: string; name: string | null; request: string; is_anonymous: boolean; prayers_count: number; created_at: string }

/* ─── Queries ─── */
export function useBroadcasts() {
  return useQuery<Broadcast[]>({ queryKey: ['broadcasts'], queryFn: async () => {
    const { data } = await api.get('/broadcasts')
    return data.broadcasts as Broadcast[]
  }})
}

export function useDashboardAnalytics() {
  return useQuery({ queryKey: ['analytics', 'dashboard'], queryFn: async () => {
    const { data } = await api.get('/analytics/dashboard')
    return data
  }})
}

export function useActiveBroadcast() {
  return useQuery<Broadcast | null>({ queryKey: ['broadcasts', 'active'], queryFn: async () => {
    const { data } = await api.get('/broadcasts/active')
    return data.broadcast as Broadcast | null
  }, retry: 1, refetchInterval: 30000 })
}

export function useSermons(limit?: number) {
  return useQuery<Sermon[]>({ queryKey: ['sermons', limit], queryFn: async () => {
    const { data } = await api.get(`/sermons${limit ? `?limit=${limit}` : ''}`)
    return data.sermons as Sermon[]
  }})
}

export function useFeaturedSermons() {
  return useQuery<Sermon[]>({ queryKey: ['sermons', 'featured'], queryFn: async () => {
    const { data } = await api.get('/sermons/featured')
    return data.sermons as Sermon[]
  }})
}

export function useSermon(id: string) {
  return useQuery<Sermon>({ queryKey: ['sermons', id], queryFn: async () => {
    const { data } = await api.get(`/sermons/${id}`)
    return data.sermon as Sermon
  }, enabled: !!id })
}

export function useGuestSpeakers() {
  return useQuery<GuestSpeaker[]>({ queryKey: ['guest-speakers'], queryFn: async () => {
    const { data } = await api.get('/guest-speakers')
    return data.guest_speakers as GuestSpeaker[]
  }})
}

export function useEvents() {
  return useQuery<EventItem[]>({ queryKey: ['events'], queryFn: async () => {
    const { data } = await api.get('/events')
    return data.events as EventItem[]
  }})
}

export function useMusic() {
  return useQuery<MusicTrack[]>({ queryKey: ['music'], queryFn: async () => {
    const { data } = await api.get('/music')
    return data.music as MusicTrack[]
  }})
}

export function usePrayers() {
  return useQuery<Prayer[]>({ queryKey: ['prayers'], queryFn: async () => {
    const { data } = await api.get('/prayer')
    return data.prayers as Prayer[]
  }})
}

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: async () => {
    const { data } = await api.get('/status')
    return data
  }})
}

export function useDonations() {
  return useQuery({ queryKey: ['donations'], queryFn: async () => {
    const { data } = await api.get('/donations')
    return data.donations
  }})
}

export function useUsers() {
  return useQuery<User[]>({ queryKey: ['users'], queryFn: async () => {
    const { data } = await api.get('/auth/users')
    return data.users as User[]
  }})
}

export function useChatMessages(broadcastId?: string) {
  return useQuery({ queryKey: ['chat', broadcastId], queryFn: async () => {
    const path = broadcastId ? `/chat/broadcast/${broadcastId}` : '/chat/general'
    const { data } = await api.get(path)
    return data.messages
  }, refetchInterval: 5000, enabled: true })
}

export function useSearch(q: string) {
  return useQuery({ queryKey: ['search', q], queryFn: async () => {
    const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`)
    return data
  }, enabled: q.trim().length > 0, staleTime: 1000 * 60 })
}

/* ─── Mutations ─── */
export function useCreateSermon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => api.post('/sermons', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sermons'] }),
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => api.post('/events', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useCreatePrayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => api.post('/prayer', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prayers'] }),
  })
}

export function useSendChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => api.post('/chat', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat'] }),
  })
}

export function useCreateDonation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => api.post('/donations', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['donations'] }),
  })
}
