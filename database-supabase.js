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
    },

    // Xoa record diem danh cua mot hoc sinh trong session
    delete: async (sessionId, studentId) => {
        const { error } = await supabase
            .from('attendance_records')
            .delete()
            .match({ session_id: sessionId, student_id: studentId });

        if (error) throw error;
        return { changes: 1 };
    },

    // Cap nhat trang thai diem danh cua mot hoc sinh
    update: async (sessionId, studentId, isPresent) => {
        const { error } = await supabase
            .from('attendance_records')
            .update({ is_present: isPresent })
            .match({ session_id: sessionId, student_id: studentId });

        if (error) throw error;
        return { changes: 1 };
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

        if (updates.username) updateData.username = updates.username;
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

// =====================================================
// SYNC ERROR LOGS
// =====================================================
export const syncErrorsDB = {
    // Tao log moi
    create: async (data) => {
        // Process attendance records if provided
        let attendanceRecords = null;
        let presentCount = 0;

        if (data.records && Array.isArray(data.records)) {
            const recordsWithDetails = [];

            for (const record of data.records) {
                if (record.isPresent) {
                    // Fetch student details
                    const { data: student, error: studentError } = await supabase
                        .from('students')
                        .select('id, baptismal_name, full_name')
                        .eq('id', record.studentId)
                        .single();

                    if (!studentError && student) {
                        const studentName = student.baptismal_name
                            ? `${student.baptismal_name} ${student.full_name}`
                            : student.full_name;

                        recordsWithDetails.push({
                            studentId: student.id,
                            studentName: studentName,
                            isPresent: true
                        });
                        presentCount++;
                    }
                }
            }

            if (recordsWithDetails.length > 0) {
                attendanceRecords = recordsWithDetails;
            }
        }

        const { error, data: result } = await supabase
            .from('sync_error_logs')
            .insert({
                user_id: data.userId,
                username: data.username,
                class_id: data.classId || null,
                attendance_date: data.attendanceDate || null,
                attendance_type: data.attendanceType || null,
                attendance_id: data.attendanceId || null,
                error_message: data.error,
                user_agent: data.userAgent || null,
                is_online: data.online || false,
                attendance_records: attendanceRecords,
                present_count: presentCount
            })
            .select('id')
            .single();

        if (error) throw error;
        return result.id;
    },

    // Lay danh sach error logs (filter + pagination)
    getAll: async ({ userId, classId, resolved, startDate, endDate, limit, offset }) => {
        let query = supabase
            .from('sync_error_logs')
            .select(`
                *,
                classes (
                    name
                )
            `, { count: 'exact' });

        if (userId) query = query.eq('user_id', userId);
        if (classId) query = query.eq('class_id', classId);
        if (resolved !== undefined) query = query.eq('resolved', resolved);
        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
            logs: data.map(log => ({
                id: log.id,
                userId: log.user_id,
                username: log.username,
                classId: log.class_id,
                className: log.classes ? log.classes.name : null,
                attendanceDate: log.attendance_date,
                attendanceType: log.attendance_type,
                attendanceId: log.attendance_id,
                error: log.error_message,
                userAgent: log.user_agent,
                isOnline: log.is_online,
                createdAt: log.created_at,
                resolved: log.resolved,
                resolvedAt: log.resolved_at,
                resolvedBy: log.resolved_by,
                notes: log.notes,
                attendanceRecords: log.attendance_records || [],
                presentCount: log.present_count || 0
            })),
            total: count
        };
    },

    // Lay thong ke
    getStats: async (period) => {
        // Note: Complex aggregation is better done with RPC or raw SQL in Supabase.
        // For simplicity with JS client and no RPC handy, we might fetch simplified data or do multiple count queries.
        // Or better, let's try to use raw SQL via RPC if available, but here we'll stick to multiple queries for safety/compatibility.

        const getCount = async (filter) => {
            let query = supabase.from('sync_error_logs').select('*', { count: 'exact', head: true });
            if (filter) filter(query);
            const { count, error } = await query;
            if (error) throw error;
            return count;
        };

        const now = new Date();
        let dateLimit;

        switch (period) {
            case '24h': dateLimit = new Date(now - 24 * 60 * 60 * 1000); break;
            case '7d': dateLimit = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': dateLimit = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
            default: dateLimit = null; // 'all'
        }

        const dateFilter = (q) => { if (dateLimit) q.gte('created_at', dateLimit.toISOString()); };

        const [total, resolved, unresolved] = await Promise.all([
            getCount(q => dateFilter(q)),
            getCount(q => { dateFilter(q); q.eq('resolved', true); }),
            getCount(q => { dateFilter(q); q.eq('resolved', false); })
        ]);

        // Helper for group by counts (client-side aggregation for small datasets, 
        // normally risky for big data but acceptable for error logs usually)
        // For better performance, create Views or RPCs in Supabase.
        const { data: logs, error } = await supabase
            .from('sync_error_logs')
            .select('username, class_id, error_message')
            .gte('created_at', dateLimit ? dateLimit.toISOString() : '1970-01-01');

        if (error) throw error;

        const byUser = {};
        const byClass = {};
        const byErrorType = {};

        logs.forEach(log => {
            byUser[log.username] = (byUser[log.username] || 0) + 1;
            if (log.class_id) byClass[log.class_id] = (byClass[log.class_id] || 0) + 1;
            byErrorType[log.error_message] = (byErrorType[log.error_message] || 0) + 1;
        });

        // Sort and limit top 10
        const sortObj = (obj) => Object.entries(obj)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

        return {
            total,
            resolved,
            unresolved,
            byUser: sortObj(byUser),
            byClass: sortObj(byClass),
            byErrorType: sortObj(byErrorType)
        };
    },

    // Resolve error
    resolve: async (id, resolveData) => {
        const { error } = await supabase
            .from('sync_error_logs')
            .update({
                resolved: true,
                resolved_at: new Date().toISOString(),
                resolved_by: resolveData.resolvedBy,
                notes: resolveData.notes
            })
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    },

    // Xoa log
    delete: async (id) => {
        const { error } = await supabase
            .from('sync_error_logs')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    },

    // Xoa nhieu log
    deleteBulk: async ({ ids, olderThan, resolved }) => {
        let query = supabase.from('sync_error_logs').delete();

        if (ids && ids.length > 0) {
            query = query.in('id', ids);
        } else if (olderThan) {
            query = query.lt('created_at', olderThan);
            if (resolved) {
                query = query.eq('resolved', true);
            }
        } else {
            throw new Error('Invalid delete conditions');
        }

        const { error, count } = await query; // count won't be returned by delete normally in Supabase JS client v2 unless select is used? 
        // Actually delete doesn't return count by default easily in valid JS syntax without select.
        // But for minimal viable implementation:
        if (error) throw error;
        return { success: true };
    },

    // Lay danh sach attendanceId da duoc resolve cho user
    getResolvedAttendanceIds: async (userId, since) => {
        let query = supabase
            .from('sync_error_logs')
            .select('attendance_id')
            .eq('user_id', userId)
            .eq('resolved', true)
            .not('attendance_id', 'is', null);

        if (since) {
            query = query.gt('resolved_at', since);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Extract unique attendance IDs
        const uniqueIds = [...new Set(data.map(log => log.attendance_id))];

        return {
            resolvedAttendanceIds: uniqueIds,
            count: uniqueIds.length
        };
    }
};

export default {
    classesDB,
    studentsDB,
    attendanceSessionsDB,
    attendanceRecordsDB,
    gradesDB,
    usersDB,
    syncErrorsDB,
    initializeDatabase
};
