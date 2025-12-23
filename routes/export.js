import express from 'express';
import { query, validationResult } from 'express-validator';
import {
    classesDB,
    studentsDB,
    attendanceSessionsDB,
    attendanceRecordsDB
} from '../database.js';
import { exportAttendanceToExcel, generateExcelFileName } from '../utils/excelExporter.js';

const router = express.Router();

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
            const fileName = generateExcelFileName(classInfo.name);

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
        if (!existsSync(excelFilePath)) {
            return res.status(404).json({
                success: false,
                error: `File Excel khong ton tai tai: ${excelFilePath}`
            });
        }

        // Lay tat ca sessions diem danh
        const sessions = await attendanceSessionsDB.getByClassId(classId);

        // Ghi tung session vao Excel
        if (sessions && sessions.length > 0) {
            const { writeAttendanceWithFormat } = await import('../utils/excelWriterWithFormat.js');

            for (const session of sessions) {
                const records = await attendanceRecordsDB.getBySessionId(session.id);

                // Ghi vao Excel cho tung thieu nhi
                for (const record of records) {
                    if (record.isPresent) {
                        try {
                            await writeAttendanceWithFormat(
                                excelFilePath,
                                record.fullName,
                                session.attendanceDate,
                                session.attendanceType,
                                record.isPresent
                            );
                        } catch (err) {
                            console.error(`Error writing attendance for ${record.fullName}:`, err.message);
                            // Continue voi records khac
                        }
                    }
                }
            }
        }

        // Doc file (da cap nhat hoac goc neu khong co sessions)
        const fileBuffer = readFileSync(excelFilePath);

        // Tao ten file
        const fileName = `${classInfo.name}_Updated_${new Date().toISOString().split('T')[0]}.xlsx`;

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
