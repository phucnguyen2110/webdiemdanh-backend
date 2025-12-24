import XLSX from 'xlsx';

/**
 * Export du lieu diem danh ra file Excel
 * @param {Object} classInfo - Thong tin lop {id, name}
 * @param {Array} students - Danh sach thieu nhi
 * @param {Array} sessions - Danh sach buoi diem danh voi records
 * @returns {Buffer} Excel file buffer
 */
export function exportAttendanceToExcel(classInfo, students, sessions) {
    // Tao workbook moi
    const workbook = XLSX.utils.book_new();

    // === SHEET 1: Tong hop diem danh ===
    const summaryData = [];

    // Header
    const header = ['STT', 'Ho va Ten'];
    sessions.forEach(session => {
        const dateStr = new Date(session.attendanceDate).toLocaleDateString('vi-VN');
        header.push(`${dateStr}\n${session.attendanceType}`);
    });
    summaryData.push(header);

    // Tao map de tra cuu nhanh
    const sessionRecordsMap = {};
    sessions.forEach(session => {
        sessionRecordsMap[session.id] = {};
        session.records.forEach(record => {
            sessionRecordsMap[session.id][record.studentId] = record.isPresent;
        });
    });

    // Danh sach thieu nhi
    students.forEach(student => {
        const row = [student.stt, student.fullName];

        sessions.forEach(session => {
            const isPresent = sessionRecordsMap[session.id][student.id];
            row.push(isPresent ? 'X' : '');
        });

        summaryData.push(row);
    });

    // Them dong thong ke
    summaryData.push([]);
    const statsRow = ['', 'Tong co mat'];
    sessions.forEach(session => {
        const presentCount = session.records.filter(r => r.isPresent).length;
        statsRow.push(presentCount);
    });
    summaryData.push(statsRow);

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths
    summarySheet['!cols'] = [
        { wch: 5 },  // STT
        { wch: 25 }, // Ho va Ten
        ...sessions.map(() => ({ wch: 15 })) // Cac cot ngay
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tong hop');

    // === SHEET 2: Chi tiet tung buoi ===
    const detailData = [];

    sessions.forEach((session, index) => {
        if (index > 0) {
            detailData.push([]); // Empty row between sessions
        }

        const dateStr = new Date(session.attendanceDate).toLocaleDateString('vi-VN');
        detailData.push([`Ngay: ${dateStr} - ${session.attendanceType}`]);
        detailData.push(['STT', 'Ho va Ten', 'Co Mat']);

        session.records.forEach(record => {
            detailData.push([
                record.stt,
                record.fullName,
                record.isPresent ? 'CO' : 'VANG'
            ]);
        });

        // const presentCount = session.records.filter(r => r.isPresent).length;
        // const totalCount = session.records.length;
        detailData.push([]);
        // detailData.push(['', 'Tong ket:', `${presentCount}/${totalCount} thieu nhi co mat`]);
    });

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
    detailSheet['!cols'] = [
        { wch: 5 },  // STT
        { wch: 25 }, // Ho va Ten
        { wch: 10 }  // Co Mat
    ];

    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Chi tiet');

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
