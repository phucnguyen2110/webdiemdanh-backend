import { supabase } from './supabase.js';

/**
 * Database helper functions for Supabase PostgreSQL
 * This replaces the SQLite database.js file
 */

// =====================================================
// CLASSES
// =====================================================
export const classesDB = {
    // Tao lop moi
    create: async (name, excelFilePath = null) => {
        const { data, error } = await supabase
            .from('classes')
            .insert({ name, excel_file_path: excelFilePath })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    },

    // Lay tat ca lop voi so luong hoc sinh (co kem ten giao vien)
    getAll: async () => {
        // 1. Get classes
        const { data: classes, error: classesError } = await supabase
            .from('classes_with_stats')
            .select('*')
            .order('created_at', { ascending: false });

        if (classesError) throw classesError;

        try {
            // 2. Get users to find teachers
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('*'); // Select all to get full_name if/when it exists

            if (usersError) {
                console.error('Error fetching users for classes:', usersError);
                return classes;
            }

            // 3. Map teachers to class
            return classes.map(cls => {
                // Find ALL users who have this class in assigned_classes
                const teachers = users.filter(u =>
                    u.assigned_classes &&
                    Array.isArray(u.assigned_classes) &&
                    u.assigned_classes.includes(cls.id)
                );

                const teacherNames = teachers.map(t => t.full_name || t.username).join(', ');

                return {
                    ...cls,
                    teacher_name: teacherNames || null
                };
            });
        } catch (err) {
            console.error('Error in getAll classes:', err);
            return classes;
        }
    },

    // Lay lop theo ID
    getById: async (id) => {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    // Cap nhat ten lop
    update: async (id, name) => {
        const { error } = await supabase
            .from('classes')
            .update({ name })
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    },

    // Cap nhat file path
    updateFilePath: async (id, filePath) => {
        const { error } = await supabase
            .from('classes')
            .update({ excel_file_path: filePath })
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    },

    // Xoa lop
    delete: async (id) => {
        const { error } = await supabase
            .from('classes')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    }
};

// =====================================================
// STUDENTS
// =====================================================
export const studentsDB = {
    // Tao nhieu hoc sinh cung luc (bulk insert)
    createBulk: async (classId, students) => {
        const studentsData = students.map(student => ({
            class_id: classId,
            stt: student.stt || null,
            student_id: student.studentId || null,
            baptismal_name: student.baptismalName || null,
            full_name: student.fullName,
            date_of_birth: student.dateOfBirth || null,
            father_name: student.fatherName || null,
            mother_name: student.motherName || null,
            address: student.address || null,
            phone: student.phone || null,
            note: student.note || null
        }));

        const { error } = await supabase
            .from('students')
            .insert(studentsData);

        if (error) throw error;
    },

    // Lay tat ca hoc sinh trong lop
    getByClassId: async (classId) => {
        const { data, error } = await supabase
            .from('students')
            .select(`
        id,
        stt,
        student_id,
        baptismal_name,
        full_name,
        date_of_birth,
        father_name,
        mother_name,
        address,
        phone,
        note
      `)
            .eq('class_id', classId)
            .order('stt', { ascending: true, nullsFirst: false });

        if (error) throw error;

        // Add displayName field: "STT. BaptismalName FullName"
        return data.map(student => ({
            id: student.id,
            stt: student.stt,
            studentId: student.student_id,
            baptismalName: student.baptismal_name,
            fullName: student.full_name,
            dateOfBirth: student.date_of_birth,
            fatherName: student.father_name,
            motherName: student.mother_name,
            address: student.address,
            phone: student.phone,
            note: student.note,
            displayName: `${student.stt || ''}${student.stt ? '. ' : ''}${student.baptismal_name ? student.baptismal_name + ' ' : ''}${student.full_name}`.trim()
        }));
    },

    // Lay thong tin mot hoc sinh
    getById: async (studentId) => {
        const { data, error } = await supabase
            .from('students')
            .select('id, class_id, stt, baptismal_name, full_name, date_of_birth')
            .eq('id', studentId)
            .single();

        if (error) throw error;

        return {
            id: data.id,
            classId: data.class_id,
            stt: data.stt,
            baptismalName: data.baptismal_name,
            fullName: data.full_name,
            dateOfBirth: data.date_of_birth
        };
    },

    // Xoa tat ca hoc sinh trong lop
    deleteByClassId: async (classId) => {
        const { error } = await supabase
            .from('students')
            .delete()
            .eq('class_id', classId);

        if (error) throw error;
        return { changes: 1 };
    }
};

// =====================================================
// ATTENDANCE SESSIONS
// =====================================================
export const attendanceSessionsDB = {
    // Tao buoi diem danh moi
    create: async (classId, attendanceDate, attendanceType, attendanceMethod = 'manual') => {
        const { data, error } = await supabase
            .from('attendance_sessions')
            .insert({
                class_id: classId,
                attendance_date: attendanceDate,
                attendance_type: attendanceType,
                attendance_method: attendanceMethod
            })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    },

    // Lay lich su buoi diem danh theo lop
    getByClassId: async (classId, startDate = null, endDate = null) => {
        let query = supabase
            .from('attendance_sessions_with_stats')
            .select('*')
            .eq('class_id', classId);

        if (startDate) {
            query = query.gte('attendance_date', startDate);
        }

        if (endDate) {
            query = query.lte('attendance_date', endDate);
        }

        const { data, error } = await query.order('attendance_date', { ascending: false });

        if (error) throw error;

        // Convert to camelCase
        return data.map(session => ({
            id: session.id,
            attendanceDate: session.attendance_date,
            attendanceType: session.attendance_type,
            attendanceMethod: session.attendance_method,
            createdAt: session.created_at,
            presentCount: session.present_count,
            totalCount: session.total_count
        }));
    },

    // Lay chi tiet buoi diem danh
    getById: async (sessionId) => {
        const { data, error } = await supabase
            .from('attendance_sessions')
            .select(`
        id,
        attendance_date,
        attendance_type,
        created_at,
        classes (
          id,
          name
        )
      `)
            .eq('id', sessionId)
            .single();

        if (error) throw error;

        return {
            id: data.id,
            attendanceDate: data.attendance_date,
            attendanceType: data.attendance_type,
            createdAt: data.created_at,
            className: data.classes.name,
            classId: data.classes.id
        };
    },

    // Xoa session
    delete: async (sessionId) => {
        const { error } = await supabase
            .from('attendance_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) throw error;
        return { changes: 1 };
    }
};

// =====================================================
// ATTENDANCE RECORDS
// =====================================================
export const attendanceRecordsDB = {
    // Tao nhieu ban ghi diem danh cung luc
    createBulk: async (sessionId, records) => {
        const recordsData = records.map(record => ({
            session_id: sessionId,
            student_id: record.studentId,
            is_present: record.isPresent
        }));

        const { error } = await supabase
            .from('attendance_records')
            .insert(recordsData);

        if (error) throw error;
    },

    // Lay chi tiet diem danh theo session
    getBySessionId: async (sessionId) => {
        const { data, error } = await supabase
            .from('attendance_records')
            .select(`
        id,
        student_id,
        is_present,
        students (
          stt,
          baptismal_name,
          full_name
        )
      `)
            .eq('session_id', sessionId)
            .order('students(stt)', { ascending: true });

        if (error) throw error;

        return data.map(record => ({
            id: record.id,
            studentId: record.student_id,
            isPresent: record.is_present,
            stt: record.students.stt,
            baptismalName: record.students.baptismal_name,
            fullName: record.students.full_name
        }));
    }
};

// =====================================================
// GRADES
// =====================================================
export const gradesDB = {
    // Tao hoac cap nhat diem (UPSERT)
    upsert: async (classId, semester, grades) => {
        const gradesData = grades.map(grade => ({
            class_id: classId,
            student_id: grade.studentId,
            student_name: grade.studentName,
            semester: semester.toUpperCase(),
            grade_m: grade.gradeM !== null && grade.gradeM !== undefined ? parseFloat(grade.gradeM) : null,
            grade_1t: grade.grade1T !== null && grade.grade1T !== undefined ? parseFloat(grade.grade1T) : null,
            grade_thi: grade.gradeThi !== null && grade.gradeThi !== undefined ? parseFloat(grade.gradeThi) : null
        }));

        const { data, error } = await supabase
            .from('grades')
            .upsert(gradesData, {
                onConflict: 'class_id,student_id,semester',
                ignoreDuplicates: false
            })
            .select('id');

        if (error) throw error;
        return data;
    },

    // Lay diem theo lop
    getByClassId: async (classId, semester = null) => {
        let query = supabase
            .from('grades')
            .select('*')
            .eq('class_id', classId);

        if (semester) {
            query = query.eq('semester', semester.toUpperCase());
        }

        const { data, error } = await query.order('student_name', { ascending: true });

        if (error) throw error;

        return data.map(grade => ({
            id: grade.id,
            classId: grade.class_id,
            studentId: grade.student_id,
            studentName: grade.student_name,
            semester: grade.semester,
            gradeM: grade.grade_m,
            grade1T: grade.grade_1t,
            gradeThi: grade.grade_thi,
            createdAt: grade.created_at,
            updatedAt: grade.updated_at
        }));
    },

    // Lay diem theo hoc sinh
    getByStudentId: async (studentId, semester = null) => {
        let query = supabase
            .from('grades')
            .select('*')
            .eq('student_id', studentId);

        if (semester) {
            query = query.eq('semester', semester.toUpperCase());
        }

        const { data, error } = await query.order('semester', { ascending: true });

        if (error) throw error;

        return data.map(grade => ({
            id: grade.id,
            classId: grade.class_id,
            studentId: grade.student_id,
            studentName: grade.student_name,
            semester: grade.semester,
            gradeM: grade.grade_m,
            grade1T: grade.grade_1t,
            gradeThi: grade.grade_thi,
            createdAt: grade.created_at,
            updatedAt: grade.updated_at
        }));
    },

    // Xoa diem theo ID
    delete: async (gradeId) => {
        const { error } = await supabase
            .from('grades')
            .delete()
            .eq('id', gradeId);

        if (error) throw error;
        return { changes: 1 };
    },

    // Xoa tat ca diem cua lop
    deleteByClassId: async (classId, semester = null) => {
        let query = supabase
            .from('grades')
            .delete()
            .eq('class_id', classId);

        if (semester) {
            query = query.eq('semester', semester.toUpperCase());
        }

        const { error } = await query;

        if (error) throw error;
        return { changes: 1 };
    }
};

/**
 * Initialize database (not needed for Supabase, but kept for compatibility)
 */
export async function initializeDatabase() {
    console.log('✅ Using Supabase PostgreSQL database');
    // Schema is already created via SQL script
    // This function is kept for compatibility with existing code
}

// =====================================================
// USERS (Authentication)
// =====================================================
// =====================================================
// USERS (Authentication)
// =====================================================
export const usersDB = {
    // Tim user theo username (for login)
    findByUsername: async (username) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }
        return data;
    },

    // Lay tat ca users (admin only, khong tra ve password)
    getAll: async () => {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, full_name, role, assigned_classes, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data.map(user => ({
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            assignedClasses: user.assigned_classes,
            createdAt: user.created_at,
            updatedAt: user.updated_at
        }));
    },

    // Lay user theo ID (khong tra ve password)
    getById: async (id) => {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, full_name, role, assigned_classes, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return {
            id: data.id,
            username: data.username,
            fullName: data.full_name,
            role: data.role,
            assignedClasses: data.assigned_classes,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    },

    // Tao user moi
    create: async (username, hashedPassword, role, assignedClasses = null, fullName = null) => {
        const { data, error } = await supabase
            .from('users')
            .insert({
                username,
                password: hashedPassword,
                role,
                assigned_classes: assignedClasses,
                full_name: fullName
            })
            .select('id, username, full_name, role, assigned_classes')
            .single();

        if (error) throw error;

        return {
            id: data.id,
            username: data.username,
            fullName: data.full_name,
            role: data.role,
            assignedClasses: data.assigned_classes
        };
    },

    // Cap nhat user
    update: async (id, updates) => {
        const updateData = {};

        if (updates.password) updateData.password = updates.password;
        if (updates.role) updateData.role = updates.role;
        if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
        if (updates.assignedClasses !== undefined) updateData.assigned_classes = updates.assignedClasses;

        const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    },

    // Xoa user
    delete: async (id) => {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    }
};

export default {
    classesDB,
    studentsDB,
    attendanceSessionsDB,
    attendanceRecordsDB,
    gradesDB,
    usersDB,
    initializeDatabase
};
