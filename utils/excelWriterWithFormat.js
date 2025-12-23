import ExcelJS from 'exceljs';

/**
 * Normalize tÃªn Ä‘á»ƒ so sÃ¡nh (loáº¡i bá» dáº¥u, khoáº£ng tráº¯ng thá»«a)
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/Ä‘/g, 'd')
        .replace(/Ä/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Format date tá»« "2025-12-18" hoáº·c "18/12/2025" thÃ nh "18/12"
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
 * TÃ¬m sheet cÃ³ tÃªn chá»©a "Ä‘iá»ƒm danh"
 */
function findAttendanceSheet(workbook) {
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    const attendanceSheetName = sheetNames.find(name =>
        normalizeName(name).includes('diem danh')
    );

    if (!attendanceSheetName) {
        return null;
    }

    return workbook.getWorksheet(attendanceSheetName);
}

/**
 * TÃ¬m dÃ²ng cá»§a thiáº¿u nhi trong sheet
 */
function findStudentRow(worksheet, studentName) {
    const normalizedSearchName = normalizeName(studentName);
    let foundRow = -1;

    // Duyá»‡t qua cÃ¡c dÃ²ng
    worksheet.eachRow((row, rowNumber) => {
        if (foundRow !== -1) return; // Already found

        // Kiá»ƒm tra cá»™t D (há» vÃ  tÃªn Ä‘á»‡m) vÃ  E (tÃªn)
        const colD = row.getCell(4).value; // Column D (index 4)
        const colE = row.getCell(5).value; // Column E (index 5)

        if (colD) {
            const fullName = colE ? `${colD} ${colE}` : colD;
            const normalizedFullName = normalizeName(String(fullName));

            if (normalizedFullName === normalizedSearchName) {
                foundRow = rowNumber;
                return;
            }
        }

        // Fallback: tÃ¬m trong cÃ¡c cá»™t khÃ¡c
        for (let col = 1; col <= 6; col++) {
            const cell = row.getCell(col);
            if (cell.value) {
                const cellValue = String(cell.value);
                const normalizedCellValue = normalizeName(cellValue);

                if (normalizedCellValue === normalizedSearchName) {
                    foundRow = rowNumber;
                    return;
                }
            }
        }
    });

    return foundRow;
}

/**
 * TÃ¬m cá»™t theo ngÃ y vÃ  loáº¡i Ä‘iá»ƒm danh
 */
function findDateColumn(worksheet, date, attendanceType) {
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Há»c GiÃ¡o LÃ½': ['H', 'Há»ŒC GL', 'HGL', 'HOC GL'],
        'Lá»… Thá»© 5': ['Lá»„ T5', 'T5', 'LE T5', 'LT5'],
        'Lá»… ChÃºa Nháº­t': ['L', 'Lá»„ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

    // TÃ¬m dÃ²ng header (dÃ²ng cÃ³ nhiá»u ngÃ y)
    let headerRow = -1;
    for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let dateCount = 0;

        row.eachCell((cell) => {
            if (cell.value && String(cell.value).match(/\d{1,2}\/\d{1,2}/)) {
                dateCount++;
            }
        });

        if (dateCount >= 3) {
            headerRow = rowNum;
            break;
        }
    }

    if (headerRow === -1) {
        return -1;
    }

    const typeRow = headerRow + 1;
    const headerRowObj = worksheet.getRow(headerRow);
    const typeRowObj = worksheet.getRow(typeRow);

    let lastSeenDate = null;

    // Duyá»‡t qua cÃ¡c cá»™t
    for (let col = 1; col <= worksheet.columnCount; col++) {
        const dateCell = headerRowObj.getCell(col);
        const typeCell = typeRowObj.getCell(col);

        const dateValue = dateCell.value ? String(dateCell.value).trim() : '';
        const typeValue = typeCell.value ? String(typeCell.value).toUpperCase().trim() : '';

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
 * Ghi Ä‘iá»ƒm danh vÃ o file Excel (GIá»® NGUYÃŠN FORMAT)
 * @param {string} filePath - ÄÆ°á»ng dáº«n file Excel
 * @param {string} studentName - TÃªn thiáº¿u nhi
 * @param {string} date - NgÃ y Ä‘iá»ƒm danh
 * @param {string} attendanceType - Loáº¡i Ä‘iá»ƒm danh
 * @param {boolean} isPresent - CÃ³ máº·t hay khÃ´ng
 * @returns {Object} { success: boolean, message: string }
 */
export async function writeAttendanceWithFormat(filePath, studentName, date, attendanceType, isPresent) {
    try {
        // Äá»c file Excel
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        // TÃ¬m sheet Ä‘iá»ƒm danh
        const worksheet = findAttendanceSheet(workbook);
        if (!worksheet) {
            return {
                success: false,
                message: 'KhÃ´ng tÃ¬m tháº¥y sheet Ä‘iá»ƒm danh trong file Excel'
            };
        }

        // TÃ¬m dÃ²ng cá»§a thiáº¿u nhi
        const studentRow = findStudentRow(worksheet, studentName);
        if (studentRow === -1) {
            return {
                success: false,
                message: `KhÃ´ng tÃ¬m tháº¥y thiáº¿u nhi "${studentName}" trong sheet`
            };
        }

        // TÃ¬m cá»™t theo ngÃ y vÃ  loáº¡i Ä‘iá»ƒm danh
        const dateColumn = findDateColumn(worksheet, date, attendanceType);
        if (dateColumn === -1) {
            return {
                success: false,
                message: `KhÃ´ng tÃ¬m tháº¥y cá»™t cho ngÃ y ${date} - ${attendanceType}`
            };
        }

        // Ghi giÃ¡ trá»‹ vÃ o Ã´ (GIá»® NGUYÃŠN FORMAT)
        const cell = worksheet.getRow(studentRow).getCell(dateColumn);
        cell.value = isPresent ? 1 : 0;
        // KhÃ´ng thay Ä‘á»•i style, format cá»§a cell

        // Force Excel to recalculate all formulas when opening the file
        workbook.calcProperties = {
            fullCalcOnLoad: true
        };

        // LÆ°u file (GIá»® NGUYÃŠN Táº¤T Cáº¢ FORMAT)
        await workbook.xlsx.writeFile(filePath);

        return {
            success: true,
            message: `ÄÃ£ ghi Ä‘iá»ƒm danh cho ${studentName} vÃ o ${date} - ${attendanceType}`,
            details: {
                sheet: worksheet.name,
                row: studentRow,
                column: dateColumn
            }
        };

    } catch (error) {
        return {
            success: false,
            message: `Lá»—i khi ghi file Excel: ${error.message}`
        };
    }
}

export default writeAttendanceWithFormat;
