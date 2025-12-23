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
        return null;
    }
}

export function parseExcelFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
            throw new Error('Excel file is empty or has no data rows');
        }

        const students = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row.length > 0 && row[1]) {
                students.push({
                    stt: row[0] || i,
                    fullName: String(row[1]).trim(),
                    baptismalName: row[2] ? String(row[2]).trim() : '',
                    dateOfBirth: row[3] ? (typeof row[3] === 'number' ? excelSerialToDate(row[3]) : String(row[3]).trim()) : '',
                    fatherName: row[4] ? String(row[4]).trim() : '',
                    motherName: row[5] ? String(row[5]).trim() : '',
                    address: row[6] ? String(row[6]).trim() : '',
                    phone: row[7] ? String(row[7]).trim() : ''
                });
            }
        }

        return students;
    } catch (error) {
        throw new Error('Failed to parse Excel file: ' + error.message);
    }
}

export default { parseExcelFile };
