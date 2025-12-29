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
import { validateAttendanceColumn } from '../utils/excelValidator.js';

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

            // Validate: Kiem tra tat ca students co thuoc class nay khong
            const classStudents = await studentsDB.getByClassId(classId);
            const validStudentIds = new Set(classStudents.map(s => s.id));

            const invalidStudents = records.filter(r => !validStudentIds.has(r.studentId));
            if (invalidStudents.length > 0) {
                console.error('❌ Invalid students:', invalidStudents.map(s => s.studentId));
                return res.status(400).json({
                    success: false,
                    error: `Co ${invalidStudents.length} hoc sinh khong thuoc lop nay`,
                    invalidStudentIds: invalidStudents.map(s => s.studentId)
                });
            }

            // Validate: Kiem tra duplicate students
            const studentIds = records.map(r => r.studentId);
            const duplicates = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
            if (duplicates.length > 0) {
                console.error('❌ Duplicate students:', duplicates);
                return res.status(400).json({
                    success: false,
                    error: 'Co hoc sinh bi trung lap trong danh sach diem danh',
                    duplicateStudentIds: [...new Set(duplicates)]
                });
            }

            console.log(`✅ Validated ${records.length} students for class ${classId}`);

            // Validate: Kiem tra duplicate attendance (da diem danh truoc do)
            const existingSessions = await attendanceSessionsDB.getByClassId(classId);
            const duplicateSession = existingSessions.find(s =>
                s.attendance_date === attendanceDate &&
                s.attendance_type === attendanceType
            );

            if (duplicateSession) {
                // Check if any students already marked
                const existingRecords = await attendanceRecordsDB.getBySessionId(duplicateSession.id);
                const existingStudentIds = existingRecords.map(r => r.student_id);
                const alreadyMarked = records.filter(r => existingStudentIds.includes(r.studentId));

                if (alreadyMarked.length > 0) {
                    console.warn('⚠️ Students already marked:', alreadyMarked.map(s => s.studentId));

                    // For QR: Skip silently and return success
                    if (attendanceMethod === 'qr') {
                        return res.json({
                            success: true,
                            message: 'Hoc sinh da duoc diem danh truoc do',
                            sessionId: duplicateSession.id,
                            skipped: alreadyMarked.length,
                            alreadyMarkedStudents: alreadyMarked.map(s => ({
                                studentId: s.studentId,
                                studentName: students.find(st => st.id === s.studentId)?.full_name
                            }))
                        });
                    }

                    // For manual: Return error
                    return res.status(400).json({
                        success: false,
                        error: 'Co hoc sinh da duoc diem danh truoc do',
                        alreadyMarkedStudents: alreadyMarked.map(s => ({
                            studentId: s.studentId,
                            studentName: students.find(st => st.id === s.studentId)?.full_name
                        }))
                    });
                }
            }

            // Validate: Kiem tra date va attendance type co ton tai trong Excel file khong
            if (classInfo.excel_file_path) {
                // Download Excel file if needed (for Supabase storage)
                let excelFilePath = classInfo.excel_file_path;

                // If Supabase path, download to temp
                if (excelFilePath.startsWith('supabase://')) {
                    try {
                        const fileBuffer = await storageManager.downloadFile(excelFilePath);
                        const fs = await import('fs');
                        const path = await import('path');
                        const os = await import('os');

                        // Create temp file
                        const tempDir = os.tmpdir();
                        const tempFileName = `temp_${classId}_${Date.now()}.xlsx`;
                        excelFilePath = path.join(tempDir, tempFileName);

                        fs.writeFileSync(excelFilePath, fileBuffer);
                        console.log(`📥 Downloaded Excel to temp: ${excelFilePath}`);
                    } catch (error) {
                        console.error('Error downloading Excel for validation:', error);
                        // Continue without validation if download fails
                        excelFilePath = null;
                    }
                }

                // Validate if we have a local file path
                if (excelFilePath && !excelFilePath.startsWith('supabase://')) {
                    const validation = validateAttendanceColumn(excelFilePath, attendanceDate, attendanceType);

                    // Clean up temp file if created
                    if (classInfo.excel_file_path.startsWith('supabase://')) {
                        try {
                            const fs = await import('fs');
                            fs.unlinkSync(excelFilePath);
                            console.log(`🗑️ Cleaned up temp file`);
                        } catch (err) {
                            console.warn('Could not delete temp file:', err.message);
                        }
                    }

                    if (!validation.valid) {
                        console.error('❌ Excel validation failed:', validation.message);
                        return res.status(400).json({
                            success: false,
                            error: validation.message,
                            details: validation.details
                        });
                    }

                    console.log(`✅ Excel validation passed:`, validation.details);
                }
            }

            // Tao hoac lay session diem danh
            // Check again for existing session (to handle race conditions)
            const existingSessionCheck = await attendanceSessionsDB.getByClassId(classId);
            console.log(`🔍 Checking ${existingSessionCheck.length} existing sessions`);

            let sessionId;
            let existingSessionForReuse = existingSessionCheck.find(s => {
                // Use camelCase (data is already converted in database-supabase.js)
                const match = s.attendanceDate === attendanceDate && s.attendanceType === attendanceType;
                console.log(`  Session ${s.id}: ${s.attendanceDate} - ${s.attendanceType} | Match: ${match}`);
                return match;
            });

            if (existingSessionForReuse) {
                // Reuse existing session
                sessionId = existingSessionForReuse.id;
                console.log(`♻️ Reusing existing session ${sessionId} for ${attendanceDate} - ${attendanceType}`);

                // Check if students already marked in this session
                const existingRecords = await attendanceRecordsDB.getBySessionId(sessionId);
                const existingStudentIds = existingRecords.map(r => r.student_id);

                // Filter out already marked students
                const newRecords = records.filter(r => !existingStudentIds.includes(r.studentId));

                if (newRecords.length === 0) {
                    console.warn('⚠️ All students already marked, skipping');
                    return res.json({
                        success: true,
                        message: 'Tat ca hoc sinh da duoc diem danh truoc do',
                        sessionId: sessionId,
                        skipped: records.length
                    });
                }

                // Only save new students
                await attendanceRecordsDB.createBulk(sessionId, newRecords);
                console.log(`✅ Added ${newRecords.length} new students to existing session`);
            } else {
                // Create new session
                sessionId = await attendanceSessionsDB.create(classId, attendanceDate, attendanceType, attendanceMethod);
                console.log(`🆕 Created new session ${sessionId} for ${attendanceDate} - ${attendanceType}`);

                // Luu chi tiet diem danh
                await attendanceRecordsDB.createBulk(sessionId, records);
            }

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

            // Get total students in class
            const students = await studentsDB.getByClassId(classId);
            const totalStudents = students.length;

            // Fix totalCount for each session
            const sessionsWithCorrectTotal = sessions.map(session => ({
                ...session,
                totalCount: totalStudents,  // Always show total students in class
                absentCount: totalStudents - session.presentCount  // Calculate absent
            }));

            res.json({
                success: true,
                className: classInfo.name,
                sessions: sessionsWithCorrectTotal
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


/**
 * DELETE /api/attendance/session/:sessionId/student/:studentId
 * Xoa diem danh cua mot hoc sinh trong buoi
 */
router.delete('/session/:sessionId/student/:studentId', async (req, res) => {
    try {
        const { sessionId, studentId } = req.params;

        // Kiem tra session co ton tai khong
        const session = await attendanceSessionsDB.getById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Khong tim thay buoi diem danh'
            });
        }

        // Update record diem danh -> isPresent = false
        // Nguoi dung yeu cau: "cac em thieu nhi do van ton tai voi isPresent bang false"
        await attendanceRecordsDB.update(sessionId, studentId, false);

        res.json({
            success: true,
            message: 'Da cap nhat trang thai vang mat cho hoc sinh'
        });

    } catch (error) {
        console.error('Error deleting student attendance:', error);
        res.status(500).json({
            success: false,
            error: 'Loi khi xoa diem danh cua hoc sinh'
        });
    }
});

export default router;
