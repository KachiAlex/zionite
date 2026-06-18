import serverless from 'serverless-http'
import app from '../backend/dist/index.js'
export default serverless(app)
