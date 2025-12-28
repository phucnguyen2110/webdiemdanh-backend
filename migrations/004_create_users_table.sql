-- =====================================================
-- Users Table Migration
-- Authentication & Authorization System
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,  -- bcrypt hashed
    role VARCHAR(10) NOT NULL CHECK(role IN ('admin', 'user')),
    assigned_classes INTEGER[],      -- Array of class IDs (for users only)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on users" ON users FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =====================================================
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DEFAULT ADMIN ACCOUNT
-- Password: admin123
-- Hash generated with bcrypt, saltRounds=10
-- =====================================================
INSERT INTO users (username, password, role, assigned_classes) VALUES
('admin', '$2b$10$rfUsdg05c5Ey4//EBwVzu.zc0gBLXEs6pSAscOx2JNUaczjprEOmm', 'admin', NULL)
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- SAMPLE USER ACCOUNTS (for testing)
-- Password: user123
-- =====================================================
-- Uncomment to create sample users
-- INSERT INTO users (username, password, role, assigned_classes) VALUES
-- ('giaovien1', '$2b$10$YourHashedPasswordHere', 'user', ARRAY[22, 23])
-- ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- DONE! 🎉
-- =====================================================

-- To generate bcrypt hash, run in Node.js:
-- const bcrypt = require('bcrypt');
-- bcrypt.hash('admin123', 10).then(hash => console.log(hash));
