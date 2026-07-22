import { registerPlugin, PluginListenerHandle } from '@capacitor/core'

export interface SystemAudioPlugin {
  startCapture(): Promise<{ started: boolean; sampleRate: number }>
  stopCapture(): Promise<{ stopped: boolean }>
  isSupported(): Promise<{ supported: boolean }>
  addListener(
    eventName: 'audioChunk',
    listenerFunc: (data: { data: string; sampleRate: number; channels: number }) => void
  ): Promise<PluginListenerHandle>
}

const SystemAudio = registerPlugin<SystemAudioPlugin>('SystemAudio')

export default SystemAudio
