import express from 'express';
import { query, validationResult } from 'express-validator';
import {
    classesDB,
    studentsDB,
    attendanceSessionsDB,
    attendanceRecordsDB,
    gradesDB
} from '../database-supabase.js';
import { exportAttendanceToExcel, generateExcelFileName } from '../utils/excelExporter.js';
import { storageManager } from '../storageManager.js';
import { mergeAttendanceIntoExcelWithFormat } from '../utils/excelMergerWithFormat.js';
import { mergeGradesIntoExcelWithFormat } from '../utils/gradesMerger.js';

const router = express.Router();

/**
 * Format class name for export filename
 * Ex: DiemDanh_Au_Nhi_1A.xlsx
 */
function formatExportFileName(className) {
    if (!className || !className.trim()) {
        return 'DiemDanh_Unknown.xlsx';
    }

    // Remove special characters and normalize Vietnamese
    let normalized = className
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
        .trim()
        .replace(/\s+/g, '_'); // Replace spaces with underscore

    // Fallback if normalization results in empty string
    if (!normalized) {
        normalized = className.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_') || 'Unknown';
    }

    return `DiemDanh_${normalized}.xlsx`;
}

/**
 * Format class name for original file download
 * Ex: FileTong_Au_Nhi_1A.xlsx
 */
function formatOriginalFileName(className) {
    if (!className || !className.trim()) {
        return 'FileTong_Unknown.xlsx';
    }

    // Remove special characters and normalize Vietnamese
    let normalized = className
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
        .trim()
        .replace(/\s+/g, '_'); // Replace spaces with underscore

    // Fallback if normalization results in empty string
    if (!normalized) {
        normalized = className.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_') || 'Unknown';
    }

    return `FileTong_${normalized}.xlsx`;
}


/**
 * GET /api/export/class/:classId
 * Export du lieu diem danh ra Excel
 * Query params: startDate (optional), endDate (optional)
 */
router.get('/class/:classId',
    [
        query('startDate').optional().isDate().withMessage('Ngay bat dau khong hop le'),
        query('endDate').optional().isDate().withMessage('Ngay ket thuc khong hop le')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: errors.array()[0].msg
                });
            }

            const { classId } = req.params;
            const { startDate, endDate } = req.query;

            // Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop'
                });
            }

            // Lay danh sach thieu nhi
            const students = await studentsDB.getByClassId(classId);

            // Lay lich su diem danh
            const sessions = await attendanceSessionsDB.getByClassId(classId, startDate, endDate);

            if (sessions.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong co du lieu diem danh de export'
                });
            }

            // Lay chi tiet tung buoi diem danh
            const sessionsWithRecords = [];
            for (const session of sessions) {
                const records = await attendanceRecordsDB.getBySessionId(session.id);
                sessionsWithRecords.push({
                    ...session,
                    records: records
                });
            }

            // Export ra Excel
            const excelBuffer = exportAttendanceToExcel(classInfo, students, sessionsWithRecords);

            // Tao ten file
            const fileName = formatExportFileName(classInfo.name);

            // Set headers va gui file
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(excelBuffer);

        } catch (error) {
            console.error('Error exporting attendance:', error);
            res.status(500).json({
                success: false,
                error: 'Loi khi export du lieu'
            });
        }
    }
);

/**
 * GET /api/export/class/:classId/original
 * Export file Excel goc da duoc cap nhat voi tat ca du lieu diem danh
 */
