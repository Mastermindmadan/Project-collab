import dotenv from 'dotenv';
dotenv.config();

export interface KeyHealth {
  status: 'ok' | 'degraded' | 'exhausted' | 'unavailable';
  activeKeyIndex: number;
  exhaustedKeysCount: number;
}

export class GeminiKeyManager {
  private static exhaustedIndices: Set<number> = new Set();
  private static exhaustedAtMap: Map<number, number> = new Map();
  private static activeIndex: number = 0;
  // Cooldown period after which an exhausted key will be re-tested (e.g. 5 minutes)
  private static readonly EXHAUSTION_COOLDOWN_MS = 5 * 60 * 1000;

  /**
   * Helper to mask API keys for safe logging (e.g., AQ.A...Ly_A)
   */
  public static maskKey(key: string): string {
    if (!key || key.trim() === '') return '[NONE]';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '***';
    return `${trimmed.substring(0, 4)}...${trimmed.substring(trimmed.length - 4)}`;
  }

  /**
   * Retrieves array of API keys configured in GEMINI_API_KEYS (comma separated)
   * or falls back to single GEMINI_API_KEY.
   */
  public static getKeys(): string[] {
    const rawMultiple = process.env.GEMINI_API_KEYS;
    if (rawMultiple && rawMultiple.trim() !== '') {
      return rawMultiple
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    }

    const singleKey = process.env.GEMINI_API_KEY;
    if (singleKey && singleKey.trim() !== '') {
      return [singleKey.trim()];
    }

    return [];
  }

  /**
   * Gets the current active key and its index.
   * Automatically bypasses exhausted keys and handles cooldown resets.
   */
  public static getActiveKey(): { key: string; index: number } | null {
    const keys = this.getKeys();
    if (keys.length === 0) return null;

    const now = Date.now();

    // Check if any exhausted keys passed their cooldown
    for (const idx of Array.from(this.exhaustedIndices)) {
      const time = this.exhaustedAtMap.get(idx) || 0;
      if (now - time > this.EXHAUSTION_COOLDOWN_MS) {
        this.exhaustedIndices.delete(idx);
        this.exhaustedAtMap.delete(idx);
        console.log(`[GeminiKeyManager] Cooldown expired for key index ${idx} (${this.maskKey(keys[idx])}). Marked available again.`);
      }
    }

    // Try to find the first non-exhausted key starting from activeIndex
    for (let i = 0; i < keys.length; i++) {
      const candidateIdx = (this.activeIndex + i) % keys.length;
      if (!this.exhaustedIndices.has(candidateIdx)) {
        this.activeIndex = candidateIdx;
        return { key: keys[candidateIdx], index: candidateIdx };
      }
    }

    // All keys are currently exhausted
    return null;
  }

  /**
   * Marks a specific key index as exhausted (e.g. after receiving 429 / RESOURCE_EXHAUSTED).
   * Switches to next available key index and logs the change.
   */
  public static markExhausted(index: number, errorDetails?: string): void {
    const keys = this.getKeys();
    if (index < 0 || index >= keys.length) return;

    if (!this.exhaustedIndices.has(index)) {
      this.exhaustedIndices.add(index);
      this.exhaustedAtMap.set(index, Date.now());
      const masked = this.maskKey(keys[index]);
      console.warn(
        `[GeminiKeyManager] Key index ${index} (${masked}) encountered HTTP 429 / RESOURCE_EXHAUSTED${
          errorDetails ? `: ${errorDetails}` : ''
        }. Marked as temporarily exhausted.`
      );
    }

    // Find next non-exhausted key
    let switched = false;
    for (let i = 1; i <= keys.length; i++) {
      const nextIdx = (index + i) % keys.length;
      if (!this.exhaustedIndices.has(nextIdx)) {
        console.log(
          `[GeminiKeyManager] Automatically switching active key: Index ${index} (${this.maskKey(
            keys[index]
          )}) -> Index ${nextIdx} (${this.maskKey(keys[nextIdx])})`
        );
        this.activeIndex = nextIdx;
        switched = true;
        break;
      }
    }

    if (!switched) {
      console.error(`[GeminiKeyManager] All ${keys.length} Gemini API key(s) are currently exhausted.`);
    }
  }

  /**
   * Returns current health metrics for GET /api/ai/health
   */
  public static getHealth(): KeyHealth {
    const keys = this.getKeys();
    const totalCount = keys.length;
    const exhaustedCount = this.exhaustedIndices.size;

    let status: 'ok' | 'degraded' | 'exhausted' | 'unavailable' = 'ok';
    let activeKeyIndex = -1;

    if (totalCount === 0) {
      status = 'unavailable';
    } else if (exhaustedCount >= totalCount) {
      status = 'exhausted';
      activeKeyIndex = -1;
    } else {
      const active = this.getActiveKey();
      activeKeyIndex = active ? active.index : -1;
      if (exhaustedCount > 0) {
        status = 'degraded';
      } else {
        status = 'ok';
      }
    }

    return {
      status,
      activeKeyIndex,
      exhaustedKeysCount: exhaustedCount,
    };
  }

  /**
   * Reset all key states (primarily for testing/admin purposes)
   */
  public static reset(): void {
    this.exhaustedIndices.clear();
    this.exhaustedAtMap.clear();
    this.activeIndex = 0;
  }
}
