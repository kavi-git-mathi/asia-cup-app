const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
    origin: '*', // Or specify your frontend URL
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/api', (req, res, next) => {
    // All /api routes will be handled here
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Configuration
const APP_ROLE = process.env.APP_ROLE || 'primary';
const REGION = process.env.WEBSITE_LOCATION || 'Central India';

console.log(`🚀 Asia Cup 2025 Application Starting...`);
console.log(`📍 Role: ${APP_ROLE.toUpperCase()}`);
console.log(`🌍 Region: ${REGION}`);

// Database connection pool
let pool = null;
let isDatabaseConnected = false;
let isDatabaseReadOnly = false;

async function initializeDatabase() {
    try {
        const dbConfig = {
            host: process.env.AZURE_SQL_SERVER || 'asiacup25-primarydb.mysql.database.azure.com',
            user: process.env.AZURE_SQL_USERNAME || 'sqladmin',
            password: process.env.AZURE_SQL_PASSWORD || 'Jaihind@12345',
            database: process.env.AZURE_SQL_DATABASE || 'asiacup25-db',
            port: parseInt(process.env.AZURE_SQL_PORT) || 3306,
            ssl: { rejectUnauthorized: true },
            waitForConnections: true,
            connectionLimit: APP_ROLE === 'primary' ? 10 : 5,
            queueLimit: 0,
            connectTimeout: 10000
        };

        console.log(`🔌 Connecting to database: ${dbConfig.host}`);

        pool = mysql.createPool(dbConfig);

        // Test connection
        const connection = await pool.getConnection();

        // Check if database is read-only
        const [result] = await connection.query('SELECT @@global.read_only as read_only');
        isDatabaseReadOnly = result[0]?.read_only === 1;

        connection.release();

        isDatabaseConnected = true;

        console.log(`✅ Database connected successfully`);
        console.log(`📊 Mode: ${isDatabaseReadOnly ? 'Read-Only Replica' : 'Read-Write Primary'}`);

        // Initialize tables
        await initializeTables();

        return true;
    } catch (error) {
        console.error(`❌ Database connection failed:`, error.message);
        isDatabaseConnected = false;
        return false;
    }
}

