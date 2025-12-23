import XLSX from 'xlsx';

function excelSerialToDate(serial) {
    if (!serial || typeof serial !== 'number') {
        return null;
    }
    try {
        const parsed = XLSX.SSF.parse_date_code(serial);
        if (!parsed) return null;
        const day = String(parsed.d).padStart(2, '0');
        const month = String(parsed.m).padStart(2, '0');
        const year = parsed.y;
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('Error converting Excel serial date:', error);
        return null;
    }
}

function processCellValue(cell) {
    if (!cell || cell.v === undefined || cell.v === null) {
        return '';
    }
    if (cell.t === 'n' && cell.v > 40000 && cell.v < 60000) {
        return excelSerialToDate(cell.v);
    }
    return String(cell.v).trim();
}

/**
 * Find the header row by looking for common column names
 */
function findHeaderRow(worksheet, range) {
    const headerKeywords = ['stt', 'tên', 'họ', 'mstn', 'mã'];

    for (let row = range.s.r; row <= Math.min(range.s.r + 20, range.e.r); row++) {
        let matchCount = 0;

        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = worksheet[cellAddress];

            if (cell && cell.v) {
                const cellText = String(cell.v).toLowerCase().trim();
                if (headerKeywords.some(keyword => cellText.includes(keyword))) {
                    matchCount++;
                }
            }
        }

        // If we found at least 2 header keywords in this row, it's likely the header
        if (matchCount >= 2) {
            return row;
        }
    }

    // Default to first row if no header found
    return range.s.r;
}

export function readExcelFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // Find the header row automatically
        const headerRow = findHeaderRow(worksheet, range);
        console.log('Found header row at:', headerRow);

        // Read headers from the detected header row
        const headers = {};
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
                const headerText = String(cell.v).toLowerCase().trim();
                headers[col] = headerText;
                console.log(`Column ${col}: "${headerText}"`);
            }
        }

        // Find first data row (skip empty rows after header)
        let firstDataRow = headerRow + 1;
        for (let row = headerRow + 1; row <= range.e.r; row++) {
            let hasData = false;
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
                    hasData = true;
                    break;
                }
            }
            if (hasData) {
                firstDataRow = row;
                break;
            }
        }

        console.log('First data row:', firstDataRow);

        const students = [];
        // Start reading data from the first non-empty row after header
        for (let row = firstDataRow; row <= range.e.r; row++) {
            const student = {
                stt: null,
                baptismalName: '',
                fullName: '',
                dateOfBirth: '',
                fatherName: '',
                motherName: '',
                address: '',
                phone: ''
            };

            let hasData = false;
            let nameCol3 = ''; // Column 3: Last name
            let nameCol4 = ''; // Column 4: First name (no header)

            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                const header = headers[col];
                const value = processCellValue(cell);

                if (value) hasData = true;

                if (header && header.includes('stt')) {
                    student.stt = parseInt(value) || null;
                } else if (header && header.includes('mstn')) {
                    student.studentId = value;
                } else if (header && (header.includes('tên thánh') || header.includes('ten thanh'))) {
                    student.baptismalName = value;
                } else if (header && (header.includes('họ') || header.includes('tên') || header.includes('ho ten'))) {
                    // Column 3: Last name part
                    nameCol3 = value;
                } else if (col === 4 && !header && value) {
                    // Column 4: First name part (no header, right after name column)
                    nameCol4 = value;
                } else if (header && (header.includes('ngày sinh') || header.includes('ngay sinh') || header.includes('sinh'))) {
                    student.dateOfBirth = value;
                } else if (header && (header.includes('cha') || header.includes('bố') || header.includes('bo'))) {
                    student.fatherName = value;
                } else if (header && (header.includes('mẹ') || header.includes('me') || header.includes('má'))) {
                    student.motherName = value;
                } else if (header && (header.includes('địa chỉ') || header.includes('dia chi') || header.includes('nơi ở'))) {
                    student.address = value;
                } else if (header && (header.includes('điện thoại') || header.includes('dien thoai') || header.includes('sđt') || header.includes('phone'))) {
                    student.phone = value;
                } else if (header && header.includes('ghi chú')) {
                    student.note = value;
                }
            }

            // Merge name
            student.fullName = [nameCol3, nameCol4].filter(Boolean).join(' ').trim();

            // Only add student if they have a name
            if (hasData && student.fullName) {
                students.push(student);
            }
        }

        console.log(`Found ${students.length} students`);
        return students;
    } catch (error) {
        console.error('Error reading Excel file:', error);
        throw new Error('Failed to read Excel file: ' + error.message);
    }
}

export default { readExcelFile };
