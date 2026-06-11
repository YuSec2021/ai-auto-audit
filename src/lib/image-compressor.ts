/**
 * 图片压缩模块
 * 使用 sharp 压缩图片，在不损失画面完整性的前提下尽可能减小文件体积
 */
import sharp from "sharp";

interface CompressedImage {
  /** 压缩后的 base64 data URL */
  dataUrl: string;
  /** 原始大小（字节） */
  originalSize: number;
  /** 压缩后大小（字节） */
  compressedSize: number;
  /** 压缩比 */
  ratio: number;
  /** 是否为新生成的文件（用于清理） */
  isLocalFile: boolean;
  /** 临时文件路径（如果有） */
  tempPath?: string;
}

/**
 * 判断是否为远程URL
 */
function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * 判断是否为 base64 data URL
 */
function isBase64Url(url: string): boolean {
  return url.startsWith("data:image/");
}

/**
 * 获取图片扩展名
 */
function getImageFormat(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);/);
  return match ? match[1] : "jpeg";
}

/**
 * 压缩图片
 * @param imageUrl 图片URL或base64 data URL
 * @param maxWidth 最大宽度（默认1920）
 * @param quality 质量（1-100，默认80）
 * @returns 压缩后的信息
 */
export async function compressImage(
  imageUrl: string,
  maxWidth: number = 1920,
  quality: number = 80
): Promise<CompressedImage> {
  let inputBuffer: Buffer;
  let originalSize: number;

  // 1. 获取图片数据
  if (isRemoteUrl(imageUrl)) {
    // 远程URL：下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    inputBuffer = Buffer.from(await response.arrayBuffer());
    originalSize = inputBuffer.length;
  } else if (isBase64Url(imageUrl)) {
    // Base64 data URL：解码
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    inputBuffer = Buffer.from(base64Data, "base64");
    originalSize = inputBuffer.length;
  } else {
    // 假设是文件路径
    const { readFileSync } = await import("fs");
    inputBuffer = readFileSync(imageUrl);
    originalSize = inputBuffer.length;
  }

  // 2. 使用 sharp 压缩
  // 策略：
  // - PNG 转 JPEG（大幅减小体积）
  // - 限制最大宽度
  // - 质量压缩
  // - 移除元数据
  let compressedBuffer: Buffer;
  const format = getImageFormat(imageUrl.startsWith("data:") ? imageUrl : "");

  // 获取图片元信息
  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || 0;
  const inputFormat = metadata.format || format;

  // 如果图片宽度超过限制，进行缩放
  const shouldResize = width > maxWidth;
  const resizeOptions = shouldResize ? { width: maxWidth } : {};

  // 根据格式选择最佳压缩策略
  // 构建处理链
  let pipeline = sharp(inputBuffer);
  if (shouldResize) {
    pipeline = pipeline.resize({ width: maxWidth });
  }
  // 移除元数据并压缩
  pipeline = pipeline.withMetadata(false);
  if (inputFormat === "png") {
    // PNG -> JPEG 压缩效果最好
    compressedBuffer = await pipeline.jpeg({ quality, progressive: true }).toBuffer();
  } else if (inputFormat === "webp") {
    // WebP 保持格式，但压缩
    compressedBuffer = await pipeline.webp({ quality }).toBuffer();
  } else {
    // JPEG/JPG 使用标准压缩
    compressedBuffer = await pipeline.jpeg({ quality, progressive: true }).toBuffer();
  }

  const compressedSize = compressedBuffer.length;
  const ratio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

  // 3. 转换为 base64 data URL
  const outputFormat = inputFormat === "png" ? "jpeg" : (inputFormat || "jpeg");
  const dataUrl = `data:image/${outputFormat};base64,${compressedBuffer.toString("base64")}`;

  return {
    dataUrl,
    originalSize,
    compressedSize,
    ratio,
    isLocalFile: false,
  };
}

/**
 * 批量压缩图片
 * @param urls 图片URL列表
 * @param maxWidth 最大宽度
 * @param quality 质量
 * @param concurrency 并发数
 */
export async function compressImages(
  urls: string[],
  maxWidth: number = 1920,
  quality: number = 80,
  concurrency: number = 3
): Promise<CompressedImage[]> {
  const semaphore = new Semaphore(concurrency);

  const compressWithSemaphore = async (url: string): Promise<CompressedImage> => {
    await semaphore.acquire();
    try {
      return await compressImage(url, maxWidth, quality);
    } finally {
      semaphore.release();
    }
  };

  return Promise.all(urls.map(url => compressWithSemaphore(url).catch(e => {
    console.warn(`[ImageCompressor] 压缩图片失败: ${url}, 错误: ${e.message}`);
    // 失败时返回原始URL作为fallback
    return {
      dataUrl: url,
      originalSize: 0,
      compressedSize: 0,
      ratio: 0,
      isLocalFile: false,
    };
  })));
}

/**
 * 简易信号量实现
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
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
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
