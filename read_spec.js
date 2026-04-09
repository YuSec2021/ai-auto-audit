const XLSX = require('xlsx');

const workbook = XLSX.readFile('审核标准以及demo.xlsx');
const sheet = workbook.Sheets['上架审核规范'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// 只打印规范相关的行
for (let i = 4; i < data.length; i++) {
  const row = data[i];
  if (row && row.length > 0 && row[0]) {
    console.log(`【${row[0]}】${row[1] || ''}`);
    console.log(`  是否必审: ${row[2] || '-'}, 是否必填: ${row[3] || '-'}`);
    console.log(`  规范: ${row[4] || '-'}`);
    console.log('---');
  }
}
