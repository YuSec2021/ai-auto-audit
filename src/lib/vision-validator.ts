/**
 * 视觉验证器
 * 使用 qwen3.6-plus 模型分析商品图片
 *
 * 检测内容：
 * 1. 图片违禁词检测
 * 2. 图片主体与商品名称匹配
 * 3. 图片主体数量与销售单位匹配
 */

import type { InputRow, AuditIssue } from "./audit-types";
import { safeStr, parseArrayField } from "./excel-parser";
import { Semaphore } from "./semaphore";
import { getOpenAIClient } from "./openai-client";
import { PROHIBITED_WORDS } from "./prohibited-words";
import { compressImage, compressImages, formatFileSize } from "./image-compressor";

export interface VisionAnalysisResult {
  imageUrl: string;
  imageIndex: number;
  subjects: string[];           // 检测到的主体
  subjectCount: number;         // 主体数量
  saleUnit: string;              // 销售单位
  prohibitedWords: string[];     // 违禁词列表
  subjectMatch: boolean;         // 主体与标题是否匹配
  countMatch: boolean;           // 数量与销售单位是否匹配
  matchScore: number;            // 匹配度 0-1
  rawResponse: string;           // 原始AI响应
  error?: string;
}

/**
 * 从 row 中提取所有图片URL（保持Excel列顺序）
 * 优先级：主图1 > 主图2 > ... > 主图6 > specImage > mainImages
 */
function extractImageUrls(row: InputRow): { urls: string[]; primaryUrl: string | null } {
  const urlSet = new Set<string>();
  const urls: string[] = [];

  // 按优先级提取：主图1-6（最高优先级，按列顺序）
  for (let i = 1; i <= 6; i++) {
    const url = safeStr(row[`主图${i}`] || row[`mainImage${i}`] || "");
    if (url && !urlSet.has(url)) {
      urlSet.add(url);
      urls.push(url);
    }
  }

  // specImage 字段
  const specImage = safeStr(row["specImage"]);
  if (specImage && !urlSet.has(specImage)) {
    urlSet.add(specImage);
    urls.push(specImage);
  }

  // mainImages 字段 - 支持标准JSON数组和Python风格列表字符串
  const mainImages = row["mainImages"];
  const mainUrls = parseArrayField(mainImages);
  for (const url of mainUrls) {
    if (!urlSet.has(url)) {
      urlSet.add(url);
      urls.push(url);
    }
  }

  return {
    urls,
    primaryUrl: urls[0] || null,
  };
}

/**
 * 按优先级提取图片URL用于主体一致性检测
 * 优先级：SKU图（specImage） > 商品主图前3张 > mainImages前3张
 * 仅返回用于一致性检测的图片列表
 */
function extractImageUrlsForSubjectMatch(row: InputRow): { urls: string[]; urlTypes: string[] } {
  const urls: string[] = [];
  const urlTypes: string[] = [];

  // 1. SKU图（specImage）- 最高优先级
  const specImage = safeStr(row["specImage"]);
  if (specImage) {
    urls.push(specImage);
    urlTypes.push("sku");
  }

  // 如果没有SKU图，使用主图前3张
  if (urls.length === 0) {
    for (let i = 1; i <= 3; i++) {
      const url = safeStr(row[`主图${i}`] || row[`mainImage${i}`] || "");
      if (url) {
        urls.push(url);
        urlTypes.push("main");
      }
    }
    // 兜底：mainImages 前3张
    if (urls.length === 0 && row["mainImages"]) {
      const mainUrls = parseArrayField(row["mainImages"]);
      for (let i = 0; i < Math.min(3, mainUrls.length); i++) {
        if (!urls.includes(mainUrls[i])) {
          urls.push(mainUrls[i]);
          urlTypes.push("main");
        }
      }
    }
  }

  return { urls, urlTypes };
}

/**
 * 违禁词列表（精确匹配）
 * 注意：必须完整匹配才算违禁，如"下单配"≠"下单鲜炖"
 * 已迁移至 prohibited-words.ts 的 PROHIBITED_WORDS，由视觉验证器引用统一词库
 */

