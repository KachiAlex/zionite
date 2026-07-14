import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../lib/api'
import axios from 'axios'
import { API_BASE } from '../lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Users, Globe, Plus, Check, X, ArrowLeft, KeyRound, Shield, Calendar, UserPlus, Layers, CreditCard, DollarSign, Trash2, Settings2 } from 'lucide-react'

interface TenantForm {
  slug: string
  name: string
  description: string
  primary_color: string
  custom_domain: string
  plan: string
}

interface LicenseForm {
  plan: string
  status: string
  starts_at: string
  expires_at: string
  trial_ends_at: string
  billing_period: string
  max_users: string
  max_storage_gb: string
  max_broadcasts: string
  features: string
}

interface OwnerForm {
  email: string
  password: string
  name: string
}

interface LicensePlan {
  id: string
  slug: string
  name: string
  description?: string
  max_users: number
  max_storage_gb: number
  max_broadcasts: number
  features: string[]
  price_monthly: number
  price_yearly: number
  is_active: boolean
  is_public: boolean
  created_at: string
  updated_at: string
}

interface PlanForm {
  id?: string
  slug: string
  name: string
  description: string
  max_users: string
  max_storage_gb: string
  max_broadcasts: string
  features: string
  price_monthly: string
  price_yearly: string
  is_active: boolean
  is_public: boolean
}

const STATUS_OPTIONS = ['active', 'trialing', 'expired', 'suspended', 'cancelled']
const BILLING_OPTIONS = ['monthly', 'annual', 'lifetime']

function toLocalDateTimeInput(date?: string) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function licenseStatusColor(status?: string) {
  if (status === 'active') return 'bg-emerald-500/20 text-emerald-400'
  if (status === 'trialing') return 'bg-blue-500/20 text-blue-400'
  if (status === 'expired') return 'bg-red-500/20 text-red-400'
  if (status === 'suspended') return 'bg-amber-500/20 text-amber-400'
  return 'bg-[#9c958a]/20 text-[#9c958a]'
}

