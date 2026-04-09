/**
 * 自动审核系统 - 主入口
 * 读取样本 → 规则审核 + LLM增强（标题/图片/类目） → 输出异常SKU报表
 */

const XLSX = require('xlsx');
const path = require('path');
const { checkRow, aggregateAnomalies } = require('./auditor');
const { getFullCategoryPath } = require('./category_mapper');
const { auditImages, evalAuditResult } = require('./image_audit');
const { unifiedLLMAudit } = require('./claude_audit');

// ===== 配置 =====
const SAMPLE_FILE = path.join(__dirname, '待审核_split', '苏州政合工业科技有限公司.xlsx');
const OUTPUT_FILE = path.join(__dirname, '异常SKU_output.xlsx');

// ===== 读取样本数据 =====
async function main() {
  console.log('📖 读取样本文件:', SAMPLE_FILE);
  const workbook = XLSX.readFile(SAMPLE_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = rawData[0];
  const dataRows = rawData.slice(1).filter(r => r.length > 0 && r[0]);

  const rows = dataRows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ''; });
    return obj;
  });

  console.log(`📊 共 ${rows.length} 条SKU待审核\n`);

  // ===== 统一 LLM 预审（标题品牌 + 类目匹配 + 图片）=====
  console.log('🤖 正在调用 Claude API 进行综合审核...');
  const llmResults = await unifiedLLMAudit(rows);
  console.log('✅ LLM 审核完成\n');

  // ===== 逐行规则审核 =====
  const anomaliesAll = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = row.sku || row.id || `行${i + 2}`;
    const title = row.title || '(无标题)';
    const catInfo = getFullCategoryPath(row.stdCategoryIdPath);

    const llmResult = llmResults[i] || {};

    // LLM 异常（R03标题品牌、R18图片违禁、R24类目匹配）
    const llmAnomalies = [];
    if (llmResult.titleBrand?.triggered) {
      llmAnomalies.push({
        ruleId: 'R03',
        reason: '标题不规范',
        detail: llmResult.titleBrand.detail || '标题缺品牌或品牌不规范',
      });
    }
    if (llmResult.categoryMatch?.triggered) {
      llmAnomalies.push({
        ruleId: 'R24',
        reason: '商品分类不规范',
        detail: llmResult.categoryMatch.detail || '商品分类与商品主体不匹配',
      });
    }
    if (llmResult.imageAudit?.triggered) {
      llmAnomalies.push({
        ruleId: 'R18',
        reason: '图片不规范',
        detail: llmResult.imageAudit.details?.join('；') || '图片含违禁词或与商品不符',
      });
    }

    // 纯规则审核（跳过 LLM 规则，由 unifiedLLMAudit 统一处理）
    const ruleAnomalies = await checkRow(row, null);

    const allAnomalies = [...ruleAnomalies, ...llmAnomalies];

    if (allAnomalies.length > 0) {
      const { reasons, details } = aggregateAnomalies(allAnomalies);
      anomaliesAll.push({
        序号: anomaliesAll.length + 1,
        日期: formatDate(new Date()),
        SKU: sku,
        名称: title.length > 50 ? title.slice(0, 50) + '...' : title,
        供应商: row.vendorName || '',
        所属采销: row.purchaserId || '',
        类目路径: catInfo.displayPath || catInfo.path || '',
        驳回原因: reasons,
        备注: details.join('；'),
        采销反馈: '',
      });
      console.log(`⚠️  [${sku}] ${title.slice(0, 30)}...`);
      console.log(`   驳回原因: ${reasons}`);
      console.log(`   备注: ${details.join('；')}\n`);
    } else {
      console.log(`✅ [${sku}] ${title.slice(0, 30)}... 通过`);
    }
  }

  // ===== 输出 Excel =====
  console.log(`\n📤 共 ${anomaliesAll.length} 条异常SKU，写入 ${OUTPUT_FILE}`);

  const outputWb = XLSX.utils.book_new();
  const outputData = [
    ['序号', '日期', 'SKU', '名称', '供应商', '所属采销', '类目路径', '驳回原因', '备注', '采销反馈'],
    ...anomaliesAll.map(a => [
      a.序号, a.日期, a.SKU, a.名称, a.供应商, a.所属采销, a.类目路径, a.驳回原因, a.备注, a.采销反馈
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(outputData);
  XLSX.utils.book_append_sheet(outputWb, ws, '异常SKU');
  XLSX.writeFile(outputWb, OUTPUT_FILE);

  console.log('🎉 审核完成!');
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    console.log('💡 提示: 设置 ANTHROPIC_API_KEY 环境变量可启用 LLM 审核');
    console.log('   例: ANTHROPIC_API_KEY=sk-... node 异常SKU_output.js');
  }
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

main().catch(console.error);