async function initializeTables() {
    try {
        // Create tables if they don't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS GroupMatches (
                MatchID INT PRIMARY KEY AUTO_INCREMENT,
                MatchDate DATE NOT NULL,
                Team1 VARCHAR(100) NOT NULL,
                Team2 VARCHAR(100) NOT NULL,
                Venue VARCHAR(100),
                Result VARCHAR(100),
                Stage VARCHAR(50),
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS Standings (
                TeamID INT PRIMARY KEY AUTO_INCREMENT,
                TeamName VARCHAR(100) NOT NULL UNIQUE,
                MatchesPlayed INT DEFAULT 0,
                Wins INT DEFAULT 0,
                Losses INT DEFAULT 0,
                Points INT DEFAULT 0,
                GoalDifference INT DEFAULT 0,
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS PlayerStats (
                PlayerID INT PRIMARY KEY AUTO_INCREMENT,
                PlayerName VARCHAR(100) NOT NULL,
                Team VARCHAR(100),
                Matches INT DEFAULT 0,
                Runs INT DEFAULT 0,
                Wickets INT DEFAULT 0,
                Catches INT DEFAULT 0,
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert sample data if tables are empty
        await insertSampleData();

        console.log(`✅ Database tables initialized`);
    } catch (error) {
        console.error(`❌ Error initializing tables:`, error.message);
    }
}

async function insertSampleData() {
    try {
        // Check and insert GroupMatches
        const [matchRows] = await pool.query('SELECT COUNT(*) as count FROM GroupMatches');
        if (matchRows[0].count === 0) {
            await pool.query(`
                INSERT INTO GroupMatches (MatchDate, Team1, Team2, Venue, Stage) VALUES
                ('2025-09-01', 'India', 'Pakistan', 'Dubai', 'Group A'),
                ('2025-09-02', 'Sri Lanka', 'Bangladesh', 'Abu Dhabi', 'Group B'),
                ('2025-09-03', 'Afghanistan', 'Nepal', 'Sharjah', 'Group A')
            `);
            console.log('✅ Sample matches inserted');
        }

        // Check and insert Standings
        const [standingRows] = await pool.query('SELECT COUNT(*) as count FROM Standings');
        if (standingRows[0].count === 0) {
            await pool.query(`
                INSERT INTO Standings (TeamName, MatchesPlayed, Wins, Losses, Points, GoalDifference) VALUES
                ('India', 2, 2, 0, 4, 15),
                ('Pakistan', 2, 1, 1, 2, 5),
                ('Sri Lanka', 2, 1, 1, 2, -3),
                ('Bangladesh', 2, 0, 2, 0, -17)
            `);
            console.log('✅ Sample standings inserted');
        }

        // Check and insert PlayerStats
        const [playerRows] = await pool.query('SELECT COUNT(*) as count FROM PlayerStats');
        if (playerRows[0].count === 0) {
            await pool.query(`
                INSERT INTO PlayerStats (PlayerName, Team, Matches, Runs, Wickets, Catches) VALUES
                ('Virat Kohli', 'India', 2, 156, 0, 3),
                ('Babar Azam', 'Pakistan', 2, 128, 0, 2),
                ('Wanindu Hasaranga', 'Sri Lanka', 2, 45, 5, 1)
            `);
            console.log('✅ Sample player stats inserted');
        }
    } catch (error) {
        console.error('❌ Error inserting sample data:', error.message);
    }
}

// ========== API ENDPOINTS ==========

// Health check endpoint (CRITICAL for Traffic Manager)
app.get('/api/health', async (req, res) => {
    const healthReport = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        app: {
            role: APP_ROLE,
            region: REGION,
            version: '1.0.0'
        },
        database: {
            connected: isDatabaseConnected,
            readOnly: isDatabaseReadOnly,
            writable: isDatabaseConnected && !isDatabaseReadOnly
        }
    };

    try {
        // Determine health status based on role
        let httpStatus = 200;

        if (APP_ROLE === 'primary') {
            // Primary must have writable database
            if (!isDatabaseConnected || isDatabaseReadOnly) {
                healthReport.status = 'degraded';
                healthReport.message = 'Primary app cannot write to database';
                httpStatus = 503; // Service Unavailable
            }
        } else if (APP_ROLE === 'secondary') {
            // Secondary can have read-only database
            if (!isDatabaseConnected) {
                healthReport.status = 'degraded';
                healthReport.message = 'Secondary app cannot read from database';
                httpStatus = 503;
            }
        }

        // Additional database test if connected
        if (isDatabaseConnected && pool) {
            try {
                await pool.query('SELECT 1');
                healthReport.database.test = 'passed';
            } catch (dbError) {
                healthReport.database.test = 'failed';
                healthReport.database.error = dbError.message;
                healthReport.status = 'degraded';
                httpStatus = 503;
            }
        }

        res.status(httpStatus).json(healthReport);

    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Data endpoints
app.get('/api/group-matches', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                role: APP_ROLE,
                region: REGION
            });
        }

        const [rows] = await pool.query('SELECT * FROM GroupMatches ORDER BY MatchDate');
        res.json({
            data: rows,
            servedBy: APP_ROLE,
            region: REGION,
            count: rows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/standings', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                role: APP_ROLE,
                region: REGION
            });
        }

        const [rows] = await pool.query('SELECT * FROM Standings ORDER BY Points DESC, GoalDifference DESC');
        res.json({
            data: rows,
            servedBy: APP_ROLE,
            region: REGION
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/player-stats', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                role: APP_ROLE,
                region: REGION
            });
        }

        const [rows] = await pool.query('SELECT * FROM PlayerStats ORDER BY Runs DESC, Wickets DESC');
        res.json({
            data: rows,
            servedBy: APP_ROLE,
            region: REGION
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Write endpoint (only on primary with write capability)
app.post('/api/match', async (req, res) => {
    // Check if we can write
    if (isDatabaseReadOnly) {
        return res.status(423).json({
            error: 'Database is read-only',
            message: 'Write operations not allowed',
            suggestion: 'This should be routed to primary region'
        });
    }

    if (APP_ROLE === 'secondary') {
        return res.status(423).json({
            error: 'Secondary instance',
            message: 'Write operations should go to primary',
            currentRole: APP_ROLE
        });
    }

    try {
        const { MatchDate, Team1, Team2, Venue, Stage } = req.body;

        if (!MatchDate || !Team1 || !Team2) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [result] = await pool.query(
            'INSERT INTO GroupMatches (MatchDate, Team1, Team2, Venue, Stage) VALUES (?, ?, ?, ?, ?)',
            [MatchDate, Team1, Team2, Venue, Stage]
        );

        res.status(201).json({
            success: true,
            matchId: result.insertId,
            message: 'Match added successfully',
            servedBy: APP_ROLE,
            region: REGION
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    res.json({
        environment: {
            APP_ROLE,
            REGION,
            NODE_ENV: process.env.NODE_ENV,
            PORT: PORT
        },
        database: {
            connected: isDatabaseConnected,
            readOnly: isDatabaseReadOnly,
            host: process.env.AZURE_SQL_SERVER
        },
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ========== START SERVER ==========
async function startServer() {
    try {
        // Initialize database
        const dbInitialized = await initializeDatabase();

        if (!dbInitialized && APP_ROLE === 'primary') {
            console.warn('⚠️  PRIMARY APP: Database initialization failed');
            console.warn('⚠️  Traffic Manager should fail over to secondary');
        }

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Server started successfully!`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`📡 Health: http://localhost:${PORT}/api/health`);
            console.log(`🔧 Debug: http://localhost:${PORT}/api/debug`);
            console.log(`\n📊 Status Summary:`);
            console.log(`   Role: ${APP_ROLE}`);
            console.log(`   Region: ${REGION}`);
            console.log(`   Database: ${isDatabaseConnected ? '✅ Connected' : '❌ Disconnected'}`);
            console.log(`   Mode: ${isDatabaseReadOnly ? 'Read-Only' : 'Read-Write'}`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Backend is working!',
        timestamp: new Date().toISOString(),
        role: APP_ROLE,
        region: REGION
    });
});
// Start application
startServer();