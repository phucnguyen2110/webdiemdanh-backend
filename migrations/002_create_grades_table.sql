-- =====================================================
-- Grades Table Migration
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- GRADES TABLE (Điểm học sinh)
-- =====================================================
CREATE TABLE IF NOT EXISTS grades (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    semester TEXT NOT NULL CHECK(semester IN ('HK1', 'HK2')),
    grade_m DECIMAL(4,2) CHECK(grade_m IS NULL OR (grade_m >= 0 AND grade_m <= 10)),
    grade_1t DECIMAL(4,2) CHECK(grade_1t IS NULL OR (grade_1t >= 0 AND grade_1t <= 10)),
    grade_thi DECIMAL(4,2) CHECK(grade_thi IS NULL OR (grade_thi >= 0 AND grade_thi <= 10)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint: One grade record per student per semester per class
CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_unique ON grades(class_id, student_id, semester);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_grades_class ON grades(class_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_semester ON grades(semester);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on grades" ON grades FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_grades_updated_at BEFORE UPDATE ON grades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DONE! 🎉
-- =====================================================
