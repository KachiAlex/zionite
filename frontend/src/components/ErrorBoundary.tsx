import { Component, type ReactNode } from 'react'
import { Radio, RefreshCw, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    // If Sentry is configured, capture here
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      ;(window as any).Sentry.captureException(error, { extra: errorInfo })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--ink)', color: 'var(--parchment)' }}>
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#c9a227]/10 border border-[#c9a227]/20 flex items-center justify-center mx-auto mb-6">
              <Radio className="w-8 h-8 text-[#c9a227]" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Something went wrong</h1>
            <p className="text-sm text-[#9c958a] mb-6">We&apos;re sorry, an unexpected error occurred. Try refreshing the page or going back home.</p>
            {this.state.error && (
              <div className="mb-6 p-3 rounded-lg bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] text-left">
                <p className="text-[10px] text-[#9c958a] font-mono break-all">{this.state.error.message}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all duration-300 bg-[#c9a227] text-[#1b1208] hover:bg-[#e0bd5a]"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <Link to="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium border transition-colors"
                style={{ borderColor: 'var(--line)', color: 'var(--parchment)' }}
              >
                <Home className="w-4 h-4" /> Home
              </Link>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
