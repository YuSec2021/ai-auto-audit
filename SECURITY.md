# 安全与凭证管理规范

> 状态：2026-06-11 历史脱敏完成版
> 配套文件：`.env` (gitignored) + `.env.example` (committed) + 本文件
>
> **2026-06-11 重大更新**：已对 git 全部历史执行 `git-filter-repo --invert-paths` 脱敏，
> 删除 7 个 `codex/sprint-*` 历史分支，仓库体积从 50MB+ 收缩到 1.8MB。
> 详见 §五「历史脱敏审计」。

---

## 一、当前所有凭证（11 项）

| # | 变量名 | 用途 | 服务商 | 风险等级 |
|---|---|---|---|---|
| 1 | `JD_HOST` | 京东 VOP 网关地址 | 京东开放平台 | 低（公开域名） |
| 2 | `JD_APP_KEY` | 京东 VOP 调用凭据 | 京东开放平台 | **高** |
| 3 | `JD_APP_SECRET` | 京东 VOP 调用凭据 | 京东开放平台 | **高** |
| 4 | `JD_PRICE_API_BASE` | 内部 JD 价格 API 地址 | 内部服务 | 中（含内网 IP） |
| 5 | `DASHSCOPE_API_KEY` | 通义千问 / Qwen-VL | 阿里云 DashScope | **高** |
| 6 | `POSTGRES_URL` | PolarDB PostgreSQL 连接 | 阿里云 RDS | **高**（含密码） |
| 7 | `WECOM_WEBHOOK_URL` | 企业微信群机器人 | 腾讯企业微信 | **高**（可发任意消息） |
| 8 | `SH_BASE` | 内部搜索服务 | 内部 | 中（含内网域名） |
| 9 | `SH_API_KEY` | 内部搜索服务 | 内部 | **高** |
| 10 | `MONGO_DSN` | 内网 MongoDB | 内部 | **高**（含内网 IP + 密码） |
| 11 | `QDRANT_URL` / `QDRANT_API_KEY` | 内网 Qdrant 向量库 | 内部 | **高**（含内网 IP + key） |

---

## 二、轮换流程

### 2.1 京东 VOP (`JD_APP_KEY` / `JD_APP_SECRET`)

1. 登录 https://open.jd.com
2. 应用管理 → 找到本应用 → 重置 Secret
3. 更新本地 `ai-audit-prototype/.env`
4. 通过企业 IM 通知团队（避免邮件明文）
5. 旧 Secret 在新 Secret 生效前保留 24h 灰度

### 2.2 阿里云 DashScope (`DASHSCOPE_API_KEY`)

1. 登录 https://dashscope.console.aliyun.com/apiKey
2. 创建新 Key（可与旧 Key 并存）
3. 在代码中切换 + 验证
4. 删除旧 Key

### 2.3 阿里云 PolarDB (`POSTGRES_URL`)

1. 阿里云控制台 → RDS → 账号管理 → 重置密码
2. 通过阿里云 DMS 验证新密码连通
3. 更新 `.env` 中 `POSTGRES_URL`
4. 重启所有连接该库的服务

### 2.4 企业微信 Webhook (`WECOM_WEBHOOK_URL`)

1. 群聊 → 群机器人 → 删除旧机器人 → 添加新机器人
2. 复制新 Webhook URL
3. 更新 `.env` 中 `WECOM_WEBHOOK_URL`
4. ⚠️ **同时修复 `src/lib/wecom-notifier.ts:390` 的硬编码 fallback**（cron job 排查项）

### 2.5 内部服务 (`SH_API_KEY` / `MONGO_DSN` / `QDRANT_*`)

1. 联系对应服务的 owner（搜索/数据/平台团队）
2. 走内部凭证重置流程
3. 内网 IP 变更时同步更新

---

## 三、应急响应

### 凭证疑似泄露

1. **立即轮换**：按 §二 流程，所有相关凭证 30 分钟内重置
2. **审计日志**：
   - JD: 京东开放平台 → 调用日志（按 AppKey 过滤）
   - DashScope: https://dashscope.console.aliyun.com → 用量监控
   - PolarDB: 阿里云 → RDS → 慢日志 / 审计日志
   - WeCom: 群机器人 → 消息记录
3. **通知负责人**：通过企业 IM 同步团队

### 仓库意外推送凭证

1. 立即轮换（§二）
2. 旧仓库可执行 `git filter-repo --invert-paths --path <file>` 重写历史
3. `git reflog expire --expire=now --all && git gc --prune=now --aggressive`
4. **强推 `git push --force-with-lease`**
5. ⚠️ 已经存在的本地 clone 仍能看到历史 — 必须轮换才是真保护

---

## 四、开发者守则

### 必须做
- ✅ 修改凭证前先 PR 说明变更原因
- ✅ 在 `.env.example` 同步新增/重命名的变量
- ✅ 任何新增的内部 URL / IP 写为 env var，不硬编码
- ✅ 内网 IP 出现在代码里 = bug（reviewer 应 reject）

