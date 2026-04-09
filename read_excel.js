const XLSX = require('xlsx');

const workbook = XLSX.readFile('审核标准以及demo.xlsx');
console.log('工作表列表:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  console.log(`\n========== ${sheetName} ==========`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 打印前20行
  for (let i = 0; i < Math.min(data.length, 30); i++) {
    console.log(`行${i + 1}:`, JSON.stringify(data[i], null, 2));
  }

  if (data.length > 30) {
    console.log(`\n... 共 ${data.length} 行`);
  }
}
