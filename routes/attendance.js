import express from 'express';
import { body, validationResult, query } from 'express-validator';
import {
    attendanceSessionsDB,
    attendanceRecordsDB,
    classesDB,
    studentsDB
} from '../database-supabase.js';
import { writeAttendanceWithFormat } from '../utils/excelWriterWithFormat.js';
import { storageManager } from '../storageManager.js';

const router = express.Router();

/**
 * POST /api/attendance
 * Luu diem danh
 */
router.post('/',
    [
        body('classId').isInt().withMessage('Class ID khong hop le'),
        body('attendanceDate').isDate().withMessage('Ngay diem danh khong hop le'),
        body('attendanceType').notEmpty().withMessage('Loai diem danh khong hop le'),
        body('records').isArray().withMessage('Du lieu diem danh khong hop le'),
        body('records.*.studentId').isInt().withMessage('Student ID khong hop le'),
        body('records.*.isPresent').isBoolean().withMessage('Trang thai co mat khong hop le')
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

            // Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop'
                });
            }

            // Tao session diem danh
            const sessionId = await attendanceSessionsDB.create(classId, attendanceDate, attendanceType, attendanceMethod);

            // Luu chi tiet diem danh
            await attendanceRecordsDB.createBulk(sessionId, records);

            // Ghi vao file Excel neu co
            const excelResults = [];
            try {
                console.log('Excel file path:', classInfo.excel_file_path);

                // Check if file exists using storageManager
                const fileExists = classInfo.excel_file_path
                    ? await storageManager.fileExists(classInfo.excel_file_path)
                    : false;
                console.log('File exists:', fileExists);

                // Only write to Excel in development with local files
                const isDevelopment = process.env.NODE_ENV !== 'production';
                const isLocalFile = classInfo.excel_file_path && !classInfo.excel_file_path.startsWith('supabase://');

                if (fileExists && isDevelopment && isLocalFile) {
                    console.log('✅ Writing attendance to local Excel file');
                    for (const record of records) {
                        // Chi ghi nhung em co mat
                        if (record.isPresent) {
                            // Lay thong tin thieu nhi
                            const students = await studentsDB.getByClassId(classId);
                            const student = students.find(s => s.id === record.studentId);

                            if (student) {
                                try {
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
                                } catch (writeError) {
                                    console.error(`Error writing attendance for ${student.fullName}:`, writeError.message);
                                    excelResults.push({
                                        student: student.fullName,
                                        success: false,
                                        message: `Loi khi ghi file excel: ${writeError.message}`
                                    });
                                    // Continue with other students
                                }
                            }
                        }
                    }
                } else {
                    if (!isDevelopment) {
                        console.log('⚠️ Production: Excel write skipped (files on Supabase Storage)');
                    } else if (!isLocalFile) {
                        console.log('⚠️ Supabase file: Excel write skipped (read-only)');
                    } else {
                        console.log('⚠️ File not found or path not available');
                    }
                }
            } catch (excelError) {
                console.error('Error writing to Excel:', excelError);
                // Don't fail the request if Excel write fails
            }

            res.json({
                success: true,
                sessionId: sessionId,
                message: 'Da luu diem danh thanh cong',
                excelWriteResults: excelResults.length > 0 ? excelResults : undefined
            });

        } catch (error) {
            console.error('Error saving attendance:', error);
            res.status(500).json({
                success: false,
                error: 'Loi khi luu diem danh'
            });
        }
    }
);

/**
 * GET /api/attendance/history
 * Lay lich su diem danh
 * Query params: classId (required), startDate (optional), endDate (optional)
 */
router.get('/history',
    [
        query('classId').isInt().withMessage('Class ID khong hop le'),
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

            const { classId, startDate, endDate } = req.query;

            // Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop'
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
                error: 'Loi khi lay lich su diem danh'
            });
        }
    }
);

/**
 * GET /api/attendance/session/:sessionId
 * Lay chi tiet mot buoi diem danh
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Lay thong tin session
        const session = await attendanceSessionsDB.getById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Khong tim thay buoi diem danh'
            });
        }

        // Lay chi tiet diem danh
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
            error: 'Loi khi lay chi tiet diem danh'
        });
    }
});

/**
 * DELETE /api/attendance/session/:sessionId
 * Xoa buoi diem danh
 */
router.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Kiem tra session co ton tai khong
        const session = await attendanceSessionsDB.getById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Khong tim thay buoi diem danh'
            });
        }

        // Xoa session (records se tu dong xoa do CASCADE)
        await attendanceSessionsDB.delete(sessionId);

        res.json({
            success: true,
            message: 'Da xoa buoi diem danh thanh cong'
        });

    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: 'Loi khi xoa buoi diem danh'
        });
    }
});

export default router;
