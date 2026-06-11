import type { InputRow, AuditIssue } from "./audit-types";
import { getPriceFields } from "./excel-parser";

export interface PriceValidationResult {
  issues: AuditIssue[];
  margin?: number;  // 毛利率 (0-1范围)
}

/**
 * 校验价格逻辑
 * - 成本价（含运费）必须 ≤ 销售价/京东VOP价格
 * - 不含运费成本价必须 ≤ 含运费成本价
 * - 成本价必须 ≥ 0
 */
export function validatePriceLogic(row: InputRow): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const prices = getPriceFields(row);

  // 成本价必须 ≥ 0
  const costPrice = prices.costPrice;
  if (costPrice !== undefined && !isNaN(costPrice) && costPrice < 0) {
    issues.push({
      field: "成本价",
      ruleId: "price_negative",
      severity: "原则性错误",
      message: "成本价不能为负数",
    });
  }

  // 含运费成本价必须 ≥ 0
  const costPriceWithFreight = prices.costPriceWithFreight;
  if (costPriceWithFreight !== undefined && !isNaN(costPriceWithFreight) && costPriceWithFreight < 0) {
    issues.push({
      field: "含运费成本价",
      ruleId: "price_freight_negative",
      severity: "原则性错误",
      message: "含运费成本价不能为负数",
    });
  }

  // 如果同时有含运费和不含运费成本价，校验逻辑关系
  if (costPrice !== undefined && costPriceWithFreight !== undefined &&
      !isNaN(costPrice) && !isNaN(costPriceWithFreight)) {
    if (costPrice > costPriceWithFreight) {
      issues.push({
        field: "成本价",
        ruleId: "price_cost_freight_logic",
        severity: "原则性错误",
        message: "成本价（不含运费）不能大于含运费成本价",
      });
    }
  }

  // 成本价必须 ≤ 零售价（如果两者都存在）
  const retailPrice = prices.retailPrice;
  if (costPrice !== undefined && retailPrice !== undefined &&
      !isNaN(costPrice) && !isNaN(retailPrice)) {
    if (costPrice > retailPrice) {
      issues.push({
        field: "成本价",
        ruleId: "price_cost_high",
        severity: "原则性错误",
        message: "成本价不能大于零售价",
      });
    }
  }

  // 成本价必须 ≤ 京东价（如果两者都存在）
  const jdPrice = prices.jdPrice;
  if (costPrice !== undefined && jdPrice !== undefined &&
      !isNaN(costPrice) && !isNaN(jdPrice)) {
    if (costPrice > jdPrice) {
      issues.push({
        field: "成本价",
        ruleId: "price_cost_high",
        severity: "原则性错误",
        message: "成本价不能大于京东VOP价格",
      });
    }
  }

  // 使用含运费成本价校验
  const effectiveCost = costPriceWithFreight !== undefined && !isNaN(costPriceWithFreight)
    ? costPriceWithFreight
    : costPrice;

  if (effectiveCost !== undefined && retailPrice !== undefined &&
      !isNaN(effectiveCost) && !isNaN(retailPrice)) {
    if (effectiveCost > retailPrice) {
      issues.push({
        field: "含运费成本价",
        ruleId: "price_cost_high",
        severity: "原则性错误",
        message: "成本高：含运费成本价大于零售价",
      });
    }
  }

  return issues;
}

/**
 * 计算毛利率
 * 毛利 = (零售价 - 成本价) / 零售价
 */
export function calculateMargin(row: InputRow): number | undefined {
  const prices = getPriceFields(row);

  // 优先使用出厂价和零售价计算毛利
  let costPrice = prices.factoryPrice;
  let salePrice = prices.retailPrice;

  // 如果没有出厂价，尝试使用含运费成本价
  if (costPrice === undefined || isNaN(costPrice)) {
    costPrice = prices.costPriceWithFreight ?? prices.costPrice;
  }

  // 如果没有零售价，尝试使用京东价
  if (salePrice === undefined || isNaN(salePrice)) {
    salePrice = prices.jdPrice;
  }

  if (costPrice === undefined || salePrice === undefined ||
      isNaN(costPrice) || isNaN(salePrice) || salePrice === 0) {
    return undefined;
  }

  return (salePrice - costPrice) / salePrice;
}

/**
 * 校验毛利空间是否在合理范围内
 * 正常毛利空间: 8% - 30%
 */
export function checkMarginRange(margin: number): {
  valid: boolean;
  severity: "提示" | "一般错误" | "原则性错误" | null;
  message: string | null;
} {
  const marginPercent = margin * 100;

  if (margin < 0) {
    return {
      valid: false,
      severity: "原则性错误",
      message: `毛利为负数(${marginPercent.toFixed(1)}%)，定价不合理`,
    };
  }

  if (marginPercent < 8) {
    return {
      valid: false,
      severity: "一般错误",
      message: `毛利空间过低(${marginPercent.toFixed(1)}%)，低于8%预警线`,
    };
  }

  if (marginPercent > 30) {
    return {
      valid: false,
      severity: "提示",
      message: `毛利空间偏高(${marginPercent.toFixed(1)}%)，超过30%建议核实`,
    };
  }

  return {
    valid: true,
    severity: null,
    message: null,
  };
}

/**
 * 执行完整的价格校验
 */
export function validatePrice(row: InputRow): PriceValidationResult {
  const issues: AuditIssue[] = [];

  // 1. 价格逻辑校验
  issues.push(...validatePriceLogic(row));

  // 2. 毛利空间校验
  const margin = calculateMargin(row);
  if (margin !== undefined) {
    const marginCheck = checkMarginRange(margin);
    if (!marginCheck.valid && marginCheck.severity) {
      issues.push({
        field: "零售价",
        ruleId: "price_margin_range",
        severity: marginCheck.severity,
        message: marginCheck.message!,
      });
    }
  }

  return { issues, margin };
}

/**
 * 便捷函数：校验价格并生成问题列表
 */
export function priceAuditIssues(row: InputRow): AuditIssue[] {
  return validatePrice(row).issues;
}
