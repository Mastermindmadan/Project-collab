export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIProviderResponse<T = any> {
  provider: 'gemini' | 'groq' | 'openai';
  text?: string;
  data?: T;
}

export interface IAIProvider {
  readonly name: 'gemini' | 'groq' | 'openai';
  isAvailable(): boolean;
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateJSON<T = any>(prompt: string, schemaDescription?: string, options?: GenerateOptions): Promise<T>;
}
