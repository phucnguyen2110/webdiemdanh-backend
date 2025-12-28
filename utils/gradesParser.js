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
 * Find grades worksheet by semester (HK1 or HK2)
 */
function findGradesWorksheet(workbook, semester) {
    const semesterLower = semester.toLowerCase();

    // Priority patterns (exact matches first)
    const exactPatterns = [
        `diem ${semesterLower}`,
        `bang diem ${semesterLower}`
    ];

    // Fallback patterns
    const fallbackPatterns = [
        `${semesterLower}`,
        `hoc ky ${semester.substring(2)}`,
        `ky ${semester.substring(2)}`
    ];

    // First pass: Look for exact matches (exclude "danh" - attendance)
    for (const worksheet of workbook.worksheets) {
        const normalizedName = normalizeName(worksheet.name);

        // Skip if it's an attendance sheet
        if (normalizedName.includes('diem danh') || normalizedName.includes('diemdanh')) {
            continue;
        }

        for (const pattern of exactPatterns) {
            if (normalizedName.includes(pattern)) {
                return worksheet;
            }
        }
    }

    // Second pass: Fallback patterns
    for (const worksheet of workbook.worksheets) {
        const normalizedName = normalizeName(worksheet.name);

        // Skip if it's an attendance sheet
        if (normalizedName.includes('diem danh') || normalizedName.includes('diemdanh')) {
            continue;
        }

        for (const pattern of fallbackPatterns) {
            if (normalizedName.includes(pattern)) {
                return worksheet;
            }
        }
    }

    return null;
}

/**
 * Find header row (contains STT, MSTN, Họ và Tên, M, 1T, Thi)
 */
function findHeaderRow(worksheet) {
    for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let hasSTT = false;
        let hasName = false;
        let hasM = false;

        row.eachCell((cell, colNum) => {
            const cellValue = normalizeName(String(cell.value || ''));
            if (cellValue === 'stt') hasSTT = true;
            if (cellValue.includes('ho') && cellValue.includes('ten')) hasName = true;
            if (cellValue === 'm' || cellValue === 'mieng') hasM = true;
        });

        if (hasSTT && hasName && hasM) {
            return rowNum;
        }
    }

    return -1;
}

/**
 * Find column index for specific header
 */
function findColumn(row, patterns) {
    const matches = [];

    for (let col = 1; col <= row.cellCount; col++) {
        const cellValue = normalizeName(String(row.getCell(col).value || ''));

        for (const pattern of patterns) {
            const normalizedPattern = normalizeName(pattern);

            // Exact match - highest priority
            if (cellValue === normalizedPattern) {
                return col;
            }

            // Contains match - store for later
            if (cellValue.includes(normalizedPattern)) {
                matches.push({ col, cellValue, pattern, score: cellValue.length });
            }
        }
    }

    // Return best match (shortest cell value = most specific)
    if (matches.length > 0) {
        matches.sort((a, b) => a.score - b.score);
        return matches[0].col;
    }

    return -1;
}

/**
 * Extract grade value from cell
 */
function extractGradeValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined || cell.value === '') {
        return null;
    }

    let value = cell.value;

    // If it's a formula, get the result
    if (typeof value === 'object' && value.result !== undefined) {
        value = value.result;
    }

    // Convert to number
    const numValue = parseFloat(value);

    // Validate range
    if (isNaN(numValue) || numValue < 0 || numValue > 10) {
        return null;
    }

    // Return exact value from Excel (no rounding)
    return numValue;
}

/**
 * Parse grades from Excel file
 * @param {Buffer|string} filePathOrBuffer - Path to Excel file or buffer
 * @param {string} semester - 'HK1' or 'HK2'
 * @returns {Promise<Array>} Array of grades: [{ studentName, gradeM, grade1T, gradeThi }]
 */
