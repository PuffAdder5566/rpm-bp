const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;

// Login page
router.get('/login', (req, res) => {
    // Only redirect if there's a valid session
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    
    res.render('login', {
        error: req.query.error || null,
        registered: req.query.registered === 'true',
        loggedOut: req.query.loggedOut === 'true',
        sessionExpired: req.query.sessionExpired === 'true',
        formData: {
            username: req.query.username || ''
        }
    });
});

// Login handler - UPDATED WITH SESSION FIXES
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const query = 'SELECT id, username, password, role, clinicName FROM accounts WHERE username = ?';
        req.db.query(query, [username], async (error, results) => {
            if (error) {
                console.error('Database error:', error);
                return res.render('login', {
                    error: 'Database error occurred',
                    formData: { username }
                });
            }
            
            if (results.length === 0) {
                return res.render('login', {
                    error: 'Invalid username or password',
                    formData: { username }
                });
            }
            
            const user = results[0];
            const match = await bcrypt.compare(password, user.password);
            
            if (!match) {
                return res.render('login', {
                    error: 'Invalid username or password',
                    formData: { username }
                });
            }
            
            // Create new session with regeneration
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    return res.render('login', {
                        error: 'Login failed. Please try again.',
                        formData: { username }
                    });
                }

                // Set session data
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.role = user.role;
                req.session.clinicName = user.clinicName;
                
                // Manually set cookie (workaround for some browsers)
                res.cookie('rpm.sid', req.sessionID, {
                    maxAge: 30 * 60 * 1000,
                    httpOnly: true,
                    sameSite: 'lax',
                    domain: 'localhost'
                });

                // Save session and handle response
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        return res.render('login', {
                            error: 'Login failed. Please try again.',
                            formData: { username }
                        });
                    }
                    
                    console.log('Login successful for user:', user.username);
                    return res.redirect('/dashboard');
                });
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            error: 'An error occurred during login',
            formData: { username }
        });
    }
});

// Logout handler
router.get('/logout', (req, res) => {
    console.log('Logging out user:', req.session.username);
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/dashboard');
        }
        
        // Clear the session cookie
        res.clearCookie('rpm.sid');
        res.redirect('/login?loggedOut=true');
    });
});

module.exports = { router };