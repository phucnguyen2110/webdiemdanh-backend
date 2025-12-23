import XLSX from 'xlsx';

/**
 * Export dá»¯ liá»‡u Ä‘iá»ƒm danh ra file Excel
 * @param {Object} classInfo - ThÃ´ng tin lá»›p {id, name}
 * @param {Array} students - Danh sÃ¡ch thiáº¿u nhi
 * @param {Array} sessions - Danh sÃ¡ch buá»•i Ä‘iá»ƒm danh vá»›i records
 * @returns {Buffer} Excel file buffer
 */
export function exportAttendanceToExcel(classInfo, students, sessions) {
    // Táº¡o workbook má»›i
    const workbook = XLSX.utils.book_new();

    // === SHEET 1: Tá»•ng há»£p Ä‘iá»ƒm danh ===
    const summaryData = [];

    // Header
    const header = ['STT', 'Há» vÃ  TÃªn'];
    sessions.forEach(session => {
        const dateStr = new Date(session.attendanceDate).toLocaleDateString('vi-VN');
        header.push(`${dateStr}\n${session.attendanceType}`);
    });
    summaryData.push(header);

    // Táº¡o map Ä‘á»ƒ tra cá»©u nhanh
    const sessionRecordsMap = {};
    sessions.forEach(session => {
        sessionRecordsMap[session.id] = {};
        session.records.forEach(record => {
            sessionRecordsMap[session.id][record.studentId] = record.isPresent;
        });
    });

    // Dá»¯ liá»‡u tá»«ng thiáº¿u nhi
    students.forEach(student => {
        const row = [student.stt, student.fullName];

        sessions.forEach(session => {
            const isPresent = sessionRecordsMap[session.id][student.id];
            row.push(isPresent ? 'X' : '');
        });

        summaryData.push(row);
    });

    // ThÃªm dÃ²ng thá»‘ng kÃª
    summaryData.push([]);
    const statsRow = ['', 'Tá»•ng cÃ³ máº·t'];
    sessions.forEach(session => {
        const presentCount = session.records.filter(r => r.isPresent).length;
        statsRow.push(presentCount);
    });
    summaryData.push(statsRow);

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths
    summarySheet['!cols'] = [
        { wch: 5 },  // STT
        { wch: 25 }, // Há» tÃªn
        ...sessions.map(() => ({ wch: 15 })) // CÃ¡c cá»™t ngÃ y
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tá»•ng há»£p');

    // === SHEET 2: Chi tiáº¿t tá»«ng buá»•i ===
    const detailData = [];

    sessions.forEach((session, index) => {
        if (index > 0) {
            detailData.push([]); // Empty row between sessions
        }

        const dateStr = new Date(session.attendanceDate).toLocaleDateString('vi-VN');
        detailData.push([`NgÃ y: ${dateStr} - ${session.attendanceType}`]);
        detailData.push(['STT', 'Há» vÃ  TÃªn', 'CÃ³ máº·t']);

        session.records.forEach(record => {
            detailData.push([
                record.stt,
                record.fullName,
                record.isPresent ? 'CÃ³' : 'Váº¯ng'
            ]);
        });

        const presentCount = session.records.filter(r => r.isPresent).length;
        const totalCount = session.records.length;
        detailData.push([]);
        detailData.push(['', 'Tá»•ng káº¿t:', `${presentCount}/${totalCount} em cÃ³ máº·t`]);
    });

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
    detailSheet['!cols'] = [
        { wch: 5 },  // STT
        { wch: 25 }, // Há» tÃªn
        { wch: 10 }  // CÃ³ máº·t
    ];

    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Chi tiáº¿t');

    // Convert workbook to buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return excelBuffer;
}

/**
 * Táº¡o tÃªn file Excel
 * @param {string} className - TÃªn lá»›p
 * @returns {string} TÃªn file
 */
export function generateExcelFileName(className) {
    const date = new Date().toISOString().split('T')[0];
    const sanitizedClassName = className.replace(/[^a-zA-Z0-9]/g, '_');
    return `DiemDanh_${sanitizedClassName}_${date}.xlsx`;
}
