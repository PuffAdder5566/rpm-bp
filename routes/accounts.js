const express = require('express');
const router = express.Router();
const database = require('../database');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const { requireLogin, requireAdmin } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(requireLogin);
router.use(requireAdmin);

// Account Manager Dashboard
router.get('/', (req, res) => {
    const currentUser = req.session.user;
    
    if (!currentUser) {
        console.error('No user session found');
        return res.redirect('/login');
    }

    console.log('Rendering account manager for:', currentUser.username);

    const query = `
        SELECT id, clinicName, username, role, DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') as formattedDate 
        FROM accounts 
        ORDER BY createdAt DESC
    `;
    
    database.query(query, (error, accounts) => {
        if (error) {
            console.error('Database error:', error);
            return res.status(500).render('error', {
                title: 'Database Error',
                message: 'Failed to load accounts',
                currentUser: currentUser
            });
        }
        
        res.render('account-manager', {
            title: 'Account Manager',
            accounts: accounts,
            currentUser: currentUser,
            success: req.query.success,
            error: req.query.error
        });
    });
});

// Get single account for editing
router.get('/:id', (req, res) => {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
    }

    const query = 'SELECT id, clinicName, username, role FROM accounts WHERE id = ?';

    database.query(query, [id], (error, results) => {
        if (error) {
            console.error('Error fetching account:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }

        res.json(results[0]);
    });
});

// Create new account
router.post('/', async (req, res) => {
    const { clinicName, username, password, role } = req.body;
    const currentUser = req.session.user;

    if (!clinicName || !username || !password || !role) {
        return res.redirect('/account-manager?error=Missing required fields');
    }

    if (!['admin', 'user'].includes(role)) {
        return res.redirect('/account-manager?error=Invalid role specified');
    }

    try {
        // Check if username already exists
        const [existing] = await database.query(
            'SELECT id FROM accounts WHERE username = ?', 
            [username]
        );
        
        if (existing) {
            return res.redirect('/account-manager?error=Username already exists');
        }

        // Hash password and create account
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        await database.query(
            'INSERT INTO accounts (clinicName, username, password, role) VALUES (?, ?, ?, ?)',
            [clinicName, username, hashedPassword, role]
        );
        
        res.redirect('/account-manager?success=Account created successfully');
    } catch (error) {
        console.error('Create account error:', error);
        res.redirect('/account-manager?error=Failed to create account');
    }
});

// Update existing account
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { clinicName, username, password, role } = req.body;

    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
    }

    try {
        // Check if username is taken by another account
        const [existing] = await database.query(
            'SELECT id FROM accounts WHERE username = ? AND id != ?',
            [username, id]
        );
        
        if (existing) {
            return res.redirect('/account-manager?error=Username already exists');
        }

        // Prepare update query based on whether password is being changed
        let updateQuery, params;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateQuery = 'UPDATE accounts SET clinicName = ?, username = ?, password = ?, role = ? WHERE id = ?';
            params = [clinicName, username, hashedPassword, role, id];
        } else {
            updateQuery = 'UPDATE accounts SET clinicName = ?, username = ?, role = ? WHERE id = ?';
            params = [clinicName, username, role, id];
        }

        // Execute update
        const result = await database.query(updateQuery, params);
        
        if (result.affectedRows === 0) {
            return res.redirect('/account-manager?error=Account not found');
        }

        res.redirect('/account-manager?success=Account updated successfully');
    } catch (error) {
        console.error('Update account error:', error);
        res.redirect('/account-manager?error=Failed to update account');
    }
});

// Delete account
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const currentUser = req.session.user;

    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
    }

    try {
        // Prevent deleting own account
        if (currentUser.id === parseInt(id)) {
            return res.redirect('/account-manager?error=Cannot delete your own account');
        }

        // Get account being deleted
        const [account] = await database.query(
            'SELECT role FROM accounts WHERE id = ?', 
            [id]
        );
        
        if (!account) {
            return res.redirect('/account-manager?error=Account not found');
        }

        // Special handling for admin accounts
        if (account.role === 'admin') {
            const [adminCount] = await database.query(
                'SELECT COUNT(*) as count FROM accounts WHERE role = "admin"'
            );
            if (adminCount.count <= 1) {
                return res.redirect('/account-manager?error=Cannot delete the last admin account');
            }
        }

        // Delete the account
        await database.query('DELETE FROM accounts WHERE id = ?', [id]);
        res.redirect('/account-manager?success=Account deleted successfully');
    } catch (error) {
        console.error('Delete account error:', error);
        res.redirect('/account-manager?error=Failed to delete account');
    }
});

// Add this at the end of accounts.js, before module.exports
router.use((err, req, res, next) => {
    console.error('Account Manager Error:', err);
    res.status(500).render('error', { 
        message: 'Account Manager Error',
        error: err 
    });
});

module.exports = router;