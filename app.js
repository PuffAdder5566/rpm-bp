const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const mysql = require('mysql');
const MySQLStore = require('express-mysql-session')(session);

const authRouter = require('./routes/auth').router;
const dashboardRouter = require('./routes/dashboard');
const accountManagerRouter = require('./routes/accounts');
const patientsApiRouter = require('./routes/api/patients');
const readingsApiRouter = require('./routes/api/readings');

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Session store configuration
const sessionStore = new MySQLStore({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'T.4.$.1.!.h',
    database: 'rpm-test',
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
});

// Session store event listeners
sessionStore.on('error', (error) => {
    console.error('Session store error:', error);
});

sessionStore.on('connect', () => {
    console.log('Connected to session store');
});

// Session middleware - UPDATED CONFIGURATION
app.use(session({
    store: sessionStore,
    secret: 'your-very-strong-secret-123', // CHANGE THIS IN PRODUCTION
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 60 * 1000, // 30 minutes
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'lax', // Changed from 'strict' for better compatibility
        domain: 'localhost' // Explicit domain setting
    },
    name: 'rpm.sid', // Custom cookie name
    rolling: true // Reset maxAge on every request
}));

// Session debug middleware
app.use((req, res, next) => {
    console.log('Session Debug:', {
        id: req.sessionID,
        userId: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        clinicName: req.session.clinicName
    });
    next();
});

// Other middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'T.4.$.1.!.h',
    database: 'rpm-test'
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Make db available to routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Session check endpoint
// Session check endpoint
app.get('/api/check-session', (req, res) => {
    console.log('Session check - current session:', req.session);
    if (!req.session.userId) {
        return res.status(401).json({ 
            valid: false,
            message: 'No active session'
        });
    }
    res.json({ 
        valid: true,
        user: {
            id: req.session.userId,
            username: req.session.username,
            clinicName: req.session.clinicName
        }
    });
});


// Routes
app.use('/', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/account-manager', accountManagerRouter);
app.use('/api/patients', patientsApiRouter);
app.use('/api/readings', readingsApiRouter);

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;