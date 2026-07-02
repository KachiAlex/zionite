import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../lib/api'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Users, Globe, Plus, Check, X, ArrowLeft } from 'lucide-react'

interface TenantForm {
  slug: string
  name: string
  description: string
  primary_color: string
  custom_domain: string
  plan: string
}

export default function SuperAdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: currentTenant } = useTenant()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TenantForm>({ slug: '', name: '', description: '', primary_color: '#c9a227', custom_domain: '', plan: 'free' })
  const [saving, setSaving] = useState(false)

  if (user?.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-[#0c0c12] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-[#9c958a]">Super admin privileges required.</p>
          <button onClick={() => navigate('/')} className="btn-gold mt-4 text-sm">Go Home</button>
        </div>
      </div>
    )
  }

  const { data: tenantsResp } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/api/tenants`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      return data.tenants as any[]
    },
    enabled: user?.role === 'super_admin'
  })

  const { data: usersResp } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/api/auth/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      return data.users as any[]
    },
    enabled: user?.role === 'super_admin'
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await axios.post(`${API_BASE}/api/tenants`, form, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setShowForm(false)
      setForm({ slug: '', name: '', description: '', primary_color: '#c9a227', custom_domain: '', plan: 'free' })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create tenant')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c12] text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/admin')} className="text-[#9c958a] hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-serif text-2xl font-bold">Super Admin</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.06)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="w-5 h-5 text-[#c9a227]" />
              <span className="text-sm text-[#9c958a]">Tenants</span>
            </div>
            <div className="text-2xl font-bold">{tenantsResp?.length || 0}</div>
          </div>
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.06)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-[#c9a227]" />
              <span className="text-sm text-[#9c958a]">Total Users</span>
            </div>
            <div className="text-2xl font-bold">{usersResp?.length || 0}</div>
          </div>
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.06)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-[#c9a227]" />
              <span className="text-sm text-[#9c958a]">Current Tenant</span>
            </div>
            <div className="text-lg font-bold truncate">{currentTenant?.name || 'Zionite'}</div>
          </div>
        </div>

        {/* Tenants */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-bold">Churches / Tenants</h2>
            <button onClick={() => setShowForm(true)} className="btn-gold text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Tenant
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-xl p-5 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Slug (subdomain)</label>
                  <input type="text" required value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="input-dark w-full text-sm" placeholder="firstbaptist" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Name</label>
                  <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-dark w-full text-sm" placeholder="First Baptist Church" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.primary_color} onChange={e => setForm({ ...form, primary_color: e.target.value })} className="w-10 h-8 rounded border-0 bg-transparent" />
                    <input type="text" value={form.primary_color} onChange={e => setForm({ ...form, primary_color: e.target.value })} className="input-dark w-full text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Plan</label>
                  <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className="input-dark w-full text-sm">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-[#9c958a] block mb-1">Description</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-dark w-full text-sm" placeholder="A brief description of the church" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-[#9c958a] block mb-1">Custom Domain (optional)</label>
                  <input type="text" value={form.custom_domain} onChange={e => setForm({ ...form, custom_domain: e.target.value })} className="input-dark w-full text-sm" placeholder="church.example.com" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={saving} className="btn-gold text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" /> {saving ? 'Creating...' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-line text-sm flex items-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </form>
          )}

          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.06)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(243,238,228,0.06)] text-[#9c958a]">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Slug</th>
                  <th className="text-left px-4 py-3">Plan</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Color</th>
                </tr>
              </thead>
              <tbody>
                {tenantsResp?.map((t: any) => (
                  <tr key={t.id} className="border-b border-[rgba(243,238,228,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-[#9c958a]">{t.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.plan === 'pro' ? 'bg-[#c9a227]/20 text-[#c9a227]' : t.plan === 'enterprise' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#9c958a]/20 text-[#9c958a]'}`}>{t.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: t.primary_color }} />
                        <span className="text-[#9c958a] text-xs">{t.primary_color}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!tenantsResp?.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[#9c958a]">No tenants found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
