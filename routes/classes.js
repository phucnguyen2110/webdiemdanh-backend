import express from 'express';
import multer from 'multer';
import path from 'path';
import fs, { existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { classesDB, studentsDB } from '../database.js';
import { readExcelFile } from '../utils/excelReader.js';
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
        const { className } = req.body;
        if (!className || !className.trim()) {
            return res.status(400).json({ success: false, error: 'Class name is required' });
        }
        const students = await readExcelFile(req.file.path);
        if (!students || students.length === 0) {
            return res.status(400).json({ success: false, error: 'No students found in Excel file' });
        }

        // Check if class already exists
        const existingClasses = await classesDB.getAll();
        const existingClass = existingClasses.find(c => c.name === className.trim());

        let classId;
        if (existingClass) {
            // Class exists - delete old students and old file
            classId = existingClass.id;
            await studentsDB.deleteByClassId(classId);

            // Delete old Excel file if exists
            const oldClass = await classesDB.getById(classId);
            if (oldClass && oldClass.excel_file_path && existsSync(oldClass.excel_file_path)) {
                try {
                    unlinkSync(oldClass.excel_file_path);
                    console.log('Deleted old Excel file:', oldClass.excel_file_path);
                } catch (err) {
                    console.error('Error deleting old file:', err);
                }
            }

            // Update excel file path
            await classesDB.update(classId, className.trim(), req.file.path);
        } else {
            // Create new class
            classId = await classesDB.create(className.trim(), req.file.path, req.file.originalname);
        }

        // Insert all students at once using bulk insert
        await studentsDB.createBulk(classId, students);

        res.json({
            success: true,
            message: existingClass ? 'Class updated successfully' : 'Class created successfully',
            classId: classId,
            className: className.trim(),
            studentsCount: students.length
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
        if (classInfo && classInfo.excel_file_path && existsSync(classInfo.excel_file_path)) {
            try {
                unlinkSync(classInfo.excel_file_path);
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

        // Check if file exists
        if (!fs.existsSync(classInfo.excel_file_path)) {
            return res.status(404).json({ success: false, error: 'Excel file not found on server' });
        }

        // Read Excel file
        const workbook = XLSX.readFile(classInfo.excel_file_path);
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

        res.json({
            success: true,
            fileName: path.basename(classInfo.excel_file_path),
            sheets: sheets
        });

    } catch (error) {
        console.error('Error reading Excel file:', error);
        res.status(500).json({ success: false, error: 'Failed to read Excel file' });
    }
});

export default router;