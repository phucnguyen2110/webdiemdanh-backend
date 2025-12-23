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
 * Khoi tao database schema
 */
export async function initializeDatabase() {
  // Enable foreign keys
  await run('PRAGMA foreign_keys = ON');

  // Tao bang classes (lop hoc)
  await run(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      excel_file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tao bang student (thieu nhi)
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);

  // Tao bang attendance_sessions (buoi diem danh)
  await run(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      attendance_type TEXT NOT NULL CHECK(attendance_type IN ('Hoc Giao Ly', 'Le Thu 5', 'Le Chua Nhat')),
      attendance_method TEXT DEFAULT 'manual' CHECK(attendance_method IN ('manual', 'qr')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);

  // Tao bang attendance_records (chi tiet diem danh)
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
    console.log('✅ Migration: Added attendance_method column');
  } catch (err) {
    // Column already exists, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.error('Migration warning:', err.message);
    }
  }

  // Migration: Add new student fields if they don't exist
  const studentColumns = [
    'student_id TEXT',
    'baptismal_name TEXT',
    'date_of_birth TEXT',
    'father_name TEXT',
    'mother_name TEXT',
    'address TEXT',
    'phone TEXT',
    'note TEXT'
  ];

  for (const column of studentColumns) {
    try {
      const [columnName] = column.split(' ');
      await run(`ALTER TABLE students ADD COLUMN ${column}`);
      console.log(`✅ Migration: Added ${columnName} column to students`);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('Migration warning:', err.message);
      }
    }
  }

  // Migration: Make stt nullable if needed
  // SQLite doesn't support ALTER COLUMN, so we skip this


  // Tao indexes de tang toc query
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
  // Tao lop moi
  create: async (name, excelFilePath = null) => {
    const result = await run(
      'INSERT INTO classes (name, excel_file_path) VALUES (?, ?)',
      [name, excelFilePath]
    );
    return result.lastID;
  },

  // Lay tat ca lop
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

  // Lay lop theo ID
  getById: async (id) => {
    return await get('SELECT * FROM classes WHERE id = ?', [id]);
  },

  // Cap nhat ten lop
  update: async (id, name) => {
    return await run('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
  },

  // Xoa lop
  delete: async (id) => {
    return await run('DELETE FROM classes WHERE id = ?', [id]);
  }
};

// Students
export const studentsDB = {
  // Tao nhiu hoc sinh cung luc (bulk insert)
  createBulk: async (classId, students) => {
    await run('BEGIN TRANSACTION');
    try {
      for (const student of students) {
        await run(
          `INSERT INTO students (
            class_id, stt, student_id, baptismal_name, full_name, 
            date_of_birth, father_name, mother_name, address, phone, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            classId,
            student.stt || null,
            student.studentId || null,
            student.baptismalName || null,
            student.fullName,
            student.dateOfBirth || null,
            student.fatherName || null,
            student.motherName || null,
            student.address || null,
            student.phone || null,
            student.note || null
          ]
        );
      }
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  },

  // Lay tat ca hoc sinh trong lop
  getByClassId: async (classId) => {
    const students = await all(`
      SELECT 
        id, 
        stt, 
        student_id as studentId,
        baptismal_name as baptismalName, 
        full_name as fullName, 
        date_of_birth as dateOfBirth,
        father_name as fatherName,
        mother_name as motherName,
        address,
        phone,
        note
      FROM students
      WHERE class_id = ?
      ORDER BY stt ASC
    `, [classId]);

    // Add displayName field: "STT. BaptismalName FullName"
    return students.map(student => ({
      ...student,
      displayName: `${student.stt || ''}${student.stt ? '. ' : ''}${student.baptismalName ? student.baptismalName + ' ' : ''}${student.fullName}`.trim()
    }));
  },

  // Lay thong tin mot hoc sinh
  getById: async (studentId) => {
    return await get(`
      SELECT id, class_id as classId, stt, baptismal_name as baptismalName, full_name as fullName, date_of_birth as dateOfBirth
      FROM students
      WHERE id = ?
    `, [studentId]);
  },

  // Xoa tat ca hoc sinh trong lop
  deleteByClassId: async (classId) => {
    return await run('DELETE FROM students WHERE class_id = ?', [classId]);
  }
};

// Attendance Sessions
export const attendanceSessionsDB = {
  // Tao buoi diem danh moi
  create: async (classId, attendanceDate, attendanceType, attendanceMethod = 'manual') => {
    const result = await run(`
      INSERT INTO attendance_sessions (class_id, attendance_date, attendance_type, attendance_method)
      VALUES (?, ?, ?, ?)
    `, [classId, attendanceDate, attendanceType, attendanceMethod]);
    return result.lastID;
  },

  // Lay sach buoi diem danh theo lop
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

  // Lay chi tiet buoi diem danh
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

  // Xoa session
  delete: async (sessionId) => {
    return await run('DELETE FROM attendance_sessions WHERE id = ?', [sessionId]);
  }
};

// Attendance Records
export const attendanceRecordsDB = {
  // Tao nhiu ban ghi diem danh cung luc
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

  // Lay chi tiet diem danh theo session
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