export async function parseGradesFromExcel(filePathOrBuffer, semester = 'HK1') {
    try {
        const workbook = new ExcelJS.Workbook();

        // Load workbook
        if (Buffer.isBuffer(filePathOrBuffer)) {
            await workbook.xlsx.load(filePathOrBuffer);
        } else {
            await workbook.xlsx.readFile(filePathOrBuffer);
        }

        // Find worksheet
        const worksheet = findGradesWorksheet(workbook, semester);
        if (!worksheet) {
            console.warn(`No worksheet found for semester ${semester}`);
            return [];
        }

        console.log(`📊 Found sheet: "${worksheet.name}" for ${semester}`);

        // Find header row
        const headerRow = findHeaderRow(worksheet);
        if (headerRow === -1) {
            console.warn(`Header row not found in sheet ${worksheet.name}`);
            return [];
        }

        console.log(`  Header row: ${headerRow}`);

        const headerRowData = worksheet.getRow(headerRow);

        // Find columns - use specific patterns to avoid false matches
        const colName = findColumn(headerRowData, ['ho va ten', 'ho ten', 'hoten']);
        const colM = findColumn(headerRowData, ['m']);  // Exact match only
        const col1T = findColumn(headerRowData, ['1t', '1 tiet']);
        const colThi = findColumn(headerRowData, ['thi']);

        console.log(`  Columns - Name: ${colName}, M: ${colM}, 1T: ${col1T}, Thi: ${colThi}`);

        if (colName === -1) {
            console.warn('Name column not found');
            return [];
        }

        // Parse grades
        const grades = [];

        for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);

            // Get student name - might be split across 2 columns
            const nameCell = row.getCell(colName);
            const nextCell = row.getCell(colName + 1);

            let studentName = nameCell.value;
            let nextValue = nextCell.value;

            // Skip if no name
            if (!studentName || studentName === '') {
                continue;
            }

            // Handle formula results
            if (typeof studentName === 'object' && studentName !== null && studentName.result !== undefined) {
                studentName = studentName.result;
            }
            if (nextValue && typeof nextValue === 'object' && nextValue.result !== undefined) {
                nextValue = nextValue.result;
            }

            studentName = String(studentName).trim();

            // Combine with next column if it looks like a name (not a date, not a number)
            if (nextValue && String(nextValue).trim()) {
                const nextStr = String(nextValue).trim();
                // Check if next value is not a date and not a long number
                if (!nextStr.includes('GMT') &&
                    !nextStr.includes('-') &&
                    !nextStr.match(/^\d{4}\/\d{2}\/\d{2}/) &&
                    nextStr.length < 20) {
                    studentName = `${studentName} ${nextStr}`;
                }
            }

            // Skip empty or header-like rows
            if (!studentName || studentName.length < 2) {
                continue;
            }

            // Skip header rows
            const normalizedName = normalizeName(studentName);
            if (normalizedName.includes('ho va ten') ||
                normalizedName.includes('ho ten') ||
                normalizedName === 'stt') {
                continue;
            }

            // Get grades
            const gradeM = colM !== -1 ? extractGradeValue(row.getCell(colM)) : null;
            const grade1T = col1T !== -1 ? extractGradeValue(row.getCell(col1T)) : null;
            const gradeThi = colThi !== -1 ? extractGradeValue(row.getCell(colThi)) : null;

            // Only add if at least one grade exists
            if (gradeM !== null || grade1T !== null || gradeThi !== null) {
                grades.push({
                    studentName,
                    gradeM,
                    grade1T,
                    gradeThi
                });
            }
        }

        console.log(`  ✅ Parsed ${grades.length} student grades`);

        return grades;

    } catch (error) {
        console.error('Error parsing grades from Excel:', error);
        return [];
    }
}

/**
 * Parse grades for both semesters from Excel file
 * @param {Buffer|string} filePathOrBuffer - Path to Excel file or buffer
 * @returns {Promise<Object>} { HK1: [...], HK2: [...] }
 */
export async function parseAllGradesFromExcel(filePathOrBuffer) {
    const [gradesHK1, gradesHK2] = await Promise.all([
        parseGradesFromExcel(filePathOrBuffer, 'HK1'),
        parseGradesFromExcel(filePathOrBuffer, 'HK2')
    ]);

    return {
        HK1: gradesHK1,
        HK2: gradesHK2
    };
}
