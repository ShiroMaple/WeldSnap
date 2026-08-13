const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(process.cwd(), 'public', 'demo.xlsx');
const wb = xlsx.readFile(filePath);

console.log('Sheet Names:', wb.SheetNames);
wb.SheetNames.forEach(sheetName => {
  console.log(`\n--- Sheet: ${sheetName} ---`);
  const sheet = wb.Sheets[sheetName];
  console.log('Range:', sheet['!ref']);
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log('Row Count:', rows.length);
  rows.slice(0, 10).forEach((row, index) => {
    console.log(`Row ${index + 1}:`, JSON.stringify(row));
  });
});
