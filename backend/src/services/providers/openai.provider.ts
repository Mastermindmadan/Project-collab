import axios from 'axios';
import { IAIProvider, GenerateOptions } from './aiProvider.interface';

export class OpenAIProvider implements IAIProvider {
  public readonly name = 'openai' as const;

  public isAvailable(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  public async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.trim() === '') {
      throw new Error('RESOURCE_EXHAUSTED: OPENAI_API_KEY is not configured.');
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const messages: any[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${key.trim()}`,
            'Content-Type': 'application/json',
          },
          timeout: 25000,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (content) {
        return content.trim();
      }
      throw new Error('OpenAI API returned empty content.');
    } catch (error: any) {
      const status = error.response?.status;
      const errMsg = error.response?.data?.error?.message || error.message || '';
      console.warn(`[AI] OpenAI provider error (${status}): ${errMsg}`);
      throw new Error(`RESOURCE_EXHAUSTED: OpenAI provider failed (${status}): ${errMsg}`);
    }
  }

  public async generateJSON<T = any>(
    prompt: string,
    _schemaDescription?: string,
    options?: GenerateOptions
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: Respond strictly in valid JSON format without markdown backticks.`;
    const text = await this.generateText(jsonPrompt, options);
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  }
}
