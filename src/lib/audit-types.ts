export type AuditTaskStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export type AuditSeverity = "提示" | "一般错误" | "原则性错误";

export interface InputRow {
  /** 原始行号（从1开始，不含表头） */
  __rowNumber: number;
  [key: string]: unknown;
}

export interface AuditIssue {
  field?: string;
  ruleId: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditResultRow {
  // 基础信息
  序号: number;
  日期: string;
  SKU: string;
  名称: string;
  供应商: string;

  // 基础信息模块
  商品名称: string;
  商品卖点: string;
  标题: string;
  品牌: string;
  商品分类: string;

  // 商品参数模块
  销售单位: string;
  重量: string;
  产地: string;
  最小起订数量: string;

  // 规格信息模块
  规格模式: string;
  成本价: string;
  零售价: string;
  出厂价: string;
  SKU图片: string;
  规格名称: string;

  // 商品展示&详情模块
  商品主图: string;
  详情图片: string;
  详情描述: string;
  主体图片: string;
  视觉AI: string;

  // 物流配送模块
  配送方式: string;
  货期: string;
  运费模板: string;

  // 其他设置模块
  售后服务: string;
  VOP价格: string;
}

export interface SupplierProgress {
  supplier: string;
  total: number;
  reviewed: number;
  abnormal: number;
  principleHitsInFirst5: number;
  status: "通过" | "需复核" | "驳回";
}

export interface AuditTask {
  id: string;
  filename: string;
  createdAt: string; // ISO
  status: AuditTaskStatus;

  // Input
  inputColumns: string[];
  supplierField: string;
  inputRows: InputRow[];

  // Options
  rulesetName: string;
  outputTemplateName: string;
  splitExportBySupplier: boolean;

  // Runtime
  progress: number; // 0-100
  reviewed: number;
  total: number;
  currentSupplier?: string;
  logs: { ts: string; level: "info" | "warn" | "error"; msg: string }[];

  // Results
  suppliers: SupplierProgress[];
  abnormalRows: AuditResultRow[];

  // AI图像审核相关
  imageAuditEnabled: boolean;
  imageAuditProgress: number;
  currentImageIndex?: number;
  aiServiceAvailable: boolean;
}

// 违禁词定义
export interface ProhibitedWord {
  word: string;
  category: string;  // 虚假宣传/平台违规/促销诱导等
}
