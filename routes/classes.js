import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { classesDB, studentsDB } from '../database.js';
import { readExcelFile } from '../utils/excelReader.js';

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
        const classId = await classesDB.create(className.trim(), req.file.path, req.file.originalname);
        for (const student of students) {
            await studentsDB.create(classId, student);
        }
        res.json({
            success: true,
            message: 'Class created successfully',
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
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Class name is required' });
        }
        await classesDB.update(classId, name.trim());
        res.json({ success: true, message: 'Class updated successfully' });
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ success: false, error: 'Failed to update class' });
    }
});

router.delete('/:classId', async (req, res) => {
    try {
        const { classId } = req.params;
        await classesDB.delete(classId);
        res.json({ success: true, message: 'Class deleted successfully' });
    } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({ success: false, error: 'Failed to delete class' });
    }
});

export default router;