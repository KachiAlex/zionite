import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Radio, Users, BookOpen, Heart } from 'lucide-react'

interface ChurchOnlinePlayerProps {
  churchId: string
  showChat?: boolean
  showBible?: boolean
  showPrayer?: boolean
  className?: string
}

export function ChurchOnlinePlayer({
  churchId,
  showChat = true,
  showBible = true,
  showPrayer = true,
  className = '',
}: ChurchOnlinePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'main' | 'chat' | 'bible' | 'prayer'>('main')

  const embedUrl = `https://live.churchonlineplatform.com/${churchId}`

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe) {
      iframe.onload = () => setIsLoading(false)
    }
  }, [])

  return (
    <div className={`flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-600" />
          <span className="font-semibold text-gray-900">Live Stream</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Users className="w-4 h-4" />
          <span>via Church Online Platform</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Player */}
        <div className="flex-1 relative bg-black">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={embedUrl}
            className="w-full h-full min-h-[400px]"
            allow="autoplay; fullscreen; microphone; camera"
            allowFullScreen
            title="Church Online Platform Stream"
          />
        </div>

        {/* Side Panel */}
        {(showChat || showBible || showPrayer) && (
          <div className="w-80 border-l border-gray-200 flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {showChat && (
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'chat'
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Chat
                </button>
              )}
              {showBible && (
                <button
                  onClick={() => setActiveTab('bible')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'bible'
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <BookOpen className="w-4 h-4 inline mr-1" />
                  Bible
                </button>
              )}
              {showPrayer && (
                <button
                  onClick={() => setActiveTab('prayer')}
                  className={`flex-1 px-3 py-2 text-sm font-medium ${
                    activeTab === 'prayer'
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Heart className="w-4 h-4 inline mr-1" />
                  Prayer
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {activeTab === 'chat' && (
                <div className="text-sm text-gray-600">
                  <p className="mb-2">Join the conversation in the Church Online Platform chat.</p>
                  <p className="text-gray-400">Chat messages appear in the main video area.</p>
                </div>
              )}
              {activeTab === 'bible' && (
                <div className="text-sm text-gray-600">
                  <p className="mb-2">Scripture references are linked in the video player.</p>
                  <p className="text-gray-400">Click on any verse reference to view it.</p>
                </div>
              )}
              {activeTab === 'prayer' && (
                <div className="text-sm text-gray-600">
                  <p className="mb-2">Submit prayer requests through the video player.</p>
                  <p className="text-gray-400">Your prayer team will be notified.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function RTMPBroadcaster({
  onStart,
  onStop,
  isStreaming,
}: {
  onStart: () => void
  onStop: () => void
  isStreaming: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200">
      <button
        onClick={isStreaming ? onStop : onStart}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
          isStreaming
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
      >
        {isStreaming ? (
          <>
            <MicOff className="w-5 h-5" />
            Stop Broadcast
          </>
        ) : (
          <>
            <Mic className="w-5 h-5" />
            Go Live
          </>
        )}
      </button>
      
      {isStreaming && (
        <div className="flex items-center gap-2 text-red-600 animate-pulse">
          <Radio className="w-5 h-5" />
          <span className="font-medium">LIVE</span>
        </div>
      )}
    </div>
  )
}
