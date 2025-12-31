-- =====================================================
-- 7. SYNC_ERROR_LOGS TABLE (Log lỗi đồng bộ)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_error_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    username VARCHAR(255) NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    attendance_date DATE,
    attendance_type VARCHAR(100),
    attendance_id INTEGER,
    error_message TEXT NOT NULL,
    user_agent TEXT,
    is_online BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER REFERENCES users(id),
    notes TEXT,
    attendance_records JSONB,
    present_count INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_errors_user_id ON sync_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_class_id ON sync_error_logs(class_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_created_at ON sync_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_errors_resolved ON sync_error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_sync_errors_present_count ON sync_error_logs(present_count);

-- RLS
ALTER TABLE sync_error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on sync_error_logs" ON sync_error_logs FOR ALL USING (true) WITH CHECK (true);
