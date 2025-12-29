import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { classesDB, studentsDB, attendanceSessionsDB, attendanceRecordsDB, gradesDB, usersDB } from '../database-supabase.js';
import { readExcelFile } from '../utils/excelReader.js';
import { storageManager } from '../storageManager.js';
import { mergeAttendanceIntoExcel } from '../utils/excelMerger.js';
import { parseAllGradesFromExcel } from '../utils/gradesParser.js';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/', async (req, res) => {
    try {
        const classes = await classesDB.getAll();
        res.json({ success: true, classes: classes });
    } catch (error) {
        console.error('Error getting classes:', error);
        res.status(500).json({ success: false, error: 'Failed to get classes' });
    }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        let { className } = req.body;
        if (!className || !className.trim()) {
            return res.status(400).json({ success: false, error: 'Class name is required' });
        }

        // Auto-add [DEV] prefix in development
        const isDevelopment = process.env.NODE_ENV !== 'production';
        const originalClassName = className.trim();

        if (isDevelopment && !originalClassName.startsWith('[DEV]')) {
            className = `[DEV] ${originalClassName}`;
        }

        const students = await readExcelFile(req.file.path);
        if (!students || students.length === 0) {
            return res.status(400).json({ success: false, error: 'No students found in Excel file' });
        }

        // Parse grades early before file upload (which might delete the local file in PROD)
        let allGrades = { HK1: [], HK2: [] };
        try {
            allGrades = await parseAllGradesFromExcel(req.file.path);
            console.log(`📊 Early parse: ${allGrades.HK1.length} HK1 grades, ${allGrades.HK2.length} HK2 grades`);
        } catch (error) {
            console.error('Error parsing grades early:', error);
        }

        // Check if class already exists
        const existingClasses = await classesDB.getAll();
        const existingClass = existingClasses.find(c => c.name === className.trim());

        // Generate unique file name
        const timestamp = Date.now();
        const sanitizedClassName = className.trim().replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${sanitizedClassName}_${timestamp}.xlsx`;

        // Upload file to storage (auto-detects dev/prod)
        const uploadResult = await storageManager.uploadFile(req.file.path, fileName);
        const filePath = uploadResult.filePath;

        let classId;
        if (existingClass) {
            // Class exists - delete old students and old file
            classId = existingClass.id;
            await studentsDB.deleteByClassId(classId);

            // Delete old Excel file if exists
            const oldClass = await classesDB.getById(classId);
            if (oldClass && oldClass.excel_file_path) {
                try {
                    await storageManager.deleteFile(oldClass.excel_file_path);
                    console.log('Deleted old Excel file:', oldClass.excel_file_path);
                } catch (err) {
                    console.error('Error deleting old file:', err);
                }
            }

            // Update class name (file path is not stored in update)
            await classesDB.update(classId, className.trim());
            // Update file path in database
            await classesDB.updateFilePath(classId, filePath);
        } else {
            // Create new class with file path
            classId = await classesDB.create(className.trim(), filePath);

            // Auto-assign class to creator (if not admin)
            const userId = req.headers['x-user-id'];
            const userRole = req.headers['x-user-role'];

            if (userId && userRole !== 'admin') {
                try {
                    const user = await usersDB.getById(parseInt(userId));
                    if (user) {
                        // Get current assigned classes
                        const currentClasses = user.assignedClasses || [];

                        // Add new class if not already assigned
                        if (!currentClasses.includes(classId)) {
                            const updatedClasses = [...currentClasses, classId];
                            await usersDB.update(parseInt(userId), {
                                assignedClasses: updatedClasses
                            });
                            console.log(`✅ Auto-assigned class ${classId} to user ${userId}`);
                        }
                    }
                } catch (assignError) {
                    console.error('Error auto-assigning class:', assignError);
                    // Don't fail the upload if auto-assign fails
                }
            }
        }

        // Insert all students at once using bulk insert
        await studentsDB.createBulk(classId, students);

        // Parse and import grades from Excel file
        let gradesImported = { HK1: 0, HK2: 0 };
        try {
            console.log('📊 Importing parsed grades...');
            // Grades were parsed early (allGrades variable from outer scope)

            // Get all students with their IDs
            const insertedStudents = await studentsDB.getByClassId(classId);

            // Import HK1 grades
            if (allGrades.HK1.length > 0) {
                const gradesHK1ToSave = [];

                for (const grade of allGrades.HK1) {
                    // Find student by name (normalize for matching)
                    const student = insertedStudents.find(s => {
                        const normalizedStudentName = s.fullName.toLowerCase().trim();
                        const normalizedGradeName = grade.studentName.toLowerCase().trim();
                        return normalizedStudentName === normalizedGradeName ||
                            normalizedStudentName.includes(normalizedGradeName) ||
                            normalizedGradeName.includes(normalizedStudentName);
                    });

                    if (student) {
                        gradesHK1ToSave.push({
                            studentId: student.id,
                            studentName: student.fullName,
                            gradeM: grade.gradeM,
                            grade1T: grade.grade1T,
                            gradeThi: grade.gradeThi
                        });
                    }
                }

                if (gradesHK1ToSave.length > 0) {
                    await gradesDB.upsert(classId, 'HK1', gradesHK1ToSave);
                    gradesImported.HK1 = gradesHK1ToSave.length;
                    console.log(`✅ Imported ${gradesHK1ToSave.length} HK1 grades`);
                }
            }

            // Import HK2 grades
            if (allGrades.HK2.length > 0) {
                const gradesHK2ToSave = [];

                for (const grade of allGrades.HK2) {
                    // Find student by name
                    const student = insertedStudents.find(s => {
                        const normalizedStudentName = s.fullName.toLowerCase().trim();
                        const normalizedGradeName = grade.studentName.toLowerCase().trim();
                        return normalizedStudentName === normalizedGradeName ||
                            normalizedStudentName.includes(normalizedGradeName) ||
                            normalizedGradeName.includes(normalizedStudentName);
                    });

                    if (student) {
                        gradesHK2ToSave.push({
                            studentId: student.id,
                            studentName: student.fullName,
                            gradeM: grade.gradeM,
                            grade1T: grade.grade1T,
                            gradeThi: grade.gradeThi
                        });
                    }
                }

                if (gradesHK2ToSave.length > 0) {
                    await gradesDB.upsert(classId, 'HK2', gradesHK2ToSave);
                    gradesImported.HK2 = gradesHK2ToSave.length;
                    console.log(`✅ Imported ${gradesHK2ToSave.length} HK2 grades`);
                }
            }
        } catch (gradesError) {
            console.error('Error importing grades:', gradesError);
            // Don't fail the whole upload if grades import fails
        }

        const storageInfo = storageManager.getStorageInfo();

        res.json({
            success: true,
            message: existingClass ? 'Class updated successfully' : 'Class created successfully',
            classId: classId,
            className: className.trim(),
            studentsCount: students.length,
            gradesImported: gradesImported,
            environment: isDevelopment ? 'Development' : 'Production',
            storage: {
                type: storageInfo.storageType,
                database: 'Supabase PostgreSQL',
                files: isDevelopment ? 'Local (uploads/)' : 'Supabase Storage'
            }
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to upload file' });
    }
});

router.get('/:classId/students', async (req, res) => {
    try {
        const { classId } = req.params;
        const students = await studentsDB.getByClassId(classId);
        res.json({ success: true, students: students });
    } catch (error) {
        console.error('Error getting students:', error);
        res.status(500).json({ success: false, error: 'Failed to get students' });
    }
});

router.put('/:classId', async (req, res) => {
    try {
        const { classId } = req.params;
        const { name, className } = req.body;
        const newName = name || className; // Accept both 'name' and 'className'

        if (!newName || !newName.trim()) {
            return res.status(400).json({ success: false, error: 'Class name is required' });
        }

        // Check if class name already exists (for a different class)
        const existingClasses = await classesDB.getAll();
        const duplicate = existingClasses.find(c => c.name === newName.trim() && c.id != classId);

        if (duplicate) {
            return res.status(400).json({
                success: false,
                error: `Tên lớp "${newName.trim()}" đã tồn tại. Vui lòng chọn tên khác.`
            });
        }

        await classesDB.update(classId, newName.trim());
        res.json({ success: true, message: 'Class updated successfully' });
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ success: false, error: 'Failed to update class' });
    }
});

router.delete('/:classId', async (req, res) => {
    try {
        const { classId } = req.params;

        // Get class info to find Excel file path
        const classInfo = await classesDB.getById(classId);

        // Delete Excel file if exists
        if (classInfo && classInfo.excel_file_path) {
            try {
                await storageManager.deleteFile(classInfo.excel_file_path);
                console.log('Deleted Excel file:', classInfo.excel_file_path);
            } catch (err) {
                console.error('Error deleting file:', err);
            }
        }

        // Delete class from database
        await classesDB.delete(classId);
        res.json({ success: true, message: 'Class deleted successfully' });
    } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({ success: false, error: 'Failed to delete class' });
    }
});

// Get Excel file content
router.get('/:classId/excel', async (req, res) => {
    try {
        const { classId } = req.params;

        // Get class info to find Excel file path
        const classInfo = await classesDB.getById(classId);
        if (!classInfo) {
            return res.status(404).json({ success: false, error: 'Class not found' });
        }

        if (!classInfo.excel_file_path) {
            return res.status(404).json({ success: false, error: 'No Excel file associated with this class' });
        }

        // Download file from storage (works for both local and Supabase)
        let fileBuffer = await storageManager.downloadFile(classInfo.excel_file_path);

        // Get attendance data and merge into Excel file
        const latestAttendance = await attendanceSessionsDB.getByClassId(classId);
        if (latestAttendance.length > 0) {
            // Deduplicate: Keep only latest session for each date+type combination
            const sessionMap = new Map();
            for (const session of latestAttendance) {
                const key = `${session.attendanceDate}_${session.attendanceType}`;
                const existing = sessionMap.get(key);

                // Keep the session with latest createdAt
                if (!existing || new Date(session.createdAt) > new Date(existing.createdAt)) {
                    sessionMap.set(key, session);
                }
            }

            const uniqueSessions = Array.from(sessionMap.values());
            console.log(`📊 Deduplicated: ${latestAttendance.length} sessions → ${uniqueSessions.length} unique sessions`);

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

            // Merge attendance into Excel buffer
            fileBuffer = mergeAttendanceIntoExcel(fileBuffer, attendanceSessions);
            console.log(`✅ Merged ${attendanceSessions.length} attendance sessions into Excel`);
        }

        // Read Excel file from buffer (now with attendance data)
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheets = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON with header row
            const rawData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,  // Return as 2D array
                defval: '',  // Default value for empty cells
                raw: true   // Return raw values (Excel serial numbers for dates)
            });

            // Process data to convert Excel dates
            const data = rawData.map(row =>
                row.map(cell => {
                    // Try to convert if it looks like an Excel date
                    if (typeof cell === 'number' && cell > 40000 && cell < 60000) {
                        try {
                            const parsed = XLSX.SSF.parse_date_code(cell);
                            if (parsed) {
                                const day = String(parsed.d).padStart(2, '0');
                                const month = String(parsed.m).padStart(2, '0');
                                const year = parsed.y;
                                return `${day}/${month}/${year}`;
                            }
                        } catch (e) {
                            return cell;
                        }
                    }
                    return cell;
                })
            );

            sheets.push({
                name: sheetName,
                data: data,
                rowCount: data.length,
                colCount: data.length > 0 ? Math.max(...data.map(row => row.length)) : 0
            });
        }

        // Extract file name from path
        let fileName = 'excel_file.xlsx';
        if (classInfo.excel_file_path.startsWith('supabase://')) {
            fileName = classInfo.excel_file_path.split('/').pop();
        } else {
            fileName = path.basename(classInfo.excel_file_path);
        }

        // Get latest attendance timestamp for cache invalidation
        const attendanceForTimestamp = await attendanceSessionsDB.getByClassId(classId);
        const lastUpdated = attendanceForTimestamp.length > 0
            ? attendanceForTimestamp[0].createdAt
            : classInfo.created_at;

        // Get attendance data to merge
        const attendanceData = [];
        if (attendanceForTimestamp.length > 0) {
            for (const session of attendanceForTimestamp) {
                const records = await attendanceRecordsDB.getBySessionId(session.id);
                attendanceData.push({
                    sessionId: session.id,
                    date: session.attendanceDate,
                    type: session.attendanceType,
                    records: records.map(r => ({
                        studentId: r.studentId,
                        studentName: r.fullName,
                        isPresent: r.isPresent
                    }))
                });
            }
        }

        res.json({
            success: true,
            fileName: fileName,
            sheets: sheets,
            lastUpdated: lastUpdated,
            classId: classId,
            className: classInfo.name,
            attendanceData: attendanceData  // ← NEW: Attendance data for merging
        });

    } catch (error) {
        console.error('Error reading Excel file:', error);
        res.status(500).json({ success: false, error: 'Failed to read Excel file' });
    }
});

export default router;