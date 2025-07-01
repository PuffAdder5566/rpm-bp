// authMiddleware.js
const requireLogin = (req, res, next) => {
    if (!req.session?.userId) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }
        return res.redirect('/login?sessionExpired=true');
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session?.role || req.session.role !== 'admin') {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied' 
            });
        }
        return res.redirect('/dashboard');
    }
    next();
};

module.exports = {
    requireLogin,
    requireAdmin
};