### 禁止做
- ❌ 真实凭证提交到任何分支（包括 feat/fix 分支）
- ❌ 凭证通过 IM 截图、企业邮箱、企业文档库明文传递
- ❌ 同一凭证在多个 `.env` 文件重复保存（应单源）
- ❌ 在 `wecom-notifier.ts` 等源码中保留硬编码 fallback

---

## 五、配套文件

```
.
├── .env              # 真实凭证 (gitignored)
├── .env.example      # 凭证模板 (committed, 无真实值)
├── SECURITY.md       # 本文件
└── .gitignore        # 屏蔽所有 .env* 变体

新增凭证时同步：① 更新 `.env.example` ② 更新本文件 §一/§二

---

## 六、历史脱敏审计（2026-06-11）

### 6.1 背景

用户已删除远端仓库，但本地 git 历史的 35 个 commit 仍含 9 类敏感文件的旧 blob。
为了把「当前代码」作为干净的最新分支分发到任何新远端，对全历史执行了
`git-filter-repo --invert-paths` + `--replace-refs delete-no-add`。

### 6.2 脱敏范围

| 类别 | 路径数 | 说明 |
|---|---|---|
| 业务数据资产 | 4 | vendor.json、category.json、brand-list.json、audit_vision_cache.json |
| 规则 / 词表 | 4 | audit-engine.ts、prohibited-words.ts、wordlist.yaml、audit-full-rules.js |
| 010-era 脚本 | 5 | audit_rules.js、auditor.js、claude_audit.js、image_audit.js、category_mapper.js、get_category_path.js |
| 内部文档 | 2 | 商品审核系统架构.md、picture_audit_agent.md |
| 硬编码密钥 | 1 | src/lib/wecom-notifier.ts（旧版含 webhook fallback） |
| 旧 .env | 2 | .env、.env.example（ai-audit-prototype/ 旧路径） |
| 整个旧目录 | 100+ | `ai-audit-prototype/` 整棵子树（防止遗漏的旧 blob） |

### 6.3 执行步骤

```bash
# 1. 解跟踪当前仍 tracked 的 9 个敏感文件
git rm --cached <9 files>
git commit --no-gpg-sign -m "chore(security): untrack 9 sensitive files"

# 2. 第一次 filter-repo：按显式路径清单
git-filter-repo --invert-paths \
  --path vendor.json --path category.json ... (23 paths) \
  --replace-refs delete-no-add --force

# 3. 第二次 filter-repo：补漏 — 整棵 ai-audit-prototype/ 子树
git-filter-repo --invert-paths --path ai-audit-prototype/ --force

# 4. 删除 7 个 codex/sprint-* 历史分支
git branch -D codex/sprint-{1,2,3,4,5,6,9}-*

# 5. 强制 GC
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 6.4 脱敏后核验

| 校验项 | 结果 |
|---|---|
| `git log --all` 仍可显示完整 35 commit | ✅ 历史结构保留 |
| 9 个当前敏感文件在 HEAD 不再 tracked | ✅ 由 .gitignore 永久屏蔽 |
| 9 个文件仍在工作树（未误删） | ✅ 大小、内容完整 |
| 7 个 `codex/sprint-*` 分支已删除 | ✅ 仅 `main` 留存 |
| `.git` 体积 | 50MB+ → **1.8MB**（缩减 96%）|
| Webhook key (`bfd69058...`) 在所有可达 blob | ✅ 0 命中 |
| 内部 IP `192.168.100.100` 在所有可达 blob | ✅ 0 命中 |
| OSS bucket `uece-sanheng-public` 在所有可达 blob | ✅ 0 命中 |
| Aliyun AK 前缀 `LTAI5t` 在所有可达 blob | ✅ 0 命中 |
| 内部域名 `kyrie` 在所有可达 blob | ✅ 0 命中 |
| `git fsck` 完整性 | ✅ 0 dangling |
| `.env.example` 中的占位符 (`WECOM_WEBHOOK_URL` 等) | ✅ 保留（无真实值）|

### 6.5 仍需人工处理的项

下列风险**脱敏无法消除**——任何持有旧 commit 历史的本地 clone 仍能看到原始 blob：

| 风险 | 处理方 | 紧迫度 |
|---|---|---|
| 5 项生产凭证（见 §二） | 京东开放平台 / 阿里云 / 企业微信 各自后台轮换 | **24h 内** |
| 内网 IP / 域名 | 运维层面更换 IP/域名 | 1 周内 |
| 旧 clone 销毁 | `rm -rf <old-clone-path>` 后重新 clone | 立即 |
| `/tmp/ai-audit-backup/` | 物理销毁该备份目录 | 立即 |
| 企业微信 webhook 旧 key | 在企业微信群机器人后台删除 | 24h 内 |
```

新增凭证时同步：① 更新 `.env.example` ② 更新本文件 §一/§二
