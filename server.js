const express = require('express');
const mysql = require('mysql2/promise'); // Changed from mssql to mysql2
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

console.log('📋 Environment Variables Check:');
console.log('AZURE_SQL_USERNAME:', process.env.AZURE_SQL_USERNAME ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_SERVER:', process.env.AZURE_SQL_SERVER ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_DATABASE:', process.env.AZURE_SQL_DATABASE ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_PASSWORD:', process.env.AZURE_SQL_PASSWORD ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_PORT:', process.env.AZURE_SQL_PORT ? process.env.AZURE_SQL_PORT : '3306 (default)');

// Database connection pool
let pool;
async function createPool() {
    try {
        console.log('🔌 Creating MySQL connection pool...');
        pool = mysql.createPool({
            host: process.env.AZURE_SQL_SERVER,
            user: process.env.AZURE_SQL_USERNAME,
            password: process.env.AZURE_SQL_PASSWORD,
            database: process.env.AZURE_SQL_DATABASE,
            port: parseInt(process.env.AZURE_SQL_PORT) || 3306,
            ssl: {
                rejectUnauthorized: true
            },
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        // Test connection
        const connection = await pool.getConnection();
        console.log('✅ Connected to Azure MySQL Database');
        connection.release();

        await initializeDatabase();
        return pool;
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('Full error:', err);
        return null;
    }
}

// Initialize database
async function initializeDatabase() {
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

        // Check if we have sample data
        const [matches] = await pool.query('SELECT COUNT(*) as count FROM GroupMatches');
        if (matches[0].count === 0) {
            await pool.query(`
                INSERT INTO GroupMatches (MatchDate, Team1, Team2, Venue, Stage) VALUES
                                                                                     ('2025-09-01', 'India', 'Pakistan', 'Dubai', 'Group A'),
                                                                                     ('2025-09-02', 'Sri Lanka', 'Bangladesh', 'Abu Dhabi', 'Group B'),
                                                                                     ('2025-09-03', 'Afghanistan', 'Nepal', 'Sharjah', 'Group A')
            `);
        }

        const [standings] = await pool.query('SELECT COUNT(*) as count FROM Standings');
        if (standings[0].count === 0) {
            await pool.query(`
                INSERT INTO Standings (TeamName, MatchesPlayed, Wins, Losses, Points, GoalDifference) VALUES
                                                                                                          ('India', 2, 2, 0, 4, 15),
                                                                                                          ('Pakistan', 2, 1, 1, 2, 5),
                                                                                                          ('Sri Lanka', 2, 1, 1, 2, -3),
                                                                                                          ('Bangladesh', 2, 0, 2, 0, -17)
                    ON DUPLICATE KEY UPDATE
                                         MatchesPlayed = VALUES(MatchesPlayed),
                                         Wins = VALUES(Wins),
                                         Losses = VALUES(Losses),
                                         Points = VALUES(Points),
                                         GoalDifference = VALUES(GoalDifference)
            `);
        }

        const [players] = await pool.query('SELECT COUNT(*) as count FROM PlayerStats');
        if (players[0].count === 0) {
            await pool.query(`
                INSERT INTO PlayerStats (PlayerName, Team, Matches, Runs, Wickets, Catches) VALUES
                                                                                                ('Virat Kohli', 'India', 2, 156, 0, 3),
                                                                                                ('Babar Azam', 'Pakistan', 2, 128, 0, 2),
                                                                                                ('Wanindu Hasaranga', 'Sri Lanka', 2, 45, 5, 1)
            `);
        }

        console.log('✅ Database initialized successfully');
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        throw err;
    }
}

// API Routes
app.get('/api/group-matches', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const [rows] = await pool.query('SELECT * FROM GroupMatches ORDER BY MatchDate');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching matches:', err);
        res.status(500).json({ error: 'Failed to fetch matches', details: err.message });
    }
});

app.get('/api/standings', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const [rows] = await pool.query('SELECT * FROM Standings ORDER BY Points DESC, GoalDifference DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching standings:', err);
        res.status(500).json({ error: 'Failed to fetch standings', details: err.message });
    }
});

app.get('/api/player-stats', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const [rows] = await pool.query('SELECT * FROM PlayerStats ORDER BY Runs DESC, Wickets DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching player stats:', err);
        res.status(500).json({ error: 'Failed to fetch player stats', details: err.message });
    }
});

// Updated /api/health endpoint
app.get('/api/health', async (req, res) => {
    const healthReport = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
            appService: 'healthy',
            database: 'unknown'
        },
        region: process.env.WEBSITE_LOCATION || 'unknown',
        databaseServer: process.env.DATABASE_SERVER_TYPE || 'unknown'
    };

    try {
        // 1. Test database connection
        let dbHealthy = false;
        let dbError = null;

        if (pool) {
            try {
                await pool.query('SELECT 1');

                // Additional check - verify we can read/write
                const [result] = await pool.query('SELECT @@global.read_only as read_only');
                const isReadOnly = result[0]?.read_only === 1;

                if (isReadOnly) {
                    healthReport.components.database = 'read-only';
                    healthReport.databaseMode = 'read-only-replica';
                } else {
                    healthReport.components.database = 'healthy';
                    healthReport.databaseMode = 'read-write-primary';
                    dbHealthy = true;
                }
            } catch (dbErr) {
                healthReport.components.database = 'unhealthy';
                healthReport.databaseError = dbErr.message;
                dbError = dbErr;
            }
        } else {
            healthReport.components.database = 'not-connected';
        }

        // 2. Determine overall health status
        // If database is unhealthy and we're supposed to be primary, mark as degraded
        if (process.env.APP_ROLE === 'primary' && !dbHealthy) {
            healthReport.status = 'degraded';
            healthReport.overallStatus = 'UNHEALTHY - Primary DB down';

            // Return 503 Service Unavailable for Traffic Manager
            return res.status(503).json(healthReport);
        }

        // If database is healthy or we're secondary (can be read-only)
        if (healthReport.components.database === 'healthy' ||
            (process.env.APP_ROLE === 'secondary' && healthReport.components.database === 'read-only')) {
            return res.status(200).json(healthReport);
        }

        // Default fallback
        return res.status(200).json(healthReport);

    } catch (error) {
        console.error('Health check failed:', error);
        healthReport.status = 'unhealthy';
        healthReport.error = error.message;
        return res.status(503).json(healthReport);
    }
});
// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server with database connection
async function startServer() {
    try {
        await createPool();

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌐 Frontend: http://localhost:${PORT}`);
            console.log(`📡 API: http://localhost:${PORT}/api/health`);
            console.log(`📊 Database: ${process.env.AZURE_SQL_SERVER}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        console.log('⚠️ Starting server without database connection...');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT} (without database)`);
            console.log(`⚠️ Warning: Database connection failed`);
        });
    }
}

startServer();