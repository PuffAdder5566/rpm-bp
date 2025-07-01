const express = require('express');
const router = express.Router();
// const { requireLogin } = require('../middleware/authMiddleware');
const { requireLogin } = require('../middleware/authMiddleware');

router.get('/', requireLogin, async (req, res) => {
    try {
        // Verify session exists
        if (!req.session.userId) {
            return res.redirect('/login?sessionExpired=true');
        }

        const query = `
            SELECT p.*, 
                   (SELECT r.systolic FROM readings r 
                    WHERE r.patient_id = p.id 
                    ORDER BY r.date DESC, r.time DESC 
                    LIMIT 1) as last_systolic,
                   (SELECT r.diastolic FROM readings r 
                    WHERE r.patient_id = p.id 
                    ORDER BY r.date DESC, r.time DESC 
                    LIMIT 1) as last_diastolic
            FROM patients p
            WHERE p.clinic_id = ?
            ORDER BY p.name ASC
        `;
        
        const patients = await new Promise((resolve, reject) => {
            req.db.query(query, [req.session.userId], (error, results) => {
                if (error) reject(error);
                resolve(results || []);
            });
        });

        res.render('dashboard', {
            user: {
                id: req.session.userId,
                username: req.session.username,
                role: req.session.role,
                clinicName: req.session.clinicName
            },
            patients: patients
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            message: 'Server error',
            user: req.session.userId ? {
                id: req.session.userId,
                username: req.session.username,
                role: req.session.role,
                clinicName: req.session.clinicName
            } : null
        });
    }
});
// Get single patient with readings
router.get('/api/patients/:id', requireLogin, async (req, res) => {
    try {
        const patientId = req.params.id;
        
        // Verify session
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }

        // Get patient info
        req.db.query('SELECT * FROM patients WHERE id = ? AND clinic_id = ?', 
            [patientId, req.session.userId], 
            (error, patients) => {
                if (error) {
                    console.error('Database error:', error);
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
                
                const patient = patients[0];
                
                // Get readings for this patient
                req.db.query(
                    'SELECT * FROM readings WHERE patient_id = ? ORDER BY date DESC, time DESC',
                    [patientId],
                    (error, readings) => {
                        if (error) {
                            console.error('Database error:', error);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to load readings' 
                            });
                        }
                        
                        patient.readings = readings || [];
                        res.json({ 
                            success: true, 
                            patient 
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error fetching patient:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Add new reading
router.post('/api/readings', requireLogin, async (req, res) => {
    try {
        // Validate session
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }

        const { date, time, systolic, diastolic, notes, patient_id } = req.body;
        
        // Validate input
        if (!date || !time || isNaN(systolic) || isNaN(diastolic) || !patient_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        // Verify patient belongs to this clinic
        req.db.query(
            'SELECT id FROM patients WHERE id = ? AND clinic_id = ?',
            [patient_id, req.session.userId],
            (error, results) => {
                if (error) {
                    console.error('Database error:', error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Database error' 
                    });
                }

                if (results.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Patient not found'
                    });
                }

                // Insert reading
                req.db.query(
                    'INSERT INTO readings (date, time, systolic, diastolic, notes, patient_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [date, time, systolic, diastolic, notes, patient_id],
                    (error, result) => {
                        if (error) {
                            console.error('Database error:', error);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to add reading' 
                            });
                        }

                        // Get the full reading data to return
                        req.db.query(
                            'SELECT * FROM readings WHERE id = ?',
                            [result.insertId],
                            (error, readings) => {
                                if (error) {
                                    console.error('Database error:', error);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to fetch reading' 
                                    });
                                }

                                res.json({ 
                                    success: true,
                                    reading: readings[0]
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error adding reading:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Add new patient
router.post('/api/patients', requireLogin, async (req, res) => {
    try {
        // Validate session
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }

        const { name, age, medical_condition, notes } = req.body;
        
        // Validate input
        if (!name || !age || !medical_condition) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        if (isNaN(age)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Age must be a number' 
            });
        }
        
        req.db.query(
            'INSERT INTO patients (name, age, medical_condition, notes, clinic_id) VALUES (?, ?, ?, ?, ?)',
            [name, age, medical_condition, notes, req.session.userId],
            (error, results) => {
                if (error) {
                    console.error('Error adding patient:', error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to add patient' 
                    });
                }
                
                // Return the newly created patient
                req.db.query(
                    'SELECT * FROM patients WHERE id = ?',
                    [results.insertId],
                    (error, patients) => {
                        if (error) {
                            console.error('Database error:', error);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to fetch patient' 
                            });
                        }
                        if (patients.length === 0) {
                            return res.json({ success: true });
                        }
                        res.json({ 
                            success: true,
                            patient: patients[0]
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error adding patient:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

module.exports = router;