/**
/**
 * 正则提取函数（当JSON解析失败时的后备方案）
 */
function extractVLResultByRegex(content: string): {
  subjects: string[];
  prohibitedWords: string[];
  subjectCount: number;
  reasoning: string;
} {
  const result = {
    subjects: [] as string[],
    prohibitedWords: [] as string[],
    subjectCount: 1,
    reasoning: "",
  };

  // 提取 subjects（可能是对象数组或字符串数组）
  const subjectsMatch = content.match(/"subjects"\s*:\s*\[([\s\S]*?)\]/);
  if (subjectsMatch) {
    const subjectsStr = subjectsMatch[1];
    // 匹配 { name: "..." } 或 { subjectName: "..." } 或 "..."
    const itemMatches = subjectsStr.matchAll(/"(?:name|subjectName|subject)"\s*:\s*"([^"]*)"/g);
    for (const m of itemMatches) {
      if (m[1]) result.subjects.push(m[1]);
    }
    // 如果没匹配到对象格式，尝试匹配纯字符串
    if (result.subjects.length === 0) {
      const strMatches = subjectsStr.matchAll(/"([^"]+)"/g);
      for (const m of strMatches) {
        if (m[1] && !m[1].includes(":") && m[1].length > 1) {
          result.subjects.push(m[1]);
        }
      }
    }
    // 提取 subjectCount
    const countMatch = subjectsStr.match(/"count"\s*:\s*(\d+)/);
    if (countMatch) {
      result.subjectCount = parseInt(countMatch[1], 10);
    }
  }

  // 提取 prohibitedWords
  const prohibitedMatch = content.match(/"prohibitedWords"\s*:\s*\[([\s\S]*?)\]/);
  if (prohibitedMatch) {
    const wordsStr = prohibitedMatch[1];
    const wordMatches = wordsStr.matchAll(/"([^"]*)"/g);
    for (const m of wordMatches) {
      if (m[1]) result.prohibitedWords.push(m[1]);
    }
  }

  // 提取 reasoning
  const reasoningMatch = content.match(/"reasoning"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*\}|\s*$)/);
  if (reasoningMatch) {
    result.reasoning = reasoningMatch[1];
  }

  return result;
}

/**
 * 调用 qwen3.6-plus 进行图片分析
 * @param processedUrl 可选的预压缩图片URL，避免重复压缩
 */
