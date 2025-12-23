import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Normalize ten de so sanh (loai bo dau, khong trang thua)
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Format date tu "2025-12-18" hoac "18/12/2025" thanh "18/12"
 */
function formatDateForExcel(dateString) {
    // Handle YYYY-MM-DD format (from API)
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`; // "2025-12-18" thanh "18/12"
        }
    }

    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`; // "18/12/2025" thanh "18/12"
    }

    return dateString;
}

/**
 * Tim sheet co ten la "Diem danh"
 */
function findAttendanceSheet(workbook) {
    const sheetNames = workbook.SheetNames;

    // Tim sheet co ten la "Diem danh" (case-insensitive)
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
 * Tim dong cua thieu nhi trong sheet
 */
function findStudentRow(sheet, studentName) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const normalizedSearchName = normalizeName(studentName);

    // Duyet qua cac dong
    for (let row = range.s.r; row <= range.e.r; row++) {
        // Kiem tra cot D (ho vay ten dam) va E (ten)
        const colDCell = sheet[XLSX.utils.encode_cell({ r: row, c: 3 })]; // Column D
        const colECell = sheet[XLSX.utils.encode_cell({ r: row, c: 4 })]; // Column E

        if (colDCell && colDCell.v) {
            const fullName = colECell && colECell.v
                ? `${colDCell.v} ${colECell.v}`
                : colDCell.v;

            const normalizedFullName = normalizeName(fullName);

            // So sanh ten day du
            if (normalizedFullName === normalizedSearchName) {
                return row;
            }
        }

        // Fallback: tim trong cac cot khac (cho truong hop ten khong tach)
        for (let col = 0; col <= Math.min(5, range.e.c); col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[cellAddress];

            if (cell && cell.v) {
                const cellValue = String(cell.v);
                const normalizedCellValue = normalizeName(cellValue);

                // So sanh ten
                if (normalizedCellValue === normalizedSearchName) {
                    return row;
                }
            }
        }
    }

    return -1;
}

/**
 * Tim cot theo ngay va loai diem danh
 * Logic: 
 * 1. Tim dong co nhieu ngay
 * 2. Tim cot co ngay khop va loai khop ngay ben duoi
 * 3. Neu cot khong co ngay (trong), dung ngay gan nhat ben trai
 */
function findDateColumn(sheet, date, attendanceType) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Hoc Giao Ly': ['H', 'Há»ŒC GL', 'HGL', 'HOC GL'],
        'Le Thu 5': ['Lá»„ T5', 'T5', 'LE T5', 'LT5'],
        'Le Chua Nhat': ['L', 'Lá»„ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

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
            // So sanh ngay (ho tro ca 7/9 va 07/09)
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
 * Ghi diem danh vao file excel
 * @param {string} filePath - Duong dan file excel
 * @param {string} studentName - Ten thieu nhi
 * @param {string} date - Ngay diem danh (format: DD/MM/YYYY)
 * @param {string} attendanceType - Loai diem danh
 * @param {boolean} isPresent - Co mat hay khong
 * @returns {Object} { success: boolean, message: string }
 */
export function writeAttendance(filePath, studentName, date, attendanceType, isPresent) {
    try {
        // Doc file excel
        const fileBuffer = readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // Tim sheet diem danh
        const attendanceSheetInfo = findAttendanceSheet(workbook);
        if (!attendanceSheetInfo) {
            return {
                success: false,
                message: 'Khong tim thay sheet diem danh trong file excel'
            };
        }

        const sheet = attendanceSheetInfo.sheet;

        // Tim dong cua thieu nhi
        const studentRow = findStudentRow(sheet, studentName);
        if (studentRow === -1) {
            return {
                success: false,
                message: `Khong tim thay thieu nhi "${studentName}" trong sheet`
            };
        }

        // Tim cot theo ngay va loai diem danh
        const dateColumn = findDateColumn(sheet, date, attendanceType);
        if (dateColumn === -1) {
            return {
                success: false,
                message: `Khong tim thay cot cho ngay ${date} - ${attendanceType}`
            };
        }

        // Ghi gia tri vao o
        const cellAddress = XLSX.utils.encode_cell({ r: studentRow, c: dateColumn });
        if (!sheet[cellAddress]) {
            sheet[cellAddress] = {};
        }
        sheet[cellAddress].v = isPresent ? 1 : 0;
        sheet[cellAddress].t = 'n'; // number type

        // Luu file
        XLSX.writeFile(workbook, filePath);

        return {
            success: true,
            message: `Da ghi diem danh cho ${studentName} vao ${date} - ${attendanceType}`,
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
            message: `Loi khi ghi file Excel: ${error.message}`
        };
    }
}

/**
 * Ghi diem danh cho nhieu thieu nhi cung luc
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
