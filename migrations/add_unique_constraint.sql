-- Add unique constraint to prevent duplicate attendance sessions
-- This will prevent race conditions when scanning QR codes quickly

-- Drop existing constraint if any
ALTER TABLE attendance_sessions 
DROP CONSTRAINT IF EXISTS unique_class_date_type_student;

-- Add unique constraint on class_id + attendance_date + attendance_type
-- This ensures only ONE session per class/date/type combination
ALTER TABLE attendance_sessions
ADD CONSTRAINT unique_class_date_type 
UNIQUE (class_id, attendance_date, attendance_type);

-- Note: This will prevent creating multiple sessions for same class/date/type
-- If you need to allow multiple sessions, use a different approach