function formatPrice(cents: number) {
  if (!cents) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

function emptyPlanForm(): PlanForm {
  return {
    slug: '',
    name: '',
    description: '',
    max_users: '',
    max_storage_gb: '',
    max_broadcasts: '',
    features: '',
    price_monthly: '',
    price_yearly: '',
    is_active: true,
    is_public: true
  }
}

export default function SuperAdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: currentTenant } = useTenant()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TenantForm>({ slug: '', name: '', description: '', primary_color: '#c9a227', custom_domain: '', plan: 'free' })
  const [saving, setSaving] = useState(false)
  const [editingTenant, setEditingTenant] = useState<any | null>(null)
  const [licenseForm, setLicenseForm] = useState<LicenseForm | null>(null)
  const [licenseSaving, setLicenseSaving] = useState(false)
  const [ownerForm, setOwnerForm] = useState<OwnerForm | null>(null)
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans'>('tenants')
  const [planForm, setPlanForm] = useState<PlanForm | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [planDeleting, setPlanDeleting] = useState<string | null>(null)

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

  const token = localStorage.getItem('token')
  const authHeaders = { Authorization: `Bearer ${token}` }

  const { data: tenantsResp } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/api/tenants`, { headers: authHeaders })
      return data.tenants as any[]
    },
    enabled: user?.role === 'super_admin'
  })

  const { data: usersResp } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/api/auth/users`, { headers: authHeaders })
      return data.users as any[]
    },
    enabled: user?.role === 'super_admin'
  })

  const { data: plansResp } = useQuery({
    queryKey: ['license-plans'],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/api/license-plans`, { headers: authHeaders })
      return data.plans as LicensePlan[]
    },
    enabled: user?.role === 'super_admin'
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await axios.post(`${API_BASE}/api/tenants`, form, { headers: authHeaders })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setShowForm(false)
      setForm({ slug: '', name: '', description: '', primary_color: '#c9a227', custom_domain: '', plan: 'free' })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create tenant')
    } finally {
      setSaving(false)
    }
  }

  function openLicenseModal(tenant: any) {
    const l = tenant.license || {}
    setEditingTenant(tenant)
    setLicenseForm({
      plan: l.plan || tenant.plan || 'free',
      status: l.status || 'active',
      starts_at: toLocalDateTimeInput(l.starts_at),
      expires_at: toLocalDateTimeInput(l.expires_at),
      trial_ends_at: toLocalDateTimeInput(l.trial_ends_at),
      billing_period: l.billing_period || 'monthly',
      max_users: l.max_users?.toString() || '',
      max_storage_gb: l.max_storage_gb?.toString() || '',
      max_broadcasts: l.max_broadcasts?.toString() || '',
      features: Array.isArray(l.features) ? l.features.join(', ') : (l.features || '')
    })
  }

  async function handleLicenseSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTenant || !licenseForm) return
    setLicenseSaving(true)
    try {
      const payload: any = {
        plan: licenseForm.plan,
        status: licenseForm.status,
        starts_at: licenseForm.starts_at || null,
        expires_at: licenseForm.expires_at || null,
        trial_ends_at: licenseForm.trial_ends_at || null,
        billing_period: licenseForm.billing_period,
        max_users: licenseForm.max_users ? parseInt(licenseForm.max_users) : null,
        max_storage_gb: licenseForm.max_storage_gb ? parseInt(licenseForm.max_storage_gb) : null,
        max_broadcasts: licenseForm.max_broadcasts ? parseInt(licenseForm.max_broadcasts) : null,
        features: licenseForm.features.split(',').map((f: string) => f.trim()).filter(Boolean)
      }
      await axios.patch(`${API_BASE}/api/tenants/${editingTenant.id}/license`, payload, { headers: authHeaders })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setLicenseForm(null)
      setEditingTenant(null)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update license')
    } finally {
      setLicenseSaving(false)
    }
  }

  function applyPlanDefaults(planSlug: string) {
    if (!licenseForm) return
    const plan = plansResp?.find((p: LicensePlan) => p.slug === planSlug)
    if (!plan) return
    setLicenseForm({
      ...licenseForm,
      plan: planSlug,
      max_users: plan.max_users?.toString() || '',
      max_storage_gb: plan.max_storage_gb?.toString() || '',
      max_broadcasts: plan.max_broadcasts?.toString() || '',
      features: (plan.features || []).join(', ')
    })
  }

  async function handleOwnerCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTenant || !ownerForm) return
    setOwnerSaving(true)
    try {
      await axios.post(`${API_BASE}/api/tenants/${editingTenant.id}/owner`, ownerForm, { headers: authHeaders })
      qc.invalidateQueries({ queryKey: ['users'] })
      setOwnerForm(null)
      setEditingTenant(null)
      alert('Owner account created successfully')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create owner')
    } finally {
      setOwnerSaving(false)
    }
  }

  async function handlePlanSave(e: React.FormEvent) {
    e.preventDefault()
    if (!planForm) return
    setPlanSaving(true)
    try {
      const payload = {
        slug: planForm.slug,
        name: planForm.name,
        description: planForm.description || null,
        max_users: planForm.max_users ? parseInt(planForm.max_users) : null,
        max_storage_gb: planForm.max_storage_gb ? parseInt(planForm.max_storage_gb) : null,
        max_broadcasts: planForm.max_broadcasts ? parseInt(planForm.max_broadcasts) : null,
        features: planForm.features.split(',').map((f: string) => f.trim()).filter(Boolean),
        price_monthly: planForm.price_monthly ? Math.round(parseFloat(planForm.price_monthly) * 100) : 0,
        price_yearly: planForm.price_yearly ? Math.round(parseFloat(planForm.price_yearly) * 100) : 0,
        is_active: planForm.is_active,
        is_public: planForm.is_public
      }
      if (planForm.id) {
        await axios.patch(`${API_BASE}/api/license-plans/${planForm.id}`, payload, { headers: authHeaders })
      } else {
        await axios.post(`${API_BASE}/api/license-plans`, payload, { headers: authHeaders })
      }
      qc.invalidateQueries({ queryKey: ['license-plans'] })
      setPlanForm(null)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save plan')
    } finally {
      setPlanSaving(false)
    }
  }

  async function handlePlanDelete(slug: string) {
    if (!confirm('Delete this plan? Tenants using it will not be affected, but you cannot delete a plan that is assigned to a tenant.')) return
    setPlanDeleting(slug)
    try {
      await axios.delete(`${API_BASE}/api/license-plans/${slug}`, { headers: authHeaders })
      qc.invalidateQueries({ queryKey: ['license-plans'] })
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete plan')
    } finally {
      setPlanDeleting(null)
    }
  }

  function openPlanForm(plan?: LicensePlan) {
    if (!plan) {
      setPlanForm(emptyPlanForm())
      return
    }
    setPlanForm({
      id: plan.slug,
      slug: plan.slug,
      name: plan.name,
      description: plan.description || '',
      max_users: plan.max_users?.toString() || '',
      max_storage_gb: plan.max_storage_gb?.toString() || '',
      max_broadcasts: plan.max_broadcasts?.toString() || '',
      features: (plan.features || []).join(', '),
      price_monthly: plan.price_monthly ? (plan.price_monthly / 100).toFixed(2) : '',
      price_yearly: plan.price_yearly ? (plan.price_yearly / 100).toFixed(2) : '',
      is_active: plan.is_active,
      is_public: plan.is_public
    })
  }

  return (
    <div className="min-h-screen bg-[#0c0c12] text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
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

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-[rgba(243,238,228,0.08)]">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tenants' ? 'border-[#c9a227] text-[#c9a227]' : 'border-transparent text-[#9c958a] hover:text-white'}`}>
            <Building2 className="w-4 h-4" /> Tenants
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'plans' ? 'border-[#c9a227] text-[#c9a227]' : 'border-transparent text-[#9c958a] hover:text-white'}`}>
            <Layers className="w-4 h-4" /> License Plans
          </button>
        </div>

        {/* Tenants tab */}
        {activeTab === 'tenants' && (
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
                      {(plansResp || []).map((p: LicensePlan) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
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
                    <th className="text-left px-4 py-3">License</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantsResp?.map((t: any) => (
                    <tr key={t.id} className="border-b border-[rgba(243,238,228,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: t.primary_color }} />
                          {t.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9c958a]">{t.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${t.plan === 'pro' ? 'bg-[#c9a227]/20 text-[#c9a227]' : t.plan === 'enterprise' ? 'bg-emerald-500/20 text-emerald-400' : t.plan === 'basic' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#9c958a]/20 text-[#9c958a]'}`}>{t.plan}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${licenseStatusColor(t.license?.status)}`}>
                            {t.license?.status || 'none'}
                          </span>
                          {t.license?.expires_at && (
                            <span className="text-[10px] text-[#9c958a]">Expires {new Date(t.license.expires_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openLicenseModal(t)} className="p-1.5 rounded-lg bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.12)] text-[#c9a227]" title="Edit license">
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setEditingTenant(t); setOwnerForm({ email: '', password: '', name: '' }) }} className="p-1.5 rounded-lg bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.12)] text-[#9c958a] hover:text-white" title="Create owner">
                            <UserPlus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!tenantsResp?.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#9c958a]">No tenants found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* License Plans tab */}
        {activeTab === 'plans' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold">License Plans</h2>
              <button onClick={() => openPlanForm()} className="btn-gold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Plan
              </button>
            </div>

            <div className="bg-[#14141a] border border-[rgba(243,238,228,0.06)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(243,238,228,0.06)] text-[#9c958a]">
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Slug</th>
                    <th className="text-left px-4 py-3">Limits</th>
                    <th className="text-left px-4 py-3">Pricing</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plansResp?.map((p: LicensePlan) => (
                    <tr key={p.id} className="border-b border-[rgba(243,238,228,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {!p.is_public && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#9c958a]/20 text-[#9c958a]">Hidden</span>}
                        </div>
                        <div className="text-xs text-[#9c958a] max-w-xs truncate">{p.description}</div>
                      </td>
                      <td className="px-4 py-3 text-[#9c958a]"><code className="text-xs">{p.slug}</code></td>
                      <td className="px-4 py-3 text-[#9c958a] text-xs">
                        <div>{p.max_users} users</div>
                        <div>{p.max_storage_gb} GB</div>
                        <div>{p.max_broadcasts} broadcasts</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-[#c9a227]" /> {formatPrice(p.price_monthly)}/mo</div>
                        <div className="flex items-center gap-1"><DollarSign className="w-3 h-3 text-[#9c958a]" /> {formatPrice(p.price_yearly)}/yr</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openPlanForm(p)} className="p-1.5 rounded-lg bg-[rgba(243,238,228,0.06)] hover:bg-[rgba(243,238,228,0.12)] text-[#c9a227]" title="Edit plan">
                            <Settings2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handlePlanDelete(p.slug)} disabled={planDeleting === p.slug} className="p-1.5 rounded-lg bg-[rgba(243,238,228,0.06)] hover:bg-red-500/20 text-[#9c958a] hover:text-red-400" title="Delete plan">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!plansResp?.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#9c958a]">No license plans found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* License modal */}
      {licenseForm && editingTenant && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-[#c9a227]" />
              <h3 className="font-serif text-lg font-bold">Edit License — {editingTenant.name}</h3>
            </div>
            <form onSubmit={handleLicenseSave}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Plan</label>
                  <select value={licenseForm.plan} onChange={e => applyPlanDefaults(e.target.value)} className="input-dark w-full text-sm">
                    {(plansResp || []).map((p: LicensePlan) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">License Status</label>
                  <select value={licenseForm.status} onChange={e => setLicenseForm({ ...licenseForm, status: e.target.value })} className="input-dark w-full text-sm">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Billing Period</label>
                  <select value={licenseForm.billing_period} onChange={e => setLicenseForm({ ...licenseForm, billing_period: e.target.value })} className="input-dark w-full text-sm">
                    {BILLING_OPTIONS.map(b => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Users</label>
                  <input type="number" value={licenseForm.max_users} onChange={e => setLicenseForm({ ...licenseForm, max_users: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Storage (GB)</label>
                  <input type="number" value={licenseForm.max_storage_gb} onChange={e => setLicenseForm({ ...licenseForm, max_storage_gb: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Broadcasts</label>
                  <input type="number" value={licenseForm.max_broadcasts} onChange={e => setLicenseForm({ ...licenseForm, max_broadcasts: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Starts At</label>
                  <input type="datetime-local" value={licenseForm.starts_at} onChange={e => setLicenseForm({ ...licenseForm, starts_at: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Expires At</label>
                  <input type="datetime-local" value={licenseForm.expires_at} onChange={e => setLicenseForm({ ...licenseForm, expires_at: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Trial Ends At</label>
                  <input type="datetime-local" value={licenseForm.trial_ends_at} onChange={e => setLicenseForm({ ...licenseForm, trial_ends_at: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-[#9c958a] block mb-1">Features (comma-separated)</label>
                  <input type="text" value={licenseForm.features} onChange={e => setLicenseForm({ ...licenseForm, features: e.target.value })} className="input-dark w-full text-sm" placeholder="sermons, music, livestream, ..." />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={licenseSaving} className="btn-gold text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" /> {licenseSaving ? 'Saving...' : 'Save License'}
                </button>
                <button type="button" onClick={() => { setLicenseForm(null); setEditingTenant(null) }} className="btn-line text-sm flex items-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Owner modal */}
      {ownerForm && editingTenant && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-[#c9a227]" />
              <h3 className="font-serif text-lg font-bold">Create Owner — {editingTenant.name}</h3>
            </div>
            <form onSubmit={handleOwnerCreate}>
              <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Owner Name</label>
                  <input type="text" required value={ownerForm.name} onChange={e => setOwnerForm({ ...ownerForm, name: e.target.value })} className="input-dark w-full text-sm" placeholder="Pastor John" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Owner Email</label>
                  <input type="email" required value={ownerForm.email} onChange={e => setOwnerForm({ ...ownerForm, email: e.target.value })} className="input-dark w-full text-sm" placeholder="pastor@church.com" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Temporary Password</label>
                  <input type="text" required value={ownerForm.password} onChange={e => setOwnerForm({ ...ownerForm, password: e.target.value })} className="input-dark w-full text-sm" placeholder="Secure password" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={ownerSaving} className="btn-gold text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" /> {ownerSaving ? 'Creating...' : 'Create Owner'}
                </button>
                <button type="button" onClick={() => { setOwnerForm(null); setEditingTenant(null) }} className="btn-line text-sm flex items-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plan modal */}
      {planForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#14141a] border border-[rgba(243,238,228,0.08)] rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-[#c9a227]" />
              <h3 className="font-serif text-lg font-bold">{planForm.id ? 'Edit Plan' : 'New Plan'}</h3>
            </div>
            <form onSubmit={handlePlanSave}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Slug</label>
                  <input type="text" required disabled={!!planForm.id} value={planForm.slug} onChange={e => setPlanForm({ ...planForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="input-dark w-full text-sm" placeholder="pro" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Name</label>
                  <input type="text" required value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} className="input-dark w-full text-sm" placeholder="Pro" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-[#9c958a] block mb-1">Description</label>
                  <input type="text" value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} className="input-dark w-full text-sm" placeholder="Brief description shown to tenants" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Users</label>
                  <input type="number" required value={planForm.max_users} onChange={e => setPlanForm({ ...planForm, max_users: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Storage (GB)</label>
                  <input type="number" required value={planForm.max_storage_gb} onChange={e => setPlanForm({ ...planForm, max_storage_gb: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Max Broadcasts</label>
                  <input type="number" required value={planForm.max_broadcasts} onChange={e => setPlanForm({ ...planForm, max_broadcasts: e.target.value })} className="input-dark w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Monthly Price (USD)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9c958a]" />
                    <input type="number" step="0.01" min="0" value={planForm.price_monthly} onChange={e => setPlanForm({ ...planForm, price_monthly: e.target.value })} className="input-dark w-full text-sm pl-9" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#9c958a] block mb-1">Yearly Price (USD)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9c958a]" />
                    <input type="number" step="0.01" min="0" value={planForm.price_yearly} onChange={e => setPlanForm({ ...planForm, price_yearly: e.target.value })} className="input-dark w-full text-sm pl-9" placeholder="0.00" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-[#9c958a] block mb-1">Features (comma-separated)</label>
                  <input type="text" value={planForm.features} onChange={e => setPlanForm({ ...planForm, features: e.target.value })} className="input-dark w-full text-sm" placeholder="sermons, music, livestream, ..." />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="is_active" checked={planForm.is_active} onChange={e => setPlanForm({ ...planForm, is_active: e.target.checked })} className="w-4 h-4 rounded border-[rgba(243,238,228,0.2)] bg-[#14141a] text-[#c9a227] focus:ring-[#c9a227]" />
                  <label htmlFor="is_active" className="text-sm text-[#9c958a]">Active</label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="is_public" checked={planForm.is_public} onChange={e => setPlanForm({ ...planForm, is_public: e.target.checked })} className="w-4 h-4 rounded border-[rgba(243,238,228,0.2)] bg-[#14141a] text-[#c9a227] focus:ring-[#c9a227]" />
                  <label htmlFor="is_public" className="text-sm text-[#9c958a]">Public</label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={planSaving} className="btn-gold text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" /> {planSaving ? 'Saving...' : 'Save Plan'}
                </button>
                <button type="button" onClick={() => setPlanForm(null)} className="btn-line text-sm flex items-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
