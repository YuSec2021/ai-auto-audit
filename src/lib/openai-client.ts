/**
 * 阿里云百炼 OpenAI 兼容客户端
 * 使用官方 OpenAI SDK，配置 DashScope 作为 baseURL
 */
import OpenAI from "openai";

let _openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY environment variable is not set");
    }
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeout: 120 * 1000, // 120秒超时
      maxRetries: 3,
    });
  }
  return _openaiClient;
}
