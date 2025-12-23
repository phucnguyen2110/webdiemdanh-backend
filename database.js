import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Khá»Ÿi táº¡o database
const dbPath = join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Promisify database operations
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
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

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

/**
 * Khá»Ÿi táº¡o database schema
 */
export async function initializeDatabase() {
  // Enable foreign keys
  await run('PRAGMA foreign_keys = ON');

  // Táº¡o báº£ng classes (lá»›p há»c)
  await run(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      excel_file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Táº¡o báº£ng students (thiáº¿u nhi)
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      stt INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);

  // Táº¡o báº£ng attendance_sessions (buá»•i Ä‘iá»ƒm danh)
  await run(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      attendance_type TEXT NOT NULL CHECK(attendance_type IN ('Há»c GiÃ¡o LÃ½', 'Lá»… Thá»© 5', 'Lá»… ChÃºa Nháº­t')),
      attendance_method TEXT DEFAULT 'manual' CHECK(attendance_method IN ('manual', 'qr')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);

  // Táº¡o báº£ng attendance_records (chi tiáº¿t Ä‘iá»ƒm danh)
  await run(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      is_present BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add attendance_method column if it doesn't exist
  try {
    await run(`
      ALTER TABLE attendance_sessions 
      ADD COLUMN attendance_method TEXT DEFAULT 'manual' CHECK(attendance_method IN ('manual', 'qr'))
    `);
    console.log('âœ… Migration: Added attendance_method column');
  } catch (err) {
    // Column already exists, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.error('Migration warning:', err.message);
    }
  }

  // Táº¡o indexes Ä‘á»ƒ tÄƒng tá»‘c query
  await run('CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON attendance_sessions(class_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON attendance_sessions(attendance_date)');
  await run('CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id)');

  console.log('âœ… Database initialized successfully');
}

/**
 * Database helper functions
 */

// Classes
export const classesDB = {
  // Táº¡o lá»›p má»›i
  create: async (name, excelFilePath = null) => {
    const result = await run(
      'INSERT INTO classes (name, excel_file_path) VALUES (?, ?)',
      [name, excelFilePath]
    );
    return result.lastID;
  },

  // Láº¥y táº¥t cáº£ lá»›p
  getAll: async () => {
    const rows = await all(`
      SELECT 
        c.id,
        c.name,
        c.created_at,
        COUNT(s.id) as students_count
      FROM classes c
      LEFT JOIN students s ON c.id = s.class_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    return rows;
  },

  // Láº¥y lá»›p theo ID
  getById: async (id) => {
    return await get('SELECT * FROM classes WHERE id = ?', [id]);
  },

  // Cáº­p nháº­t tÃªn lá»›p
  update: async (id, name) => {
    return await run('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
  },

  // XÃ³a lá»›p
  delete: async (id) => {
    return await run('DELETE FROM classes WHERE id = ?', [id]);
  }
};

// Students
export const studentsDB = {
  // Táº¡o nhiá»u há»c sinh cÃ¹ng lÃºc (bulk insert)
  createBulk: async (classId, students) => {
    await run('BEGIN TRANSACTION');
    try {
      for (const student of students) {
        await run(
          'INSERT INTO students (class_id, stt, baptismal_name, full_name, date_of_birth) VALUES (?, ?, ?, ?, ?)',
          [classId, student.stt, student.baptismalName, student.fullName, student.dateOfBirth]
        );
      }
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  },

  // Láº¥y táº¥t cáº£ há»c sinh trong lá»›p
  getByClassId: async (classId) => {
    return await all(`
      SELECT id, stt, baptismal_name as baptismalName, full_name as fullName, date_of_birth as dateOfBirth
      FROM students
      WHERE class_id = ?
      ORDER BY stt ASC
    `, [classId]);
  },

  // Láº¥y thÃ´ng tin má»™t há»c sinh
  getById: async (studentId) => {
    return await get(`
      SELECT id, class_id as classId, stt, baptismal_name as baptismalName, full_name as fullName, date_of_birth as dateOfBirth
      FROM students
      WHERE id = ?
    `, [studentId]);
  },

  // XÃ³a táº¥t cáº£ há»c sinh trong lá»›p
  deleteByClassId: async (classId) => {
    return await run('DELETE FROM students WHERE class_id = ?', [classId]);
  }
};

// Attendance Sessions
export const attendanceSessionsDB = {
  // Táº¡o buá»•i Ä‘iá»ƒm danh má»›i
  create: async (classId, attendanceDate, attendanceType, attendanceMethod = 'manual') => {
    const result = await run(`
      INSERT INTO attendance_sessions (class_id, attendance_date, attendance_type, attendance_method)
      VALUES (?, ?, ?, ?)
    `, [classId, attendanceDate, attendanceType, attendanceMethod]);
    return result.lastID;
  },

  // Láº¥y lá»‹ch sá»­ Ä‘iá»ƒm danh theo lá»›p
  getByClassId: async (classId, startDate = null, endDate = null) => {
    let query = `
      SELECT 
        s.id,
        s.attendance_date as attendanceDate,
        s.attendance_type as attendanceType,
        s.created_at as createdAt,
        COUNT(CASE WHEN r.is_present = 1 THEN 1 END) as presentCount,
        COUNT(r.id) as totalCount
      FROM attendance_sessions s
      LEFT JOIN attendance_records r ON s.id = r.session_id
      WHERE s.class_id = ? AND s.attendance_method = 'manual'
    `;

    const params = [classId];

    if (startDate) {
      query += ' AND s.attendance_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND s.attendance_date <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY s.id ORDER BY s.attendance_date DESC';

    return await all(query, params);
  },

  // Láº¥y chi tiáº¿t buá»•i Ä‘iá»ƒm danh
  getById: async (sessionId) => {
    return await get(`
      SELECT 
        s.id,
        s.attendance_date as attendanceDate,
        s.attendance_type as attendanceType,
        s.created_at as createdAt,
        c.name as className,
        c.id as classId
      FROM attendance_sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `, [sessionId]);
  },

  // XÃ³a session (records sáº½ tá»± Ä‘á»™ng xÃ³a do ON DELETE CASCADE)
  delete: async (sessionId) => {
    return await run('DELETE FROM attendance_sessions WHERE id = ?', [sessionId]);
  }
};

// Attendance Records
export const attendanceRecordsDB = {
  // Táº¡o nhiá»u báº£n ghi Ä‘iá»ƒm danh cÃ¹ng lÃºc
  createBulk: async (sessionId, records) => {
    await run('BEGIN TRANSACTION');
    try {
      for (const record of records) {
        await run(`
          INSERT INTO attendance_records (session_id, student_id, is_present)
          VALUES (?, ?, ?)
        `, [sessionId, record.studentId, record.isPresent ? 1 : 0]);
      }
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  },

  // Láº¥y chi tiáº¿t Ä‘iá»ƒm danh theo session
  getBySessionId: async (sessionId) => {
    return await all(`
      SELECT 
        r.id,
        r.student_id as studentId,
        r.is_present as isPresent,
        st.stt,
        st.baptismal_name as baptismalName,
        st.full_name as fullName
      FROM attendance_records r
      JOIN students st ON r.student_id = st.id
      WHERE r.session_id = ?
      ORDER BY st.stt ASC
    `, [sessionId]);
  }
};

export default db;
