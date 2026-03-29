/**
 * lib/ai/groq.ts
 *
 * Groq API wrapper for text-based AI tasks. SERVER-ONLY.
 * Uses Llama 3.3-70B Versatile model.
 *
 * Used for: weekly reports, lyrics transliteration/translation/summarization,
 * pitch check interpretation.
 *
 * Environment variable required: GROQ_API_KEY
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call the Groq API with a chat completion request.
 * Returns the text content of the first choice.
 *
 * @throws Error if GROQ_API_KEY is not configured or the API call fails.
 */
export async function callGroq(
  messages: GroqMessage[],
  options: GroqOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.startsWith('REPLACE_')) {
    throw new Error(
      'GROQ_API_KEY is not configured. Set it in .env.local. ' +
      'Get a key from https://console.groq.com/keys'
    );
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Groq API returned empty content');
  }

  return content;
}

/**
 * Convenience: call Groq with a system prompt and a user message.
 */
export async function callGroqSimple(
  systemPrompt: string,
  userMessage: string,
  options: GroqOptions = {}
): Promise<string> {
  return callGroq(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    options
  );
}
