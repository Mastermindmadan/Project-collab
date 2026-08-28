import axios from 'axios';
import { GeminiKeyManager } from './geminiKeyManager';

export class GeminiService {
  /**
   * Calls Google Gemini API with prompt and returns generated JSON object.
   * Supports automatic API key failover across multiple GEMINI_API_KEYS on HTTP 429 / RESOURCE_EXHAUSTED.
   */
  static async generateStructuredJson<T>(
    prompt: string,
    fallbackGenerator: () => T,
    allowFallback: boolean = true
  ): Promise<T> {
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const candidateModels = Array.from(new Set([
      configuredModel,
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ]));

    // Maximum attempts equal to number of configured keys (or 1 if none)
    const keys = GeminiKeyManager.getKeys();
    const maxAttempts = Math.max(keys.length, 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const activeKeyObj = GeminiKeyManager.getActiveKey();

      if (!activeKeyObj) {
        console.warn('[GeminiService] No active/available Gemini API key found (all keys exhausted or missing).');
        break;
      }

      const { key, index: keyIndex } = activeKeyObj;
      let keyFailedWithRateLimit = false;

      for (const modelName of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

          const response = await axios.post(
            url,
            {
              contents: [
                {
                  parts: [
                    {
                      text: prompt + "\n\nCRITICAL INSTRUCTION: Respond strictly in valid JSON format. Do NOT wrap in markdown backticks ```json ``` and do NOT include any introductory or concluding text."
                    }
                  ]
                }
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.7,
                maxOutputTokens: 2048,
              }
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 25000 // 25s timeout
            }
          );

          const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText) as T;
            return parsed;
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

          console.warn(
            `[GeminiService] Model '${modelName}' with key index ${keyIndex} (${GeminiKeyManager.maskKey(key)}) returned error (${status}): ${errMsg}`
          );

          if (isKeyError) {
            keyFailedWithRateLimit = true;
            GeminiKeyManager.markExhausted(keyIndex, errMsg);
            break; // Break model loop to retry with next key in key loop
          }
        }
      }

      // If key succeeded, execution returned above.
      // If key failed with 429, GeminiKeyManager.markExhausted switched to next key, loop continues.
      // If key failed with non-429 error and didn't trigger rate limit, break key loop to fallback.
      if (!keyFailedWithRateLimit) {
        break;
      }
    }

    if (!allowFallback) {
      throw new Error('AI service temporarily unavailable');
    }

    console.info('[GeminiService] Using dynamic input-driven fallback engine.');
    return fallbackGenerator();
  }
}
