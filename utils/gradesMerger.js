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

    // Priority patterns - must have "diem" and semester, but NOT "diem danh"
    for (const worksheet of workbook.worksheets) {
        const normalizedName = normalizeName(worksheet.name);

        // Skip attendance sheets (contains "diem danh")
        if (normalizedName.includes('diem danh') || normalizedName.includes('diemdanh')) {
            continue;
        }

        // Must have both "diem" and the semester (hk1/hk2)
        if (normalizedName.includes('diem') && normalizedName.includes(semesterLower)) {
            return worksheet;
        }
    }

    return null;
}

/**
 * Find header row (contains STT, MSTN, Họ và Tên, etc.)
 */
function findHeaderRow(worksheet) {
    for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        let hasSTT = false;
        let hasName = false;

        row.eachCell((cell) => {
            const cellValue = normalizeName(String(cell.value || ''));
            if (cellValue.includes('stt')) hasSTT = true;
            if (cellValue.includes('ho') && cellValue.includes('ten')) hasName = true;
        });

        if (hasSTT && hasName) {
            return rowNum;
        }
    }

    return -1;
}

/**
 * Find column index for grade type (M, 1T, Thi)
 */
function findGradeColumn(worksheet, headerRow, gradeType) {
    const row = worksheet.getRow(headerRow);

    const patterns = {
        'M': ['m', 'mieng', 'diem mieng'],
        '1T': ['1t', '1 tiet', 'diem 1 tiet', 'diem 1t', 'mot tiet'],
        'Thi': ['thi', 'diem thi', 'cuoi ky', 'cuoi ki', 'ck']
    };

    const typePatterns = patterns[gradeType] || [];

    for (let col = 1; col <= worksheet.columnCount; col++) {
        const cellValue = normalizeName(String(row.getCell(col).value || ''));

        for (const pattern of typePatterns) {
            if (cellValue === pattern || cellValue.includes(pattern)) {
                return col;
            }
        }
    }

    return -1;
}

/**
 * Find student row in worksheet
 * Excel structure: Col3=Ten Thanh, Col4=Ho, Col5=Ten
 * Database has: "Ten Thanh Ho Ten" (e.g. "Isave Nguyen Gia An")
 */
function findStudentRow(worksheet, studentName, headerRow) {
    const normalizedSearchName = normalizeName(studentName);

    // Search from headerRow + 1 onwards
    for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);

        // Get name components from Excel
        const col3 = row.getCell(3).value; // Ten Thanh
        const col4 = row.getCell(4).value; // Ho
        const col5 = row.getCell(5).value; // Ten

        if (!col4) continue; // Skip if no name

        // Build full name from Excel: "Ten Thanh Ho Ten"
        let excelFullName = '';
        if (col3) excelFullName += String(col3).trim() + ' ';
        if (col4) excelFullName += String(col4).trim();
        if (col5) excelFullName += ' ' + String(col5).trim();

        const normalizedExcelName = normalizeName(excelFullName);

        // Exact match
        if (normalizedExcelName === normalizedSearchName) {
            return rowNum;
        }

        // Partial match (in case of slight differences)
        if (normalizedSearchName.includes(normalizedExcelName) ||
            normalizedExcelName.includes(normalizedSearchName)) {
            return rowNum;
        }
    }

    return -1;
}

/**
 * Merge grades data into Excel workbook using ExcelJS (preserves formatting)
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {Array} gradesSessions - Array of grades by semester
 *   Format: [{ semester: 'HK1', grades: [{ studentName, gradeM, grade1T, gradeThi }] }]
 * @returns {Buffer} Modified Excel file buffer
 */
export async function mergeGradesIntoExcelWithFormat(fileBuffer, gradesSessions) {
    try {
        // Read workbook with ExcelJS (preserves formatting)
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);

        let totalModified = 0;

        // Process each semester
        for (const session of gradesSessions) {
            const { semester, grades } = session;

            // Find worksheet for this semester
            const worksheet = findGradesWorksheet(workbook, semester);
            if (!worksheet) {
                console.warn(`No worksheet found for semester ${semester}`);
                continue;
            }

            console.log(`📊 Processing semester ${semester} in sheet "${worksheet.name}"`);

            // Find header row
            const headerRow = findHeaderRow(worksheet);
            if (headerRow === -1) {
                console.warn(`Header row not found in sheet ${worksheet.name}`);
                continue;
            }

            // Use fixed column positions
            // M = Column G (7), 1T = Column H (8), Thi = Column I (9)
            const colM = 7;
            const col1T = 8;
            const colThi = 9;

            console.log(`  Using fixed columns - M: G(${colM}), 1T: H(${col1T}), Thi: I(${colThi})`);

            let modifiedCount = 0;

            // Write grades for each student
            for (const grade of grades) {
                const { studentName, gradeM, grade1T, gradeThi } = grade;

                // Find student row
                const studentRow = findStudentRow(worksheet, studentName, headerRow);
                if (studentRow === -1) {
                    console.warn(`  Student not found: ${studentName}`);
                    continue;
                }

                // Write grades
                const row = worksheet.getRow(studentRow);
                let writtenGrades = [];

                if (colM !== -1 && gradeM !== null && gradeM !== undefined) {
                    row.getCell(colM).value = gradeM;
                    writtenGrades.push(`M=${gradeM}`);
                    modifiedCount++;
                }

                if (col1T !== -1 && grade1T !== null && grade1T !== undefined) {
                    row.getCell(col1T).value = grade1T;
                    writtenGrades.push(`1T=${grade1T}`);
                    modifiedCount++;
                }

                if (colThi !== -1 && gradeThi !== null && gradeThi !== undefined) {
                    row.getCell(colThi).value = gradeThi;
                    writtenGrades.push(`Thi=${gradeThi}`);
                    modifiedCount++;
                }

                // Log write result
                if (writtenGrades.length > 0) {
                    console.log(`  Write result: { success: true, message: 'Da ghi diem cho ${studentName} vao ${semester}', details: { sheet: '${worksheet.name}', row: ${studentRow}, grades: '${writtenGrades.join(', ')}' } }`);
                }
            }

            console.log(`  ✅ Merged ${modifiedCount} grade values for ${semester}`);
            totalModified += modifiedCount;
        }

        console.log(`✅ Total merged: ${totalModified} grade values across all semesters`);

        // Force Excel to recalculate formulas when file is opened
        workbook.calcProperties.fullCalcOnLoad = true;

        // Write workbook to buffer (preserves formatting)
        const newBuffer = await workbook.xlsx.writeBuffer();
        return newBuffer;

    } catch (error) {
        console.error('Error merging grades into Excel:', error);
        return fileBuffer; // Return original on error
    }
}
