import ExcelJS from 'exceljs';

/**
 * Normalize ten de so sanh (loai bo dau, khoang trang)
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
 * Format date tu "2025-12-18" hoac "18/12/2025" thanh "18/12"
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
 * Tim sheet co ten la "diem danh"
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
 * Tim dong cua thieu nhi trong sheet
 */
function findStudentRow(worksheet, studentName) {
    const normalizedSearchName = normalizeName(studentName);
    let foundRow = -1;

    // Duyet qua cac dong
    worksheet.eachRow((row, rowNumber) => {
        if (foundRow !== -1) return; // Da tim thay

        // Kiem tra cot D (ho va ten dam) va E (ten)
        const colD = row.getCell(4).value; // Cot D (index 4)
        const colE = row.getCell(5).value; // Column E (index 5)

        if (colD) {
            const fullName = colE ? `${colD} ${colE}` : colD;
            const normalizedFullName = normalizeName(String(fullName));

            if (normalizedFullName === normalizedSearchName) {
                foundRow = rowNumber;
                return;
            }
        }

        // Fallback: tim trong cac cot khac
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
 * Tim cot theo ngay va loai diem danh
 */
function findDateColumn(worksheet, date, attendanceType) {
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Hoc Giao Ly': ['H', 'Há»ŒC GL', 'HGL', 'HOC GL'],
        'Le Thu 5': ['Lá»„ T5', 'T5', 'LE T5', 'LT5'],
        'Le Chua Nhat': ['L', 'Lá»„ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

    // Tim dong header (dong co nhieu ngay)
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

    // Duyet qua cac cot
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
 * Ghi diem danh vao file excel (GIU NGUYEN TAT CA FORMAT)
 * @param {string} filePath - Dinh danh file excel
 * @param {string} studentName - Ten thieu nhi
 * @param {string} date - Ngay diem danh
 * @param {string} attendanceType - Loai diem danh
 * @param {boolean} isPresent - Co mat hay khong
 * @returns {Object} { success: boolean, message: string }
 */
export async function writeAttendanceWithFormat(filePath, studentName, date, attendanceType, isPresent) {
    try {
        // Doc file excel
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        // Tim sheet diem danh
        const worksheet = findAttendanceSheet(workbook);
        if (!worksheet) {
            return {
                success: false,
                message: 'Khong tim thay sheet diem danh trong file excel'
            };
        }

        // Tim dong cua thieu nhi
        const studentRow = findStudentRow(worksheet, studentName);
        if (studentRow === -1) {
            return {
                success: false,
                message: `Khong tim thay thieu nhi "${studentName}" trong sheet`
            };
        }

        // Tim cot theo ngay va loai diem danh
        const dateColumn = findDateColumn(worksheet, date, attendanceType);
        if (dateColumn === -1) {
            return {
                success: false,
                message: `Khong tim thay cot cho ngay ${date} - ${attendanceType}`
            };
        }

        // Ghi gia tri vao o (GIAYUEN FORMAT)
        const cell = worksheet.getRow(studentRow).getCell(dateColumn);
        cell.value = isPresent ? 1 : 0;

        // Force Excel to recalculate all formulas when opening the file
        workbook.calcProperties = {
            fullCalcOnLoad: true
        };

        // Luu file (GIU NGUYEN TAT CA FORMAT)
        await workbook.xlsx.writeFile(filePath);

        return {
            success: true,
            message: `Da ghi diem danh cho ${studentName} vao ${date} - ${attendanceType}`,
            details: {
                sheet: worksheet.name,
                row: studentRow,
                column: dateColumn
            }
        };

    } catch (error) {
        return {
            success: false,
            message: `Loi khi ghi file excel: ${error.message}`
        };
    }
}

export default writeAttendanceWithFormat;
