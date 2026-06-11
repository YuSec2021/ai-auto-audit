/**
 * JD VOP 价格验证器
 * 使用内部接口获取京东商品价格，校验成本价是否低于VOP价格
 */

import type { InputRow, AuditIssue } from "./audit-types";
import { safeStr, getSaleUnit } from "./excel-parser";

// 内部价格查询 API（base 走 env，避免硬编码内网 IP）
const PRICE_API_BASE = process.env.JD_PRICE_API_BASE;
if (!PRICE_API_BASE) {
  throw new Error("JD_PRICE_API_BASE not configured (see .env.example)");
}
const PRICE_API_URL = `${PRICE_API_BASE}/api/v1/products/sku_price`;
// SKU搜索API（获取销售单位等详情）
const SKU_SEARCH_API_URL = `${PRICE_API_BASE}/api/v1/products/sku_search`;

/**
 * 从 sourceLinks 字段提取京东SKU ID
 * 格式: {https://item.jd.com/100026673498.html}
 */
export function extractJdSkuId(sourceLinks: unknown): string | null {
  const linksStr = safeStr(sourceLinks);
  if (!linksStr) return null;

  // 匹配 item.jd.com/数字.html 格式
  const match = linksStr.match(/item\.jd\.com\/(\d+)\.html/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * 调用内部价格查询API批量获取商品价格
 */
export async function getJdVopPrices(skuIds: string[]): Promise<{
  prices: Map<string, number>;
  errors: Map<string, string>;
}> {
  if (skuIds.length === 0) return { prices: new Map(), errors: new Map() };

  const prices = new Map<string, number>();
  const errors = new Map<string, string>();

  try {
    // 构造请求 - POST JSON (直接传数组)
    const response = await fetch(PRICE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(skuIds.map((id) => parseInt(id, 10))),
    });

    if (!response.ok) {
      console.error("Price API error:", response.status);
      return { prices, errors };
    }

    const data = await response.json();

    // 解析结果 - 返回格式为 { success: true, result: [{ skuId, salePrice, ... }] }
    if (data.success && Array.isArray(data.result)) {
      for (const item of data.result) {
        const price = parseFloat(item.salePrice);
        if (!isNaN(price) && price > 0) {
          prices.set(item.skuId.toString(), price);
        }
      }
    } else if (data.resultCode === "2004") {
      // SKU 不在商品池，提取所有 SKU ID 标记为错误
      const msg = data.resultMessage || "不在用户商品池";
      for (const skuId of skuIds) {
        errors.set(skuId, msg);
      }
    } else {
      console.error("Price API response error:", data);
    }
  } catch (error) {
    console.error("Price API call failed:", error);
  }

  return { prices, errors };
}

/**
 * 调用SKU搜索API获取商品销售单位等信息
 * API: POST /api/v1/products/sku_search?sku={skuId}
 */
export async function getSkuSearchInfo(skuId: string): Promise<{
  saleUnit?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${SKU_SEARCH_API_URL}?sku=${skuId}`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
      },
      body: "[0]",
    });
    if (!response.ok) {
      return { error: `API错误: ${response.status}` };
    }

    const data = await response.json();
    // 返回格式: { "a": "", "saleUnit": "", ... }
    if (data && data.saleUnit) {
      return {
        saleUnit: data.saleUnit,
      };
    } else {
      return { error: "查询无结果" };
    }
  } catch (error) {
    return { error: `请求失败: ${error}` };
  }
}

/**
 * 校验商品成本价是否低于JD VOP价格
 */
export async function validateJdVopPrice(row: InputRow): Promise<{
  issues: AuditIssue[];
  jdPrice?: number;
  costPrice?: number;
  skuId?: string;
  vopError?: string;  // VOP错误信息，如"不在商品池"
  vopSaleUnit?: string; // VOP系统中的销售单位（用于价格差异分析）
}> {
  const issues: AuditIssue[] = [];

  // 获取成本价
  const costPriceStr = safeStr(row["priceCost"]);
  const costPrice = parseFloat(costPriceStr);

  if (isNaN(costPrice) || costPrice <= 0) {
    return { issues };
  }

  // 从sourceLinks提取SKU ID
  const skuId = extractJdSkuId(row["sourceLinks"]);
  if (!skuId) {
    return { issues };
  }

  // 查询JD VOP价格
  const { prices, errors } = await getJdVopPrices([skuId]);
  const jdPrice = prices.get(skuId);
  const vopError = errors.get(skuId);

  if (vopError) {
    // SKU 不在商品池
    return { issues, jdPrice: undefined, costPrice, skuId, vopError };
  }

  if (jdPrice === undefined) {
    // 无法获取VOP价格，不报错但记录
    return { issues, jdPrice: undefined, costPrice, skuId };
  }

  // 审核规则：
  // 1. 成本价高于VOP价格 → 原则性错误
  // 2. 成本价低于VOP价格超过30% → 一般错误，需检查销售单位是否一致
  if (costPrice >= jdPrice) {
    issues.push({
      field: "成本价",
      ruleId: "price_cost_above_vop",
      severity: "原则性错误",
      message: `成本价(¥${costPrice})高于VOP价格(¥${jdPrice})`,
    });
  } else if (costPrice < jdPrice * 0.7) {
    // 调用sku_search接口获取VOP销售单位，进行销售单位对比
    const { saleUnit: vopSaleUnit, error: searchError } = await getSkuSearchInfo(skuId);
    const currentSaleUnit = getSaleUnit(row);

    let saleUnitNote = "";
    if (searchError) {
      saleUnitNote = `（销售单位对比失败: ${searchError}）`;
    } else if (vopSaleUnit && currentSaleUnit) {
      // 比较销售单位是否一致（忽略空格和大小写）
      const vopUnitNorm = vopSaleUnit.trim().toLowerCase();
      const currentUnitNorm = currentSaleUnit.trim().toLowerCase();
      if (vopUnitNorm !== currentUnitNorm) {
        saleUnitNote = `（疑似销售单位不一致: 填写的销售单位为"${currentSaleUnit}"，VOP系统销售单位为"${vopSaleUnit}"，可能导致价格差异）`;
      } else {
        saleUnitNote = `（销售单位一致: "${currentSaleUnit}"，但成本价仍低于VOP价格30%以上，请核实）`;
      }
    } else if (!currentSaleUnit) {
      saleUnitNote = `（VOP销售单位为"${vopSaleUnit || '未知'}"，但填写商品未填写销售单位，可能导致价格差异）`;
    }

    issues.push({
      field: "成本价",
      ruleId: "price_cost_below_vop_30",
      severity: "一般错误",
      message: `成本价(¥${costPrice})低于VOP价格70%(¥${jdPrice} × 0.7 = ¥${(jdPrice * 0.7).toFixed(2)})${saleUnitNote}`,
    });

    return { issues, jdPrice, costPrice, skuId, vopSaleUnit };
  }

  return { issues, jdPrice, costPrice, skuId };
}

/**
 * 批量校验商品VOP价格（用于提升性能）
 */
export async function batchValidateJdVopPrices(
  rows: InputRow[]
): Promise<Map<number, {
  skuId: string;
  costPrice: number;
  jdPrice?: number;
  vopError?: string;
  vopSaleUnit?: string;
  issues: AuditIssue[];
}>> {
  const results = new Map<number, {
    skuId: string;
    costPrice: number;
    jdPrice?: number;
    vopError?: string;
    vopSaleUnit?: string;
    issues: AuditIssue[];
  }>();

  // 收集所有需要查询的SKU
  const skuIdToRowIndex = new Map<string, number>();
  const skuIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const costPriceStr = safeStr(row["priceCost"]);
    const costPrice = parseFloat(costPriceStr);

    if (isNaN(costPrice) || costPrice <= 0) continue;

    const skuId = extractJdSkuId(row["sourceLinks"]);
    if (!skuId) continue;

    skuIdToRowIndex.set(skuId, i);
    skuIds.push(skuId);
    results.set(i, { skuId, costPrice, issues: [] });
  }

  // 批量查询价格
  if (skuIds.length === 0) return results;

  const { prices: priceMap, errors: errorMap } = await getJdVopPrices(skuIds);

  // 校验价格
  for (const [skuId, rowIndex] of skuIdToRowIndex.entries()) {
    const jdPrice = priceMap.get(skuId);
    const vopError = errorMap.get(skuId);
    const item = results.get(rowIndex)!;
    const row = rows[rowIndex];
    item.jdPrice = jdPrice;
    item.vopError = vopError;

    if (vopError) {
      // SKU 不在商品池
      item.issues.push({
        field: "VOP价格",
        ruleId: "vop_sku_not_in_pool",
        severity: "一般错误",
        message: `SKU ${skuId}: ${vopError}`,
      });
    } else if (jdPrice !== undefined) {
      if (item.costPrice >= jdPrice) {
        // 成本价高于VOP价格
        item.issues.push({
          field: "成本价",
          ruleId: "price_cost_above_vop",
          severity: "原则性错误",
          message: `成本价(¥${item.costPrice})高于VOP价格(¥${jdPrice})`,
        });
      } else if (item.costPrice < jdPrice * 0.7) {
        // 成本价低于VOP价格超过30%，检查销售单位是否一致
        const { saleUnit: vopSaleUnit, error: searchError } = await getSkuSearchInfo(skuId);
        const currentSaleUnit = getSaleUnit(row);
        item.vopSaleUnit = vopSaleUnit;

        let saleUnitNote = "";
        if (searchError) {
          saleUnitNote = `（销售单位对比失败: ${searchError}）`;
        } else if (vopSaleUnit && currentSaleUnit) {
          const vopUnitNorm = vopSaleUnit.trim().toLowerCase();
          const currentUnitNorm = currentSaleUnit.trim().toLowerCase();
          if (vopUnitNorm !== currentUnitNorm) {
            saleUnitNote = `（疑似销售单位不一致: 填写的销售单位为"${currentSaleUnit}"，VOP系统销售单位为"${vopSaleUnit}"，可能导致价格差异）`;
          } else {
            saleUnitNote = `（销售单位一致: "${currentSaleUnit}"，但成本价仍低于VOP价格30%以上，请核实）`;
          }
        } else if (!currentSaleUnit) {
          saleUnitNote = `（VOP销售单位为"${vopSaleUnit || '未知'}"，但填写商品未填写销售单位，可能导致价格差异）`;
        }

        item.issues.push({
          field: "成本价",
          ruleId: "price_cost_below_vop_30",
          severity: "一般错误",
          message: `成本价(¥${item.costPrice})低于VOP价格70%(¥${jdPrice} × 0.7 = ¥${(jdPrice * 0.7).toFixed(2)})${saleUnitNote}`,
        });
      }
    }
  }

  return results;
}
