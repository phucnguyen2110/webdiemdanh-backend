import express from 'express';
import { body, validationResult, query } from 'express-validator';
import {
    gradesDB,
    classesDB,
    studentsDB
} from '../database-supabase.js';

const router = express.Router();

/**
 * Validate grade value (0-10 or null)
 */
function validateGrade(value) {
    if (value === null || value === undefined || value === '') {
        return true;
    }
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0 && numValue <= 10;
}

/**
 * Validate semester (HK1 or HK2)
 */
function validateSemester(value) {
    const upperValue = value.toUpperCase();
    return upperValue === 'HK1' || upperValue === 'HK2';
}

/**
 * POST /api/grades
 * Lưu/Cập nhật điểm học sinh
 */
router.post('/',
    [
        body('classId').isInt().withMessage('Class ID khong hop le'),
        body('semester').custom(validateSemester).withMessage('Hoc ky phai la HK1 hoac HK2'),
        body('grades').isArray({ min: 1 }).withMessage('Danh sach diem khong duoc rong'),
        body('grades.*.studentId').isInt().withMessage('Student ID khong hop le'),
        body('grades.*.studentName').notEmpty().withMessage('Ten hoc sinh khong duoc rong'),
        body('grades.*.gradeM').optional().custom(validateGrade).withMessage('Diem mieng phai tu 0-10'),
        body('grades.*.grade1T').optional().custom(validateGrade).withMessage('Diem 1 tiet phai tu 0-10'),
        body('grades.*.gradeThi').optional().custom(validateGrade).withMessage('Diem thi phai tu 0-10')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: errors.array()[0].msg,
                    code: 'VALIDATION_ERROR'
                });
            }

            const { classId, semester, grades } = req.body;

            // Validate: Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop',
                    code: 'CLASS_NOT_FOUND'
                });
            }

            // Validate: Kiem tra tat ca hoc sinh co thuoc lop nay khong
            const students = await studentsDB.getByClassId(classId);
            const validStudentIds = students.map(s => s.id);
            const invalidStudents = grades.filter(g => !validStudentIds.includes(g.studentId));

            if (invalidStudents.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Co ${invalidStudents.length} hoc sinh khong thuoc lop nay`,
                    code: 'STUDENT_NOT_FOUND',
                    invalidStudentIds: invalidStudents.map(s => s.studentId)
                });
            }

            // Validate: Kiem tra duplicate students
            const studentIds = grades.map(g => g.studentId);
            const duplicates = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
            if (duplicates.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Co hoc sinh bi trung lap trong danh sach',
                    code: 'DUPLICATE_STUDENTS',
                    duplicateStudentIds: [...new Set(duplicates)]
                });
            }

            // Parse grades (no rounding, keep exact values)
            const parsedGrades = grades.map(g => ({
                studentId: g.studentId,
                studentName: g.studentName,
                gradeM: g.gradeM !== null && g.gradeM !== undefined && g.gradeM !== ''
                    ? parseFloat(g.gradeM)
                    : null,
                grade1T: g.grade1T !== null && g.grade1T !== undefined && g.grade1T !== ''
                    ? parseFloat(g.grade1T)
                    : null,
                gradeThi: g.gradeThi !== null && g.gradeThi !== undefined && g.gradeThi !== ''
                    ? parseFloat(g.gradeThi)
                    : null
            }));

            // Upsert grades
            const result = await gradesDB.upsert(classId, semester, parsedGrades);

            console.log(`✅ Saved ${result.length} grades for class ${classId}, semester ${semester}`);

            res.json({
                success: true,
                message: 'Luu diem thanh cong',
                savedCount: result.length
            });

        } catch (error) {
            console.error('Error saving grades:', error);
            res.status(500).json({
                success: false,
                error: 'Loi khi luu diem',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * GET /api/grades/class/:classId
 * Lấy điểm của lớp
 * Query params: semester (optional) - HK1 hoặc HK2
 */
router.get('/class/:classId',
    [
        query('semester').optional().custom(validateSemester).withMessage('Hoc ky phai la HK1 hoac HK2')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: errors.array()[0].msg,
                    code: 'VALIDATION_ERROR'
                });
            }

            const { classId } = req.params;
            const { semester } = req.query;

            // Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop',
                    code: 'CLASS_NOT_FOUND'
                });
            }

            // Lay diem
            const grades = await gradesDB.getByClassId(classId, semester);

            res.json({
                success: true,
                grades: grades
            });

        } catch (error) {
            console.error('Error getting grades:', error);
            res.status(500).json({
                success: false,
                error: 'Loi khi lay diem',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * GET /api/grades/history
 * Lấy lịch sử điểm
 * Query params: 
 *   - classId (required)
 *   - semester (optional) - HK1 hoặc HK2
 */
router.get('/history',
    [
        query('classId').isInt().withMessage('Class ID khong hop le'),
        query('semester').optional().custom(validateSemester).withMessage('Hoc ky phai la HK1 hoac HK2')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: errors.array()[0].msg,
                    code: 'VALIDATION_ERROR'
                });
            }

            const { classId, semester } = req.query;

            // Kiem tra lop co ton tai khong
            const classInfo = await classesDB.getById(classId);
            if (!classInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Khong tim thay lop',
                    code: 'CLASS_NOT_FOUND'
                });
            }

            // Lay diem
            const grades = await gradesDB.getByClassId(classId, semester);

            res.json({
                success: true,
                grades: grades
            });

        } catch (error) {
            console.error('Error getting grades history:', error);
            res.status(500).json({
                success: false,
                error: 'Loi khi lay lich su diem',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * DELETE /api/grades/:gradeId
 * Xóa điểm
 */
router.delete('/:gradeId', async (req, res) => {
    try {
        const { gradeId } = req.params;

        // Validate gradeId
        if (!gradeId || isNaN(parseInt(gradeId))) {
            return res.status(400).json({
                success: false,
                error: 'Grade ID khong hop le',
                code: 'INVALID_GRADE_ID'
            });
        }

        // Xoa diem
        await gradesDB.delete(gradeId);

        console.log(`✅ Deleted grade ${gradeId}`);

        res.json({
            success: true,
            message: 'Xoa diem thanh cong'
        });

    } catch (error) {
        console.error('Error deleting grade:', error);
        res.status(500).json({
            success: false,
            error: 'Loi khi xoa diem',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