async function callQwenVL(
  imageUrl: string,
  productName: string,
  saleUnit: string,
  imageIndex?: number,
  totalImages?: number,
  processedUrl?: string
): Promise<{
  subjects: string[];
  prohibitedWords: string[];
  subjectCount: number;
  reasoning: string;
}> {
  const API_KEY = process.env.DASHSCOPE_API_KEY;

  if (!API_KEY) {
    throw new Error("DASHSCOPE_API_KEY not configured");
  }

  // 检查缓存
  const { globalCache, cacheKeyVision } = await import("./ai-cache");
  const cacheKey = cacheKeyVision(imageUrl, productName, saleUnit);
  const cached = globalCache.get<{
    subjects: string[];
    prohibitedWords: string[];
    subjectCount: number;
    reasoning: string;
  }>(cacheKey);
  if (cached) {
    console.log(`[Vision] 缓存命中, 分析图片: ${imageUrl.substring(0, 80)}...`);
    return cached;
  }

  const imageContext = imageIndex !== undefined && totalImages !== undefined
    ? `（这是商品主图的第${imageIndex + 1}张，共${totalImages}张主图）`
    : "";

  const prompt = `你是一个专业的商品图片审核专家。请分析这张商品图片中的文字。

商品标题：${productName}
销售单位：${saleUnit}
${imageContext}

请仔细观察图片中的文字，识别以下类型的违禁营销词：

1. 平台违规：平台名称（京东/天猫/淘宝/拼多多）、平台承诺（包邮/次日达/京仓/自营/百亿补贴/国补/到手价/旗舰店/京东物流/京东配送/京东自营/顺丰包邮）、售后相关（退换/更换/发票/发货时间）
2. 促销诱导：促销类（促销价/赠品/限时/618/大促/只换不修/国家补贴/下单配）
3. 极限虚假宣传：最高级/绝对化表述（第一/最好/最强/最佳/最优/极品/顶级/顶尖/独一无二/史无前例/全网首创/全球首发/全国最低/全网最低/全网最便宜/假一赔十/绝对）

【严格排除 - 以下不是违禁词】
- "下单鲜炖"、"下单即食"中的"下单" ≠ "下单配"
- 功能描述（"全网通"、"7天待机"、"双卡双待"）不是违禁词
- 规格参数（"90cm"、"5000公里"）、材质描述（"全新料"）、设计描述（"翻盖设计"）都不是违禁词
- 认证标识（"中国检科院"、"ISO认证"）不是违禁词

请返回JSON格式：
{
  "subjects": ["图片中识别到的商品主体名称"],
  "subjectCount": 图片中商品的个体数量（数字）,
  "prohibitedWords": ["图片中实际存在的违禁营销词，只列出真正识别到的，不要列出没有识别到的"],
  "reasoning": "简要说明"
}

注意：只返回JSON，不要有其他内容`;

  let elapsed = 0;
  try {
    const startTime = Date.now();
    console.log(`[Vision] 使用模型: qwen3.6-plus, 分析图片: ${imageUrl.substring(0, 80)}...`);

    // 图片压缩处理（优先使用预压缩结果，避免重复压缩）
    let processedImageUrl = processedUrl || imageUrl;
    if (!processedUrl) {
      try {
        const compressed = await compressImage(imageUrl, 1920, 80);
        console.log(`[Vision] 图片压缩, 原始: ${formatFileSize(compressed.originalSize)}, 压缩后: ${formatFileSize(compressed.compressedSize)}, 节省: ${compressed.ratio.toFixed(1)}%`);
        if (compressed.ratio > 5) {
          processedImageUrl = compressed.dataUrl;
        }
      } catch (compressError) {
        console.warn(`[Vision] 图片压缩失败，使用原图: ${compressError}`);
      }
    } else {
      console.log(`[Vision] 使用预压缩图片, 原始: ${imageUrl.substring(0, 60)}...`);
    }

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "qwen3.6-plus",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: processedImageUrl,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      temperature: 0.1,
      thinking: false,
    });

    elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "";

    // 解析 JSON 响应
    try {
      // 尝试提取 JSON（可能在 ```json ... ``` 中）
      let jsonStr = content;
      const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        jsonStr = jsonBlockMatch[1];
      } else {
        // 尝试直接匹配 JSON 对象
        const jsonObjMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonStr = jsonObjMatch[0];
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        // JSON解析失败，可能是包含未转义的换行符
        // 尝试修复常见的JSON问题后重试
        let fixedJson = jsonStr;

        // 提取所有字符串值，修复其中的换行符
        fixedJson = fixedJson.replace(/"([^"\\]|\\.)*"/g, (match) => {
          return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        });

        try {
          result = JSON.parse(fixedJson);
        } catch {
          // 如果仍然失败，使用正则提取关键字段
          return extractVLResultByRegex(content);
        }
      }

      // 兼容 subjects 格式：可能是字符串数组或对象数组
      const subjects: string[] = [];
      if (Array.isArray(result.subjects)) {
        for (const s of result.subjects) {
          if (typeof s === "string") {
            subjects.push(s);
          } else if (typeof s === "object" && s !== null) {
            // 兼容 { subjectName: "..." } 或 { name: "..." } 格式
            const name = s.subjectName || s.name || s.subject || "";
            if (name) subjects.push(name);
          }
        }
      }

      // 兼容 prohibitedWords 格式：可能是字符串数组或对象数组
      const aiProhibitedWords: string[] = [];
      if (Array.isArray(result.prohibitedWords)) {
        for (const w of result.prohibitedWords) {
          if (typeof w === "string") {
            aiProhibitedWords.push(w);
          } else if (typeof w === "object" && w !== null) {
            // 兼容 { word: "..." } 格式
            const word = w.word || w.text || w.name || "";
            if (word) aiProhibitedWords.push(word);
          }
        }
      }

      // AI可能误报，用精确匹配过滤AI返回的违禁词
      const verifiedProhibitedWords: string[] = [];
      for (const word of aiProhibitedWords) {
        if (PROHIBITED_WORDS.includes(word)) {
          verifiedProhibitedWords.push(word);
        }
      }

      // 兼容 subjectCount：可能是顶层字段或嵌套在对象中
      let subjectCount = result.subjectCount || 1;
      if (subjectCount === 1 && Array.isArray(result.subjects) && result.subjects.length > 0) {
        const firstSubject = result.subjects[0];
        if (typeof firstSubject === "object" && firstSubject !== null) {
          subjectCount = firstSubject.subjectCount || firstSubject.count || 1;
        }
      }

      const analysisResult = {
        subjects,
        prohibitedWords: verifiedProhibitedWords,
        subjectCount,
        reasoning: result.reasoning || "",
      };
      console.log(`[Vision] 图片分析完成, URL: ${imageUrl.substring(0, 60)}..., 违禁词: ${verifiedProhibitedWords.length} 个, 主体: ${subjects.length} 个, 耗时: ${elapsed}ms`);
      // 写入缓存
      globalCache.set(cacheKey, analysisResult);
      return analysisResult;
    } catch (parseError: unknown) {
      console.error("Failed to parse VL response, parse error:", parseError);
      console.error("Content length:", content.length);
      console.error("Content preview:", content.substring(0, 200));
      throw new Error(`AI响应解析失败: ${parseError instanceof Error ? parseError.message : parseError}`);
    }
  } catch (error) {
    console.error("Qwen VL API call failed:", error);
    throw error;
  }
}

