import serverless from 'serverless-http'
// @ts-ignore
import app from '../backend/dist/index.js'
export default serverless(app)
