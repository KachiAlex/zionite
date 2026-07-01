import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, usePlaylists, useRadioSchedules, useActiveRadioSchedule, useSermons, useMusic } from '../../lib/api'
import {
  Plus, Trash2, Loader2, Clock, Calendar, Save, X,
  Radio, Play, Square, SkipForward, ListMusic, Headphones, Music, BookOpen
} from 'lucide-react'

export default function SermonRadioManager({ onRefresh }: { onRefresh?: () => void }) {
  const qc = useQueryClient()
  const { data: playlists = [] } = usePlaylists()
  const { data: schedules = [], isLoading: schLoading } = useRadioSchedules()
  const { data: activeSchedule } = useActiveRadioSchedule()

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    playlist_id: '',
    start_date: '', start_time: '',
    end_date: '', end_time: '',
  })
  const [saving, setSaving] = useState(false)
  const [radioLoading, setRadioLoading] = useState(false)
  const [playlistForm, setPlaylistForm] = useState({ title: '', description: '' })
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('')
  const { data: selectedPlaylist } = usePlaylist(selectedPlaylistId)
  const { data: sermons = [] } = useSermons()
  const { data: musicTracks = [] } = useMusic()
  const [itemForm, setItemForm] = useState({ content_type: 'sermon', content_id: '', order_index: 0, duration_minutes: 30 })
  const [addingItem, setAddingItem] = useState(false)

  function toISO(date: string, time: string) {
    if (!date) return ''
    const t = time || '00:00'
    return new Date(`${date}T${t}`).toISOString()
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['radio-schedules'] })
    qc.invalidateQueries({ queryKey: ['radio-schedules', 'active'] })
    qc.invalidateQueries({ queryKey: ['playlists'] })
    qc.invalidateQueries({ queryKey: ['sermons', 'radio', 'current'] })
    onRefresh?.()
  }

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!form.playlist_id || !form.start_date) return
    setSaving(true)
    try {
      await api.post('/radio-schedules', {
        playlist_id: form.playlist_id,
        start_time: toISO(form.start_date, form.start_time),
        end_time: form.end_date ? toISO(form.end_date, form.end_time) : null,
      })
      setCreating(false)
      setForm({ playlist_id: '', start_date: '', start_time: '', end_date: '', end_time: '' })
      refresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create schedule')
    } finally { setSaving(false) }
  }

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault()
    if (!playlistForm.title) return
    setSaving(true)
    try {
      await api.post('/playlists', playlistForm)
      setCreatingPlaylist(false)
      setPlaylistForm({ title: '', description: '' })
      refresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create playlist')
    } finally { setSaving(false) }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlaylistId || !itemForm.content_id) return
    setSaving(true)
    try {
      await api.post(`/playlists/${selectedPlaylistId}/items`, itemForm)
      setItemForm({ content_type: 'sermon', content_id: '', order_index: 0, duration_minutes: 30 })
      qc.invalidateQueries({ queryKey: ['playlists', selectedPlaylistId] })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add item')
    } finally { setSaving(false) }
  }

  async function deleteItem(itemId: string) {
    if (!selectedPlaylistId) return
    try {
      await api.delete(`/playlists/${selectedPlaylistId}/items/${itemId}`)
      qc.invalidateQueries({ queryKey: ['playlists', selectedPlaylistId] })
    } catch {}
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this schedule?')) return
    try {
      await api.delete(`/radio-schedules/${id}`)
      refresh()
    } catch {}
  }

  async function startRadioFromSchedule(scheduleId: string) {
    setRadioLoading(true)
    try {
      const schedule = schedules.find((s: any) => s.id === scheduleId)
      if (!schedule) throw new Error('Schedule not found')
      await api.post('/radio/start', { playlistId: schedule.playlist_id })
      refresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start radio')
    } finally { setRadioLoading(false) }
  }

  async function stopRadioStream() {
    setRadioLoading(true)
    try {
      await api.post('/radio/stop')
      refresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to stop radio')
    } finally { setRadioLoading(false) }
  }

  async function skipRadio() {
    setRadioLoading(true)
    try {
      await api.post('/radio/skip')
      refresh()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to skip')
    } finally { setRadioLoading(false) }
  }

  const now = new Date()
  const sorted = useMemo(() =>
    [...schedules].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [schedules]
  )

  const inp = { background: 'var(--ink)', border: '1px solid var(--line)', color: 'var(--parchment)' }

  return (
    <div className="space-y-6">
      {activeSchedule ? (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
              <span className="text-sm font-semibold text-white">Radio On Air</span>
              <span className="text-xs" style={{ color: 'var(--dim)' }}>
                {activeSchedule.playlist_title || 'Unknown playlist'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E05A1A]/10 text-[#E05A1A]">
                {new Date(activeSchedule.start_time).toLocaleTimeString()} – {activeSchedule.end_time ? new Date(activeSchedule.end_time).toLocaleTimeString() : 'open'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={skipRadio} disabled={radioLoading}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: 'rgba(201,162,39,0.1)', color: 'var(--gold)', border: '1px solid rgba(201,162,39,0.2)' }}>
                {radioLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />} Skip
              </button>
              <button onClick={stopRadioStream} disabled={radioLoading}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.2)' }}>
                {radioLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />} Stop
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-4" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3">
            <Headphones className="w-5 h-5" style={{ color: 'var(--dim)' }} />
            <span className="text-sm" style={{ color: 'var(--dim)' }}>No active radio schedule. Start one below or create a new schedule.</span>
          </div>
        </div>
      )}

      {creatingPlaylist ? (
        <div className="rounded-2xl p-5" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />New Playlist</h3>
            <button onClick={() => setCreatingPlaylist(false)} style={{ color: 'var(--dim)' }}><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={createPlaylist} className="grid grid-cols-1 gap-3">
            <input type="text" value={playlistForm.title} onChange={e => setPlaylistForm({ ...playlistForm, title: e.target.value })} placeholder="Playlist title" required
              className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
            <input type="text" value={playlistForm.description} onChange={e => setPlaylistForm({ ...playlistForm, description: e.target.value })} placeholder="Description (optional)"
              className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-gold disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
              <button type="button" onClick={() => setCreatingPlaylist(false)} className="text-sm px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setCreatingPlaylist(true)} className="btn-gold text-sm"><Plus className="w-4 h-4" /> New Playlist</button>
        </div>
      )}

      <div className="rounded-2xl p-5" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-4"><ListMusic className="w-4 h-4" style={{ color: 'var(--gold)' }} />Manage Playlist Items</h3>
        <select value={selectedPlaylistId} onChange={e => setSelectedPlaylistId(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm mb-4" style={inp}>
          <option value="">Select a playlist</option>
          {playlists.map((pl: any) => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
        </select>

        {selectedPlaylistId && (
          <>
            <div className="mb-4">
              <p className="text-xs font-medium text-white mb-2">
                {selectedPlaylist?.playlist?.title || 'Loading...'} ({selectedPlaylist?.items?.length || 0} items)
              </p>
              {selectedPlaylist?.items?.length === 0 ? (
                <p className="text-xs text-[var(--dim)]">No items yet. Add sermons or music below.</p>
              ) : (
                <div className="space-y-2">
                  {selectedPlaylist.items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(243,238,228,0.03)] border border-[rgba(243,238,228,0.06)]">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.content_type === 'sermon' ? <BookOpen className="w-3 h-3 text-[var(--gold)]" /> : <Music className="w-3 h-3 text-[var(--gold)]" />}
                        <span className="text-xs text-white truncate">{item.content_title || item.content_id}</span>
                        <span className="text-[10px] text-[var(--dim)]">{item.duration_minutes}m</span>
                      </div>
                      <button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-300 text-[10px] px-2 py-1 rounded border border-red-400/20 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {addingItem ? (
              <form onSubmit={addItem} className="grid grid-cols-1 gap-3">
                <select value={itemForm.content_type} onChange={e => setItemForm({ ...itemForm, content_type: e.target.value, content_id: '' })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp}>
                  <option value="sermon">Sermon</option>
                  <option value="music">Music</option>
                </select>
                <select value={itemForm.content_id} onChange={e => setItemForm({ ...itemForm, content_id: e.target.value })} required
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp}>
                  <option value="">Select {itemForm.content_type}</option>
                  {(itemForm.content_type === 'sermon' ? sermons : musicTracks).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.title}{s.speaker || s.artist ? ` — ${s.speaker || s.artist}` : ''}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={itemForm.order_index} onChange={e => setItemForm({ ...itemForm, order_index: parseInt(e.target.value) || 0 })}
                    placeholder="Order" className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
                  <input type="number" value={itemForm.duration_minutes} onChange={e => setItemForm({ ...itemForm, duration_minutes: parseInt(e.target.value) || 30 })}
                    placeholder="Duration (min)" className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-gold disabled:opacity-50 text-sm">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Item
                  </button>
                  <button type="button" onClick={() => setAddingItem(false)} className="text-sm px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setAddingItem(true)} className="text-sm px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                <Plus className="w-3 h-3 inline mr-1" /> Add Item
              </button>
            )}
          </>
        )}
      </div>

      {creating ? (
        <div className="rounded-2xl p-5" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />New Schedule</h3>
            <button onClick={() => setCreating(false)} style={{ color: 'var(--dim)' }}><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={createSchedule} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] mb-1" style={{ color: 'var(--dim)' }}><ListMusic className="w-3 h-3 inline mr-1" />Playlist *</label>
              <select value={form.playlist_id} onChange={e => setForm({ ...form, playlist_id: e.target.value })} required
                className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp}>
                <option value="">Select a playlist</option>
                {playlists.map((pl: any) => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--dim)' }}><Calendar className="w-3 h-3 inline mr-1" />Start Date *</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--dim)' }}><Clock className="w-3 h-3 inline mr-1" />Start Time *</label>
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} required
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
              </div>
            </div>
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--dim)' }}><Calendar className="w-3 h-3 inline mr-1" />End Date (optional)</label>
                <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--dim)' }}><Clock className="w-3 h-3 inline mr-1" />End Time (optional)</label>
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm" style={inp} />
              </div>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="btn-gold disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
              <button type="button" onClick={() => setCreating(false)} className="text-sm px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>Cancel</button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="btn-gold text-sm"><Plus className="w-4 h-4" /> New Schedule</button>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-xs font-semibold text-white flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} /> Radio Schedules
          </h3>
        </div>
        {schLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dim)' }} /></div>}
        {!schLoading && schedules.length === 0 && (
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>
            <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No schedules yet. Create one to start automated radio.</p>
          </div>
        )}
        {!schLoading && sorted.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'rgba(240,190,100,0.04)' }}>
            {sorted.map((sch: any) => {
              const isActive = activeSchedule?.id === sch.id
              const isPast = sch.end_time && new Date(sch.end_time) < now
              const isFuture = new Date(sch.start_time) > now
              return (
                <div key={sch.id} className="px-4 py-3 flex items-center justify-between hover:bg-[rgba(240,190,100,0.04)] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isActive ? 'rgba(74,222,128,0.1)' : 'var(--ink)', border: `1px solid ${isActive ? 'rgba(74,222,128,0.3)' : 'var(--line)'}` }}>
                      {isActive ? <Radio className="w-4 h-4 text-[#4ade80]" /> : <Clock className="w-4 h-4" style={{ color: 'var(--dim)' }} />}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white truncate">{sch.playlist_title || 'Unknown Playlist'}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--dim)' }}>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {new Date(sch.start_time).toLocaleString()}
                        {sch.end_time ? ` → ${new Date(sch.end_time).toLocaleString()}` : ' (open-ended)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#4ade80]/10 text-[#4ade80]">On Air</span>}
                    {isPast && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--ink)] text-[var(--dim)]" style={{ border: '1px solid var(--line)' }}>Ended</span>}
                    {isFuture && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#eab308]/10 text-[#eab308]">Upcoming</span>}
                    {!isActive && !isPast && (
                      <button onClick={() => startRadioFromSchedule(sch.id)} disabled={radioLoading}
                        className="text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                        {radioLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 inline mr-0.5" />} Start
                      </button>
                    )}
                    <button onClick={() => deleteSchedule(sch.id)}
                      className="text-red-400 hover:text-red-300 text-[10px] px-2 py-1 rounded border border-red-400/20 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
