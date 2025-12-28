import ExcelJS from 'exceljs';

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
 * Find "Diem danh" worksheet
 */
function findAttendanceWorksheet(workbook) {
    for (const worksheet of workbook.worksheets) {
        const normalizedName = normalizeName(worksheet.name);
        if (normalizedName.includes('diem danh')) {
            return worksheet;
        }
    }
    return null;
}

/**
 * Find student row in worksheet
 */
function findStudentRow(worksheet, studentName) {
    const normalizedSearchName = normalizeName(studentName);

    worksheet.eachRow((row, rowNumber) => {
        // Check columns D and E (index 4 and 5)
        const colD = row.getCell(4).value;
        const colE = row.getCell(5).value;

        if (colD) {
            const fullName = colE ? `${colD} ${colE}` : colD;
            const normalizedFullName = normalizeName(String(fullName));

            if (normalizedFullName === normalizedSearchName) {
                return rowNumber;
            }
        }

        // Fallback: search in first 6 columns
        for (let col = 1; col <= 6; col++) {
            const cellValue = row.getCell(col).value;
            if (cellValue) {
                const normalizedCellValue = normalizeName(String(cellValue));
                if (normalizedCellValue === normalizedSearchName) {
                    return rowNumber;
                }
            }
        }
    });

    // If not found in eachRow, search manually
    for (let rowNum = 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);

        // Check columns D and E
        const colD = row.getCell(4).value;
        const colE = row.getCell(5).value;

        if (colD) {
            const fullName = colE ? `${colD} ${colE}` : colD;
            const normalizedFullName = normalizeName(String(fullName));

            if (normalizedFullName === normalizedSearchName) {
                return rowNum;
            }
        }

        // Fallback
        for (let col = 1; col <= 6; col++) {
            const cellValue = row.getCell(col).value;
            if (cellValue) {
                const normalizedCellValue = normalizeName(String(cellValue));
                if (normalizedCellValue === normalizedSearchName) {
                    return rowNum;
                }
            }
        }
    }

    return -1;
}

/**
 * Find date column matching date and attendance type
 */
function findDateColumn(worksheet, date, attendanceType) {
    const dateStr = formatDateForExcel(date);

    const patterns = {
        'Hoc Giao Ly': ['H', 'HỌC GL', 'HGL', 'HOC GL'],
        'Le Thu 5': ['LỄ T5', 'T5', 'LE T5', 'LT5'],
        'Le Chua Nhat': ['L', 'LỄ CN', 'LCN', 'LE CN', 'CHU NHAT', 'CN']
    };

    const typePatterns = patterns[attendanceType] || [];

    // Find header row (row with many dates)
    let headerRow = -1;
    for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let dateCount = 0;

        row.eachCell((cell) => {
            const cellValue = String(cell.value || '');
            if (cellValue.match(/\d{1,2}\/\d{1,2}/)) {
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
    const headerRowData = worksheet.getRow(headerRow);
    const typeRowData = worksheet.getRow(typeRow);

    let lastSeenDate = null;

    for (let col = 1; col <= worksheet.columnCount; col++) {
        const dateValue = String(headerRowData.getCell(col).value || '').trim();
        const typeValue = String(typeRowData.getCell(col).value || '').toUpperCase().trim();

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
 * Merge attendance data into Excel workbook using ExcelJS (preserves formatting)
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {Array} attendanceSessions - Array of attendance sessions with records
 * @returns {Buffer} Modified Excel file buffer
 */
export async function mergeAttendanceIntoExcelWithFormat(fileBuffer, attendanceSessions) {
    try {
        // Read workbook with ExcelJS (preserves formatting)
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);

        // Find attendance worksheet
        const worksheet = findAttendanceWorksheet(workbook);
        if (!worksheet) {
            console.warn('No attendance worksheet found, returning original file');
            return fileBuffer;
        }

        let modifiedCount = 0;

        // Process each attendance session
        for (const session of attendanceSessions) {
            const { date, type, records } = session;

            // Find date column
            const dateColumn = findDateColumn(worksheet, date, type);
            if (dateColumn === -1) {
                console.warn(`Column not found for ${date} - ${type}`);
                continue;
            }

            // Write attendance for each student
            for (const record of records) {
                const { studentName, isPresent } = record;

                // Find student row
                const studentRow = findStudentRow(worksheet, studentName);
                if (studentRow === -1) {
                    console.warn(`Student not found: ${studentName}`);
                    continue;
                }

                // Only write 1 for present students, skip absent (don't write 0)
                if (isPresent) {
                    const cell = worksheet.getRow(studentRow).getCell(dateColumn);
                    cell.value = 1;
                    modifiedCount++;

                    // Log write result
                    console.log(`  Write result: { success: true, message: 'Da ghi diem danh cho ${studentName} vao ${date} - ${type}', details: { sheet: '${worksheet.name}', row: ${studentRow}, column: ${dateColumn} } }`);
                }
            }
        }

        console.log(`✅ Merged ${modifiedCount} attendance records into Excel (with formatting)`);

        // Force Excel to recalculate formulas when file is opened
        workbook.calcProperties.fullCalcOnLoad = true;

        // Write workbook to buffer (preserves formatting)
        const newBuffer = await workbook.xlsx.writeBuffer();
        return newBuffer;

    } catch (error) {
        console.error('Error merging attendance into Excel:', error);
        return fileBuffer; // Return original on error
    }
}
