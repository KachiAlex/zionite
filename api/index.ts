import serverless from 'serverless-http'

console.log('[API] cold start:', new Date().toISOString())
console.log('[API] NODE_ENV:', process.env.NODE_ENV)
console.log('[API] DATABASE_URL present:', !!process.env.DATABASE_URL)

// @ts-ignore
import app from './dist/index.js'
console.log('[API] app loaded OK')

export default serverless(app)
