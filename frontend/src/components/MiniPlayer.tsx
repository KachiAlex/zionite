import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import { Play, Pause, X, Volume2, SkipBack, SkipForward } from 'lucide-react'

export default function MiniPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, stop, setVolume, seek } = useAudioPlayer()
  if (!currentTrack) return null

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const pct = duration ? (progress / duration) * 100 : 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[rgba(243,238,228,0.08)] bg-[#111118]/95 backdrop-blur-md animate-slide-up">
      <div className="max-w-[1440px] mx-auto px-4 py-2 flex items-center gap-3">
        {currentTrack.thumbnail ? (
          <img src={currentTrack.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center flex-shrink-0">
            <Volume2 className="w-4 h-4 text-[#9c958a]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{currentTrack.title}</p>
          <p className="text-[10px] text-[#9c958a] truncate">{currentTrack.speaker}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-[#9c958a] font-mono">{formatTime(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
              className="flex-1 h-1 accent-[#c9a227] cursor-pointer"
              style={{ appearance: 'none', background: `linear-gradient(to right, #c9a227 ${pct}%, #2a2a3a ${pct}%)`, borderRadius: '2px' }}
            />
            <span className="text-[9px] text-[#9c958a] font-mono">{formatTime(duration)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-[#c9a227] flex items-center justify-center text-[#1b1208] transition-transform active:scale-95">
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button onClick={stop} className="w-8 h-8 rounded-full bg-[#1c1d24] border border-[rgba(243,238,228,0.08)] flex items-center justify-center text-[#9c958a] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
