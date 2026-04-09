const fs = require('fs');
const path = require('path');

// 读取 CSV
console.log('正在读取 CSV...');
const content = fs.readFileSync('_StdProduct__202604021044.csv', 'utf-8');
const lines = content.split('\n');
const headers = lines[0].split(',');

console.log(`总行数: ${lines.length}`);

// 找到关键列索引
const vendorNameIndex = headers.findIndex(h => h === 'vendorName');
const priceFactoryIndex = headers.findIndex(h => h === 'priceFactory');
console.log(`vendorName 索引: ${vendorNameIndex}, priceFactory 索引: ${priceFactoryIndex}`);

// CSV 行解析函数（处理引号内的逗号）
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// 先过滤 priceFactory 为空的行
const 待审核Rows = [];
const 正常Rows = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const values = parseCSVLine(line);
  const priceFactory = values[priceFactoryIndex]?.trim();

  if (priceFactory === '' || priceFactory === null || priceFactory === undefined) {
    待审核Rows.push(line);
  } else {
    正常Rows.push(line);
  }
}

console.log(`\npriceFactory为空（待审核）: ${待审核Rows.length} 条`);
console.log(`priceFactory不为空（正常）: ${正常Rows.length} 条`);

// 写入待审核.csv
fs.writeFileSync('待审核.csv', headers.join(',') + '\n' + 待审核Rows.join('\n'));
console.log(`\n已保存: 待审核.csv (${待审核Rows.length} 条)`);

// 按 vendorName 拆分待审核数据
const groups = {};
let emptyVendorCount = 0;

for (const line of 待审核Rows) {
  const values = parseCSVLine(line);
  let vendorName = values[vendorNameIndex]?.trim();

  if (!vendorName || vendorName === '') {
    vendorName = '暂无供应商';
    emptyVendorCount++;
  }

  if (!groups[vendorName]) {
    groups[vendorName] = [];
  }
  groups[vendorName].push(line);
}

console.log(`\n待审核数据分组（vendorName为空合并到暂无供应商）:`);
console.log(`  分组数: ${Object.keys(groups).length}`);
console.log(`  暂无供应商组: ${emptyVendorCount} 条`);

// 创建输出目录
const outputDir = './vendor_待审核';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// 写入每个供应商的 CSV
for (const [vendorName, rows] of Object.entries(groups)) {
  // 文件名安全处理
  const safeFileName = vendorName.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);
  const outputPath = path.join(outputDir, `${safeFileName}.csv`);

  const csvContent = headers.join(',') + '\n' + rows.join('\n');
  fs.writeFileSync(outputPath, csvContent);
}

console.log(`\n已拆分到 ${outputDir} 目录`);
console.log(`共 ${Object.keys(groups).length} 个文件`);
