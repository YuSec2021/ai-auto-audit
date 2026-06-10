#!/usr/bin/env node
/**
 * 全规则审核脚本：对单个 Excel 文件执行所有可用的规则审核
 * 输入：未审核有出厂价（5.26前创建）.xlsx
 * 输出：异常结果 Excel（按规则归类）
 *
 * 规则对照表（与 audit-engine.ts R01-R21 + price-validator 保持一致）：
 *   R01 / title_prohibited: 标题含违禁词
 *   R03:                商品分类未选择至最末级
 *   R04:                最小追加数量为空
 *   R05:                重量精度超过 2 位小数
 *   R07:                货期填"其他"
 *   R08:                货期超过 3 天
 *   R12:                成本价未填写
 *   R13:                成本价高于京东价（无京东价列时跳过）
 *   R14:                出厂价高于零售价
 *   R15:                成本价低于不含运费成本价
 *   price_negative:     成本价不能为负数
 *   price_freight_neg:  含运费成本价不能为负数
 *   price_cost_freight: 不含运费成本价 > 含运费成本价
 *   price_cost_high:    成本价 > 零售价
 *   price_margin_range: 毛利 < 8% / > 30% / < 0
 *
 * 不适用规则（数据缺列）：
 *   R02/R02b（标题品牌/AI语义识别 - 需要 LLM 联网）
 *   R06/R09/R10/R11（货期/配送/售后 - 字段不匹配）
 *   R16/R20（视觉/类目 AI 识别 - 需要 LLM）
 *   R17/R18/R19（SKU 图片相关 - 缺图片列）
 *   R21（定向商品 - 缺 targetCustomerIds）
 */

import * as XLSX from "xlsx";
import * as fs from "node:fs";
import path from "node:path";

const INPUT_FILE =
  "/Users/liyuyang/Library/Containers/com.tencent.WeWorkMac/Data/Documents/Profiles/34319AED673ECD21BCA437E46DC718FA/Caches/Files/2026-06/e16f029dfb864ed007f1f374f2f50bf0/未审核有出厂价（5.26前创建）.xlsx";

const OUTPUT_DIR =
  "/Users/liyuyang/projects/ai_auto_audit/异常SKU_output";
const TIMESTAMP = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "_");
const OUTPUT_FILE = path.join(OUTPUT_DIR, `异常SKU_${TIMESTAMP}.xlsx`);

// ---------------- 违禁词库（与 prohibited-words.ts 严格一致） ----------------
const PROHIBITED_WORDS = [
  // 虚假宣传
  "全网最低","全网最便宜","假一赔十","绝对",
  // 平台违规
  "京仓","国补","到手价","旗舰店","自营","百亿补贴",
  "京东物流","京东配送","京东自营",
  "顺丰包邮","非授权顺丰包邮","包邮",
  "天猫","淘宝","拼多多",
  "次日达","退换","更换","发票","发货时间",
  // 促销诱导
  "促销价","赠品","限时","618","大促","只换不修",
  "国家补贴","下单配",
];

