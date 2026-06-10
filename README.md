# AI 自动商品审核平台 (ai-auto-audit)

> 面向企业内部商品上架流程的智能审核平台原型 —— 以 SKU 为最小处理单元，以 Agent 编排为流程核心，以规则引擎和多模态模型为执行器。

![status](https://img.shields.io/badge/version-v0.6.0-blue) ![status](https://img.shields.io/badge/sprint-Sprint%209%20PASS-brightgreen) ![status](https://img.shields.io/badge/license-internal-lightgrey)

---

## 一、项目背景

### 1.1 业务现状

企业内部商品上架流程目前严重依赖人工对供应商提交的 Excel 数据进行字段检查、价格核验和图片审核，存在以下五个核心问题：

1. **审核标准分散**：规则沉淀在多份文档与个人经验中，不同审核员对同一商品的判定结果不一致。
2. **效率与稳定性差**：单批次商品数量大（数千 SKU）、图片数量多，人工审核耗时长且容易遗漏。
3. **图片理解能力不足**：商品主体识别、销售单位比对、标题/详情违禁词等内容，传统规则程序难以准确判定。
4. **过程留痕缺失**：审核结果缺少统一的归因链路，出现争议时无法追溯。
5. **缺乏可恢复执行框架**：大批量任务一旦中断，只能从头开始，无法断点续审。

### 1.2 解决思路

构建一套 **AI 自动商品审核平台**，将「结构化规则审核」与「OCR + VLM 多模态审核」能力结合，形成可编排、可追溯、可复核的智能审核体系。本仓库是平台的工程化原型与 Sprint 增量交付的最终状态。

### 1.3 核心能力

- 供应商 Excel 批量导入与标准化解析（xlsx 解析 + 字段映射）
- 按 SKU 维度自动审核：标题/品牌/类目/价格规则 + 文字风险 + 视觉风险
- OCR 违禁词识别（多模式匹配：AC 自动机 + DFA + 正则）
- 主图销售单位识别与商品主体图文一致性识别（VLM 调用占位）
- 异常归因与标准化《异常 SKU》报告导出
- 低置信度结果进入人工复核闭环
- 全链路操作日志与审核留痕

---

## 二、代码架构

### 2.1 顶层目录

```
ai-auto-audit/
├── ai-audit-prototype/       # 主项目：TypeScript + React + Node.js (ESM)
│   ├── src/                  # 应用源码（Agent 编排、规则、UI 组件）
│   ├── scripts/              # CLI 入口（run-audit.ts 与各 Sprint 的 smoke test）
│   ├── package.json
│   └── vitest.config.ts
├── .specify/                 # Spec-Kit 规格/计划/任务体系
├── .sprintfoundry/           # SprintFoundry 三 Agent 编排运行时状态
├── 商品审核系统架构.md         # 业务架构设计说明书（V1.0 正式版）
├── AGENT.md                  # Agent 行为规范（spec → plan → tasks → implement → evaluate）
├── CLAUDE.md                 # Claude 执行契约与 Harness 设计
├── planner-spec.json         # 总产品规划（Sprint 拆分与验收标准）
└── CHANGELOG.md              # 版本变更日志（v0.1.0 → v0.6.0）
```

### 2.2 后端核心模块（`ai-audit-prototype/src/`）

按照 **Harness 设计 + 多 Agent 编排** 的思路组织：

```
src/
├── agents/                    # Agent 基类与通信基座
│   ├── types.ts               # Agent / AgentInput / AgentOutput / MessageBus 等类型契约
│   ├── message-bus.ts         # MessageBus 抽象（EventEmitter 实现，可替换为 NATS/Kafka）
│   ├── audit-log.ts           # 审核日志发射器（image_id / agent / score / reason / elapsed_ms）
│   ├── text-risk-agent.ts     # 文字风险 Agent（Sprint 8 替换为真实实现）
│   ├── vision-agent.ts        # 视觉 Agent（Sprint 2 占位）
│   └── metadata-agent.ts      # 元数据 Agent（Sprint 4 占位）
│
├── orchestrator/              # 流水线编排器
│   ├── orchestrator.ts        # 状态机：init → preprocess → 并行 fan-out → fusion → done
│   └── state-machine.ts       # 显式状态转移与终态判定
│
├── pipeline-stages/           # 编排内部阶段（从 orchestrator 抽离，Sprint 5）
│   ├── fan-out.ts             # 7 路并行分发：[textRisk, vision, metadata, porn, ad, political, logo]
│   ├── fusion-input.ts        # 构造融合输入
│   ├── placeholder.ts         # 占位融合输出
│   └── clamp.ts               # 数值归一化
│
├── preprocess/                # 预处理器（Sprint 3）
│   ├── preprocess-agent.ts    # 格式归一化、尺寸/哈希输出
│   ├── blocklist.ts           # MD5 + pHash 黑名单（fast-path）
│   └── phash.ts               # 感知哈希（手写，无 native 依赖）
│
├── text-risk/                 # 文字风险核心（Sprint 6/9，epic-2 sprint 1/3）
│   ├── automaton.ts           # Aho-Corasick 多模式匹配
│   ├── dfa.ts                 # 归一化（大小写/全半角/空白）
│   ├── regex-matcher.ts       # 正则匹配（带缓存）
│   ├── matcher.ts             # 顶层 matchWordlist(text, wordlist)
│   ├── wordlist.ts            # YAML 解析 + loadWordlistFromDefault() + PROHIBITED_WORDS 派生
│   ├── index.ts               # 桶装出口（唯一公开面）
│   └── wordlist/wordlist.yaml # 违禁词库（5 类 45 条，唯一手编源）
│
├── fusion/                    # 风险融合（Sprint 4）
│   ├── risk-fusion-agent.ts   # 7 层加权公式 + 阈值映射（PASS/REVIEW/REJECT）
│   └── fusion-config.ts       # 权重/阈值配置
│
├── specialized/               # 专项子 Agent（Sprint 4）
│   ├── porn-agent.ts          # 色情识别
│   ├── ad-agent.ts            # 广告识别
│   ├── political-agent.ts     # 政治敏感识别
│   ├── logo-agent.ts          # 商标识别
│   └── registry.ts            # 专项 Agent 注册表
│
├── lib/                       # 业务规则层（010 时代沉淀）
│   ├── audit-engine.ts        # 审核主流程：Excel 解析 → 多维校验 → 异常归因
│   ├── excel-parser.ts        # xlsx 解析（基于 xlsx 库）
│   ├── price-validator.ts     # 价格规则
│   ├── jdvop-price-validator.ts # 京东 VOP 价格校验
│   ├── category-validator.ts  # 类目一致性
│   ├── prohibited-words.ts    # 010 时代词库函数（保留兼容，Sprint 9 已统一源头）
│   ├── vision-validator.ts    # 视觉校验（占位）
│   ├── openai-client.ts       # DashScope OpenAI 兼容客户端
│   └── wecom-notifier.ts      # 企业微信通知
│
├── components/                # React UI 组件
├── pages/                     # 路由页面（上传 / 任务 / 详情 / 首页）
├── hooks/                     # 自定义 React Hook
├── fusion/                    # 融合模块入口
├── assets/                    # 静态资源（品牌列表等）
└── App.tsx                    # 应用入口
```

### 2.3 数据流

```
Excel 上传
   │
   ▼
audit-engine（lib/）
   │
   ├── 字段规则校验（price / category / prohibited-words …）
   │
   ├── 图片预处理（preprocess-agent：sharp + pHash 黑名单）
   │
   ├── 流水线编排（orchestrator：7-fan-out + risk-fusion）
   │      │
   │      ├── Text Risk Agent（text-risk/：AC + DFA + regex）
   │      ├── Vision Agent（VLM 调用占位）
   │      ├── Metadata Agent
   │      ├── Porn / Ad / Political / Logo 子 Agent
   │      │
   │      └── Risk Fusion Agent（加权融合 + 阈值决策）
   │
   ▼
异常 SKU 归因（按供应商导出 Excel）
```

### 2.4 Sprint 增量交付

当前完成度（v0.6.0）：

| Sprint | 版本    | 主题                                                | 状态    |
| ------ | ------- | --------------------------------------------------- | ------- |
| 1      | v0.1.0  | Agent 接口 + MessageBus + 审核日志                 | ✅ PASS |
| 2      | v0.2.0  | 流水线编排 + 3 个占位 Agent                         | ✅ PASS |
| 3      | v0.3.0  | 预处理器 + MD5/pHash 黑名单                         | ✅ PASS |
| 4      | v0.4.0  | 4 专项子 Agent + 真实 RiskFusion + CLI 烟测         | ✅ PASS |
| 5      | v0.4.1  | 技术债清理（orchestrator 拆解 + 4 个 eslint 遗留） | ✅ PASS |
| 6      | v0.5.0  | 文字风险匹配核心（AC + DFA + regex，零新依赖）      | ✅ PASS |
| 9      | v0.6.0  | 违禁词库统一：单一数据源（YAML → 类型化桶装）        | ✅ PASS |
| 7/8    | —       | OCR 阶段接入 / TextRiskAgent 真实实现               | ⏸ 延期  |

epic-2 仍需 2 个 Sprint 完成；epic-3 ~ epic-7（视觉真实化、元数据真实化、专项 Agent 真实化、融合生产加固、违禁词漏斗迁移）尚未在 `planner-spec.json` 中拆解。

---

## 三、技术栈

### 3.1 运行时与语言

| 项            | 选型 / 版本                              | 说明                                    |
| ------------- | ---------------------------------------- | --------------------------------------- |
| 运行时        | **Node.js 25**（ES Modules）             | 原生支持 ESM 与 `tsx`                    |
| 语言          | **TypeScript ~5.9.3**                    | 严格类型（`tsc --noEmit` 通过）         |
| 包管理        | pnpm（亦兼容 npm；锁定文件 `pnpm-lock.yaml`） | —                                       |
| 测试          | **Vitest 4**                             | 145 用例 / 23 文件，全部通过             |
| 覆盖率        | `@vitest/coverage-v8`                    | 项目行覆盖率 83.99%（v0.5.0 基线）        |
| Lint          | **ESLint 9**（`typescript-eslint`）       | 新增代码 `--max-warnings=0`              |
| 端到端        | **Playwright 1.59**                      | UI 流程与诊断脚本                        |
| 模块执行      | **`tsx`**（`node --import tsx`）        | 零编译直接跑 `.ts` 入口                  |

### 3.2 前端（仅 UI 原型）

| 项         | 选型                                                       |
| ---------- | ---------------------------------------------------------- |
| 框架       | **React 19.2** + **Vite 7**                                |
| 路由       | `wouter`                                                   |
| 样式       | **Tailwind CSS 4** + `tailwindcss-vite`                    |
| 组件基座   | `@radix-ui/*` 全家桶（无样式可访问性）                     |
| 表单       | `react-hook-form` + `zod` + `@hookform/resolvers`          |
| 图表       | `recharts`                                                 |
| 动画       | `framer-motion`                                            |
| 图标       | `lucide-react`                                             |
| 文件保存   | `file-saver`                                               |
| Excel 读写 | `xlsx` 0.18.5                                              |

### 3.3 后端 / Agent 核心

| 能力              | 选型 / 实现                                                  |
| ----------------- | ------------------------------------------------------------ |
| Agent 基座        | 自研（`src/agents/types.ts` 定义 `Agent` 接口：`id` / `version` / `init` / `run` / `healthcheck`） |
| 消息总线          | 进程内 `EventEmitter` 实现的 `MessageBus` 接口（可替换 NATS/Kafka） |
| 编排状态机        | 自研显式状态机（`init` → `preprocess` → 并行 fan-out → fusion → `done` / `cancelled` / `failed`） |
| 文字风险匹配      | **Aho-Corasick 自动机 + DFA 归一化 + 正则**（纯 TypeScript，零新增依赖） |
| 词库              | YAML（`src/text-risk/wordlist/wordlist.yaml`，45 条 / 5 类；自研手写 YAML 解析器，未引入 `js-yaml`） |
| 视觉 / VLM        | DashScope OpenAI 兼容客户端（占位；真实 Qwen3-VL 调用在 epic-3） |
| 图像预处理        | `sharp` + 手写 pHash（无 `image-hash` 依赖）                 |
| 持久化            | 文件日志：`./logs/audit_*.log`；审查队列：`./logs/review-queue.jsonl` |
| 日志体系          | 自研 `audit_logger.js`（JSON 行格式）                         |

### 3.4 数据与契约

- **品牌库**：`ai-audit-prototype/src/assets/brand-list.json`
- **黑名单种子**：`ai-audit-prototype/src/preprocess/blocklist-seeds.json`
- **类目表**：根目录 `category.json`（带 1.json 软链）
- **供应商配置**：`vendor.json` / `vendor_id.json`
- **API 客户端**：`axios` 1.13（HTTP 透传）

### 3.5 工具链

- **Harness 设计**（`AGENT.md` / `CLAUDE.md`）：Spec → Plan → Tasks → Implement → Evaluate → Iterate
- **SprintFoundry 三 Agent GAN**：Planner（Claude sub-agent）+ Generator（Codex CLI）+ Evaluator（Claude sub-agent），由 Orchestrator 编排
- **Spec-Kit 体系**（`.specify/`）：规格/计划/任务三层结构化

---

## 四、使用方式

### 4.1 环境要求

```bash
node -v     # v25.x（推荐 25.0+）
pnpm -v     # 任意 8.x+；未装可改用 npm
```

### 4.2 克隆与安装

```bash
git clone git@github.com:YuSec2021/ai-auto-audit.git
cd ai-auto-audit/ai-audit-prototype
pnpm install        # 或 npm install
```

### 4.3 跑通烟测（无需任何外部密钥 / 网络）

烟测是 **Hermetic** 的：内联 3 段 `Buffer.from([...])` 字节数组作为 fixture，分别覆盖正常图片 / 黑名单命中 / 损坏数据，全程不调用 DashScope、不访问外网。

```bash
cd ai-audit-prototype
node --import tsx scripts/run-audit.ts --smoke-test
```

期望输出（关键审计行三元组 `9,2,9` —— 正常=9 行、黑名单=2 行、损坏=9 行）：

```
audit-log: agent=textRisk vision=...
audit-log: agent=fusion score=...
…
[PASS] normal=9 blocklist=2 corrupt=9
```

历史 Sprint 烟测脚本（Sprint 1 ~ 4）也保留可执行：

```bash
node --import tsx scripts/smoke-test-sprint-1.ts
node --import tsx scripts/smoke-test-sprint-2.ts
node --import tsx scripts/smoke-test-sprint-3.ts
node --import tsx scripts/smoke-test-sprint-4.ts
```

### 4.4 启动 UI 原型

```bash
cd ai-audit-prototype
pnpm dev           # 或 npm run dev
# 浏览器打开 http://localhost:5173
```

UI 提供完整业务流程：

1. **上传 Excel**（`/upload`）—— 拖拽供应商提供的商品表
2. **任务列表**（`/tasks`）—— 查看所有审核任务
3. **任务详情**（`/tasks/:id`）—— 进度、暂停、恢复、单 SKU 详情
4. **导出异常 SKU** —— 按供应商维度下载异常归因 Excel

### 4.5 单元测试与覆盖率

```bash
cd ai-audit-prototype
pnpm vitest run                    # 跑全部 145 用例
pnpm vitest run --coverage         # 跑覆盖率报告
pnpm vitest run src/text-risk      # 仅跑文字风险模块
```

### 4.6 类型检查与 Lint

```bash
cd ai-audit-prototype
npx tsc -p tsconfig.app.json --noEmit
pnpm lint                          # 全量 ESLint
npx eslint src/text-risk/ --max-warnings=0    # 增量 lint（推荐）
```

### 4.7 安全审计

```bash
cd ai-audit-prototype
npm audit --audit-level=high       # 期望 0 high / 0 critical
```

### 4.8 生产构建

```bash
cd ai-audit-prototype
pnpm build                         # tsc -b && vite build
pnpm preview                       # 本地预览构建产物
```

### 4.9 直接调用 Agent 核心（库式使用）

文字风险匹配器是纯函数，可独立使用：

```ts
import { matchWordlist, loadWordlistFromDefault } from "./src/text-risk/index.js";

const wordlist = loadWordlistFromDefault();   // 读取内嵌 wordlist.yaml
const result   = matchWordlist("京东包邮 限时促销", wordlist);
// result = {
//   matched: [{ word, category, severity, span: { start, end }, match }],
//   total: 45,
//   score: 0.0444
// }
```

词库字符串列表（Sprint 9 起唯一源头）：

```ts
import { PROHIBITED_WORDS } from "./src/text-risk/index.js";
// length 45，localeCompare('zh-Hans-CN') 排序 + 去重
```

### 4.10 Excel 审核（端到端）

> 该模式依赖企业内 DashScope 网关与京东 VOP 接口；当前烟测无需这些依赖。

```bash
# 1) 准备供应商 Excel（编码 UTF-8，UTF-8 BOM 兼容）
# 2) 启动 UI 上传，或在脚本中直接调用：
node --import tsx scripts/audit-excel.ts ./待审核.xlsx
```

输出：

- `./logs/audit_YYYYMMDD_HHMMSS.log` —— 每条审核的全链路日志
- `./异常SKU_<供应商>_<时间>.xlsx` —— 按供应商归类的异常 SKU 报告

### 4.11 参与开发

1. 阅读 `AGENT.md` 与 `CLAUDE.md`，理解 Spec → Plan → Tasks 流程
2. 阅读 `planner-spec.json` 中下一个未完成的 Sprint 合同
3. 通过 SprintFoundry 启动新 Sprint（Orchestrator 自动接管）

---

## 五、版本与变更

完整变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。当前 HEAD = `v0.6.0`（Sprint 9 PASS）。

| 字段             | 值                                                  |
| ---------------- | --------------------------------------------------- |
| 仓库             | `git@github.com:YuSec2021/ai-auto-audit.git`        |
| 主分支           | `main`                                              |
| 当前版本         | v0.6.0                                              |
| 已完成 Sprint    | 7（Sprint 1-6 + Sprint 9；7/8 延期）                 |
| 累计测试         | 145 vitest 用例 / 23 文件                            |
| Sprint 9 字数    | 145 用例通过；零新增依赖；零高危漏洞                 |

---

## 六、许可与责任

本仓库为 **企业内部项目**（Internal Use Only），所有词库、规则、品牌列表归企业内部所有，不对外授权。

如有问题或建议，请在企业 IM 工具中联系 `yusec`。
