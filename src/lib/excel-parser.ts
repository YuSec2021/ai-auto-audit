import * as XLSX from "xlsx";
import * as fs from "fs";
import type { InputRow } from "./audit-types";

export interface ParseResult {
  rows: InputRow[];
  columns: string[];
  supplierField: string;
  filename: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 解析用户上传的Excel文件，默认读取第一个sheet作为输入表
 * - 返回 rows（对象数组）
 * - 自动推断供应商字段：优先"供应商"，否则尝试"公司名称"
 */
export async function parseInputExcel(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const columns = Array.from(
    new Set(json.flatMap((r) => Object.keys(r)))
  ).filter(Boolean);

  // 标准输入：供应商
  const supplierField = detectSupplierField(columns);

  const rows: InputRow[] = json.map((r, idx) => ({
    __rowNumber: idx + 1,
    ...r,
  }));

  return {
    rows,
    columns,
    supplierField,
    filename: file.name,
  };
}

/**
 * 自动识别供应商字段
 * 优先级：供应商 > 公司名称 > 其他
 */
export function detectSupplierField(columns: string[]): string {
  if (columns.includes("供应商")) {
    return "供应商";
  }
  if (columns.includes("公司名称")) {
    return "公司名称";
  }
  return columns[0] || "供应商";
}

/**
 * 校验Excel格式
 */
export function validateExcelFormat(
  rows: InputRow[],
  columns: string[]
): ValidationResult {
  const errors: string[] = [];

  if (rows.length === 0) {
    errors.push("Excel sheet为空，无数据行");
  }

  // 检查必要的列是否存在
  const requiredFields = ["商品名称", "SKU"];
  for (const field of requiredFields) {
    if (!columns.includes(field)) {
      errors.push(`缺少必要字段: ${field}`);
    }
  }

  // 检查第一行数据（表头校验）
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (!firstRow["商品名称"] && !firstRow["SKU"] && !firstRow["名称"] && !firstRow["name"]) {
      // This might be a header row being treated as data - not an error necessarily
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 安全获取字符串值
 */
export function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  // 清理Excel强制文本格式的前导单引号（如 'https://...）
  let str = String(v).trim();
  if (str.startsWith("'")) {
    str = str.substring(1);
  }
  return str;
}

/**
 * 安全解析数组字段（支持JSON数组和Python风格列表字符串）
 * 如: "['url1', 'url2']" 或 "[\"url1\", \"url2\"]" 或 ["url1", "url2"]
 */
export function parseArrayField(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) {
    return v.map((item) => {
      let str = String(item).trim();
      if (str.startsWith("'")) str = str.substring(1);
      return str;
    }).filter(Boolean);
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]") return [];
    try {
      // Try standard JSON parse first
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          let str = String(item).trim();
          if (str.startsWith("'")) str = str.substring(1);
          return str;
        }).filter(Boolean);
      }
    } catch {
      // Try Python-style list: ['url1', 'url2'] → ["url1", "url2"]
      const pythonListMatch = trimmed.match(/^\[.*\]$/);
      if (pythonListMatch) {
        try {
          // Convert single quotes to double quotes for JSON.parse
          const jsonCompatible = trimmed.replace(/'/g, '"');
          const parsed = JSON.parse(jsonCompatible);
          if (Array.isArray(parsed)) {
            return parsed.map((item) => {
              let str = String(item).trim();
              if (str.startsWith("'")) str = str.substring(1);
              return str;
            }).filter(Boolean);
          }
        } catch {
          // Fallback: extract URLs by splitting on commas
        }
      }
    }
    // Fallback: split by comma
    return trimmed.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 解析价格字段（处理可能的货币符号和逗号）
 */
export function parsePrice(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const str = String(v).replace(/[¥$,，￥\s]/g, "");
  return parseFloat(str);
}

/**
 * 检测字段值是否为空
 */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * 获取商品名称（兼容多个字段名）
 * 优先使用测试数据的英文字段名
 */
export function getProductName(row: InputRow): string {
  return (
    safeStr(row["title"]) ||
    safeStr(row["商品名称"]) ||
    safeStr(row["名称"]) ||
    safeStr(row["name"]) ||
    ""
  );
}

/**
 * 获取SKU（兼容多个字段名）
 */
export function getSKU(row: InputRow): string {
  return (
    safeStr(row["sku"]) ||
    safeStr(row["SKU"]) ||
    safeStr(row["Sku"]) ||
    ""
  );
}

/**
 * 获取品牌（兼容多个字段名）
 */
export function getBrand(row: InputRow): string {
  return (
    safeStr(row["brandName"]) ||
    safeStr(row["brandId"]) ||
    safeStr(row["品牌"]) ||
    safeStr(row["brand"]) ||
    safeStr(row["品牌名称"]) ||
    ""
  );
}

/**
 * 获取商品分类路径（原始ID路径）
 */
export function getCategoryPath(row: InputRow): string {
  return (
    safeStr(row["stdCategoryIdPath"]) ||
    safeStr(row["商品分类"]) ||
    safeStr(row["分类"]) ||
    safeStr(row["category"]) ||
    ""
  );
}

// 延迟加载类目映射器
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _categoryMapper: Record<string, any> | null = null;

function getCategoryMapper() {
  if (_categoryMapper) return _categoryMapper;

  // category.json 在项目根目录
  const CATEGORY_FILE = "/Users/liyuyang/projects/ai_auto_audit/category.json";
  const data = JSON.parse(
    fs.readFileSync(CATEGORY_FILE, "utf-8")
  );
  _categoryMapper = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function traverse(items: any[]) {
    for (const item of items) {
      _categoryMapper![item.id] = item;
      if (item.children?.length) {
        traverse(item.children);
      }
    }
  }
  traverse(data);
  return _categoryMapper;
}

function parseIdPath(stdCategoryIdPath: string): string[] {
  if (!stdCategoryIdPath || typeof stdCategoryIdPath !== "string") return [];
  const trimmed = stdCategoryIdPath.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
  const inner = trimmed.slice(1, -1);
  return inner.split(",").map((s: string) => s.trim()).filter(Boolean);
}

/**
 * 将 stdCategoryIdPath 映射为完整类目名称路径
 * 例如: {id1,id2,id3} -> "办公用品 > 文件管理 > 文件夹 > 百孔夹"
 */
export function mapCategoryIdToPath(stdCategoryIdPath: string): string {
  if (!stdCategoryIdPath) return "";

  const mapper = getCategoryMapper();
  const ids = parseIdPath(stdCategoryIdPath);
  if (ids.length === 0) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  for (const id of ids) {
    const node = mapper[id];
    if (node) {
      nodes.push({ id: node.id, name: node.name, level: node.level });
    }
  }

  return nodes.map((n) => n.name).join(" > ");
}

/**
 * 获取商品分类路径（映射后的完整路径）
 */
export function getCategoryPathMapped(row: InputRow): string {
  const rawPath = getCategoryPath(row);
  // 如果原始值已经包含 > 符号，说明已经是映射后的路径
  if (rawPath.includes(" > ")) return rawPath;
  // 否则尝试映射
  return mapCategoryIdToPath(rawPath);
}

/**
 * 获取销售单位
 */
export function getSaleUnit(row: InputRow): string {
  return (
    safeStr(row["销售单位"]) ||
    safeStr(row["saleUnit"]) ||
    safeStr(row["单位"]) ||
    ""
  );
}

/**
 * 获取主图URLs
 * 支持标准JSON数组和Python风格列表字符串
 */
export function getMainImageUrls(row: InputRow): string[] {
  const urls: string[] = [];

  // mainImages 字段
  const mainImages = row["mainImages"] || row["主图"] || row["主图链接"];
  urls.push(...parseArrayField(mainImages));

  // 分别的主图字段
  for (let i = 1; i <= 5; i++) {
    const fieldName = `主图${i}` === `图${i}` ? `主图${i}` : `主图${i}`;
    const url = row[fieldName] || row[`mainImage${i}`];
    if (url && typeof url === "string" && url.trim()) {
      urls.push(url.trim());
    }
  }

  return urls;
}

/**
 * 获取详情图URLs（保持Excel列顺序）
 */
export function getDetailImageUrls(row: InputRow): string[] {
  const urlSet = new Set<string>();
  const urls: string[] = [];

  // 按优先级提取：详情图1-10 > detailImages
  for (let i = 1; i <= 10; i++) {
    const url = row[`详情图${i}`] || row[`detailImage${i}`];
    if (url && typeof url === "string" && url.trim() && !urlSet.has(url.trim())) {
      urlSet.add(url.trim());
      urls.push(url.trim());
    }
  }

  // detailImages 字段（支持标准JSON数组和Python风格列表字符串）
  const detailImages = row["detailImages"] || row["详情图"] || row["详情图链接"];
  const detailUrls = parseArrayField(detailImages);
  for (const url of detailUrls) {
    if (!urlSet.has(url)) {
      urlSet.add(url);
      urls.push(url);
    }
  }

  return urls;
}

/**
 * 获取价格字段
 * 优先使用测试数据的英文字段名
 */
export function getPriceFields(row: InputRow): {
  costPrice?: number;        // 成本价
  costPriceWithFreight?: number; // 含运费成本价
  factoryPrice?: number;     // 出厂价
  retailPrice?: number;      // 零售价
  jdPrice?: number;         // 京东价/VOP价格
} {
  return {
    costPrice: parsePrice(row["priceCost"]) || parsePrice(row["成本价"]),
    costPriceWithFreight: parsePrice(row["含运费成本价"]) || parsePrice(row["成本价含运费"]),
    factoryPrice: parsePrice(row["priceFactory"]) || parsePrice(row["出厂价"]),
    retailPrice: parsePrice(row["priceRetail"]) || parsePrice(row["零售价"]),
    jdPrice: parsePrice(row["priceJd"]) || parsePrice(row["京东价"]) || parsePrice(row["京东VOP价格"]),
  };
}

/**
 * 获取售后服务政策
 * 优先使用测试数据的英文字段名
 */
export function getAfterSalesPolicy(row: InputRow): string[] {
  const policy = row["supportedAfterSalesServiceTypes"] || row["售后服务政策"] || row["afterSales"] || row["售后服务"];
  if (!policy) return [];
  // 处理空对象 {}
  if (typeof policy === "string" && policy.trim() === "{}") return [];
  if (typeof policy === "string") {
    // 处理JSON格式的数组字符串，如 "{REFUND,REFUND_ONLY}"
    const cleaned = policy.replace(/[{}"]/g, "");
    if (!cleaned.trim()) return [];
    return cleaned.split(/[,，]/).map((p) => p.trim()).filter(Boolean);
  }
  if (Array.isArray(policy)) {
    return policy.map((p) => String(p).trim()).filter(Boolean);
  }
  return [];
}

/**
 * 获取供应商名称
 */
export function getVendorName(row: InputRow): string {
  return (
    safeStr(row["vendorName"]) ||
    safeStr(row["供应商"]) ||
    safeStr(row["companyName"]) ||
    safeStr(row["公司名称"]) ||
    ""
  );
}

/**
 * 获取所属采销
 */
export function getPurchaserId(row: InputRow): string {
  return (
    safeStr(row["purchaserId"]) ||
    safeStr(row["所属采销"]) ||
    safeStr(row["purchaser"]) ||
    ""
  );
}
