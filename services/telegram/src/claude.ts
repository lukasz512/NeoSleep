import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://neosleepcare.com',
    'X-Title': 'NeoSleep AI Team',
  },
})

const MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-5'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY = 20 // messages (10 exchanges)

export async function chat(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...history.slice(-MAX_HISTORY).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })

  return response.choices[0]?.message?.content ?? ''
}
