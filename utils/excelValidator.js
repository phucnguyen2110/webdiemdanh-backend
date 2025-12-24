import XLSX from 'xlsx';
import { readFileSync } from 'fs';

/**
 * Normalize text for comparison
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Format date from "2025-12-18" to "18/12"
 */
function formatDateForExcel(dateString) {
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`;
        }
    }

    const parts = dateString.split('/');
    if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }

    return dateString;
}

/**
 * Find "Diem danh" sheet
 */
function findAttendanceSheet(workbook) {
    const sheetNames = workbook.SheetNames;
    const attendanceSheetName = sheetNames.find(name =>
        normalizeName(name).includes('diem danh')
    );

    if (!attendanceSheetName) {
        return null;
    }

    return {
        name: attendanceSheetName,
        sheet: workbook.Sheets[attendanceSheetName]
    };
}

/**
 * Find date column matching date and attendance type
 */
function findDateColumn(sheet, date, attendanceType) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Hoc Giao Ly': ['H', 'HỌC GL', 'HGL', 'HOC GL'],
        'Le Thu 5': ['LỄ T5', 'T5', 'LE T5', 'LT5'],
        'Le Chua Nhat': ['L', 'LỄ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

    // Find header row (row with many dates)
    let headerRow = -1;
    for (let row = range.s.r; row <= Math.min(range.s.r + 20, range.e.r); row++) {
        let dateCount = 0;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.v && String(cell.v).match(/\d{1,2}\/\d{1,2}/)) {
                dateCount++;
            }
        }
        if (dateCount >= 3) {
            headerRow = row;
            break;
        }
    }

    if (headerRow === -1) {
        return -1;
    }

    const typeRow = headerRow + 1;
    let lastSeenDate = null;

    for (let col = range.s.c; col <= range.e.c; col++) {
        const dateCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
        const typeCell = sheet[XLSX.utils.encode_cell({ r: typeRow, c: col })];

        const dateValue = dateCell?.v ? String(dateCell.v).trim() : '';
        const typeValue = typeCell?.v ? String(typeCell.v).toUpperCase().trim() : '';

        if (dateValue.includes('/')) {
            lastSeenDate = dateValue;
        }

        const hasPattern = typePatterns.some(pattern =>
            typeValue.includes(pattern.toUpperCase())
        );

        if (hasPattern) {
            const normalizedDate = dateValue.split('/').map(n => parseInt(n) || 0).join('/');
            const normalizedSearchDate = dateStr.split('/').map(n => parseInt(n) || 0).join('/');
            const normalizedLastDate = lastSeenDate ? lastSeenDate.split('/').map(n => parseInt(n) || 0).join('/') : null;

            if (dateValue.includes('/') && normalizedDate === normalizedSearchDate) {
                return col;
            }

            if (!dateValue.includes('/') && normalizedLastDate === normalizedSearchDate) {
                return col;
            }
        }
    }

    return -1;
}

/**
 * Validate if date and attendance type exist in Excel file
 * @param {string} filePath - Excel file path
 * @param {string} date - Attendance date (YYYY-MM-DD)
 * @param {string} attendanceType - Attendance type
 * @returns {Object} { valid: boolean, message: string, details?: object }
 */
export function validateAttendanceColumn(filePath, date, attendanceType) {
    try {
        // Read Excel file
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // Find attendance sheet
        const attendanceSheetInfo = findAttendanceSheet(workbook);
        if (!attendanceSheetInfo) {
            return {
                valid: false,
                message: 'Không tìm thấy sheet "Điểm danh" trong file Excel'
            };
        }

        const sheet = attendanceSheetInfo.sheet;

        // Find date column
        const dateColumn = findDateColumn(sheet, date, attendanceType);
        if (dateColumn === -1) {
            const dateStr = formatDateForExcel(date);
            return {
                valid: false,
                message: `Không tìm thấy cột điểm danh cho ngày ${dateStr} - ${attendanceType} trong file Excel`,
                details: {
                    date: dateStr,
                    attendanceType: attendanceType,
                    hint: 'Kiểm tra xem file Excel có cột với ngày và loại điểm danh này không'
                }
            };
        }

        return {
            valid: true,
            message: 'Tìm thấy cột điểm danh phù hợp',
            details: {
                sheet: attendanceSheetInfo.name,
                column: dateColumn,
                date: formatDateForExcel(date),
                attendanceType: attendanceType
            }
        };

    } catch (error) {
        return {
            valid: false,
            message: `Lỗi khi đọc file Excel: ${error.message}`
        };
    }
}

/**
 * Get all available attendance columns from Excel
 * @param {string} filePath - Excel file path
 * @returns {Array} List of available dates and types
 */
export function getAvailableAttendanceColumns(filePath) {
    try {
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        const attendanceSheetInfo = findAttendanceSheet(workbook);
        if (!attendanceSheetInfo) {
            return [];
        }

        const sheet = attendanceSheetInfo.sheet;
        const range = XLSX.utils.decode_range(sheet['!ref']);

        // Find header row
        let headerRow = -1;
        for (let row = range.s.r; row <= Math.min(range.s.r + 20, range.e.r); row++) {
            let dateCount = 0;
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
                if (cell && cell.v && String(cell.v).match(/\d{1,2}\/\d{1,2}/)) {
                    dateCount++;
                }
            }
            if (dateCount >= 3) {
                headerRow = row;
                break;
            }
        }

        if (headerRow === -1) {
            return [];
        }

        const typeRow = headerRow + 1;
        const columns = [];
        let lastSeenDate = null;

        for (let col = range.s.c; col <= range.e.c; col++) {
            const dateCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
            const typeCell = sheet[XLSX.utils.encode_cell({ r: typeRow, c: col })];

            const dateValue = dateCell?.v ? String(dateCell.v).trim() : '';
            const typeValue = typeCell?.v ? String(typeCell.v).trim() : '';

            if (dateValue.includes('/')) {
                lastSeenDate = dateValue;
            }

            if (typeValue) {
                columns.push({
                    date: dateValue || lastSeenDate,
                    type: typeValue,
                    column: col
                });
            }
        }

        return columns;

    } catch (error) {
        console.error('Error reading Excel columns:', error);
        return [];
    }
}
