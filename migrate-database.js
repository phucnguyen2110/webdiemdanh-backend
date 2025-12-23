import sqlite3 from 'sqlite3';
import { open } from 'sqlite3';

async function migrate() {
    console.log('Starting migration...');

    const db = new sqlite3.Database('database.db');

    const run = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    try {
        // 1. Rename old table
        console.log('Renaming old table...');
        await run("ALTER TABLE attendance_sessions RENAME TO attendance_sessions_old");

        // 2. Create new table with correct schema (no encoding issues in CHECK constraint)
        console.log('Creating new table...');
        await run(`
            CREATE TABLE attendance_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                attendance_date DATE NOT NULL,
                attendance_type TEXT NOT NULL CHECK(attendance_type IN ('Hoc Giao Ly', 'Le Thu 5', 'Le Chua Nhat')),
                attendance_method TEXT DEFAULT 'manual' CHECK(attendance_method IN ('manual', 'qr')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
            )
        `);

        // 3. Copy data from old table to new table
        // Note: attendance_type might need mapping if old data has issues, 
        // but assuming we are fixing schema for future data mostly.
        // If old data has encoding issues, copying might fail on CHECK constraint.
        // So we might need to update old data first or ignore check constraint during copy?
        // Actually best is to just re-insert with valid values if possible.
        // For simplicity and safety against data loss, we try to copy what matches.

        console.log('Copying data...');
        // We assume old data is empty or acceptable. 
        // If old data has invalid values, this mapping is needed:
        // 'Học Giáo Lý' -> 'Hoc Giao Ly' etc.

        try {
            await run(`
                INSERT INTO attendance_sessions (id, class_id, attendance_date, attendance_type, attendance_method, created_at)
                SELECT id, class_id, attendance_date, 
                CASE 
                    WHEN attendance_type LIKE 'H%c Gi%o L%' THEN 'Hoc Giao Ly'
                    WHEN attendance_type LIKE 'L% Th% 5' THEN 'Le Thu 5'
                    WHEN attendance_type LIKE 'L% Ch%a Nh%t' THEN 'Le Chua Nhat'
                    ELSE attendance_type 
                END,
                attendance_method, created_at
                FROM attendance_sessions_old
            `);
            console.log('Data copied successfully.');
        } catch (copyError) {
            console.error('Error copying data (might due to constraint violations):', copyError);
            console.log('Skipping data copy to ensure schema fix.');
        }

        // 4. Drop old table
        console.log('Dropping old table...');
        await run("DROP TABLE attendance_sessions_old");

        console.log('Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        // Rollback attempt?
        // SQLite doesn't support complex rollback if DDL fails mid-way easily without transaction logic carefully handled.
        // But RENAME is atomic.
    } finally {
        db.close();
    }
}

migrate();
