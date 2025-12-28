-- Add full_name column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);

-- Update existing users with a default value (optional, using username)
UPDATE users SET full_name = username WHERE full_name IS NULL;
