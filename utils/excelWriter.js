import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Normalize tÃªn Ä‘á»ƒ so sÃ¡nh (loáº¡i bá» dáº¥u, khoáº£ng tráº¯ng thá»«a)
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/Ä‘/g, 'd')  // Convert Ä‘ to d
        .replace(/Ä/g, 'd')  // Convert Ä to d
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Format date tá»« "2025-12-18" hoáº·c "18/12/2025" thÃ nh "18/12"
 */
function formatDateForExcel(dateString) {
    // Handle YYYY-MM-DD format (from API)
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`; // "2025-12-18" â†’ "18/12"
        }
    }

    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`; // "18/12/2025" â†’ "18/12"
    }

    return dateString;
}

/**
 * TÃ¬m sheet cÃ³ tÃªn chá»©a "Ä‘iá»ƒm danh"
 */
function findAttendanceSheet(workbook) {
    const sheetNames = workbook.SheetNames;

    // TÃ¬m sheet cÃ³ chá»©a "Ä‘iá»ƒm danh" (case-insensitive)
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
 * TÃ¬m dÃ²ng cá»§a thiáº¿u nhi trong sheet
 */
function findStudentRow(sheet, studentName) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const normalizedSearchName = normalizeName(studentName);

    // Duyá»‡t qua cÃ¡c dÃ²ng
    for (let row = range.s.r; row <= range.e.r; row++) {
        // Kiá»ƒm tra cá»™t D (há» vÃ  tÃªn Ä‘á»‡m) vÃ  E (tÃªn)
        const colDCell = sheet[XLSX.utils.encode_cell({ r: row, c: 3 })]; // Column D
        const colECell = sheet[XLSX.utils.encode_cell({ r: row, c: 4 })]; // Column E

        if (colDCell && colDCell.v) {
            // GhÃ©p cá»™t D vÃ  E Ä‘á»ƒ táº¡o tÃªn Ä‘áº§y Ä‘á»§
            const fullName = colECell && colECell.v
                ? `${colDCell.v} ${colECell.v}`
                : colDCell.v;

            const normalizedFullName = normalizeName(fullName);

            // So sÃ¡nh tÃªn Ä‘áº§y Ä‘á»§
            if (normalizedFullName === normalizedSearchName) {
                return row;
            }
        }

        // Fallback: tÃ¬m trong cÃ¡c cá»™t khÃ¡c (cho trÆ°á»ng há»£p tÃªn khÃ´ng tÃ¡ch)
        for (let col = 0; col <= Math.min(5, range.e.c); col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[cellAddress];

            if (cell && cell.v) {
                const cellValue = String(cell.v);
                const normalizedCellValue = normalizeName(cellValue);

                // So sÃ¡nh tÃªn
                if (normalizedCellValue === normalizedSearchName) {
                    return row;
                }
            }
        }
    }

    return -1;
}

/**
 * TÃ¬m cá»™t theo ngÃ y vÃ  loáº¡i Ä‘iá»ƒm danh
 * Logic: 
 * 1. Tá»± Ä‘á»™ng phÃ¡t hiá»‡n dÃ²ng header (tÃ¬m dÃ²ng cÃ³ nhiá»u ngÃ y)
 * 2. TÃ¬m cá»™t cÃ³ ngÃ y khá»›p vÃ  loáº¡i khá»›p ngay bÃªn dÆ°á»›i
 * 3. Náº¿u cá»™t khÃ´ng cÃ³ ngÃ y (trá»‘ng), dÃ¹ng ngÃ y tá»« cá»™t gáº§n nháº¥t bÃªn trÃ¡i
 */
