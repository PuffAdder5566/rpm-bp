module.exports = function(req, res, next) {
    // Skip session check for public routes
    const publicRoutes = ['/login', '/auth', '/logout', '/'];
    if (publicRoutes.includes(req.path)) {
        return next();
    }

    // Check if session exists
    if (!req.session) {
        console.error('Session middleware error: No session found');
        return handleSessionError(req, res);
    }

    // Check if user exists in session
    if (!req.session.user) {
        console.error('Session middleware error: No user in session');
        return handleSessionError(req, res);
    }

    // Verify session in database
    req.db.query(
        'SELECT id FROM users WHERE id = ? AND session_token = ?',
        [req.session.user.id, req.session.user.sessionToken],
        (error, results) => {
            if (error || results.length === 0) {
                console.error('Session verification failed:', error || 'No matching user');
                req.session.destroy();
                return handleSessionError(req, res);
            }
            next();
        }
    );

    function handleSessionError(req, res) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }
        return res.redirect('/login');
    }
};