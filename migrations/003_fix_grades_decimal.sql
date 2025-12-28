-- =====================================================
-- Fix Grades Table - Change DECIMAL(3,1) to DECIMAL(4,2)
-- This allows storing 2 decimal places (9.75 instead of 9.8)
-- =====================================================

-- Alter columns to support 2 decimal places
ALTER TABLE grades 
    ALTER COLUMN grade_m TYPE DECIMAL(4,2),
    ALTER COLUMN grade_1t TYPE DECIMAL(4,2),
    ALTER COLUMN grade_thi TYPE DECIMAL(4,2);

-- Update constraints
ALTER TABLE grades 
    DROP CONSTRAINT IF EXISTS grades_grade_m_check,
    DROP CONSTRAINT IF EXISTS grades_grade_1t_check,
    DROP CONSTRAINT IF EXISTS grades_grade_thi_check;

ALTER TABLE grades 
    ADD CONSTRAINT grades_grade_m_check CHECK(grade_m IS NULL OR (grade_m >= 0 AND grade_m <= 10)),
    ADD CONSTRAINT grades_grade_1t_check CHECK(grade_1t IS NULL OR (grade_1t >= 0 AND grade_1t <= 10)),
    ADD CONSTRAINT grades_grade_thi_check CHECK(grade_thi IS NULL OR (grade_thi >= 0 AND grade_thi <= 10));

-- =====================================================
-- DONE! 🎉
-- Run this in Supabase SQL Editor
-- =====================================================
