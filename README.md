# AI 自动商品审核平台 (ai-auto-audit)

> 面向企业内部商品上架流程的智能审核平台原型 —— 以 SKU 为最小处理单元，以 Agent 编排为流程核心，以规则引擎和多模态模型为执行器。

![status](https://img.shields.io/badge/version-v0.5.0-blue) ![status](https://img.shields.io/badge/sprint-Sprint%209%20PASS-brightgreen) ![status](https://img.shields.io/badge/license-internal-lightgrey)

---

## TL;DR

| 维度             | 状态                                                                |
| ---------------- | ------------------------------------------------------------------- |
| 当前版本         | **v0.5.0**（最近一次功能 Sprint 是 Sprint 9）                       |
| 已完成 Sprint    | 7 个（Sprint 1-6 + Sprint 9；Sprint 7/8 延期）                      |
| CLI 烟测         | ✅ Hermetic，30 秒内跑通（详见 §3.2）                                |
| 测试套件         | 145 vitest 用例 / 23 文件 / 行覆盖率 83.99%（v0.5.0 基线）          |
| UI 前端          | ⚠️ 暂不可用（`pages/` 已清理,App.tsx 仍依赖旧路由,后续 Sprint 重建）|
| 凭证管理         | 11 项凭证统一在 `.env` + `.env.example`，详见 SECURITY.md           |
| 历史脱敏         | 2026-06-11 对全部 35 个 commit 做了 `git-filter-repo --invert-paths` |

**30 秒验证烟测**：

```bash
pnpm install
node --import tsx scripts/run-audit.ts --smoke-test
# 期望最后一行: SC-5: PASS
```

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

### 2.1 顶层目录（2026-06-11 当前状态）

```
ai-auto-audit/
├── src/                       # 应用源码（Agent 编排 + UI 基座）
├── scripts/                   # CLI 入口（run-audit.ts + 4 个 Sprint smoke test）
├── docs/                      # 业务/产品文档
│   ├── 商品审核系统架构.md
│   └── 商品审核系统PRD.md
├── logs/                      # 运行时日志（gitignored；audit_*.log / review-queue.jsonl）
│
├── .env                       # 真实凭证（gitignored，单源；11 个键见 SECURITY.md §一）
├── .env.example               # 凭证模板（committed；占位符）
├── SECURITY.md                # 凭证管理与脱敏审计
│
├── package.json               # 工作区根 package（audit / vitest / lint scripts）
├── tsconfig.json              # TypeScript 多项目配置
├── vitest.config.ts           # Vitest 配置（145 用例 / 23 文件）
├── eslint.config.js           # ESLint 9 flat config
├── index.html                 # Vite 入口
├── init.sh                    # SprintFoundry 入口（依赖安装 + 就绪检查）
│
├── AGENT.md                   # Agent 行为规范（spec → plan → tasks → implement → evaluate）
├── CLAUDE.md                  # Claude 执行契约 + Harness 设计
├── MEMORY.md                  # 项目持久记忆
├── planner-spec.json          # 总产品规划（Sprint 拆分与验收标准）
├── CHANGELOG.md               # 版本变更日志
├── VERSION                    # 当前版本号（0.5.0）
│
└── .sprintfoundry/            # SprintFoundry 三 Agent 编排运行时状态（gitignored）
```

**未纳入仓库的业务资产**（本地存在，由 `.gitignore` 屏蔽）：

| 路径                                          | 说明                          |
| --------------------------------------------- | ----------------------------- |
| `src/assets/brand-list.json`                  | 品牌库（27MB）                |
| `src/lib/wecom-notifier.ts`                   | 企业微信通知                  |
| `src/text-risk/wordlist/wordlist.yaml`        | 违禁词词表（被 wordlist.ts 引用）|
| `scripts/.audit_vision_cache.json`            | 视觉审核缓存（自动重建）      |

> 这些文件保留在工作树是因为本地开发需要它们；新协作者通过 `.env.example` 和 `SECURITY.md §四` 即可恢复运行环境。

### 2.2 后端核心模块（`src/`）

按照 **Harness 设计 + 多 Agent 编排** 的思路组织：

```
src/
├── agents/                    # Agent 基类与通信基座
│   ├── types.ts               # Agent / AgentInput / AgentOutput / MessageBus 等类型契约
│   ├── message-bus.ts         # MessageBus 抽象（EventEmitter 实现，可替换为 NATS/Kafka）
│   ├── audit-log.ts           # 审核日志发射器（image_id / agent / score / reason / elapsed_ms）
│   ├── text-risk-agent.ts     # 文字风险 Agent（Sprint 8 替换为真实实现）
│   ├── vision-agent.ts        # 视觉 Agent（Sprint 2 占位）
│   ├── metadata-agent.ts      # 元数据 Agent（Sprint 4 占位）
│   └── index.ts               # 桶装出口（外部 import 面）
│
├── orchestrator/              # 流水线编排器
│   ├── orchestrator.ts        # 状态机：init → preprocess → 并行 fan-out → fusion → done
│   ├── state-machine.ts       # 显式状态转移与终态判定
│   └── index.ts               # 桶装出口
│
├── pipeline-stages/           # 编排内部阶段（从 orchestrator 抽离，Sprint 5）
│   ├── fan-out.ts             # 7 路并行分发
│   ├── fusion-input.ts        # 构造融合输入
│   ├── placeholder.ts         # 占位融合输出
│   ├── clamp.ts               # 数值归一化
│   └── index.ts               # 桶装出口
│
├── preprocess/                # 预处理器（Sprint 3）
│   ├── preprocess-agent.ts    # 格式归一化、尺寸/哈希输出
│   ├── blocklist.ts           # MD5 + pHash 黑名单（fast-path）
│   ├── blocklist-seeds.json   # 黑名单种子（gitignored）
│   ├── phash.ts               # 感知哈希（手写，无 native 依赖）
│   └── index.ts               # 桶装出口
│
├── text-risk/                 # 文字风险核心（Sprint 6/9）
│   ├── automaton.ts           # Aho-Corasick 多模式匹配
│   ├── dfa.ts                 # 归一化（大小写/全半角/空白）
│   ├── regex-matcher.ts       # 正则匹配（带缓存）
│   ├── matcher.ts             # 顶层 matchWordlist(text, wordlist)
│   ├── wordlist.ts            # YAML 解析 + loadWordlistFromDefault() + PROHIBITED_WORDS 派生
│   ├── index.ts               # 桶装出口（唯一公开面）
│   ├── wordlist/wordlist.yaml # 违禁词库（5 类 45 条，唯一手编源，gitignored）
│   └── *.test.ts              # vitest 用例
│
├── fusion/                    # 风险融合（Sprint 4）
│   ├── risk-fusion-agent.ts   # 7 层加权公式 + 阈值映射（PASS/REVIEW/REJECT）
│   ├── fusion-config.ts       # 权重/阈值配置
│   └── index.ts               # 桶装出口
│
├── specialized/               # 专项子 Agent（Sprint 4）
│   ├── porn-agent.ts          # 色情识别
│   ├── ad-agent.ts            # 广告识别
│   ├── political-agent.ts     # 政治敏感识别
│   ├── logo-agent.ts          # 商标识别
│   ├── registry.ts            # 专项 Agent 注册表（SpecializedAgentRegistry）
│   └── index.ts               # 桶装出口（含 SpecializedTarget 类型）
│
├── components/                # React UI 组件（仅 ui/ 基座；product-audit 特性已删）
├── hooks/                     # 自定义 React Hook（use-mobile）
├── assets/                    # 静态资源（brand-list.json，gitignored）
├── App.tsx                    # 应用入口（⚠️ pages/ 已空,UI 暂时不可用）
├── App.css / index.css        # 样式入口
└── main.tsx                   # React 根挂载
```

> **`src/lib/` 已删除**（2026-06-11）：原 010-era 业务规则层 13 个文件在运行时图中 0 引用（`scripts/run-audit.ts` → `src/orchestrator/` 只依赖 `agents/` + `preprocess/` + `text-risk/` + `fusion/` + `specialized/`）。`src/lib/` 内的 `audit-engine.ts` / `prohibited-words.ts` / `wecom-notifier.ts` 仍作为 Group B 业务资产在本地保留（gitignored）。

### 2.3 数据流

```
CLI 入口（scripts/run-audit.ts）
   │
   ▼
PipelineOrchestrator（src/orchestrator/）
   │
   ├── PreprocessAgent（sharp + MD5/pHash 黑名单 fast-path）
   │
   ├── 7 路并行 fan-out：
   │      ├── TextRiskAgent    （text-risk/：AC + DFA + regex 三合一）
   │      ├── VisionAgent      （VLM 调用占位；真实 Qwen-VL 在 epic-3）
   │      ├── MetadataAgent    （EXIF / GPS / AI-gen 检测）
   │      ├── PornAgent
   │      ├── AdAgent
   │      ├── PoliticalAgent
   │      └── LogoAgent
   │
   └── RiskFusionAgent        （7 层加权 + 阈值映射 → PASS / REVIEW / REJECT）
```

### 2.4 Sprint 增量交付

| Sprint | 版本    | 主题                                                | 状态    |
| ------ | ------- | --------------------------------------------------- | ------- |
| 1      | v0.1.0  | Agent 接口 + MessageBus + 审核日志                 | ✅ PASS |
| 2      | v0.2.0  | 流水线编排 + 3 个占位 Agent                         | ✅ PASS |
| 3      | v0.3.0  | 预处理器 + MD5/pHash 黑名单                         | ✅ PASS |
| 4      | v0.4.0  | 4 专项子 Agent + 真实 RiskFusion + CLI 烟测         | ✅ PASS |
| 5      | v0.4.1  | 技术债清理（orchestrator 拆解 + 4 个 eslint 遗留） | ✅ PASS |
| 6      | v0.5.0  | 文字风险匹配核心（AC + DFA + regex，零新依赖）      | ✅ PASS |
| 9      | v0.5.0  | 违禁词库统一：单一数据源（YAML → 类型化桶装）        | ✅ PASS |
| 7/8    | —       | OCR 阶段接入 / TextRiskAgent 真实实现               | ⏸ 延期  |

epic-2 仍需 2 个 Sprint 完成；epic-3 ~ epic-7（视觉真实化、元数据真实化、专项 Agent 真实化、融合生产加固、违禁词漏斗迁移）尚未在 `planner-spec.json` 中拆解。

---

## 三、使用方式

### 3.1 环境要求

```bash
node -v     # v25.x（推荐 25.0+）
pnpm -v     # 任意 8.x+；未装可改用 npm
```

### 3.2 跑通烟测（无需任何外部密钥 / 网络）

烟测是 **Hermetic** 的：内联 3 段 `Buffer.from([...])` 字节数组作为 fixture，分别覆盖正常图片 / 黑名单命中 / 损坏数据，全程不调用 DashScope、不访问外网。

```bash
git clone git@github.com:YuSec2021/ai-auto-audit.git
cd ai-auto-audit
pnpm install
node --import tsx scripts/run-audit.ts --smoke-test
```

期望输出（关键审计行三元组 `9,2,9` —— 正常=9 行、黑名单=2 行、损坏=9 行）：

```
SC-5: hermetic:no-api-key=true:no-real-image-files=true:fixtures-embedded=true
SC-5: e2e:fixtures=3:all-completed=true:actions=PASS,REJECT,REVIEW
SC-5: e2e:terminals=done,done,done:audit-lines=9,2,9:durations-ms=...
SC-5: PASS
```

历史 Sprint 烟测脚本（Sprint 1 ~ 4）也保留可执行：

```bash
node --import tsx scripts/smoke-test-sprint-1.ts
node --import tsx scripts/smoke-test-sprint-2.ts
node --import tsx scripts/smoke-test-sprint-3.ts
node --import tsx scripts/smoke-test-sprint-4.ts
```

### 3.3 单元测试与覆盖率

```bash
pnpm vitest run                    # 跑全部 145 用例
pnpm vitest run --coverage         # 跑覆盖率报告
pnpm vitest run src/text-risk      # 仅跑文字风险模块
```

### 3.4 类型检查与 Lint

```bash
npx tsc -p tsconfig.app.json --noEmit
pnpm lint                          # 全量 ESLint
npx eslint src/text-risk/ --max-warnings=0    # 增量 lint（推荐）
```

### 3.5 安全审计

```bash
npm audit --audit-level=high       # 期望 0 high / 0 critical
# 也可查看 SECURITY.md §六「历史脱敏审计」中的本地敏感信息扫描结果
```

### 3.6 生产构建

```bash
pnpm build                         # tsc -b && vite build
pnpm preview                       # 本地预览构建产物
```

> ⚠️ **UI 暂不可用**：`src/pages/` 在 2026-06-11 的死代码清理中已删除（与 `src/lib/` 同批次），`App.tsx` 仍引用 `@/pages/Home` 与 `@/pages/ProductAudit`。`pnpm dev` 启动后浏览器会白屏。CLI 烟测是当前唯一可用入口，UI 重建规划在后续 Sprint。

### 3.7 直接调用 Agent 核心（库式使用）

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

### 3.8 参与开发

1. 阅读 `AGENT.md` 与 `CLAUDE.md`，理解 Spec → Plan → Tasks 流程
2. 阅读 `planner-spec.json` 中下一个未完成的 Sprint 合同
3. 通过 SprintFoundry 启动新 Sprint（Orchestrator 自动接管）

---

## 四、技术栈

### 4.1 运行时与语言

| 项            | 选型 / 版本                              | 说明                                    |
| ------------- | ---------------------------------------- | --------------------------------------- |
| 运行时        | **Node.js 25**（ES Modules）             | 原生支持 ESM 与 `tsx`                    |
| 语言          | **TypeScript ~5.9.3**                    | 严格类型（`tsc --noEmit` 通过）         |
| 包管理        | pnpm（亦兼容 npm；锁定文件 `pnpm-lock.yaml`） | —                                       |
| 测试          | **Vitest 4**                             | 145 用例 / 23 文件，全部通过             |
| 覆盖率        | `@vitest/coverage-v8`                    | 项目行覆盖率 83.99%（v0.5.0 基线）        |
| Lint          | **ESLint 9**（`typescript-eslint`）       | 新增代码 `--max-warnings=0`              |
| 端到端        | **Playwright 1.59**                      | UI 流程与诊断脚本（暂未启用，UI 重建后启用）|
| 模块执行      | **`tsx`**（`node --import tsx`）        | 零编译直接跑 `.ts` 入口                  |

### 4.2 后端 / Agent 核心

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
| HTTP 客户端       | `axios` 1.13（所有 base URL / key 走 `process.env.*`）       |

### 4.3 数据与契约

| 资产                            | 路径                              | 仓库可见性 |
| ------------------------------- | --------------------------------- | ---------- |
| 品牌库                          | `src/assets/brand-list.json`      | gitignored |
| 黑名单种子                      | `src/preprocess/blocklist-seeds.json` | gitignored |
| 类目树                          | `category.json`                   | gitignored |
| 供应商配置                      | `vendor.json`                     | gitignored |
| 视觉审核缓存                    | `scripts/.audit_vision_cache.json` | gitignored |
| 真实凭证                        | `.env`（11 个键）                 | gitignored |
| 凭证模板                        | `.env.example`                    | committed  |

### 4.4 工具链

- **Harness 设计**（`AGENT.md` / `CLAUDE.md`）：Spec → Plan → Tasks → Implement → Evaluate → Iterate
- **SprintFoundry 三 Agent GAN**：Planner（Claude sub-agent）+ Generator（Codex CLI）+ Evaluator（Claude sub-agent），由 Orchestrator 编排；运行时状态在 `.sprintfoundry/`（gitignored）
- **历史 Spec-Kit 体系**（`.specify/`、`specs/`）：已于 2026-06-10 移除（commit `48f9239`），现统一在 `AGENT.md` + `planner-spec.json` 中维护

---

## 五、许可与责任

本仓库为 **企业内部项目**（Internal Use Only），所有词库、规则、品牌列表归企业内部所有，不对外授权。

完整版本与变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)；凭证管理与脱敏审计见 [`SECURITY.md`](./SECURITY.md)。

如有问题或建议，请在企业 IM 工具中联系 `yusec`。