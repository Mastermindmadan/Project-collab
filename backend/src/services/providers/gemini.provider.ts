import axios from 'axios';
import { IAIProvider, GenerateOptions } from './aiProvider.interface';
import { GeminiKeyManager } from '../geminiKeyManager';

export class GeminiProvider implements IAIProvider {
  public readonly name = 'gemini' as const;

  public isAvailable(): boolean {
    return GeminiKeyManager.getActiveKey() !== null;
  }

  public async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const candidateModels = Array.from(
      new Set([
        configuredModel,
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
      ])
    );

    const keys = GeminiKeyManager.getKeys();
    const maxAttempts = Math.max(keys.length, 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const activeKeyObj = GeminiKeyManager.getActiveKey();
      if (!activeKeyObj) {
        throw new Error('RESOURCE_EXHAUSTED: All Gemini API keys are currently exhausted.');
      }

      const { key, index: keyIndex } = activeKeyObj;
      let keyFailedWithRateLimit = false;

      for (const modelName of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
          const contentsParts: any[] = [];
          if (options?.systemPrompt) {
            contentsParts.push({ text: `System Instruction: ${options.systemPrompt}` });
          }
          contentsParts.push({ text: prompt });

          const response = await axios.post(
            url,
            {
              contents: [{ parts: contentsParts }],
              generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens ?? 2048,
              },
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 25000,
            }
          );

          const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            return rawText.trim();
          }
        } catch (error: any) {
          const status = error.response?.status;
          const errMsg = error.response?.data?.error?.message || error.message || '';
          const isKeyError =
            status === 429 ||
            status === 403 ||
            status === 401 ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.toLowerCase().includes('quota') ||
            errMsg.toLowerCase().includes('denied access') ||
            errMsg.toLowerCase().includes('rate limit');

          if (isKeyError) {
            keyFailedWithRateLimit = true;
            console.warn(`[AI] Gemini key ${keyIndex} (${GeminiKeyManager.maskKey(key)}) exhausted (${status}): ${errMsg}`);
            GeminiKeyManager.markExhausted(keyIndex, errMsg);
            break;
          }
        }
      }

      if (!keyFailedWithRateLimit) {
        break;
      }
    }

    throw new Error('RESOURCE_EXHAUSTED: All Gemini models/keys failed.');
  }

  public async generateJSON<T = any>(
    prompt: string,
    _schemaDescription?: string,
    options?: GenerateOptions
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: Respond strictly in valid JSON format. Do NOT wrap in markdown backticks \`\`\`json \`\`\` and do NOT include any introductory or concluding text.`;
    const text = await this.generateText(jsonPrompt, options);
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  }
}
