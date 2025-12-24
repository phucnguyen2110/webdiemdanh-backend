-- =====================================================
-- Supabase Database Schema for Điểm Danh System
-- =====================================================

-- Enable UUID extension (for better IDs in the future if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CLASSES TABLE (Lớp học)
-- =====================================================
CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    excel_file_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_classes_name ON classes(name);

-- =====================================================
-- 2. STUDENTS TABLE (Thiếu nhi)
-- =====================================================
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    stt INTEGER,
    student_id TEXT,
    baptismal_name TEXT,
    full_name TEXT NOT NULL,
    date_of_birth TEXT,
    father_name TEXT,
    mother_name TEXT,
    address TEXT,
    phone TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_stt ON students(stt);

-- =====================================================
-- 3. ATTENDANCE_SESSIONS TABLE (Buổi điểm danh)
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    attendance_type TEXT NOT NULL CHECK(attendance_type IN ('Hoc Giao Ly', 'Le Thu 5', 'Le Chua Nhat')),
    attendance_method TEXT DEFAULT 'manual' CHECK(attendance_method IN ('manual', 'qr')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON attendance_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON attendance_sessions(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_type ON attendance_sessions(attendance_type);

-- =====================================================
-- 4. ATTENDANCE_RECORDS TABLE (Chi tiết điểm danh)
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    is_present BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);

-- Unique constraint: One record per student per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance_records(session_id, student_id);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (you can customize this later)
CREATE POLICY "Allow all operations on classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on attendance_sessions" ON attendance_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on attendance_records" ON attendance_records FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 6. HELPFUL VIEWS (Optional - for easier queries)
-- =====================================================

-- View: Classes with student count
CREATE OR REPLACE VIEW classes_with_stats AS
SELECT 
    c.id,
    c.name,
    c.created_at,
    COUNT(s.id) as students_count
FROM classes c
LEFT JOIN students s ON c.id = s.class_id
GROUP BY c.id, c.name, c.created_at;

-- View: Attendance sessions with statistics
CREATE OR REPLACE VIEW attendance_sessions_with_stats AS
SELECT 
    s.id,
    s.class_id,
    s.attendance_date,
    s.attendance_type,
    s.attendance_method,
    s.created_at,
    COUNT(r.id) as total_count,
    COUNT(CASE WHEN r.is_present = true THEN 1 END) as present_count,
    COUNT(CASE WHEN r.is_present = false THEN 1 END) as absent_count
FROM attendance_sessions s
LEFT JOIN attendance_records r ON s.id = r.session_id
GROUP BY s.id, s.class_id, s.attendance_date, s.attendance_type, s.attendance_method, s.created_at;

-- =====================================================
-- DONE! 🎉
-- =====================================================
-- Next steps:
-- 1. Copy this entire file content
-- 2. Go to Supabase Dashboard → SQL Editor
-- 3. Paste and run this script
-- =====================================================
