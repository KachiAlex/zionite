import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE, type HomeConfig } from '../../lib/api'
import { useTenantContext } from '../../contexts/TenantContext'
import { Save, Loader2, Image, Layout, Type, Link, Eye, EyeOff, Mail, MapPin, Church } from 'lucide-react'

const defaultConfig: HomeConfig = {
  hero: {
    title: '{tenant} – The Voice of Redemption',
    subtitle: 'Welcome to',
    description: 'The official digital radio ministry of {tenant}. Broadcasting the Gospel of Jesus Christ to the nations through powerful sermons, worship, prayer, and life-transforming conversations.',
    backgroundImage: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=2000&q=80',
    primaryCta: { text: 'Listen Live', link: '/live' },
    secondaryCta: { text: 'Browse Sermons', link: '/archive' },
    communityCta: { text: 'Join the Community', subtext: 'Thousands of listeners online' }
  },
  brand: { tagline: 'The Voice of Redemption' },
  footer: {
    brandStatement: 'A Digital Ministry of<br />The Redemption Project',
    location: 'Lagos, Nigeria',
    email: 'theredemptionprojectministries@gmail.com'
  },
  sections: {
    showTestimonies: true,
    showPrayerWall: true,
    showEvents: true,
    showDonations: true,
    showGuestSpeakers: true,
    showTranscripts: true,
    showCommunityCta: true
  }
}

function mergeConfig(tenantConfig?: HomeConfig): HomeConfig {
  return {
    hero: { ...defaultConfig.hero, ...tenantConfig?.hero },
    brand: { ...defaultConfig.brand, ...tenantConfig?.brand },
    footer: { ...defaultConfig.footer, ...tenantConfig?.footer },
    sections: { ...defaultConfig.sections, ...tenantConfig?.sections }
  }
}

