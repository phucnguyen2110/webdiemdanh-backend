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
 * Export dá»¯ liá»‡u Ä‘iá»ƒm danh ra Excel
 * Query params: startDate (optional), endDate (optional)
 */
router.get('/class/:classId',
    [
        query('startDate').optional().isDate().withMessage('NgÃ y báº¯t Ä‘áº§u khÃ´ng há»£p lá»‡'),
        query('endDate').optional().isDate().withMessage('NgÃ y káº¿t thÃºc khÃ´ng há»£p lá»‡')
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

            // Kiá»ƒm tra lá»›p cÃ³ tá»“n táº¡i khÃ´ng
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'KhÃ´ng tÃ¬m tháº¥y lá»›p'
                });
            }

            // Láº¥y danh sÃ¡ch thiáº¿u nhi
            const students = await studentsDB.getByClassId(classId);

            // Láº¥y lá»‹ch sá»­ Ä‘iá»ƒm danh
            const sessions = await attendanceSessionsDB.getByClassId(classId, startDate, endDate);

            if (sessions.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'KhÃ´ng cÃ³ dá»¯ liá»‡u Ä‘iá»ƒm danh Ä‘á»ƒ export'
                });
            }

            // Láº¥y chi tiáº¿t tá»«ng buá»•i Ä‘iá»ƒm danh
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

            // Táº¡o tÃªn file
            const fileName = generateExcelFileName(classInfo.name);

            // Set headers vÃ  gá»­i file
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(excelBuffer);

        } catch (error) {
            console.error('Error exporting attendance:', error);
            res.status(500).json({
                success: false,
                error: 'Lá»—i khi export dá»¯ liá»‡u'
            });
        }
    }
);

/**
 * GET /api/export/class/:classId/original
 * Export file Excel gá»‘c Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t vá»›i táº¥t cáº£ dá»¯ liá»‡u Ä‘iá»ƒm danh
 */
router.get('/class/:classId/original', async (req, res) => {
    try {
        const { classId } = req.params;

        // Kiá»ƒm tra lá»›p cÃ³ tá»“n táº¡i khÃ´ng
        const classInfo = await classesDB.getById(classId);
        if (!classInfo) {
            return res.status(404).json({
                success: false,
                error: 'KhÃ´ng tÃ¬m tháº¥y lá»›p'
            });
        }

        // Import cÃ¡c module cáº§n thiáº¿t
        const { readFileSync, existsSync, readdirSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');

        let excelFilePath = classInfo.excel_file_path;

        // Náº¿u khÃ´ng cÃ³ excelFilePath, tÃ¬m trong thÆ° má»¥c uploads
        if (!excelFilePath) {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const uploadsDir = join(__dirname, '..', 'uploads', 'excel');

            if (existsSync(uploadsDir)) {
                const files = readdirSync(uploadsDir);
                // TÃ¬m file chá»©a tÃªn lá»›p (case-insensitive)
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

        // Kiá»ƒm tra cÃ³ file Excel khÃ´ng
        if (!excelFilePath) {
            return res.status(404).json({
                success: false,
                error: 'Lá»›p nÃ y khÃ´ng cÃ³ file Excel. Vui lÃ²ng upload file Excel trÆ°á»›c khi export.'
            });
        }

        // Kiá»ƒm tra file cÃ³ tá»“n táº¡i khÃ´ng
        if (!existsSync(excelFilePath)) {
            return res.status(404).json({
                success: false,
                error: `File Excel khÃ´ng tá»“n táº¡i táº¡i: ${excelFilePath}`
            });
        }

        // Láº¥y táº¥t cáº£ sessions Ä‘iá»ƒm danh
        const sessions = await attendanceSessionsDB.getByClassId(classId);

        // Ghi tá»«ng session vÃ o Excel
        if (sessions && sessions.length > 0) {
            const { writeAttendanceWithFormat } = await import('../utils/excelWriterWithFormat.js');

            for (const session of sessions) {
                const records = await attendanceRecordsDB.getBySessionId(session.id);

                // Ghi vÃ o Excel cho tá»«ng thiáº¿u nhi
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
                            // Continue vá»›i records khÃ¡c
                        }
                    }
                }
            }
        }

        // Äá»c file (Ä‘Ã£ cáº­p nháº­t hoáº·c gá»‘c náº¿u khÃ´ng cÃ³ sessions)
        const fileBuffer = readFileSync(excelFilePath);

        // Táº¡o tÃªn file
        const fileName = `${classInfo.name}_Updated_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Set headers vÃ  gá»­i file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error exporting original Excel:', error);
        res.status(500).json({
            success: false,
            error: `Lá»—i khi export file Excel: ${error.message}`
        });
    }
});

export default router;