/**
 * 验证单张图片
 * @param processedUrl 可选的预压缩图片URL，用于避免重复压缩
 */
export async function validateImage(
  imageUrl: string,
  imageIndex: number,
  productName: string,
  saleUnit: string,
  totalImages?: number,
  processedUrl?: string
): Promise<VisionAnalysisResult> {
  const result: VisionAnalysisResult = {
    imageUrl,
    imageIndex,
    subjects: [],
    subjectCount: 1,
    saleUnit,
    prohibitedWords: [],
    subjectMatch: true,
    countMatch: true,
    matchScore: 1,
    rawResponse: "",
  };

  try {
    // 调用 Qwen VL 分析图片，传入预压缩的URL
    const analysis = await callQwenVL(imageUrl, productName, saleUnit, imageIndex, totalImages, processedUrl);

    result.subjects = analysis.subjects;
    result.prohibitedWords = analysis.prohibitedWords;
    result.subjectCount = analysis.subjectCount;
    result.rawResponse = JSON.stringify(analysis);

    // 检测违禁词
    if (analysis.prohibitedWords.length > 0) {
      result.matchScore = 0.3;
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : "未知错误";
    result.matchScore = 0;
  }

  return result;
}

/**
 * 验证商品所有图片（并发优化版）
 * 违禁词检测：所有图片
 * 主体一致性检测：优先SKU图，兜底商品主图前3张
 *
 * 优化点：
 * 1. 图片预压缩并行化（compressImages，8并发）
 * 2. 图片验证并发提升到8
 * 3. 主体匹配批量LLM调用
 */
export async function validateProductImages(row: InputRow): Promise<{
  results: VisionAnalysisResult[];
  totalIssues: AuditIssue[];
  hasProhibitedWords: boolean;
  subjectMismatchImages: number[];
  countMismatchImages: number[];
}> {
  const fnStartTime = Date.now();
  // 全部图片URL（用于违禁词检测）
  const allUrls = extractImageUrls(row);
  // 用于主体一致性检测的图片URL（优先级：SKU图 > 主图前3张）
  const subjectUrls = extractImageUrlsForSubjectMatch(row);
  const productName = safeStr(row["商品名称"] || row["名称"] || row["title"]);
  const saleUnit = safeStr(row["saleUnit"] || row["销售单位"] || "");

  const totalIssues: AuditIssue[] = [];
  let hasProhibitedWords = false;
  const subjectMismatchImages: number[] = [];
  const countMismatchImages: number[] = [];

  if (allUrls.urls.length === 0) {
    return { results: [], totalIssues, hasProhibitedWords, subjectMismatchImages, countMismatchImages };
  }

  // ========== 优化1：预压缩所有图片（8并发）==========
  const compressionStart = Date.now();
  const compressionResults = await compressImages(allUrls.urls, 1920, 80, 8);
  // 构建 URL -> 压缩后URL 的映射
  const compressedUrlMap = new Map<string, string>();
  for (let i = 0; i < allUrls.urls.length; i++) {
    const original = allUrls.urls[i];
    const compressed = compressionResults[i];
    // 如果压缩节省超过5%或压缩失败但有结果，使用压缩结果
    if (compressed.ratio > 5 && compressed.dataUrl !== original) {
      compressedUrlMap.set(original, compressed.dataUrl);
    }
  }
  console.log(`[validateProductImages] 图片预压缩完成, 图片数: ${allUrls.urls.length}, 压缩耗时: ${Date.now() - compressionStart}ms`);

  // 图片并发控制（优化：从5提升到8）
  const IMAGE_CONCURRENCY = 8;
  const imageSemaphore = new Semaphore(IMAGE_CONCURRENCY);

  // 并发验证所有图片（用于违禁词），使用压缩后的URL
  const validateImageWithSemaphore = async (url: string, index: number): Promise<VisionAnalysisResult> => {
    await imageSemaphore.acquire();
    try {
      // 使用压缩后的URL（如果有）
      const processedUrl = compressedUrlMap.get(url) || url;
      return await validateImage(url, index, productName, saleUnit, allUrls.urls.length, processedUrl);
    } finally {
      imageSemaphore.release();
    }
  };

  const allResults = await Promise.all(
    allUrls.urls.map((url, i) => validateImageWithSemaphore(url, i))
  );

  // 建立 URL -> result 的映射
  const resultMap = new Map<string, VisionAnalysisResult>();
  for (let i = 0; i < allUrls.urls.length; i++) {
    resultMap.set(allUrls.urls[i], allResults[i]);
  }

  // 汇总违禁词检测结果（所有图片）
  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i];
    if (result.prohibitedWords.length > 0) {
      hasProhibitedWords = true;
      totalIssues.push({
        field: "商品主图",
        ruleId: "image_prohibited_words",
        severity: "原则性错误",
        message: `第${i + 1}张主图包含违禁词: ${result.prohibitedWords.join(", ")}`,
      });
    }
  }

  // ========== 优化3：主体匹配批量LLM调用 ==========
  // 收集需要检测的图片及其主体
  const subjectCheckItems: Array<{ url: string; urlType: string; subjectText: string; globalIndex: number }> = [];
  for (let i = 0; i < subjectUrls.urls.length; i++) {
    const url = subjectUrls.urls[i];
    const urlType = subjectUrls.urlTypes[i];
    const result = resultMap.get(url);
    if (!result || !result.subjects || result.subjects.length === 0) continue;

    const subjectText = result.subjects.join(" ");
    const globalIndex = allUrls.urls.indexOf(url);
    if (globalIndex !== -1) {
      subjectCheckItems.push({ url, urlType, subjectText, globalIndex });
    }
  }

  // 批量调用LLM检测主体匹配（只调用一次）
  if (subjectCheckItems.length > 0) {
    const mismatchResults = await checkSubjectMismatchBatch(productName, subjectCheckItems.map(item => item.subjectText));
    // 汇总主体一致性检测结果
    for (let i = 0; i < subjectCheckItems.length; i++) {
      const item = subjectCheckItems[i];
      const isMismatch = mismatchResults[i];
      if (isMismatch) {
        subjectMismatchImages.push(item.globalIndex);
        const result = resultMap.get(item.url)!;
        totalIssues.push({
          field: "商品主体",
          ruleId: "R16",
          severity: "一般错误",
          message: `图片主体与商品标题品名不一致：图片展示"${result.subjects.join(",")}"，标题为"${productName}"`,
        });
        // 第一优先级（SKU图）已检测出不一致，无需再检测低优先级图片
        if (item.urlType === "sku") {
          break;
        }
      }
    }
  }

  console.log(`[validateProductImages] 主图违禁词检测完成, 图片数: ${allResults.length}, 违禁词命中: ${hasProhibitedWords}, 主体不一致: ${subjectMismatchImages.length} 张, 总耗时: ${Date.now() - fnStartTime}ms`);
  return {
    results: allResults,
    totalIssues,
    hasProhibitedWords,
    subjectMismatchImages,
    countMismatchImages,
  };
}

