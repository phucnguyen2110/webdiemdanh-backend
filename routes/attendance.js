import express from 'express';
import { body, validationResult, query } from 'express-validator';
import {
    attendanceSessionsDB,
    attendanceRecordsDB,
    classesDB,
    studentsDB
} from '../database.js';
import { writeAttendanceWithFormat } from '../utils/excelWriterWithFormat.js';
import { existsSync } from 'fs';

const router = express.Router();

/**
 * POST /api/attendance
 * LÆ°u Ä‘iá»ƒm danh
 */
router.post('/',
    [
        body('classId').isInt().withMessage('Class ID khÃ´ng há»£p lá»‡'),
        body('attendanceDate').isDate().withMessage('NgÃ y Ä‘iá»ƒm danh khÃ´ng há»£p lá»‡'),
        body('attendanceType')
            .isIn(['Há»c GiÃ¡o LÃ½', 'ThÃ¡nh Lá»…', 'Lá»… Thá»© 5', 'Lá»… ChÃºa Nháº­t'])
            .withMessage('Loáº¡i Ä‘iá»ƒm danh khÃ´ng há»£p lá»‡'),
        body('records').isArray().withMessage('Dá»¯ liá»‡u Ä‘iá»ƒm danh khÃ´ng há»£p lá»‡'),
        body('records.*.studentId').isInt().withMessage('Student ID khÃ´ng há»£p lá»‡'),
        body('records.*.isPresent').isBoolean().withMessage('Tráº¡ng thÃ¡i cÃ³ máº·t khÃ´ng há»£p lá»‡')
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

            const { classId, attendanceDate, attendanceType, records, attendanceMethod = 'manual' } = req.body;

            // Kiá»ƒm tra lá»›p cÃ³ tá»“n táº¡i khÃ´ng
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'KhÃ´ng tÃ¬m tháº¥y lá»›p'
                });
            }

            // Táº¡o session Ä‘iá»ƒm danh
            const sessionId = await attendanceSessionsDB.create(classId, attendanceDate, attendanceType, attendanceMethod);

            // LÆ°u chi tiáº¿t Ä‘iá»ƒm danh
            await attendanceRecordsDB.createBulk(sessionId, records);

            // Ghi vÃ o file Excel náº¿u cÃ³
            const excelResults = [];
            try {
                console.log('Excel file path:', classInfo.excel_file_path);
                console.log('File exists:', classInfo.excel_file_path && existsSync(classInfo.excel_file_path));

                if (classInfo.excel_file_path && existsSync(classInfo.excel_file_path)) {
                    for (const record of records) {
                        // Chá»‰ ghi nhá»¯ng em cÃ³ máº·t
                        if (record.isPresent) {
                            // Láº¥y thÃ´ng tin thiáº¿u nhi
                            const students = await studentsDB.getByClassId(classId);
                            const student = students.find(s => s.id === record.studentId);

                            if (student) {
                                console.log(`Writing attendance for ${student.fullName}, date: ${attendanceDate}, type: ${attendanceType}`);
                                const result = await writeAttendanceWithFormat(
                                    classInfo.excel_file_path,
                                    student.fullName,
                                    attendanceDate,
                                    attendanceType,
                                    record.isPresent
                                );
                                console.log('Write result:', result);
                                excelResults.push({
                                    student: student.fullName,
                                    ...result
                                });
                            }
                        }
                    }
                }
            } catch (excelError) {
                console.error('Error writing to Excel:', excelError);
                // Don't fail the request if Excel write fails
            }

            res.json({
                success: true,
                sessionId: sessionId,
                message: 'ÄÃ£ lÆ°u Ä‘iá»ƒm danh thÃ nh cÃ´ng',
                excelWriteResults: excelResults.length > 0 ? excelResults : undefined
            });

        } catch (error) {
            console.error('Error saving attendance:', error);
            res.status(500).json({
                success: false,
                error: 'Lá»—i khi lÆ°u Ä‘iá»ƒm danh'
            });
        }
    }
);

/**
 * GET /api/attendance/history
 * Láº¥y lá»‹ch sá»­ Ä‘iá»ƒm danh
 * Query params: classId (required), startDate (optional), endDate (optional)
 */
router.get('/history',
    [
        query('classId').isInt().withMessage('Class ID khÃ´ng há»£p lá»‡'),
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

            const { classId, startDate, endDate } = req.query;

            // Kiá»ƒm tra lá»›p cÃ³ tá»“n táº¡i khÃ´ng
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'KhÃ´ng tÃ¬m tháº¥y lá»›p'
                });
            }

            const sessions = await attendanceSessionsDB.getByClassId(classId, startDate, endDate);

            res.json({
                success: true,
                className: classInfo.name,
                sessions: sessions
            });

        } catch (error) {
            console.error('Error getting attendance history:', error);
            res.status(500).json({
                success: false,
                error: 'Lá»—i khi láº¥y lá»‹ch sá»­ Ä‘iá»ƒm danh'
            });
        }
    }
);

/**
 * GET /api/attendance/session/:sessionId
 * Láº¥y chi tiáº¿t má»™t buá»•i Ä‘iá»ƒm danh
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Láº¥y thÃ´ng tin session
        const session = await attendanceSessionsDB.getById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'KhÃ´ng tÃ¬m tháº¥y buá»•i Ä‘iá»ƒm danh'
            });
        }

        // Láº¥y chi tiáº¿t Ä‘iá»ƒm danh
        const records = await attendanceRecordsDB.getBySessionId(sessionId);

        res.json({
            success: true,
            session: {
                id: session.id,
                attendanceDate: session.attendanceDate,
                attendanceType: session.attendanceType,
                className: session.className,
                classId: session.classId
            },
            records: records
        });

    } catch (error) {
        console.error('Error getting session details:', error);
        res.status(500).json({
            success: false,
            error: 'Lá»—i khi láº¥y chi tiáº¿t Ä‘iá»ƒm danh'
        });
    }
});

/**
 * DELETE /api/attendance/session/:sessionId
 * XÃ³a buá»•i Ä‘iá»ƒm danh
 */
router.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Kiá»ƒm tra session cÃ³ tá»“n táº¡i khÃ´ng
        const session = await attendanceSessionsDB.getById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'KhÃ´ng tÃ¬m tháº¥y buá»•i Ä‘iá»ƒm danh'
            });
        }

        // XÃ³a session (records sáº½ tá»± Ä‘á»™ng xÃ³a do CASCADE)
        await attendanceSessionsDB.delete(sessionId);

        res.json({
            success: true,
            message: 'ÄÃ£ xÃ³a buá»•i Ä‘iá»ƒm danh thÃ nh cÃ´ng'
        });

    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: 'Lá»—i khi xÃ³a buá»•i Ä‘iá»ƒm danh'
        });
    }
});

export default router;
