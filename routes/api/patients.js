const express = require('express');
const router = express.Router();
const { requireLogin } = require('../../middleware/authMiddleware');

// Get all patients for current clinic
// Get all patients for current clinic
router.get('/', requireLogin, (req, res) => {
    const query = `
        SELECT p.* 
        FROM patients p
        WHERE p.clinic_id = ?
        ORDER BY p.name ASC
    `;
    
    req.db.query(query, [req.session.user.id], (error, patients) => {
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Database error'
            });
        }
        
        res.json({
            success: true,
            patients: patients
        });
    });
});

// Add new patient
router.post('/', requireLogin, async (req, res) => {
    try {
        const { name, age, medical_condition, notes } = req.body;
        
        // Validation
        if (!name || !age || !medical_condition) {
            return res.status(400).json({ 
                success: false,
                error: 'Name, age and medical condition are required' 
            });
        }

        if (age < 1 || age > 120) {
            return res.status(400).json({
                success: false,
                error: 'Age must be between 1-120'
            });
        }

        // Verify clinic exists
        const clinicCheck = 'SELECT id FROM accounts WHERE id = ?';
        req.db.query(clinicCheck, [req.session.user.id], (err, clinics) => {
            if (err || clinics.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid clinic ID'
                });
            }

            // Insert patient
            const query = `
                INSERT INTO patients 
                (name, age, medical_condition, notes, clinic_id) 
                VALUES (?, ?, ?, ?, ?)
            `;
            
            req.db.query(query, 
                [name, age, medical_condition, notes || null, req.session.user.id],
                (error, results) => {
                    if (error) {
                        console.error('Detailed DB error:', {
                            code: error.code,
                            message: error.sqlMessage,
                            sql: error.sql
                        });
                        return res.status(500).json({ 
                            success: false,
                            error: 'Database operation failed',
                            details: process.env.NODE_ENV === 'development' ? {
                                code: error.code,
                                message: error.sqlMessage
                            } : undefined
                        });
                    }
                    
                    // Return the created patient
                    const newPatientQuery = 'SELECT * FROM patients WHERE id = ?';
                    req.db.query(newPatientQuery, [results.insertId], (err, patientResult) => {
                        if (err) {
                            console.error('Fetch error:', err);
                            return res.status(201).json({
                                success: true,
                                message: 'Patient created but could not retrieve details',
                                patientId: results.insertId
                            });
                        }
                        
                        res.status(201).json({
                            success: true,
                            patient: patientResult[0]
                        });
                    });
                }
            );
        });
    } catch (error) {
        console.error('Add patient error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get single patient with readings
// Get single patient with readings
router.get('/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    // First verify patient belongs to this clinic
    const verifyQuery = 'SELECT * FROM patients WHERE id = ? AND clinic_id = ?';
    req.db.query(verifyQuery, [id, req.session.user.id], (error, patients) => {
        if (error) {
            return res.status(500).json({ 
                success: false,
                error: 'Database error'
            });
        }
        
        if (patients.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        // Then get their readings - updated for your schema
        req.db.query(
            `SELECT id, systolic, diastolic, date, time, notes, created_at
             FROM readings 
             WHERE patient_id = ? 
             ORDER BY date DESC, time DESC`, 
            [id],
            (error, readings) => {
                if (error) {
                    return res.status(500).json({ 
                        success: false,
                        error: 'Database error' 
                    });
                }
                
                res.json({
                    success: true,
                    patient: {
                        ...patients[0],
                        readings: readings
                    }
                });
            }
        );
    });
});
// Update patient
router.put('/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    const { name, age, medical_condition, notes } = req.body;
    
    if (!name || !age || !medical_condition) {
        return res.status(400).json({ 
            success: false,
            error: 'Name, age and medical condition are required' 
        });
    }

    const query = `
        UPDATE patients 
        SET name = ?, age = ?, medical_condition = ?, notes = ?
        WHERE id = ? AND clinic_id = ?
    `;
    
    req.db.query(query, 
        [name, age, medical_condition, notes || null, id, req.session.user.id],
        (error, results) => {
            if (error) {
                console.error('Database error:', {
                    code: error.code,
                    message: error.sqlMessage,
                    sql: error.sql
                });
                return res.status(500).json({ 
                    success: false,
                    error: 'Database operation failed'
                });
            }
            
            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Patient not found or not authorized'
                });
            }
            
            res.json({
                success: true,
                message: 'Patient updated successfully'
            });
        }
    );
});

// Delete patient
router.delete('/:id', requireLogin, (req, res) => {
    const { id } = req.params;
    
    // First delete all readings for this patient
    const deleteReadingsQuery = 'DELETE FROM readings WHERE patient_id = ?';
    req.db.query(deleteReadingsQuery, [id], (error, results) => {
        if (error) {
            console.error('Error deleting readings:', {
                code: error.code,
                message: error.sqlMessage
            });
            return res.status(500).json({ 
                success: false,
                error: 'Failed to delete patient readings'
            });
        }
        
        // Then delete the patient
        const deletePatientQuery = 'DELETE FROM patients WHERE id = ? AND clinic_id = ?';
        req.db.query(deletePatientQuery, [id, req.session.user.id], (err, patientResults) => {
            if (err) {
                console.error('Error deleting patient:', {
                    code: err.code,
                    message: err.sqlMessage
                });
                return res.status(500).json({ 
                    success: false,
                    error: 'Failed to delete patient'
                });
            }
            
            if (patientResults.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Patient not found or not authorized'
                });
            }
            
            res.json({
                success: true,
                message: 'Patient and all readings deleted successfully'
            });
        });
    });
});

module.exports = router;