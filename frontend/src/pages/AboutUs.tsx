import { Cross, Radio, Heart, Users, Mic2, Globe } from 'lucide-react'
import { usePageTitle } from '../hooks/usePageTitle'

export default function AboutUs() {
  usePageTitle('About')
  return (
    <div className="min-h-screen py-8 lg:py-12" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gold)' }}>
            <Cross className="w-8 h-8" style={{ color: '#1b1208' }} />
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>About ZioniteFM</h1>
          <p className="mt-2 max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
            The official digital radio ministry of The Redemption Project.
          </p>
        </div>

        {/* Mission */}
        <div className="mb-12 p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <h2 className="text-xl font-semibold mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Our Mission</h2>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--dim)' }}>
            ZioniteFM exists to broadcast the Gospel of Jesus Christ to the nations through powerful sermons, 
            worship, prayer, and life-transforming conversations. We believe in the power of media to reach 
            every heart, every home, and every community with the message of redemption.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--dim)' }}>
            As the digital radio ministry of The Redemption Project, we are committed to equipping believers, 
            reaching the lost, and building a community of faith that spans across borders and cultures.
          </p>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          {[
            { icon: Radio, title: 'Broadcasting Truth', desc: 'Reaching millions with the unfiltered Gospel message.' },
            { icon: Heart, title: 'Transforming Lives', desc: 'Prayer, teaching, and worship that changes destinies.' },
            { icon: Globe, title: 'Global Reach', desc: 'Connecting believers across nations and time zones.' },
          ].map(v => (
            <div key={v.title} className="p-5 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(201,162,39,0.08)' }}>
                <v.icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              </div>
              <h3 className="font-semibold mb-1">{v.title}</h3>
              <p className="text-xs" style={{ color: 'var(--dim)' }}>{v.desc}</p>
            </div>
          ))}
        </div>

        {/* What We Do */}
        <div className="mb-12 p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <h2 className="text-xl font-semibold mb-6" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>What We Do</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Mic2, title: 'Live Radio', desc: '24/7 streaming of worship, teaching, and prayer.' },
              { icon: Users, title: 'Community', desc: 'A global family united by faith and purpose.' },
              { icon: Cross, title: 'Discipleship', desc: 'Biblical resources for spiritual growth.' },
              { icon: Heart, title: 'Prayer', desc: 'An active prayer wall for requests and intercession.' },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ink)' }}>
                  <item.icon className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                </div>
                <div>
                  <h4 className="text-sm font-medium">{item.title}</h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="text-center p-8 rounded-2xl" style={{ background: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Get In Touch</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--dim)' }}>
            Have questions, feedback, or partnership inquiries? We would love to hear from you.
          </p>
          <a href="mailto:theredemptionprojectministries@gmail.com" className="btn-gold text-sm">Contact Us</a>
        </div>
      </div>
    </div>
  )
}
