const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Generate an Excel report from a list of transactions.
 * Returns the absolute file path to the generated .xlsx file.
 */
async function generateReport(transactions, firstName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Money Tracker Bot';
  workbook.created = new Date();

  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();

  const sheet = workbook.addWorksheet(`Laporan ${monthName} ${year}`);

  // ─── Title Row ─────────────────────────────────────────────
  sheet.mergeCells('A1:E1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `💰 Laporan Keuangan — ${monthName} ${year}`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1A73E8' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 35;

  // Subtitle
  sheet.mergeCells('A2:E2');
  const subTitle = sheet.getCell('A2');
  subTitle.value = `Pengguna: ${firstName}`;
  subTitle.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF666666' } };
  subTitle.alignment = { horizontal: 'center' };

  // ─── Header Row ────────────────────────────────────────────
  const headerRow = sheet.addRow(['No', 'Tanggal', 'Item', 'Kategori', 'Jumlah (Rp)']);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A73E8' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  sheet.getRow(3).height = 25;

  // ─── Data Rows ─────────────────────────────────────────────
  let totalAmount = 0;

  transactions.forEach((tx, index) => {
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}/${date.getFullYear()}`;

    const row = sheet.addRow([
      index + 1,
      dateStr,
      tx.item,
      tx.category,
      Number(tx.amount),
    ]);

    totalAmount += Number(tx.amount);

    // Alternate row colors
    const bgColor = index % 2 === 0 ? 'FFF8F9FA' : 'FFFFFFFF';
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };

      if (colNum === 5) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      }
    });
  });

  // ─── Total Row ─────────────────────────────────────────────
  const totalRow = sheet.addRow(['', '', '', 'TOTAL', totalAmount]);
  totalRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', size: 12, bold: true };
    if (colNum === 5) {
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right' };
      cell.font = {
        name: 'Calibri',
        size: 12,
        bold: true,
        color: { argb: 'FF1A73E8' },
      };
    }
    cell.border = {
      top: { style: 'double' },
    };
  });

  // ─── Column Widths ─────────────────────────────────────────
  sheet.getColumn(1).width = 6;   // No
  sheet.getColumn(2).width = 14;  // Tanggal
  sheet.getColumn(3).width = 28;  // Item
  sheet.getColumn(4).width = 22;  // Kategori
  sheet.getColumn(5).width = 18;  // Jumlah

  // ─── Write to temp file ────────────────────────────────────
  const tmpDir = os.tmpdir();
  const fileName = `laporan_${monthName.toLowerCase()}_${year}_${Date.now()}.xlsx`;
  const filePath = path.join(tmpDir, fileName);

  await workbook.xlsx.writeFile(filePath);

  return filePath;
}

/**
 * Clean up a generated report file.
 */
function cleanupReport(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup report file:', err.message);
  }
}

module.exports = { generateReport, cleanupReport };
