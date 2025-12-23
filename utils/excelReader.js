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

export function readExcelFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        const headers = {};
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
                const headerText = String(cell.v).toLowerCase().trim();
                headers[col] = headerText;
            }
        }

        const students = [];
        for (let row = range.s.r + 1; row <= range.e.r; row++) {
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

            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                const header = headers[col];
                const value = processCellValue(cell);

                if (value) hasData = true;

                if (header && header.includes('stt')) {
                    student.stt = parseInt(value) || null;
                } else if (header && (header.includes('tên thánh') || header.includes('ten thanh'))) {
                    student.baptismalName = value;
                } else if (header && (header.includes('họ') || header.includes('tên') || header.includes('ho ten'))) {
                    student.fullName = value;
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
                }
            }

            if (hasData && student.fullName) {
                students.push(student);
            }
        }

        return students;
    } catch (error) {
        console.error('Error reading Excel file:', error);
        throw new Error('Failed to read Excel file: ' + error.message);
    }
}

export default { readExcelFile };