export default function HomePageManager() {
  const { tenant } = useTenantContext()
  const token = localStorage.getItem('token')
  const [config, setConfig] = useState<HomeConfig>(mergeConfig(tenant?.home_config))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setConfig(mergeConfig(tenant?.home_config))
  }, [tenant?.home_config])

  function updateHero(patch: Partial<HomeConfig['hero']>) {
    setConfig(prev => ({ ...prev, hero: { ...prev.hero, ...patch } }))
  }

  function updateFooter(patch: Partial<HomeConfig['footer']>) {
    setConfig(prev => ({ ...prev, footer: { ...prev.footer, ...patch } }))
  }

  function updateBrand(patch: Partial<HomeConfig['brand']>) {
    setConfig(prev => ({ ...prev, brand: { ...prev.brand, ...patch } }))
  }

  function updateSections(patch: Partial<HomeConfig['sections']>) {
    setConfig(prev => ({ ...prev, sections: { ...prev.sections, ...patch } }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await axios.patch(`${API_BASE}/api/tenant/home-config`, { home_config: config }, { headers: { Authorization: `Bearer ${token}` } })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save home page config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Layout className="w-4 h-4 text-[#c9a227]" /> Home Page Configuration</h2>
          <p className="text-[11px] text-[#9c958a] mt-0.5">Customize the landing page for {tenant?.name || 'this ministry'}.</p>
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#e0bd5a] text-[#1b1208] text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
        </button>
      </div>

      {saved && <p className="text-xs text-green-400 flex items-center gap-1.5 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2"><Save className="w-3.5 h-3.5" /> Home page config saved successfully.</p>}
      {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

      {/* Hero Section */}
      <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] space-y-4">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2"><Type className="w-3.5 h-3.5 text-[#c9a227]" /> Hero Section</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Subtitle</label>
            <input value={config.hero?.subtitle || ''} onChange={e => updateHero({ subtitle: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Welcome to" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Title</label>
            <input value={config.hero?.title || ''} onChange={e => updateHero({ title: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="{tenant} – The Voice of Redemption" />
            <p className="text-[9px] text-[#9c958a]">Use {'{tenant}'} to insert the ministry name.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Description</label>
          <textarea value={config.hero?.description || ''} onChange={e => updateHero({ description: e.target.value })} rows={3} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Short description..." />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#9c958a] uppercase tracking-wider flex items-center gap-1"><Image className="w-3 h-3" /> Hero Background Image URL</label>
          <input value={config.hero?.backgroundImage || ''} onChange={e => updateHero({ backgroundImage: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="https://..." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 p-3 rounded-lg bg-[rgba(243,238,228,0.02)] border border-[rgba(243,238,228,0.05)]">
            <label className="text-[10px] text-white font-medium flex items-center gap-1"><Link className="w-3 h-3 text-[#c9a227]" /> Primary CTA</label>
            <div className="grid grid-cols-2 gap-2">
              <input value={config.hero?.primaryCta?.text || ''} onChange={e => updateHero({ primaryCta: { ...config.hero?.primaryCta, text: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Text" />
              <input value={config.hero?.primaryCta?.link || ''} onChange={e => updateHero({ primaryCta: { ...config.hero?.primaryCta, link: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="/live" />
            </div>
          </div>
          <div className="space-y-2 p-3 rounded-lg bg-[rgba(243,238,228,0.02)] border border-[rgba(243,238,228,0.05)]">
            <label className="text-[10px] text-white font-medium flex items-center gap-1"><Link className="w-3 h-3 text-[#c9a227]" /> Secondary CTA</label>
            <div className="grid grid-cols-2 gap-2">
              <input value={config.hero?.secondaryCta?.text || ''} onChange={e => updateHero({ secondaryCta: { ...config.hero?.secondaryCta, text: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Text" />
              <input value={config.hero?.secondaryCta?.link || ''} onChange={e => updateHero({ secondaryCta: { ...config.hero?.secondaryCta, link: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="/archive" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Community CTA Text</label>
            <input value={config.hero?.communityCta?.text || ''} onChange={e => updateHero({ communityCta: { ...config.hero?.communityCta, text: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Join the Community" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Community CTA Subtext</label>
            <input value={config.hero?.communityCta?.subtext || ''} onChange={e => updateHero({ communityCta: { ...config.hero?.communityCta, subtext: e.target.value } })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Thousands of listeners online" />
          </div>
        </div>
      </div>

      {/* Brand & Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] space-y-4">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2"><Church className="w-3.5 h-3.5 text-[#c9a227]" /> Brand</h3>
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Tagline</label>
            <input value={config.brand?.tagline || ''} onChange={e => updateBrand({ tagline: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="The Voice of Redemption" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] space-y-4">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[#c9a227]" /> Footer</h3>
          <div className="space-y-1">
            <label className="text-[10px] text-[#9c958a] uppercase tracking-wider">Brand Statement</label>
            <input value={config.footer?.brandStatement || ''} onChange={e => updateFooter({ brandStatement: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="A Digital Ministry of<br />The Redemption Project" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-[#9c958a] uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</label>
              <input value={config.footer?.location || ''} onChange={e => updateFooter({ location: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Lagos, Nigeria" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9c958a] uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3" /> Contact Email</label>
              <input value={config.footer?.email || ''} onChange={e => updateFooter({ email: e.target.value })} className="w-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="email@church.com" />
            </div>
          </div>
        </div>
      </div>

      {/* Section Visibility */}
      <div className="p-4 rounded-xl bg-[#14141a] border border-[rgba(243,238,228,0.06)] space-y-3">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-[#c9a227]" /> Visible Sections</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {([
            ['showTestimonies', 'Testimonies'],
            ['showPrayerWall', 'Prayer Wall'],
            ['showEvents', 'Events'],
            ['showDonations', 'Donations'],
            ['showGuestSpeakers', 'Guest Speakers'],
            ['showTranscripts', 'Transcripts'],
            ['showCommunityCta', 'Community CTA']
          ] as [keyof HomeConfig['sections'], string][]).map(([key, label]) => (
            <button key={key} type="button" onClick={() => updateSections({ [key]: !config.sections?.[key] } as any)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${config.sections?.[key] ? 'bg-[rgba(201,162,39,0.12)] border-[rgba(201,162,39,0.25)] text-[#c9a227]' : 'bg-[rgba(243,238,228,0.03)] border-[rgba(243,238,228,0.06)] text-[#9c958a]'}`}>
              {config.sections?.[key] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {label}
            </button>
          ))}
        </div>
      </div>
    </form>
  )
}