/**
 * 检测图片主体与标题品名是否匹配
 *
 * 判断逻辑：使用 qwen3.6-plus LLM 进行语义判断
 * - 判断图片主体与标题是否为同类商品
 * - 同类商品不报错（return false）
 * - 不同类商品报错（return true）
 */
async function checkSubjectMismatch(productName: string, imageSubjectText: string): Promise<boolean> {
  // 边缘情况：输入为空时不报错
  if (!productName || !imageSubjectText) return false;

  // 检查缓存
  const { globalCache, cacheKeySubject } = await import("./ai-cache");
  const cacheKey = cacheKeySubject(productName, imageSubjectText);
  const cached = globalCache.get<boolean>(cacheKey);
  if (cached !== null) {
    console.log(`[SubjectCheck] 缓存命中, 图片主体: "${imageSubjectText}", 标题: "${productName}"`);
    return cached;
  }

  try {
    const openai = getOpenAIClient();

    const prompt = `你是一个商品审核专家。请判断图片主体与标题是否为同类商品。

图片主体：${imageSubjectText}
商品标题：${productName}

请判断两者是否属于同一品类或相关类型（例如"有机纯牛奶"和"儿童奶粉"都是奶类，为同类；"空气炸锅"和"电烤架"都是厨房电器，为同类）。

请返回JSON格式：
{
  "isSameCategory": true或false,
  "reason": "判断理由，最多30字"
}

只返回JSON，不要有其他内容。`;

    let elapsed = 0;
    try {
      const startTime = Date.now();
      console.log(`[SubjectCheck] 使用模型: qwen3.6-plus, 图片主体: "${imageSubjectText}", 标题: "${productName}"`);
      const response = await openai.chat.completions.create({
        model: "qwen3.6-plus",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        thinking: false,
      });
      elapsed = Date.now() - startTime;

      const content = response.choices[0]?.message?.content || "";

      // 解析 JSON 响应
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const result = JSON.parse(jsonStr);

      // isSameCategory: true = 同类（不报错）, false = 不同类（报错）
      const isMismatch = !result.isSameCategory;
      console.log(`[SubjectCheck] 主体匹配检测完成, 图片主体: "${imageSubjectText}", 标题: "${productName}", 结果: ${isMismatch ? "不一致" : "一致"}, 耗时: ${elapsed}ms`);
      // 写入缓存
      globalCache.set(cacheKey, isMismatch);
      return isMismatch;
    } catch (error) {
      // LLM 调用失败时，采用保守策略（不报错）
      console.warn("checkSubjectMismatch LLM call failed:", error);
      globalCache.set(cacheKey, false);
      return false;
    }
  } finally {
    // outer try cleanup if needed
  }
}

