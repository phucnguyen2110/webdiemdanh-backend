import express from 'express';
import QRCode from 'qrcode';
import { studentsDB } from '../database.js';

const router = express.Router();

/**
 * GET /api/students/:studentId/qr
 * Generate QR code for a student (permanent, based on studentId)
 */
router.get('/:studentId/qr', async (req, res) => {
    try {
        const { studentId } = req.params;

        // Get student info
        const student = await studentsDB.getById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'KhÃ´ng tÃ¬m tháº¥y thiáº¿u nhi'
            });
        }

        // Create QR data (permanent, based on studentId only)
        const qrData = JSON.stringify({
            studentId: parseInt(studentId),
            studentName: student.fullName,
            baptismalName: student.baptismalName || ''
        });

        // Generate QR code as data URL
        const qrCodeDataURL = await QRCode.toDataURL(qrData, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        res.json({
            success: true,
            qrCode: qrCodeDataURL,
            studentName: student.fullName
        });

    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({
            success: false,
            error: 'Lá»—i khi táº¡o mÃ£ QR'
        });
    }
});

/**
 * GET /api/students/class/:classId/qr-all
 * Generate QR codes for all students in a class
 */
router.get('/class/:classId/qr-all', async (req, res) => {
    try {
        const { classId } = req.params;

        // Get all students in class
        const students = await studentsDB.getByClassId(classId);

        if (!students || students.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'KhÃ´ng cÃ³ thiáº¿u nhi trong lá»›p'
            });
        }

        // Generate QR for each student
        const qrCodes = await Promise.all(
            students.map(async (student) => {
                const qrData = JSON.stringify({
                    studentId: student.id,
                    studentName: student.fullName,
                    baptismalName: student.baptismalName || ''
                });

                const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                    width: 300,
                    margin: 2
                });

                return {
                    studentId: student.id,
                    studentName: student.fullName,
                    baptismalName: student.baptismalName,
                    stt: student.stt,
                    qrCode: qrCodeDataURL
                };
            })
        );

        res.json({
            success: true,
            qrCodes
        });

    } catch (error) {
        console.error('Error generating QR codes:', error);
        res.status(500).json({
            success: false,
            error: 'Lá»—i khi táº¡o mÃ£ QR'
        });
    }
});

export default router;
