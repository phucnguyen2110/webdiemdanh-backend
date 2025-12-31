
import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { syncErrorsDB, usersDB } from '../database-supabase.js';

const router = express.Router();

/**
 * Middleware: Authenticate User
 * Checks for x-user-id header (compatible with existing system) or Bearer token (placeholder)
 */
const authenticate = async (req, res, next) => {
    try {
        // 1. Try x-user-id header (Current System Standard)
        let userId = req.headers['x-user-id'];

        // Fallback: Try to get userId from body if header is missing (for curl simplicity)
        if (!userId && req.body && req.body.userId) {
            userId = req.body.userId;
            console.log('Using userId from request body as fallback');
        }

        if (userId) {
            const user = await usersDB.getById(parseInt(userId));
            if (user) {
                req.user = user;
                return next();
            } else {
                console.warn(`Auth failed: User ID ${userId} not found in database`);
            }
        } else {
            console.warn('Auth failed: Missing x-user-id header and no userId in body');
            // Log headers to see what IS being sent
            console.warn('Headers received:', JSON.stringify(req.headers));
        }

        // 2. Fallback: Parse Bearer token (if implemented in future)
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            // const token = authHeader.split(' ')[1];
            // Verify token logic here...
            // For now, fail if only Bearer is provided without backend support
        }

        return res.status(401).json({
            success: false,
            message: 'Unauthorized - Invalid or missing user credentials'
        });
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ success: false, message: 'Server authentication error' });
    }
};

/**
 * Middleware: Require Admin Role
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden - Admin access required'
        });
    }
    next();
};

/**
 * POST /api/sync-errors
 * Log a new sync error
 */
router.post('/', authenticate, [
    body('error').notEmpty().withMessage('Error message is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: errors.array()[0].msg });
        }

        const { classId, attendanceDate, attendanceType, attendanceId, error, userAgent, online, records } = req.body;
        const { id: userId, username } = req.user;

        const logId = await syncErrorsDB.create({
            userId,
            username,
            classId: classId ? parseInt(classId) : null,
            attendanceDate,
            attendanceType,
            attendanceId: attendanceId ? parseInt(attendanceId) : null,
            error,
            userAgent,
            online,
            records: records || []
        });

        res.json({
            success: true,
            logId,
            message: 'Error logged successfully'
        });
    } catch (error) {
        console.error('Error logging sync error:', error);
        res.status(500).json({ success: false, message: 'Failed to log error' });
    }
});

/**
 * GET /api/sync-errors
 * Get list of sync errors
 * - Admin: Can view all
 * - User: Can view only their own
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, userId, classId, resolved, startDate, endDate } = req.query;
        const currentUser = req.user;

        // If not admin, force userId filter to current user
        const filterUserId = currentUser.role === 'admin'
            ? (userId ? parseInt(userId) : undefined)
            : currentUser.id;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const result = await syncErrorsDB.getAll({
            userId: filterUserId,
            classId: classId ? parseInt(classId) : undefined,
            resolved: resolved !== undefined ? resolved === 'true' : undefined,
            startDate,
            endDate,
            limit: parseInt(limit),
            offset
        });

        res.json({
            success: true,
            data: {
                logs: result.logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    totalPages: Math.ceil(result.total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Error fetching sync errors:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch errors' });
    }
});

/**
 * GET /api/sync-errors/stats
 * Get statistics (Admin only)
 */
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        const stats = await syncErrorsDB.getStats(period);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

/**
 * PATCH /api/sync-errors/:id/resolve
 * Mark error as resolved by deleting it (Admin only)
 * This keeps the database clean and prevents old errors from accumulating
 */
router.patch('/:id/resolve', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Delete the error instead of marking as resolved
        await syncErrorsDB.delete(id);

        res.json({
            success: true,
            message: 'Error resolved and deleted successfully'
        });
    } catch (error) {
        console.error('Error resolving error:', error);
        res.status(500).json({ success: false, message: 'Failed to resolve error' });
    }
});

/**
 * DELETE /api/sync-errors/bulk
 * Delete multiple logs (Admin only)
 */
router.delete('/bulk', authenticate, requireAdmin, async (req, res) => {
    try {
        const { ids, olderThan, resolved } = req.body;

        await syncErrorsDB.deleteBulk({
            ids,
            olderThan,
            resolved
        });

        res.json({
            success: true,
            message: 'Error logs deleted'
        });
    } catch (error) {
        console.error('Error deleting bulk errors:', error);
        res.status(500).json({ success: false, message: 'Failed to delete errors' });
    }
});

/**
 * DELETE /api/sync-errors/:id
 * Delete single log (Admin only)
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await syncErrorsDB.delete(id);

        res.json({
            success: true,
            message: 'Error log deleted'
        });
    } catch (error) {
        console.error('Error deleting error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete error' });
    }
});

/**
 * GET /api/sync-errors/my-resolved
 * Get list of resolved attendance IDs for current user
 * This allows users to clean up their local IndexedDB
 */
router.get('/my-resolved', authenticate, async (req, res) => {
    try {
        const { since } = req.query;
        const { id: userId } = req.user;

        const result = await syncErrorsDB.getResolvedAttendanceIds(userId, since);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching resolved attendance IDs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch resolved attendance IDs' });
    }
});

export default router;
