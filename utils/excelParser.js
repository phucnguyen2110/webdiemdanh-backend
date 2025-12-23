import XLSX from 'xlsx';

/**
 * Convert Excel serial date to DD/MM/YYYY format
 * @param {number} serial - Excel serial date number
 * @returns {string} Date in DD/MM/YYYY format
 */
function excelSerialToDate(serial) {
    if (!serial || isNaN(serial)) return '';

    // Use XLSX's built-in date parser for accurate conversion
    const dateObj = XLSX.SSF.parse_date_code(serial);

    if (!dateObj) return '';

    const day = String(dateObj.d).padStart(2, '0');
    const month = String(dateObj.m).padStart(2, '0');
    const year = dateObj.y;

    return `${day}/${month}/${year}`;
}

/**
 * Parse file Excel vÃ  trÃ­ch xuáº¥t danh sÃ¡ch thiáº¿u nhi
 * @param {Buffer} fileBuffer - Buffer cá»§a file Excel
 * @returns {Array} Danh sÃ¡ch thiáº¿u nhi vá»›i format [{stt, baptismalName, fullName, dateOfBirth}]
 */
export function parseExcelFile(fileBuffer) {
    try {
        // Äá»c workbook tá»« buffer
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // Láº¥y sheet Ä‘áº§u tiÃªn
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert sheet sang JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length === 0) {
            throw new Error('File Excel trá»‘ng');
        }

        // TÃ¬m header row (dÃ²ng chá»©a "STT" hoáº·c "Há» tÃªn")
        let headerRowIndex = -1;
        let sttColIndex = -1;
        let baptismalNameColIndex = 2; // Cá»™t C (index 2) - TÃªn ThÃ¡nh
        let nameColIndex = -1;
        let dateOfBirthColIndex = 5; // Cá»™t F (index 5) - NgÃ y sinh
        let hasSecondNameColumn = false;

        for (let i = 0; i < Math.min(15, rawData.length); i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            for (let j = 0; j < row.length; j++) {
                const cellValue = String(row[j] || '').toLowerCase().trim();

                // TÃ¬m cá»™t STT
                if (cellValue.includes('stt') || cellValue === 'sá»‘ tt') {
                    headerRowIndex = i;
                    sttColIndex = j;
                }

                // TÃ¬m cá»™t tÃªn - há»— trá»£ nhiá»u biáº¿n thá»ƒ
                if (cellValue.includes('há»') && cellValue.includes('tÃªn') ||
                    cellValue.includes('há» vÃ  tÃªn') ||
                    cellValue.includes('tÃªn') && j > 0 ||
                    cellValue === 'há» tÃªn') {
                    nameColIndex = j;
                }
            }

            if (headerRowIndex !== -1 && sttColIndex !== -1 && nameColIndex !== -1) {
                break;
            }
        }

        // Náº¿u khÃ´ng tÃ¬m tháº¥y header, giáº£ Ä‘á»‹nh cá»™t 0 lÃ  STT, cá»™t 1 lÃ  Há» tÃªn
        if (headerRowIndex === -1) {
            headerRowIndex = 0;
            sttColIndex = 0;
            nameColIndex = 1;
        }

        // Kiá»ƒm tra xem tÃªn cÃ³ bá»‹ tÃ¡ch thÃ nh 2 cá»™t khÃ´ng
        if (nameColIndex !== -1 && rawData.length > headerRowIndex + 1) {
            let countWithSecondCol = 0;
            let samplesChecked = 0;
            const maxSamples = 5;

            for (let i = headerRowIndex + 1; i < rawData.length && samplesChecked < maxSamples; i++) {
                const sampleRow = rawData[i];
                if (!sampleRow || sampleRow.length === 0 || !sampleRow[nameColIndex]) {
                    continue;
                }

                samplesChecked++;

                // Kiá»ƒm tra cá»™t tiáº¿p theo cÃ³ dá»¯ liá»‡u khÃ´ng
                if (sampleRow[nameColIndex + 1] &&
                    String(sampleRow[nameColIndex + 1]).trim() !== '') {
                    countWithSecondCol++;
                }
            }

            // Náº¿u > 50% máº«u cÃ³ cá»™t thá»© 2, coi nhÆ° tÃªn bá»‹ tÃ¡ch
            if (countWithSecondCol > samplesChecked / 2) {
                hasSecondNameColumn = true;
            }
        }

        // Parse dá»¯ liá»‡u tá»« dÃ²ng sau header
        const students = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];

            // Skip empty rows
            if (!row || row.length === 0) {
                continue;
            }

            // Skip náº¿u khÃ´ng cÃ³ dá»¯ liá»‡u á»Ÿ cá»™t tÃªn
            if (!row[nameColIndex] || String(row[nameColIndex]).trim() === '') {
                continue;
            }

            // Láº¥y STT
            const stt = row[sttColIndex] ? parseInt(row[sttColIndex]) : i - headerRowIndex;

            // Skip náº¿u STT khÃ´ng há»£p lá»‡
            if (isNaN(stt)) {
                continue;
            }

            // Láº¥y tÃªn thÃ¡nh (cá»™t C - index 2)
            const baptismalName = row[baptismalNameColIndex] ?
                String(row[baptismalNameColIndex]).trim() : '';

            // GhÃ©p tÃªn tá»« 1 hoáº·c 2 cá»™t
            let fullName;
            if (hasSecondNameColumn && row[nameColIndex + 1]) {
                fullName = `${String(row[nameColIndex]).trim()} ${String(row[nameColIndex + 1]).trim()}`.trim();
            } else {
                fullName = String(row[nameColIndex]).trim();
            }

            // Skip náº¿u tÃªn trá»‘ng sau khi ghÃ©p
            if (!fullName || fullName === '') {
                continue;
            }

            // Láº¥y ngÃ y sinh (cá»™t F - index 5) vÃ  convert tá»« Excel serial
            let dateOfBirth = '';
            if (row[dateOfBirthColIndex]) {
                const dobValue = row[dateOfBirthColIndex];
                // Náº¿u lÃ  sá»‘ (Excel serial date)
                if (typeof dobValue === 'number') {
                    dateOfBirth = excelSerialToDate(dobValue);
                } else {
                    // Náº¿u Ä‘Ã£ lÃ  string, giá»¯ nguyÃªn
                    dateOfBirth = String(dobValue).trim();
                }
            }

            students.push({
                stt: stt,
                baptismalName: baptismalName,
                fullName: fullName,
                dateOfBirth: dateOfBirth
            });
        }

        if (students.length === 0) {
            throw new Error('KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u thiáº¿u nhi trong file Excel');
        }

        return students;

    } catch (error) {
        throw new Error(`Lá»—i khi Ä‘á»c file Excel: ${error.message}`);
    }
}

/**
 * Validate file Excel
 * @param {Object} file - Multer file object
 * @returns {Object} {valid: boolean, error: string}
 */
export function validateExcelFile(file) {
    if (!file) {
        return { valid: false, error: 'KhÃ´ng cÃ³ file Ä‘Æ°á»£c upload' };
    }

    // Check file extension
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (!allowedExtensions.includes(fileExtension)) {
        return { valid: false, error: 'File pháº£i cÃ³ Ä‘á»‹nh dáº¡ng .xlsx hoáº·c .xls' };
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        return { valid: false, error: 'File khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ 5MB' };
    }

    return { valid: true };
}
