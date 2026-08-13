import axios from 'axios';
import { IAIProvider, GenerateOptions } from './aiProvider.interface';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqProvider implements IAIProvider {
  public readonly name = 'groq' as const;

  private getKey(): string | null {
    const key = process.env.GROQ_API_KEY;
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  public isAvailable(): boolean {
    return this.getKey() !== null;
  }

  public async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const key = this.getKey();
    if (!key) throw new Error('RESOURCE_EXHAUSTED: GROQ_API_KEY is not configured.');

    const messages: any[] = [];
    if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await axios.post(
        GROQ_CHAT_COMPLETIONS_URL,
        {
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2048,
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 25000,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (content) return content.trim();
      throw new Error('Groq API returned empty message content.');
    } catch (error: any) {
      const status = error.response?.status;
      const errMsg = error.response?.data?.error?.message || error.message || '';
      console.warn(`[AI] Groq provider error (${status}): ${errMsg}`);
      throw new Error(`RESOURCE_EXHAUSTED: Groq provider failed (${status}): ${errMsg}`);
    }
  }

  public async generateJSON<T = any>(prompt: string, _schemaDescription?: string, options?: GenerateOptions): Promise<T> {
    const text = await this.generateText(
      `${prompt}\n\nCRITICAL INSTRUCTION: Respond strictly in valid JSON format without markdown backticks.`,
      options
    );
    return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim()) as T;
  }
}
