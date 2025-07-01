const express = require('express');
const router = express.Router();
const { requireLogin } = require('../../middleware/authMiddleware');

router.post('/', requireLogin, async (req, res) => {
    const { date, time, systolic, diastolic, notes, patient_id } = req.body;
    
    try {
        // Validate input
        if (!date || !time || isNaN(systolic) || isNaN(diastolic) || !patient_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        // Verify patient belongs to current clinic
        const patientCheck = await new Promise((resolve, reject) => {
            req.db.query(
                'SELECT id FROM patients WHERE id = ? AND clinic_id = ?',
                [patient_id, req.session.userId],
                (error, results) => {
                    if (error) reject(error);
                    resolve(results);
                }
            );
        });
        
        if (patientCheck.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Patient not found or not authorized'
            });
        }

        // Insert reading
        const result = await new Promise((resolve, reject) => {
            req.db.query(
                'INSERT INTO readings (date, time, systolic, diastolic, notes, patient_id) VALUES (?, ?, ?, ?, ?, ?)',
                [date, time, systolic, diastolic, notes || null, patient_id],
                (error, results) => {
                    if (error) reject(error);
                    resolve(results);
                }
            );
        });

        // Get the newly created reading
        const [newReading] = await new Promise((resolve, reject) => {
            req.db.query(
                'SELECT * FROM readings WHERE id = ?',
                [result.insertId],
                (error, results) => {
                    if (error) reject(error);
                    resolve(results);
                }
            );
        });

        res.status(201).json({
            success: true,
            reading: newReading
        });
        
    } catch (error) {
        console.error('Database error:', {
            code: error.code,
            message: error.sqlMessage,
            sql: error.sql
        });
        
        res.status(500).json({
            success: false,
            error: 'Database operation failed',
            details: process.env.NODE_ENV === 'development' ? {
                code: error.code,
                message: error.sqlMessage
            } : undefined
        });
    }
});

module.exports = router;