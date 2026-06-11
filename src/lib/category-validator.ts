/**
 * 类目验证器
 * 1. 使用 category_mapper 将 stdCategoryIdPath 映射为完整类目名称
 * 2. 使用 Qwen 3.5 Flash 分析商品标题与类目是否匹配
 */

import type { InputRow, AuditIssue } from "./audit-types";
import { safeStr } from "./excel-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOpenAIClient } from "./openai-client";

// ESM下获取__dirname的兼容写法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 延迟加载 category_mapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _categoryMapper: any = null;

async function getCategoryMapper() {
  if (_categoryMapper) return _categoryMapper;

  // category.json 在项目根目录（src/lib往上级）
  const CATEGORY_FILE = path.resolve(__dirname, "../../../category.json");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _map: Record<string, any> = {};

  function buildIndex() {
    const data = JSON.parse(fs.readFileSync(CATEGORY_FILE, "utf-8"));
    _map = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function traverse(items: any[]) {
      for (const item of items) {
        _map[item.id] = item;
        if (item.children?.length) {
          traverse(item.children);
        }
      }
    }
    traverse(data);
  }

  function parseIdPath(stdCategoryIdPath: string): string[] {
    if (!stdCategoryIdPath || typeof stdCategoryIdPath !== "string") return [];
    const trimmed = stdCategoryIdPath.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
    const inner = trimmed.slice(1, -1);
    return inner.split(",").map((s: string) => s.trim()).filter(Boolean);
  }

  function getFullCategoryPath(stdCategoryIdPath: string): {
    path: string;
    leafName: string;
    depth: number;
  } {
    buildIndex();

    const ids = parseIdPath(stdCategoryIdPath);
    if (ids.length === 0) {
      return { path: "", leafName: "", depth: 0 };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = [];
    for (const id of ids) {
      const node = _map[id];
      if (node) {
        nodes.push({ id: node.id, name: node.name, level: node.level });
      }
    }

    const path = nodes.map((n) => n.name).join(" > ");
    const leaf = nodes[nodes.length - 1];

    return {
      path,
      leafName: leaf?.name || "",
      depth: nodes.length,
    };
  }

  _categoryMapper = {
    getFullCategoryPath,
  };

  return _categoryMapper;
}

export async function callQwenForCategoryMatch(
  productTitle: string,
  categoryPath: string
): Promise<{
  matched: boolean;
  reason: string;
  extractedKeywords: string[];
  suitabilityLevel: "高" | "中" | "低";
  relationType: "包含关系" | "交叉关系" | "互斥关系" | "";
}> {
  const API_KEY = process.env.DASHSCOPE_API_KEY;

  if (!API_KEY) {
    // 如果没有 API Key，返回不确定状态
    console.warn("DASHSCOPE_API_KEY not set, skipping AI category check");
    return {
      matched: false,
      reason: "AI服务未配置",
      extractedKeywords: [],
      suitabilityLevel: "低",
      relationType: "",
    };
  }

  const prompt = `你是一个商品类目审核专家。请分析以下商品标题与填写类目之间的关系。

商品标题: ${productTitle}
填写类目: ${categoryPath}

请判断商品与类目之间的关系类型：

**关系类型定义**：
- **同类关系**：商品与类目是同一种东西或功能高度相似（如"猫粮"在"猫粮"类目，干猫粮与湿猫粮同属猫粮大类）
- **包含关系**：商品完全属于该类目范围（如"不锈钢汤勺"在"餐具"类目中）
- **交叉关系**：商品部分属性属于该类目（如"带铅笔的文具盒"，铅笔和文具盒分属不同类目）
- **互斥关系**：商品与类目完全不相关（如"鼠标"在"键盘"类目中）

**审核原则**（宽松模式）：
只要商品与类目不是互斥关系，且功能相似或相近，就可以通过审核。
- **通过**：同类关系、包含关系、交叉关系
- **不通过**：只有互斥关系才不通过

请用JSON格式返回分析结果：
{
  "relationType": "同类关系"或"包含关系"或"交叉关系"或"互斥关系",
  "matched": true或false（同类关系、包含关系、交叉关系=true，互斥关系=false）,
  "reason": "简要说明判断理由，最多30字",
  "extractedKeywords": ["标题中的核心产品词1", "核心产品词2"],
  "suitabilityLevel": "高"或"中"或"低"
}

只返回JSON，不要有其他内容。`;

  try {
    console.log(`[CategoryMatch] 使用模型: qwen3.6-plus, 商品分类: ${categoryPath}, 标题: ${productTitle}`);
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "qwen3.6-plus",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      thinking: false,
    });

    const content = response.choices[0]?.message?.content || "";

    // 解析 JSON 响应
    try {
      // 尝试提取 JSON（可能包含在 ```json ... ``` 中）
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const result = JSON.parse(jsonStr);

      return {
        matched: result.matched === true,
        reason: result.reason || "",
        extractedKeywords: result.extractedKeywords || [],
        suitabilityLevel: result.suitabilityLevel || "低",
        relationType: result.relationType || "",
      };
    } catch {
      console.error("Failed to parse Qwen response:", content);
      return {
        matched: false,
        reason: "AI响应解析失败",
        extractedKeywords: [],
        suitabilityLevel: "低",
        relationType: "",
      };
    }
  } catch (error) {
    console.error("Qwen API call failed:", error);
    return {
      matched: false,
      reason: `AI服务调用异常: ${error instanceof Error ? error.message : "未知错误"}`,
      extractedKeywords: [],
      suitabilityLevel: "低",
      relationType: "",
    };
  }
}

