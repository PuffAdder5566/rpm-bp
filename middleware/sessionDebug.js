module.exports = function(req, res, next) {
    console.log('Session Debug:', {
        sessionID: req.sessionID,
        userId: req.session?.userId,
        cookies: req.cookies,
        headers: req.headers['cookie']
    });
    next();
};