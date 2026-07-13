import { createBot } from './bot.js'

const token = process.env.TELEGRAM_BOT_TOKEN
const apiKey = process.env.OPENROUTER_API_KEY

if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY')

const bot = createBot(token)

bot.catch((err) => {
  console.error('Bot error:', err)
})

console.log('🛌 NeoSleep Telegram bot starting...')
bot.start()
