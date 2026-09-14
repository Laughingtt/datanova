/**
 * Excel (.xlsx) exporter.
 *
 * Uses exceljs to build a workbook in memory and return a Buffer suitable
 * for HTTP streaming. The output:
 *   - First row bold + light fill (header styling)
 *   - Columns auto-sized to header content (capped)
 *   - Sheet name sanitised (Excel rejects names > 31 chars and some chars)
 */
import ExcelJS from 'exceljs';

const MAX_SHEET_NAME = 31;
const MAX_COL_WIDTH = 60;
const MIN_COL_WIDTH = 10;

/**
 * Build an .xlsx workbook as a Buffer.
 *
 * @param sheetName  name for the single sheet (sanitised if needed)
 * @param columns    column headers
 * @param rows       row arrays aligned to columns
 */
export async function toExcel(
  sheetName: string,
  columns: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DataNova';
  wb.created = new Date();

  const safeName = sanitiseSheetName(sheetName);
  const sheet = wb.addWorksheet(safeName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: Math.min(
      MAX_COL_WIDTH,
      Math.max(MIN_COL_WIDTH, [...header].reduce((n, _c) => n + 1.2, 4))
    ),
  }));

  // Style the header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6EEF8' }, // very light blue
  };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 22;

  for (const row of rows) {
    // exceljs treats null as empty cell. Preserve order/length.
    sheet.addRow(row);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Excel sheet names must be ≤ 31 chars and cannot contain
 * `: \ / ? * [ ]`. Replace forbidden chars with `_` and truncate.
 */
function sanitiseSheetName(name: string): string {
  let s = (name || 'Data').replace(/[:\\/?*[\]]/g, '_');
  if (s.length > MAX_SHEET_NAME) s = s.slice(0, MAX_SHEET_NAME);
  return s.length > 0 ? s : 'Data';
}