import XLSX from 'xlsx';
import { readFileSync } from 'fs';

/**
 * Convert Excel serial date to DD/MM/YYYY format
 * @param {number} serial - Excel serial date number
 * @returns {string} Date in DD/MM/YYYY format
 */
function excelSerialToDate(serial) {
    if (!serial || isNaN(serial)) return serial;

    // Náº¿u khÃ´ng pháº£i sá»‘, tráº£ vá» nguyÃªn giÃ¡ trá»‹
    if (typeof serial !== 'number') return serial;

    // Use XLSX's built-in date parser for accurate conversion
    const dateObj = XLSX.SSF.parse_date_code(serial);

    if (!dateObj) return serial;

    const day = String(dateObj.d).padStart(2, '0');
    const month = String(dateObj.m).padStart(2, '0');
    const year = dateObj.y;

    return `${day}/${month}/${year}`;
}

/**
 * Process cell value - convert Excel serial dates to readable format
 * @param {any} value - Cell value
 * @param {number} colIndex - Column index (0-based)
 * @returns {any} Processed value
 */
function processCellValue(value, colIndex) {
    // Auto-detect Excel serial dates
    // Excel dates are typically between 1 (1/1/1900) and 100000 (year 2173)
    if (typeof value === 'number' && value > 1 && value < 100000) {
        // Check if it looks like a date (no decimals or small decimals)
        const hasSmallDecimal = (value % 1) < 0.01;
        if (hasSmallDecimal || value % 1 === 0) {
            // Likely a date - convert it
            return excelSerialToDate(value);
        }
    }
    return value;
}

/**
 * Äá»c táº¥t cáº£ cÃ¡c sheets tá»« file Excel
 * @param {string} filePath - ÄÆ°á»ng dáº«n tá»›i file Excel
 * @returns {Array} Máº£ng cÃ¡c sheets vá»›i tÃªn vÃ  dá»¯ liá»‡u
 */
export function readAllSheets(filePath) {
    try {
        // Äá»c file Excel
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // Láº¥y táº¥t cáº£ sheets
        const sheets = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            // Convert sheet sang máº£ng 2D
            const rawData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,  // Tráº£ vá» máº£ng 2D thay vÃ¬ objects
                defval: ''  // GiÃ¡ trá»‹ máº·c Ä‘á»‹nh cho Ã´ trá»‘ng
            });

            // Process data - convert Excel serial dates
            const data = rawData.map(row =>
                row.map((cell, colIndex) => processCellValue(cell, colIndex))
            );

            sheets.push({
                name: sheetName,
                data: data,
                rowCount: data.length,
                colCount: data.length > 0 ? Math.max(...data.map(row => row.length)) : 0
            });
        }

        return sheets;

    } catch (error) {
        throw new Error(`Lá»—i khi Ä‘á»c file Excel: ${error.message}`);
    }
}

/**
 * Äá»c má»™t sheet cá»¥ thá»ƒ tá»« file Excel
 * @param {string} filePath - ÄÆ°á»ng dáº«n tá»›i file Excel
 * @param {string} sheetName - TÃªn sheet cáº§n Ä‘á»c
 * @returns {Object} Dá»¯ liá»‡u cá»§a sheet
 */
export function readSheet(filePath, sheetName) {
    try {
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        if (!workbook.SheetNames.includes(sheetName)) {
            throw new Error(`Sheet "${sheetName}" khÃ´ng tá»“n táº¡i trong file`);
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: ''
        });

        // Process data - convert Excel serial dates
        const data = rawData.map(row =>
            row.map((cell, colIndex) => processCellValue(cell, colIndex))
        );

        return {
            name: sheetName,
            data: data,
            rowCount: data.length,
            colCount: data.length > 0 ? Math.max(...data.map(row => row.length)) : 0
        };

    } catch (error) {
        throw new Error(`Lá»—i khi Ä‘á»c sheet: ${error.message}`);
    }
}

/**
 * Láº¥y danh sÃ¡ch tÃªn cÃ¡c sheets trong file Excel
 * @param {string} filePath - ÄÆ°á»ng dáº«n tá»›i file Excel
 * @returns {Array} Máº£ng tÃªn cÃ¡c sheets
 */
export function getSheetNames(filePath) {
    try {
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        return workbook.SheetNames;
    } catch (error) {
        throw new Error(`Lá»—i khi Ä‘á»c danh sÃ¡ch sheets: ${error.message}`);
    }
}
