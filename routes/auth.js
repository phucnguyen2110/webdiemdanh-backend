import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { usersDB } from '../database-supabase.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login',
    [
        body('username').notEmpty().withMessage('Username khong duoc rong'),
        body('password').notEmpty().withMessage('Password khong duoc rong')
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

            const { username, password } = req.body;

            // Find user by username
            const user = await usersDB.findByUsername(username);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Ten dang nhap hoac mat khau khong dung'
                });
            }

            // Compare password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Ten dang nhap hoac mat khau khong dung'
                });
            }

            // Login successful - return user info (without password)
            console.log(`✅ User logged in: ${username} (${user.role})`);

            res.json({
                success: true,
                id: user.id,
                username: user.username,
                role: user.role,
                assignedClasses: user.assigned_classes
            });

        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({
                success: false,
                message: 'Loi server',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/**
 * POST /api/auth/logout
 * Logout user (optional - mainly for clearing session/cookie)
 */
router.post('/logout', (req, res) => {
    // If using sessions/cookies, clear them here
    console.log('✅ User logged out');

    res.json({
        success: true,
        message: 'Dang xuat thanh cong'
    });
});

/**
 * GET /api/auth/me
 * Get current user's latest information from database
 * Used to refresh user data when assignedClasses are updated
 */
router.get('/me', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Missing user ID'
            });
        }

        // Get fresh user data from database
        const user = await usersDB.getById(parseInt(userId));

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Return latest user info
        res.json({
            success: true,
            id: user.id,
            username: user.username,
            role: user.role,
            assignedClasses: user.assignedClasses || []
        });

    } catch (error) {
        console.error('Error in /auth/me:', error);
        res.status(500).json({
            success: false,
            message: 'Loi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
