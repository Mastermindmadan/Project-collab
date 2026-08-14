import crypto from 'crypto';
import prisma from '../utils/prisma';
import { IAIProvider, GenerateOptions } from './providers/aiProvider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiKeyManager } from './geminiKeyManager';

const db = prisma as any;

export interface RouterOptions extends GenerateOptions {
  feature?: 'planner' | 'analyzer' | 'risk' | 'aipm' | 'general';
  userId?: string;
  bypassCache?: boolean;
  ttlSeconds?: number;
}

export interface RouterResponse<T = any> {
  data: T;
  provider: 'gemini' | 'groq' | 'openai';
  cached: boolean;
  activeKeyIndex?: number;
}

export class AIRouterService {
  private static geminiProvider = new GeminiProvider();
  private static groqProvider = new GroqProvider();
  private static openAIProvider = new OpenAIProvider();

  private static lastActiveProvider: 'gemini' | 'groq' | 'openai' = 'gemini';
  private static lastFallbackTime: string | null = null;
  private static cacheHitCount = 0;

  public static readonly FEATURE_LIMITS: Record<string, number> = {
    planner: 5,
    analyzer: 5,
    risk: 5,
    aipm: 3,
  };

  /**
   * Generates a deterministic hash for prompt + options to serve as cacheKey
   */
  private static generateCacheKey(prompt: string, options?: RouterOptions): string {
    const payload = JSON.stringify({
      prompt: prompt.trim(),
      systemPrompt: options?.systemPrompt,
      feature: options?.feature,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Checks if user has exceeded daily usage limit for a feature.
   */
  public static async checkUsageLimit(userId: string, feature: string): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limit = this.FEATURE_LIMITS[feature] ?? 50;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    try {
      const used = await db.aIUsage.count({
        where: {
          userId,
          feature,
          usedAt: { gte: startOfDay },
        },
      });
      return { allowed: used < limit, used, limit };
    } catch {
      return { allowed: true, used: 0, limit };
    }
  }

  /**
   * Records feature usage for user
   */
  public static async recordUsage(userId: string, feature: string): Promise<void> {
    try {
      await db.aIUsage.create({
        data: {
          userId,
          feature,
          usedAt: new Date(),
        },
      });
    } catch (err: any) {
      console.warn('[AI] Failed to record usage:', err?.message);
    }
  }

  /**
   * Gets aggregated daily usage counts for a user
   */
  public static async getUserDailyUsage(userId: string): Promise<Record<string, { used: number; limit: number }>> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result: Record<string, { used: number; limit: number }> = {};

    for (const [feature, limit] of Object.entries(this.FEATURE_LIMITS)) {
      try {
        const used = await db.aIUsage.count({
          where: {
            userId,
            feature,
            usedAt: { gte: startOfDay },
          },
        });
        result[feature] = { used, limit };
      } catch {
        result[feature] = { used: 0, limit };
      }
    }
    return result;
  }

  /**
   * Main router for generating JSON from prompt with automatic provider fallback, caching, and rate limit checks.
   */
  public static async generateJSON<T = any>(
    prompt: string,
    fallbackGenerator?: () => T,
    options?: RouterOptions
  ): Promise<RouterResponse<T>> {
    // 1. Check Usage Limits
    if (options?.userId && options?.feature && this.FEATURE_LIMITS[options.feature]) {
      const { allowed, used, limit } = await this.checkUsageLimit(options.userId, options.feature);
      if (!allowed) {
        throw new Error(
          `RATE_LIMIT_EXCEEDED: You have reached your daily quota of ${limit} requests for ${options.feature.toUpperCase()}. Please try again tomorrow.`
        );
      }
    }

    // 2. Check Cache
    const cacheKey = this.generateCacheKey(prompt, options);
    if (!options?.bypassCache) {
      try {
        const cachedEntry = await db.aICache.findUnique({ where: { cacheKey } });
        if (cachedEntry) {
          const expired = cachedEntry.expiresAt && new Date(cachedEntry.expiresAt).getTime() < Date.now();
          if (!expired) {
            this.cacheHitCount++;
            console.log(`[AI] Cache hit for ${options?.feature || 'request'} (key: ${cacheKey.slice(0, 8)})`);
            return {
              data: cachedEntry.response as T,
              provider: (cachedEntry.provider as any) || this.lastActiveProvider,
              cached: true,
            };
          }
        }
      } catch {
        // Ignore cache lookup errors
      }
    }

    // 3. Provider Order: Gemini (all keys) -> Groq -> OpenAI
    const providers: Array<{ name: 'gemini' | 'groq' | 'openai'; instance: IAIProvider }> = [
      { name: 'gemini', instance: this.geminiProvider },
      { name: 'groq', instance: this.groqProvider },
      { name: 'openai', instance: this.openAIProvider },
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      if (!p.instance.isAvailable()) {
        continue;
      }

      try {
        if (this.lastActiveProvider !== p.name && i > 0) {
          console.warn(`[AI] Switching from ${this.lastActiveProvider} to ${p.name}`);
          this.lastFallbackTime = new Date().toISOString();
        }

        const data = await p.instance.generateJSON<T>(prompt, undefined, options);
        this.lastActiveProvider = p.name;

        // Record usage for user
        if (options?.userId && options?.feature) {
          await this.recordUsage(options.userId, options.feature);
        }

        // Save Cache
        try {
          const ttlMs = (options?.ttlSeconds ?? 86400) * 1000;
          const expiresAt = new Date(Date.now() + ttlMs);
          await db.aICache.upsert({
            where: { cacheKey },
            update: { response: data as any, provider: p.name, expiresAt },
            create: { cacheKey, response: data as any, provider: p.name, expiresAt },
          });
        } catch {
          // Ignore cache write errors
        }

        const activeKeyObj = p.name === 'gemini' ? GeminiKeyManager.getActiveKey() : null;

        return {
          data,
          provider: p.name,
          cached: false,
          activeKeyIndex: activeKeyObj?.index,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[AI] Provider ${p.name} failed: ${err.message || err}`);
      }
    }

    // 4. Fallback Generator (if all providers fail)
    if (fallbackGenerator) {
      console.warn('[AI] All providers failed. Executing dynamic fallback engine.');
      const data = fallbackGenerator();
      return {
        data,
        provider: 'gemini',
        cached: false,
      };
    }

    throw lastError || new Error('All AI providers are currently unavailable.');
  }

  /**
   * Trims conversation messages to send only last 6 + compressed summary for token optimization
   */
  public static buildTrimmedConversationPrompt(
    messages: Array<{ role: string; content: string }>,
    userPrompt: string
  ): string {
    if (messages.length <= 6) {
      const historyStr = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      return `${historyStr}\nUser: ${userPrompt}`;
    }

    const olderMessages = messages.slice(0, messages.length - 6);
    const recentMessages = messages.slice(messages.length - 6);

    const summaryItems = olderMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}`)
      .join(' | ');

    const recentStr = recentMessages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

    return `[Summary of earlier discussion: ${summaryItems}]\n\n${recentStr}\nUser: ${userPrompt}`;
  }

  /**
   * Health and Diagnostics telemetry report
   */
  public static async getHealthReport() {
    const health = GeminiKeyManager.getHealth();
    let cacheCount = 0;

    try {
      cacheCount = await db.aICache.count();
    } catch {
      cacheCount = 0;
    }

    return {
      status: 'ok',
      activeProvider: this.lastActiveProvider,
      activeKeyIndex: health.activeKeyIndex,
      totalGeminiKeys: health.totalKeys,
      activeKeyDisplay: health.activeKeyDisplay,
      exhaustedKeysCount: health.exhaustedKeysCount,
      cacheEnabled: true,
      cachedEntriesTotal: cacheCount,
      cacheHitCount: this.cacheHitCount,
      lastFallbackTime: this.lastFallbackTime,
      availableProviders: {
        gemini: this.geminiProvider.isAvailable(),
        groq: this.groqProvider.isAvailable(),
        openai: this.openAIProvider.isAvailable(),
      },
      // Whether each provider has a key configured in the environment (presence
      // only — actual keys are NEVER exposed to the frontend).
      configuredProviders: {
        gemini: GeminiKeyManager.getKeys().length > 0,
        groq: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()),
        openai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
      },
    };
  }
}