function findDateColumn(sheet, date, attendanceType) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Há»c GiÃ¡o LÃ½': ['H', 'Há»ŒC GL', 'HGL', 'HOC GL'],
        'Lá»… Thá»© 5': ['Lá»„ T5', 'T5', 'LE T5', 'LT5'],
        'Lá»… ChÃºa Nháº­t': ['L', 'Lá»„ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

    // BÆ°á»›c 1: TÃ¬m dÃ²ng header (dÃ²ng cÃ³ nhiá»u ngÃ y)
    let headerRow = -1;
    for (let row = range.s.r; row <= Math.min(range.s.r + 20, range.e.r); row++) {
        let dateCount = 0;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.v && String(cell.v).match(/\d{1,2}\/\d{1,2}/)) {
                dateCount++;
            }
        }
        // Náº¿u dÃ²ng cÃ³ >= 3 ngÃ y, coi lÃ  header
        if (dateCount >= 3) {
            headerRow = row;
            break;
        }
    }

    if (headerRow === -1) {
        return -1; // KhÃ´ng tÃ¬m tháº¥y header
    }

    const typeRow = headerRow + 1; // DÃ²ng loáº¡i Ä‘iá»ƒm danh ngay bÃªn dÆ°á»›i

    // BÆ°á»›c 2: Duyá»‡t qua cÃ¡c cá»™t Ä‘á»ƒ tÃ¬m ngÃ y + loáº¡i
    let lastSeenDate = null;

    for (let col = range.s.c; col <= range.e.c; col++) {
        const dateCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
        const typeCell = sheet[XLSX.utils.encode_cell({ r: typeRow, c: col })];

        const dateValue = dateCell?.v ? String(dateCell.v).trim() : '';
        const typeValue = typeCell?.v ? String(typeCell.v).toUpperCase().trim() : '';

        // Náº¿u cÃ³ ngÃ y, lÆ°u láº¡i
        if (dateValue.includes('/')) {
            lastSeenDate = dateValue;
        }

        // Kiá»ƒm tra loáº¡i Ä‘iá»ƒm danh
        const hasPattern = typePatterns.some(pattern =>
            typeValue.includes(pattern.toUpperCase())
        );

        if (hasPattern) {
            // So sÃ¡nh ngÃ y (há»— trá»£ cáº£ 7/9 vÃ  07/09)
            const normalizedDate = dateValue.split('/').map(n => parseInt(n) || 0).join('/');
            const normalizedSearchDate = dateStr.split('/').map(n => parseInt(n) || 0).join('/');
            const normalizedLastDate = lastSeenDate ? lastSeenDate.split('/').map(n => parseInt(n) || 0).join('/') : null;

            // Case 1: Cá»™t nÃ y cÃ³ ngÃ y vÃ  khá»›p
            if (dateValue.includes('/') && normalizedDate === normalizedSearchDate) {
                return col;
            }

            // Case 2: Cá»™t nÃ y khÃ´ng cÃ³ ngÃ y, dÃ¹ng ngÃ y gáº§n nháº¥t bÃªn trÃ¡i
            if (!dateValue.includes('/') && normalizedLastDate === normalizedSearchDate) {
                return col;
            }
        }
    }

    return -1;
}

/**
 * Ghi Ä‘iá»ƒm danh vÃ o file Excel
 * @param {string} filePath - ÄÆ°á»ng dáº«n file Excel
 * @param {string} studentName - TÃªn thiáº¿u nhi
 * @param {string} date - NgÃ y Ä‘iá»ƒm danh (format: DD/MM/YYYY)
 * @param {string} attendanceType - Loáº¡i Ä‘iá»ƒm danh
 * @param {boolean} isPresent - CÃ³ máº·t hay khÃ´ng
 * @returns {Object} { success: boolean, message: string }
 */
export function writeAttendance(filePath, studentName, date, attendanceType, isPresent) {
    try {
        // Äá»c file Excel
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // TÃ¬m sheet Ä‘iá»ƒm danh
        const attendanceSheetInfo = findAttendanceSheet(workbook);
        if (!attendanceSheetInfo) {
            return {
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y sheet Ä‘iá»ƒm danh trong file Excel'
            };
        }

        const sheet = attendanceSheetInfo.sheet;

        // TÃ¬m dÃ²ng cá»§a thiáº¿u nhi
        const studentRow = findStudentRow(sheet, studentName);
        if (studentRow === -1) {
            return {
                success: false,
                message: `KhÃ´ng tÃ¬m tháº¥y thiáº¿u nhi "${studentName}" trong sheet`
            };
        }

        // TÃ¬m cá»™t theo ngÃ y vÃ  loáº¡i Ä‘iá»ƒm danh
        const dateColumn = findDateColumn(sheet, date, attendanceType);
        if (dateColumn === -1) {
            return {
                success: false,
                message: `KhÃ´ng tÃ¬m tháº¥y cá»™t cho ngÃ y ${date} - ${attendanceType}`
            };
        }

        // Ghi giÃ¡ trá»‹ vÃ o Ã´
        const cellAddress = XLSX.utils.encode_cell({ r: studentRow, c: dateColumn });
        if (!sheet[cellAddress]) {
            sheet[cellAddress] = {};
        }
        sheet[cellAddress].v = isPresent ? 1 : 0;
        sheet[cellAddress].t = 'n'; // number type

        // LÆ°u file
        XLSX.writeFile(workbook, filePath);

        return {
            success: true,
            message: `ÄÃ£ ghi Ä‘iá»ƒm danh cho ${studentName} vÃ o ${date} - ${attendanceType}`,
            details: {
                sheet: attendanceSheetInfo.name,
                row: studentRow,
                column: dateColumn,
                cell: cellAddress
            }
        };

    } catch (error) {
        return {
            success: false,
            message: `Lá»—i khi ghi file Excel: ${error.message}`
        };
    }
}

/**
 * Ghi Ä‘iá»ƒm danh cho nhiá»u thiáº¿u nhi cÃ¹ng lÃºc
 */
export async function writeAttendanceBulk(filePath, attendanceData) {
    const results = [];

    for (const data of attendanceData) {
        const result = writeAttendance(
            filePath,
            data.studentName,
            data.date,
            data.attendanceType,
            data.isPresent
        );
        results.push({
            studentName: data.studentName,
            ...result
        });
    }

    return results;
}