/**
 * 批量检测图片主体与标题品名是否匹配（优化：合并为单次LLM调用）
 *
 * 判断逻辑：使用 qwen3.6-plus LLM 进行语义判断
 * - 判断每个图片主体与标题是否为同类商品
 * - 同类商品不报错（return false），不同类报错（return true）
 */
async function checkSubjectMismatchBatch(productName: string, imageSubjectTexts: string[]): Promise<boolean[]> {
  // 边缘情况：输入为空时不报错
  if (!productName || imageSubjectTexts.length === 0) {
    return imageSubjectTexts.map(() => false);
  }

  // 收集需要检查的项（跳过空值）
  const validItems: { originalIndex: number; subjectText: string }[] = [];
  for (let i = 0; i < imageSubjectTexts.length; i++) {
    const text = imageSubjectTexts[i];
    if (text) {
      validItems.push({ originalIndex: i, subjectText: text });
    }
  }

  if (validItems.length === 0) {
    return imageSubjectTexts.map(() => false);
  }

  // 检查缓存（逐个检查）
  const { globalCache, cacheKeySubject } = await import("./ai-cache");
  const cacheResults: (boolean | null)[] = new Array(validItems.length).fill(null);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const cacheKey = cacheKeySubject(productName, item.subjectText);
    const cached = globalCache.get<boolean>(cacheKey);
    if (cached !== null) {
      cacheResults[i] = cached;
    } else {
      uncachedIndices.push(i);
    }
  }

  // 全部命中缓存
  if (uncachedIndices.length === 0) {
    console.log(`[SubjectCheck] 批量主体匹配，缓存全部命中，数量: ${validItems.length}`);
    const result: boolean[] = new Array(imageSubjectTexts.length).fill(false);
    for (let i = 0; i < validItems.length; i++) {
      result[validItems[i].originalIndex] = cacheResults[i] ?? false;
    }
    return result;
  }

  // 构建批量prompt
  const itemsList = validItems.map((item, idx) => `  ${idx + 1}. 图片主体${idx + 1}：${item.subjectText}`).join("\n");

  const prompt = `你是一个商品审核专家。请逐一判断以下多个图片主体与标题是否为同类商品。

商品标题：${productName}

${itemsList}

请对每个图片主体逐一判断是否与标题属于同一品类或相关类型（例如"有机纯牛奶"和"儿童奶粉"都是奶类，为同类；"空气炸锅"和"电烤架"都是厨房电器，为同类）。

请返回JSON格式数组（只返回JSON，不要有其他内容）：
[
  {"index": 1, "isSameCategory": true或false, "reason": "判断理由，最多30字"},
  {"index": 2, "isSameCategory": true或false, "reason": "判断理由，最多30字"}
]`;

  try {
    const openai = getOpenAIClient();
    const startTime = Date.now();
    console.log(`[SubjectCheck] 批量主体匹配，使用模型: qwen3.6-plus, 图片数量: ${validItems.length}`);

    const response = await openai.chat.completions.create({
      model: "qwen3.6-plus",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      thinking: false,
    });

    const elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "";

    // 解析 JSON 数组响应
    let parsedResults: Array<{ index: number; isSameCategory: boolean; reason: string }> = [];
    try {
      const jsonMatch = content.match(/```json\s*(\[[\s\S]*?\])\s*```/) || content.match(/\[[\s\S]*?\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      parsedResults = JSON.parse(jsonStr);
    } catch {
      console.warn("[SubjectCheck] 批量匹配响应JSON解析失败，降级为逐个调用");
      // 降级：逐个调用 checkSubjectMismatch
      for (const idx of uncachedIndices) {
        const item = validItems[idx];
        const isMismatch = await checkSubjectMismatch(productName, item.subjectText);
        cacheResults[idx] = isMismatch;
      }
      const result: boolean[] = new Array(imageSubjectTexts.length).fill(false);
      for (let i = 0; i < validItems.length; i++) {
        result[validItems[i].originalIndex] = cacheResults[i] ?? false;
      }
      return result;
    }

    // 解析成功，更新缓存和结果
    const indexToResult = new Map<number, boolean>();
    for (const item of parsedResults) {
      const isMismatch = !item.isSameCategory;
      indexToResult.set(item.index, isMismatch);
      // 写入缓存
      const validItem = validItems[item.index - 1];
      if (validItem) {
        const cacheKey = cacheKeySubject(productName, validItem.subjectText);
        globalCache.set(cacheKey, isMismatch);
      }
    }

    // 填充结果
    for (const idx of uncachedIndices) {
      const result = indexToResult.get(idx + 1);
      if (result !== undefined) {
        cacheResults[idx] = result;
      }
    }

    console.log(`[SubjectCheck] 批量主体匹配完成, 图片数量: ${validItems.length}, 耗时: ${elapsed}ms`);

    // 构建最终结果（按原始顺序）
    const finalResult: boolean[] = new Array(imageSubjectTexts.length).fill(false);
    for (let i = 0; i < validItems.length; i++) {
      finalResult[validItems[i].originalIndex] = cacheResults[i] ?? false;
    }
    return finalResult;
  } catch (error) {
    console.warn("checkSubjectMismatchBatch LLM call failed:", error);
    // 调用失败时，采用保守策略（不报错）
    const result: boolean[] = new Array(imageSubjectTexts.length).fill(false);
    return result;
  }
}

/**
 * 验证详情图违禁词（仅检测违禁词，不做主体匹配）- 并发版
 */
export async function validateDetailImages(row: InputRow): Promise<{
  totalIssues: AuditIssue[];
  hasProhibitedWords: boolean;
}> {
  const fnStartTime = Date.now();
  const totalIssues: AuditIssue[] = [];
  let hasProhibitedWords = false;

  try {
    // 动态导入 getDetailImageUrls
    const { getDetailImageUrls } = await import("./excel-parser");
    const detailImageUrls = getDetailImageUrls(row);

    if (detailImageUrls.length === 0) {
      return { totalIssues, hasProhibitedWords };
    }

    const productName = safeStr(row["商品名称"] || row["名称"] || row["title"]);
    const saleUnit = safeStr(row["saleUnit"] || row["销售单位"] || "");

    // 详情图并发控制（优化：从5提升到8）
    const DETAIL_IMAGE_CONCURRENCY = 8;
    const detailSemaphore = new Semaphore(DETAIL_IMAGE_CONCURRENCY);

    const validateDetailWithSemaphore = async (url: string, index: number) => {
      await detailSemaphore.acquire();
      try {
        return await validateImage(url, index, productName, saleUnit, detailImageUrls.length);
      } finally {
        detailSemaphore.release();
      }
    };

    // 并发验证所有详情图
    const results = await Promise.all(
      detailImageUrls.map((url, i) => validateDetailWithSemaphore(url, i).catch(e => {
        console.warn(`Detail image ${i + 1} validation failed:`, e);
        return null;
      }))
    );

    // 汇总违禁词结果
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;

      // 只检测违禁词
      if (result.prohibitedWords.length > 0) {
        hasProhibitedWords = true;
        // 过滤并去重，仅保留 PROHIBITED_WORDS 中的词，并做合理性上限
        // LLM可能返回完整的违禁词列表而非实际检测到的，按5个做上限截断
        const MAX_DISPLAY_WORDS = 5;
        const uniqueWords = [...new Set(result.prohibitedWords)];
        const displayWords = uniqueWords.slice(0, MAX_DISPLAY_WORDS);
        const hasMore = uniqueWords.length > MAX_DISPLAY_WORDS;
        totalIssues.push({
          field: "详情图片",
          ruleId: "detail_image_prohibited_words",
          severity: "原则性错误",
          message: `第${i + 1}张详情图包含违禁词: ${displayWords.join(", ")}${hasMore ? "..." : ""}`,
        });
      }
    }
    console.log(`[validateDetailImages] 详情图违禁词检测完成, 图片数: ${detailImageUrls.length}, 违禁词命中: ${hasProhibitedWords}, 总耗时: ${Date.now() - fnStartTime}ms`);
    return { totalIssues, hasProhibitedWords };
  } catch (error) {
    console.warn("Detail images validation failed:", error);
    return { totalIssues, hasProhibitedWords };
  }
}
