import sqlite3 from 'sqlite3';

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

    const get = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    };

    try {
        // Check if old table exists (migration already happened or in progress)
        const oldTableExists = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_sessions_old'");

        if (oldTableExists) {
            console.log('attendance_sessions_old exists. Migration might have run or been interrupted.');
        } else {
            // 1. Rename old table
            console.log('Renaming old table...');
            try {
                await run("ALTER TABLE attendance_sessions RENAME TO attendance_sessions_old");
            } catch (err) {
                if (err.message.includes('no such table')) {
                    console.log('Table attendance_sessions not found. Skipping migration.');
                    db.close();
                    return;
                }
                throw err;
            }
        }

        // 2. Create new table with correct schema
        console.log('Creating new table...');
        // First drop if exists (in case previous run failed after rename but before copy)
        await run("DROP TABLE IF EXISTS attendance_sessions");

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
        console.log('Copying data...');
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
            console.error('Error copying data:', copyError);
            console.log('Continuing...');
        }

        // 4. Drop old table
        console.log('Dropping old table...');
        await run("DROP TABLE attendance_sessions_old");

        console.log('Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
