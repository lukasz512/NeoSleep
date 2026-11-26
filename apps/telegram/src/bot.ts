import { Bot, Context, session, SessionFlavor } from 'grammy'
import { SKILLS, SKILL_BY_COMMAND } from './skills.js'
import { chat, Message } from './claude.js'

interface SessionData {
  activeSkillId: string | null
  history: Message[]
}

type BotContext = Context & SessionFlavor<SessionData>

function buildHelpMessage(): string {
  const lines = [
    '🛌 *NeoSleep AI Team*',
    '',
    'Pick a team member to chat with:',
    '',
    ...SKILLS.map((s) => `${s.emoji} /${s.command} — *${s.name}* (${s.description})`),
    '',
    '📌 Other commands:',
    '/who — who is active',
    '/clear — reset conversation',
    '/help — this message',
  ]
  return lines.join('\n')
}

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLen))
    remaining = remaining.slice(maxLen)
  }
  return chunks
}

async function sendMarkdown(ctx: BotContext, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await ctx.reply(chunk, { parse_mode: 'Markdown' })
    } catch {
      // fallback: send without markdown if parsing fails
      await ctx.reply(chunk)
    }
  }
}

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token)

  bot.use(
    session({
      initial: (): SessionData => ({ activeSkillId: null, history: [] }),
    }),
  )

  // /start
  bot.command('start', async (ctx) => {
    await ctx.reply(buildHelpMessage(), { parse_mode: 'Markdown' })
  })

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(buildHelpMessage(), { parse_mode: 'Markdown' })
  })

  // /who — show active skill
  bot.command('who', async (ctx) => {
    const { activeSkillId, history } = ctx.session
    if (!activeSkillId) {
      await ctx.reply('No active skill. Use /help to pick one.')
      return
    }
    const skill = SKILLS.find((s) => s.id === activeSkillId)
    const exchanges = Math.floor(history.length / 2)
    await ctx.reply(
      `Active: ${skill?.emoji} *${skill?.fullName}*\nExchanges in session: ${exchanges}`,
      { parse_mode: 'Markdown' },
    )
  })

  // /clear — reset history
  bot.command('clear', async (ctx) => {
    ctx.session.history = []
    const skill = SKILLS.find((s) => s.id === ctx.session.activeSkillId)
    const name = skill ? `${skill.emoji} ${skill.name}` : 'current skill'
    await ctx.reply(`History cleared. ${name} is still active.`)
  })

  // Register one command per skill
  for (const skill of SKILLS) {
    bot.command(skill.command, async (ctx) => {
      ctx.session.activeSkillId = skill.id
      ctx.session.history = []
      await ctx.reply(
        `${skill.emoji} Switched to *${skill.fullName}*\n_${skill.description}_\n\nHistory cleared — what's your question?`,
        { parse_mode: 'Markdown' },
      )
    })
  }

  // Handle regular text messages
  bot.on('message:text', async (ctx) => {
    const { activeSkillId, history } = ctx.session

    if (!activeSkillId) {
      await ctx.reply('Pick a skill first — use /help to see the team.')
      return
    }

    const skill = SKILLS.find((s) => s.id === activeSkillId)
    if (!skill) return

    // Show typing indicator and keep refreshing it while Claude processes
    const typingInterval = setInterval(
      () => ctx.replyWithChatAction('typing').catch(() => {}),
      4000,
    )
    await ctx.replyWithChatAction('typing')

    try {
      const response = await chat(skill.systemPrompt, history, ctx.message.text)
      clearInterval(typingInterval)

      // Append to history
      ctx.session.history = [
        ...history,
        { role: 'user', content: ctx.message.text },
        { role: 'assistant', content: response },
      ]

      await sendMarkdown(ctx, response)
    } catch (err) {
      clearInterval(typingInterval)
      console.error('Claude API error:', err)
      await ctx.reply('⚠️ Error talking to Claude. Check your API key or try again.')
    }
  })

  return bot
}