// ---------------- 工具函数 ----------------
const safeStr = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};
const parsePrice = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  const s = String(v).replace(/[¥$,，￥\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
};

// 把"5天"/"3 天"/"2天发货"等解析为天数；返回 null 表示无法解析
const parseLeadDays = (s) => {
  const m = safeStr(s).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

// ---------------- 单行规则执行 ----------------
function auditRow(row) {
  const issues = [];

  // R01 / title_prohibited：标题含违禁词
  const title = safeStr(row["商品名称"]);
  if (title) {
    for (const w of PROHIBITED_WORDS) {
      if (title.includes(w)) {
        issues.push({
          ruleId: "R01",
          field: "商品名称",
          severity: "原则性错误",
          message: `标题含违禁词【${w}】`,
        });
        // 同一标题只报一次（已命中即停止）
        break;
      }
    }
  }

  // R03：商品分类未选择至最末级（用目录1-4 拼接）
  const cat1 = safeStr(row["目录1"]);
  const cat2 = safeStr(row["目录2"]);
  const cat3 = safeStr(row["目录3"]);
  const cat4 = safeStr(row["目录4"]);
  const catFilled = [cat1, cat2, cat3, cat4].filter(Boolean).length;
  if (catFilled > 0 && catFilled < 4) {
    issues.push({
      ruleId: "R03",
      field: "商品分类",
      severity: "一般错误",
      message: `商品分类未选择至最末级（已选${catFilled}层，需4层）`,
    });
  }

  // R04：最小追加数量为空
  const qmin = safeStr(row["最小追加数量"]);
  if (!qmin) {
    issues.push({
      ruleId: "R04",
      field: "最小追加数量",
      severity: "一般错误",
      message: "最小追加数量为空",
    });
  }

  // R05：重量精度超过 2 位小数
  const w = row["重量"];
  if (w !== "" && w !== null && w !== undefined) {
    const parts = String(w).split(".");
    if (parts.length > 1 && parts[1].length > 2) {
      issues.push({
        ruleId: "R05",
        field: "重量",
        severity: "一般错误",
        message: `重量精度超过 2 位小数（${w}）`,
      });
    }
  }

  // R07：货期填"其他"
  const lead = safeStr(row["货期"]);
  if (lead.includes("其他")) {
    issues.push({
      ruleId: "R07",
      field: "货期",
      severity: "一般错误",
      message: '货期填写为"其他"，需填写具体天数',
    });
  }

  // R08：货期超过 3 天
  if (lead) {
    const days = parseLeadDays(lead);
    if (days !== null && days > 3) {
      issues.push({
        ruleId: "R08",
        field: "货期",
        severity: "一般错误",
        message: `货期超过 3 天（${lead}）`,
      });
    }
  }

  // R12：成本价未填写或非法
  const costRaw = row["成本价"];
  if (costRaw === "" || costRaw === null || costRaw === undefined) {
    issues.push({
      ruleId: "R12",
      field: "成本价",
      severity: "原则性错误",
      message: "成本价未填写",
    });
  } else {
    const cost = parsePrice(costRaw);
    if (isNaN(cost)) {
      issues.push({
        ruleId: "R12",
        field: "成本价",
        severity: "原则性错误",
        message: `成本价非法（${costRaw}）`,
      });
    }
  }

  // 价格逻辑
  const cost = parsePrice(row["成本价"]);
  const bareCost = parsePrice(row["成本价（不含运费）"]);
  const retail = parsePrice(row["零售价"]);
  const factory = parsePrice(row["出厂价"]);

  // price_negative：成本价不能为负
  if (!isNaN(cost) && cost < 0) {
    issues.push({
      ruleId: "price_negative",
      field: "成本价",
      severity: "原则性错误",
      message: `成本价不能为负数（${cost}）`,
    });
  }
  // price_freight_negative：含运费成本价不能为负
  if (!isNaN(bareCost) && bareCost < 0) {
    issues.push({
      ruleId: "price_freight_negative",
      field: "成本价（不含运费）",
      severity: "原则性错误",
      message: `含运费成本价不能为负数（${bareCost}）`,
    });
  }
  // price_cost_freight_logic：不含运费 > 含运费
  if (
    !isNaN(cost) && !isNaN(bareCost) &&
    cost > bareCost
  ) {
    issues.push({
      ruleId: "price_cost_freight_logic",
      field: "成本价",
      severity: "原则性错误",
      message: `成本价（${cost}）不能大于含运费成本价（${bareCost}）`,
    });
  }
  // price_cost_high：成本价 > 零售价
  if (!isNaN(cost) && !isNaN(retail) && cost > retail) {
    issues.push({
      ruleId: "price_cost_high",
      field: "成本价",
      severity: "原则性错误",
      message: `成本价（${cost}）不能大于零售价（${retail}）`,
    });
  }
  // R14：出厂价 > 零售价
  if (!isNaN(factory) && !isNaN(retail) && factory > retail) {
    issues.push({
      ruleId: "R14",
      field: "出厂价",
      severity: "原则性错误",
      message: `出厂价（${factory}）高于零售价（${retail}）`,
    });
  }
  // R15：成本价 < 不含运费成本价（注意是 <，常规下成本价 >= 不含运费；此为反向异常）
  if (
    !isNaN(cost) && !isNaN(bareCost) &&
    cost < bareCost
  ) {
    issues.push({
      ruleId: "R15",
      field: "成本价",
      severity: "原则性错误",
      message: `成本价（${cost}）低于不含运费成本价（${bareCost}）`,
    });
  }
  // price_margin_range：毛利 < 8% / > 30% / < 0
  // 毛利 = (零售价 - 出厂价) / 零售价 ；若出厂价缺则用成本价
  let margin = undefined;
  if (!isNaN(retail) && retail > 0) {
    const cp = !isNaN(factory) ? factory : cost;
    if (!isNaN(cp)) {
      margin = (retail - cp) / retail;
    }
  }
  if (margin !== undefined) {
    const pct = margin * 100;
    if (margin < 0) {
      issues.push({
        ruleId: "price_margin_range",
        field: "零售价",
        severity: "原则性错误",
        message: `毛利为负数（${pct.toFixed(1)}%），定价不合理`,
      });
    } else if (pct < 8) {
      issues.push({
        ruleId: "price_margin_range",
        field: "零售价",
        severity: "一般错误",
        message: `毛利空间过低（${pct.toFixed(1)}%），低于 8% 预警线`,
      });
    } else if (pct > 30) {
      issues.push({
        ruleId: "price_margin_range",
        field: "零售价",
        severity: "提示",
        message: `毛利空间偏高（${pct.toFixed(1)}%），超过 30% 建议核实`,
      });
    }
  }

  return issues;
}

// ---------------- 主流程 ----------------
async function main() {
  console.log("=== 全规则审核开始 ===");
  console.log("输入文件:", INPUT_FILE);
  console.log("");

  const t0 = Date.now();
  const wb = XLSX.read(fs.readFileSync(INPUT_FILE), { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  console.log(`读取 ${rows.length} 行（sheet: ${sheetName}）`);
  console.log("");

  const allIssues = [];
  const stats = {
    total: rows.length,
    abnormal: 0,
    byRule: {},
    bySeverity: { 原则性错误: 0, 一般错误: 0, 提示: 0 },
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const issues = auditRow(row);
    if (issues.length > 0) {
      stats.abnormal++;
      const issueSummary = issues.map((it) => it.message).join("；");
      allIssues.push({
        __rowNumber: i + 1,
        系统SKU标准编码: row["系统SKU标准编码"],
        供应商名称: row["供应商名称"],
        商品名称: row["商品名称"],
        品牌: row["品牌"],
        成本价: row["成本价"],
        成本价_不含运费: row["成本价（不含运费）"],
        零售价: row["零售价"],
        出厂价: row["出厂价"],
        货期: row["货期"],
        目录: [row["目录1"], row["目录2"], row["目录3"], row["目录4"]]
          .filter(Boolean)
          .join(" / "),
        命中规则: issues.map((it) => it.ruleId).join(","),
        最严重等级: issues.some((it) => it.severity === "原则性错误")
          ? "原则性错误"
          : issues.some((it) => it.severity === "一般错误")
            ? "一般错误"
            : "提示",
        异常数: issues.length,
        异常详情: issueSummary,
      });
      for (const it of issues) {
        stats.byRule[it.ruleId] = (stats.byRule[it.ruleId] || 0) + 1;
        stats.bySeverity[it.severity] =
          (stats.bySeverity[it.severity] || 0) + 1;
      }
    }
    if ((i + 1) % 1000 === 0) {
      console.log(`  已审核 ${i + 1} / ${rows.length} 行...`);
    }
  }

  // ---------------- 输出 ----------------
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outWb = XLSX.utils.book_new();

  // Sheet 1: 异常 SKU 明细
  const ws1 = XLSX.utils.json_to_sheet(allIssues);
  XLSX.utils.book_append_sheet(outWb, ws1, "异常SKU明细");

  // Sheet 2: 按规则统计
  const ruleStats = Object.entries(stats.byRule)
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, count]) => ({ 规则: ruleId, 命中次数: count }));
  const ws2 = XLSX.utils.json_to_sheet(ruleStats);
  XLSX.utils.book_append_sheet(outWb, ws2, "按规则统计");

  // Sheet 3: 汇总
  const summary = [
    { 项目: "输入文件", 值: path.basename(INPUT_FILE) },
    { 项目: "审核日期", 值: new Date().toISOString().slice(0, 19).replace("T", " ") },
    { 项目: "总行数", 值: stats.total },
    { 项目: "异常行数", 值: stats.abnormal },
    { 项目: "异常率", 值: `${((stats.abnormal / stats.total) * 100).toFixed(2)}%` },
    { 项目: "原则性错误", 值: stats.bySeverity["原则性错误"] || 0 },
    { 项目: "一般错误", 值: stats.bySeverity["一般错误"] || 0 },
    { 项目: "提示", 值: stats.bySeverity["提示"] || 0 },
    { 项目: "耗时(ms)", 值: Date.now() - t0 },
  ];
  const ws3 = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(outWb, ws3, "汇总");

  XLSX.writeFile(outWb, OUTPUT_FILE);

  // 控制台输出汇总
  console.log("\n=== 审核结果 ===");
  console.log(`总行数:    ${stats.total}`);
  console.log(`异常行数:  ${stats.abnormal}（${((stats.abnormal / stats.total) * 100).toFixed(2)}%）`);
  console.log(`  原则性错误: ${stats.bySeverity["原则性错误"] || 0}`);
  console.log(`  一般错误:   ${stats.bySeverity["一般错误"] || 0}`);
  console.log(`  提示:       ${stats.bySeverity["提示"] || 0}`);
  console.log("\n按规则命中次数（降序）:");
  for (const [ruleId, count] of Object.entries(stats.byRule).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${ruleId.padEnd(28)} ${count}`);
  }
  console.log(`\n耗时: ${Date.now() - t0} ms`);
  console.log(`\n输出文件: ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
