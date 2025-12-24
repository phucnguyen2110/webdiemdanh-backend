import XLSX from 'xlsx';

/**
 * Normalize name for comparison
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
 * Find student row in sheet
 */
function findStudentRow(sheet, studentName) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const normalizedSearchName = normalizeName(studentName);

    for (let row = range.s.r; row <= range.e.r; row++) {
        // Check columns D and E (baptismal name + full name)
        const colDCell = sheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
        const colECell = sheet[XLSX.utils.encode_cell({ r: row, c: 4 })];

        if (colDCell && colDCell.v) {
            const fullName = colECell && colECell.v
                ? `${colDCell.v} ${colECell.v}`
                : colDCell.v;

            const normalizedFullName = normalizeName(fullName);

            if (normalizedFullName === normalizedSearchName) {
                return row;
            }
        }

        // Fallback: search in other columns
        for (let col = 0; col <= Math.min(5, range.e.c); col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[cellAddress];

            if (cell && cell.v) {
                const cellValue = String(cell.v);
                const normalizedCellValue = normalizeName(cellValue);

                if (normalizedCellValue === normalizedSearchName) {
                    return row;
                }
            }
        }
    }

    return -1;
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
 * Merge attendance data into Excel workbook
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {Array} attendanceSessions - Array of attendance sessions with records
 * @returns {Buffer} Modified Excel file buffer
 */
export function mergeAttendanceIntoExcel(fileBuffer, attendanceSessions) {
    try {
        // Read workbook with cellStyles to preserve formatting
        const workbook = XLSX.read(fileBuffer, {
            type: 'buffer',
            cellStyles: true  // Preserve cell styles
        });

        // Find attendance sheet
        const attendanceSheetInfo = findAttendanceSheet(workbook);
        if (!attendanceSheetInfo) {
            console.warn('No attendance sheet found, returning original file');
            return fileBuffer;
        }

        const sheet = attendanceSheetInfo.sheet;
        let modifiedCount = 0;

        // Process each attendance session
        for (const session of attendanceSessions) {
            const { date, type, records } = session;

            console.log(`🔍 Processing session: ${date} - ${type} (${records.length} students)`);

            // Find date column
            const dateColumn = findDateColumn(sheet, date, type);
            if (dateColumn === -1) {
                console.warn(`❌ Column not found for ${date} - ${type}`);
                console.warn(`   Formatted date: ${formatDateForExcel(date)}`);
                continue;
            }

            console.log(`✅ Found column ${dateColumn} for ${date} - ${type}`);

            // Write attendance for each student
            for (const record of records) {
                const { studentName, isPresent } = record;

                // Find student row
                const studentRow = findStudentRow(sheet, studentName);
                if (studentRow === -1) {
                    console.warn(`Student not found: ${studentName}`);
                    continue;
                }

                // Only write 1 for present students, skip absent (don't write 0)
                if (isPresent) {
                    const cellAddress = XLSX.utils.encode_cell({ r: studentRow, c: dateColumn });
                    if (!sheet[cellAddress]) {
                        sheet[cellAddress] = {};
                    }
                    sheet[cellAddress].v = 1;
                    sheet[cellAddress].t = 'n'; // number type
                    modifiedCount++;
                }
            }
        }

        console.log(`✅ Merged ${modifiedCount} attendance records into Excel`);

        // Write workbook to buffer with cellStyles to preserve formatting
        const newBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
            cellStyles: true,  // Preserve cell styles
            bookSST: true      // Preserve shared strings
        });
        return newBuffer;

    } catch (error) {
        console.error('Error merging attendance into Excel:', error);
        return fileBuffer; // Return original on error
    }
}
