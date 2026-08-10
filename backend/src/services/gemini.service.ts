import axios from 'axios';

export class GeminiService {
  private static getApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  /**
   * Calls Google Gemini API with prompt and returns generated JSON object.
   * If Gemini API call fails or quota limit is reached, gracefully falls back to the dynamic generator.
   */
  static async generateStructuredJson<T>(
    prompt: string,
    fallbackGenerator: () => T,
    allowFallback: boolean = true
  ): Promise<T> {
    const apiKey = this.getApiKey();
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    if (apiKey && apiKey.trim() !== '') {
      // Models to try in sequence if one returns a model-not-found error
      const candidateModels = Array.from(new Set([
        configuredModel,
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash',
        'gemini-flash-latest'
      ]));

      for (const modelName of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey.trim()}`;
          
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
            // Strip codeblock markdown if present
            const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanText) as T;
            return parsed;
          }
        } catch (error: any) {
          const status = error.response?.status;
          const errMsg = error.response?.data?.error?.message || error.message;
          console.warn(`[GeminiService] Model '${modelName}' returned error (${status}): ${errMsg}`);

          // If quota exceeded or forbidden, break early to fallback generator
          if (status === 429 || status === 403) {
            console.warn('[GeminiService] Gemini API quota limit or key restriction encountered. Utilizing dynamic input-driven analysis engine.');
            break;
          }
        }
      }
    } else {
      console.info('[GeminiService] GEMINI_API_KEY not configured. Using dynamic input-driven analysis engine.');
    }

    if (!allowFallback) {
      throw new Error('Gemini analysis is unavailable. Check the Gemini API key, quota, and model configuration.');
    }

    // Return dynamically generated analysis matching exact user inputs only for
    // product flows that explicitly support an estimated fallback.
    return fallbackGenerator();
  }
}
