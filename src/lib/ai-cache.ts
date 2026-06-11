/**
 * AI结果缓存服务
 * 按输入hash缓存AI结果，支持TTL过期
 */

import { createHash } from "crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * 创建缓存key
 */
function makeCacheKey(prefix: string, ...args: string[]): string {
  const input = args.join("|");
  const hash = createHash("sha256").update(input).digest("hex").substring(0, 16);
  return `${prefix}:${hash}`;
}

/**
 * AI结果缓存类
 */
export class AICache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;

  constructor(ttlSeconds = 3600) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * 获取缓存（自动清理过期项）
   */
  get<T>(key: string): T | null {
    this.cleanup();
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * 清理过期项
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 缓存统计
   */
  stats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: 0,
      misses: 0,
    };
  }
}

// 全局缓存实例
const globalCache = new AICache(3600); // 1小时TTL

export { globalCache, makeCacheKey };

/**
 * 缓存辅助函数：违禁词检测结果
 */
export function cacheKeyProhibited(title: string): string {
  return makeCacheKey("prohibited", title);
}

/**
 * 缓存辅助函数：品牌检测结果
 */
export function cacheKeyBrand(title: string): string {
  return makeCacheKey("brand", title);
}

/**
 * 缓存辅助函数：NER标准化结果
 */
export function cacheKeyNER(title: string): string {
  return makeCacheKey("ner", title);
}

/**
 * 缓存辅助函数：品牌一致性结果
 */
export function cacheKeyBrandMatch(mainBrand: string, mappedBrand: string): string {
  return makeCacheKey("brandMatch", mainBrand, mappedBrand);
}

/**
 * 缓存辅助函数：类目匹配结果
 */
export function cacheKeyCategory(title: string, categoryPath: string): string {
  return makeCacheKey("category", title, categoryPath);
}

/**
 * 缓存辅助函数：图片主体匹配结果
 */
export function cacheKeySubject(productName: string, imageSubject: string): string {
  return makeCacheKey("subject", productName, imageSubject);
}

/**
 * 缓存辅助函数：图片分析结果
 */
export function cacheKeyVision(imageUrl: string, productName: string, saleUnit: string): string {
  return makeCacheKey("vision", imageUrl, productName, saleUnit);
}
