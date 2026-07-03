import { createServer } from 'http'
import app from './index.js'
import { initWebSocket } from './websocket.js'
import { initRadioScheduler } from './sermon-radio.js'

const PORT = Number(process.env.PORT) || 3001

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason)
})

const server = createServer(app)
initWebSocket(server)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  initRadioScheduler(60000)
})
