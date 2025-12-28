import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
// Switch to Supabase PostgreSQL
import { initializeDatabase } from './database-supabase.js';
import { testSupabaseConnection } from './supabase.js';
import classesRouter from './routes/classes.js';
import attendanceRouter from './routes/attendance.js';
import exportRouter from './routes/export.js';
import studentsRouter from './routes/students.js';
import gradesRouter from './routes/grades.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Khoi tao Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Tao thu muc uploads neu chua ton tai
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadsDir);
}

// Khoi tao database
initializeDatabase();

// Test Supabase connection
testSupabaseConnection();

// Log environment info
const isDevelopment = process.env.NODE_ENV !== 'production';
console.log('='.repeat(50));
console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`📊 Database: Supabase PostgreSQL`);
console.log(`📁 File Storage: ${isDevelopment ? 'Local (uploads/)' : 'Supabase Storage'}`);
if (isDevelopment) {
    console.log(`🏷️  Class Prefix: [DEV] (auto-added)`);
}
console.log('='.repeat(50));

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'] // Allow frontend to read filename from header
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/classes', classesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/export', exportRouter);
app.use('/api/students', studentsRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server dang hoat dong',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Quan Ly Thieu Nhi',
        version: '1.0.0',
        endpoints: {
            classes: '/api/classes',
            attendance: '/api/attendance',
            export: '/api/export',
            students: '/api/students',
            grades: '/api/grades',
            health: '/api/health'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint khong ton tai'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Loi server',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('Server dang chay tai:');
    console.log(`   http://localhost:${PORT}`);
    console.log('='.repeat(50));
    console.log('API Endpoints:');
    console.log(`   GET    /api/health`);
    console.log(`   GET    /api/classes`);
    console.log(`   POST   /api/classes/upload`);
    console.log(`   GET    /api/classes/:classId/students`);
    console.log(`   POST   /api/attendance`);
    console.log(`   GET    /api/attendance/history`);
    console.log(`   GET    /api/attendance/session/:sessionId`);
    console.log(`   GET    /api/export/class/:classId`);
    console.log('='.repeat(50));
});

export default app;