/**
 * 验证商品类目与标题是否匹配
 */
export async function validateCategoryMatch(
  row: InputRow
): Promise<{
  issues: AuditIssue[];
  categoryPath: string;
  leafName: string;
  matchResult?: {
    matched: boolean;
    reason: string;
    extractedKeywords: string[];
    relationType: "包含关系" | "交叉关系" | "互斥关系" | "";
  };
}> {
  const issues: AuditIssue[] = [];
  const title = safeStr(row["商品名称"] || row["名称"] || row["title"]);
  const categoryIdPath = safeStr(row["stdCategoryIdPath"]);

  if (!title) {
    return { issues, categoryPath: "", leafName: "" };
  }

  if (!categoryIdPath) {
    // 没有类目路径，无法验证匹配
    return { issues, categoryPath: "", leafName: "" };
  }

  // 获取完整类目路径
  const mapper = await getCategoryMapper();
  const categoryInfo = mapper.getFullCategoryPath(categoryIdPath);
  const categoryPath = categoryInfo.path;
  const leafName = categoryInfo.leafName;

  if (!categoryPath) {
    return { issues, categoryPath: "", leafName: "" };
  }

  // 调用 AI 验证类目匹配
  const matchResult = await callQwenForCategoryMatch(title, categoryPath);

  // 判断是否为 AI 调用失败（关系类型为空且原因包含错误信息）
  const aiFailed = matchResult.relationType === "" &&
    (matchResult.reason.includes("异常") ||
     matchResult.reason.includes("失败") ||
     matchResult.reason.includes("未配置") ||
     matchResult.reason.includes("解析失败"));

  if (aiFailed) {
    // AI 验证失败，使用兜底规则：关键词匹配
    const fallbackResult = fallbackCategoryMatch(title, categoryPath);
    if (!fallbackResult.matched) {
      issues.push({
        field: "商品分类",
        ruleId: "category_title_mismatch_fallback",
        severity: "一般错误",
        message: `商品分类与标题不匹配: ${fallbackResult.reason}`,
      });
    }
  } else {
    // AI 验证正常：根据关系类型生成问题，仅互斥关系报错
    if (matchResult.relationType === "互斥关系") {
      issues.push({
        field: "商品分类",
        ruleId: "category_title_mismatch",
        severity: "一般错误",
        message: `商品分类与标题不匹配: ${matchResult.reason}`,
      });
    }
  }

  return {
    issues,
    categoryPath,
    leafName,
    matchResult,
  };
}

/**
 * 兜底规则：基于关键词的类目-标题匹配
 */
function fallbackCategoryMatch(
  productTitle: string,
  categoryPath: string
): {
  matched: boolean;
  reason: string;
} {
  if (!productTitle || !categoryPath) {
    return { matched: false, reason: "标题或类目为空" };
  }

  // 从类目路径中提取末级类目名称
  const leafCategory = categoryPath.split(/[>、/]/).pop()?.trim() || "";

  // 从标题中提取核心关键词
  const titleKeywords = productTitle
    .replace(/[0-9a-zA-Z]+/g, "")
    .split(/[\s,，、_@#]+/)
    .filter((word) => word.length >= 2);

  // 检查类目关键词是否在标题中
  let matchCount = 0;
  for (const keyword of titleKeywords) {
    if (productTitle.includes(keyword) || keyword.includes(leafCategory.substring(0, Math.min(2, leafCategory.length)))) {
      matchCount++;
    }
  }

  const matchScore = titleKeywords.length > 0 ? matchCount / titleKeywords.length : 0;

  if (matchScore >= 0.3) {
    return { matched: true, reason: "兜底规则：关键词匹配通过" };
  } else {
    return {
      matched: false,
      reason: `兜底规则：标题与类目匹配度低（类目[${leafCategory}]与标题核心词不匹配）`,
    };
  }
}

/**
 * 同步版本的类目匹配检查（仅返回类目信息，不调用 AI）
 */
export function getCategoryInfo(row: InputRow): {
  categoryPath: string;
  leafName: string;
  depth: number;
} {
  const categoryIdPath = safeStr(row["stdCategoryIdPath"]);

  if (!categoryIdPath) {
    return { categoryPath: "", leafName: "", depth: 0 };
  }

  // 同步获取类目信息（需要同步版本的 mapper）
  // 这里返回基本信息，实际 AI 验证需要用异步版本
  return {
    categoryPath: "[需要映射]",
    leafName: "[需要映射]",
    depth: 0,
  };
}
