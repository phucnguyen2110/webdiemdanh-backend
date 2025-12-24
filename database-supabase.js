import { supabase } from './supabase.js';

/**
 * Database helper functions for Supabase PostgreSQL
 * This replaces the SQLite database.js file
 */

// =====================================================
// CLASSES
// =====================================================
export const classesDB = {
    // Tạo lớp mới
    create: async (name, excelFilePath = null) => {
        const { data, error } = await supabase
            .from('classes')
            .insert({ name, excel_file_path: excelFilePath })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    },

    // Lấy tất cả lớp với số lượng học sinh
    getAll: async () => {
        const { data, error } = await supabase
            .from('classes_with_stats')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Lấy lớp theo ID
    getById: async (id) => {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    // Cập nhật tên lớp
    update: async (id, name) => {
        const { error } = await supabase
            .from('classes')
            .update({ name })
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    },

    // Cập nhật file path
    updateFilePath: async (id, filePath) => {
        const { error } = await supabase
            .from('classes')
            .update({ excel_file_path: filePath })
            .eq('id', id);

        if (error) throw error;
        return { changes: 1 };
    },

    // Xóa lớp
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
    // Tạo nhiều học sinh cùng lúc (bulk insert)
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

    // Lấy tất cả học sinh trong lớp
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

    // Lấy thông tin một học sinh
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

    // Xóa tất cả học sinh trong lớp
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
    // Tạo buổi điểm danh mới
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

    // Lấy lịch sử buổi điểm danh theo lớp
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

    // Lấy chi tiết buổi điểm danh
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

    // Xóa session
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
    // Tạo nhiều bản ghi điểm danh cùng lúc
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

    // Lấy chi tiết điểm danh theo session
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

/**
 * Initialize database (not needed for Supabase, but kept for compatibility)
 */
export async function initializeDatabase() {
    console.log('✅ Using Supabase PostgreSQL database');
    // Schema is already created via SQL script
    // This function is kept for compatibility with existing code
}

export default {
    classesDB,
    studentsDB,
    attendanceSessionsDB,
    attendanceRecordsDB,
    initializeDatabase
};