router.get('/class/:classId/original', async (req, res) => {
    try {
        const { classId } = req.params;

        // Kiem tra lop co ton tai khong
        const classInfo = await classesDB.getById(classId);
        if (!classInfo) {
            return res.status(404).json({
                success: false,
                error: 'Khong tim thay lop'
            });
        }

        // Import cac module can thiet
        const { readFileSync, existsSync, readdirSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');

        let excelFilePath = classInfo.excel_file_path;

        // Neu khong co excelFilePath, tim trong thu muc uploads
        if (!excelFilePath) {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const uploadsDir = join(__dirname, '..', 'uploads', 'excel');

            if (existsSync(uploadsDir)) {
                const files = readdirSync(uploadsDir);
                // Tim file chua ten lop (case-insensitive)
                const className = classInfo.name.toLowerCase();
                const matchingFile = files.find(f =>
                    f.toLowerCase().includes(className) &&
                    (f.endsWith('.xlsx') || f.endsWith('.xls'))
                );

                if (matchingFile) {
                    excelFilePath = join(uploadsDir, matchingFile);
                    console.log(`Auto-discovered Excel file: ${excelFilePath}`);
                }
            }
        }

        // Kiem tra co file Excel khong
        if (!excelFilePath) {
            return res.status(404).json({
                success: false,
                error: 'Lop nay khong co file Excel. Vui long upload file Excel truoc khi export.'
            });
        }

        // Kiem tra file co ton tai khong
        const fileExists = await storageManager.fileExists(excelFilePath);
        if (!fileExists) {
            return res.status(404).json({
                success: false,
                error: `File Excel khong ton tai tai: ${excelFilePath}`
            });
        }

        // Lay tat ca sessions diem danh
        const sessions = await attendanceSessionsDB.getByClassId(classId);

        // Download file from storage
        let fileBuffer = await storageManager.downloadFile(excelFilePath);

        // Merge attendance data into Excel
        if (sessions && sessions.length > 0) {
            // Deduplicate: Keep only latest session for each date+type combination
            const sessionMap = new Map();
            for (const session of sessions) {
                const key = `${session.attendanceDate}_${session.attendanceType}`;
                const existing = sessionMap.get(key);

                // Keep the session with latest createdAt
                if (!existing || new Date(session.createdAt) > new Date(existing.createdAt)) {
                    sessionMap.set(key, session);
                }
            }

            const uniqueSessions = Array.from(sessionMap.values());
            console.log(`📊 Deduplicated: ${sessions.length} sessions → ${uniqueSessions.length} unique sessions`);

            const attendanceSessions = [];
            for (const session of uniqueSessions) {
                const records = await attendanceRecordsDB.getBySessionId(session.id);
                attendanceSessions.push({
                    date: session.attendanceDate,
                    type: session.attendanceType,
                    records: records.map(r => ({
                        studentName: r.fullName,
                        isPresent: r.isPresent
                    }))
                });
            }

            // Merge attendance into Excel buffer (preserves formatting)
            fileBuffer = await mergeAttendanceIntoExcelWithFormat(fileBuffer, attendanceSessions);
            console.log(`✅ Merged ${attendanceSessions.length} sessions into Excel for download`);
        }

        // Merge grades data into Excel
        const gradesHK1 = await gradesDB.getByClassId(classId, 'HK1');
        const gradesHK2 = await gradesDB.getByClassId(classId, 'HK2');

        const gradesSessions = [];
        if (gradesHK1.length > 0) {
            gradesSessions.push({
                semester: 'HK1',
                grades: gradesHK1.map(g => ({
                    studentName: g.studentName,
                    gradeM: g.gradeM,
                    grade1T: g.grade1T,
                    gradeThi: g.gradeThi
                }))
            });
        }

        if (gradesHK2.length > 0) {
            gradesSessions.push({
                semester: 'HK2',
                grades: gradesHK2.map(g => ({
                    studentName: g.studentName,
                    gradeM: g.gradeM,
                    grade1T: g.grade1T,
                    gradeThi: g.gradeThi
                }))
            });
        }

        if (gradesSessions.length > 0) {
            fileBuffer = await mergeGradesIntoExcelWithFormat(fileBuffer, gradesSessions);
            console.log(`✅ Merged grades for ${gradesSessions.length} semesters into Excel`);
        }

        // Tao ten file
        const fileName = formatOriginalFileName(classInfo.name);

        // Set headers va gui file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error exporting original Excel:', error);
        res.status(500).json({
            success: false,
            error: `Loi khi export file Excel: ${error.message}`
        });
    }
});

export default router;
