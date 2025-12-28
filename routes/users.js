import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { usersDB } from '../database-supabase.js';

const router = express.Router();

// Middleware: Check if user is admin
// TODO: Replace with actual auth middleware that gets user from session/token
function checkAdmin(req, res, next) {
    // For now, expect user info in request body/headers
    // In production, this should come from JWT/session
    const userRole = req.headers['x-user-role']; // Temporary

    if (userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Khong co quyen truy cap'
        });
    }
    next();
}

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', checkAdmin, async (req, res) => {
    try {
        const users = await usersDB.getAll();

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            message: 'Loi khi lay danh sach nguoi dung',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/users
 * Create new user (admin only)
 */
router.post('/',
    [
        checkAdmin,
        body('username').isLength({ min: 3 }).withMessage('Username phai co it nhat 3 ky tu'),
        body('password').isLength({ min: 6 }).withMessage('Password phai co it nhat 6 ky tu'),
        body('role').isIn(['admin', 'user']).withMessage('Role phai la admin hoac user'),
        body('assignedClasses').optional().isArray().withMessage('assignedClasses phai la array')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { username, password, role, assignedClasses } = req.body;

            // Check if username already exists
            const existingUser = await usersDB.findByUsername(username);
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Username da ton tai'
                });
            }

            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create user
            const newUser = await usersDB.create(
                username,
                hashedPassword,
                role,
                assignedClasses || null,
                req.body.fullName || null
            );

            console.log(`✅ Created new user: ${username} (${role})`);

            res.status(201).json({
                success: true,
                message: 'Tao nguoi dung thanh cong',
                user: newUser
            });

        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({
                success: false,
                message: 'Loi khi tao nguoi dung',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * PUT /api/users/:id
 * Update user (admin only)
 */
router.put('/:id',
    [
        checkAdmin,
        body('password').optional().isLength({ min: 6 }).withMessage('Password phai co it nhat 6 ky tu'),
        body('role').optional().isIn(['admin', 'user']).withMessage('Role phai la admin hoac user'),
        body('assignedClasses').optional().isArray().withMessage('assignedClasses phai la array')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { id } = req.params;
            const { password, role, assignedClasses, fullName } = req.body;

            // Check if user exists
            const user = await usersDB.getById(id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Khong tim thay nguoi dung'
                });
            }

            // Prepare updates
            const updates = {};
            if (role) updates.role = role;
            if (fullName !== undefined) updates.fullName = fullName;
            if (assignedClasses !== undefined) updates.assignedClasses = assignedClasses;

            // Hash new password if provided
            if (password) {
                const saltRounds = 10;
                updates.password = await bcrypt.hash(password, saltRounds);
            }

            // Update user
            await usersDB.update(id, updates);

            console.log(`✅ Updated user: ${user.username}`);

            res.json({
                success: true,
                message: 'Cap nhat nguoi dung thanh cong'
            });

        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({
                success: false,
                message: 'Loi khi cap nhat nguoi dung',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', checkAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const user = await usersDB.getById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Khong tim thay nguoi dung'
            });
        }

        // Don't allow deleting yourself (optional safety check)
        // TODO: Get current user ID from session/token
        // if (currentUserId === parseInt(id)) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'Khong the xoa chinh minh'
        //     });
        // }

        // Delete user
        await usersDB.delete(id);

        console.log(`✅ Deleted user: ${user.username}`);

        res.json({
            success: true,
            message: 'Xoa nguoi dung thanh cong'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Loi khi xoa nguoi dung',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
