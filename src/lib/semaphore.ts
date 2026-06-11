/**
 * 简易信号量实现 - 用于并发控制
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void>;

  constructor(permits: number) {
    this.permits = permits;
    this.queue = [];
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }
}
