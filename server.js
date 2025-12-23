const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Enhanced logging
console.log('🚀 Asia Cup 2025 Application Starting...');
console.log('📋 Environment Variables Status:');
console.log('- AZURE_SQL_SERVER:', process.env.AZURE_SQL_SERVER ? '✓ Set' : '✗ Missing');
console.log('- AZURE_SQL_USERNAME:', process.env.AZURE_SQL_USERNAME ? '✓ Set' : '✗ Missing');
console.log('- AZURE_SQL_DATABASE:', process.env.AZURE_SQL_DATABASE ? '✓ Set' : '✗ Missing');
console.log('- AZURE_SQL_PASSWORD:', process.env.AZURE_SQL_PASSWORD ? '✓ Set (hidden)' : '✗ Missing');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- PORT:', PORT);

// Database configuration - with fallback values for Azure
const dbConfig = {
    host: process.env.AZURE_SQL_SERVER || 'asiacup25-primarydb.mysql.database.azure.com',
    user: process.env.AZURE_SQL_USERNAME || 'sqladmin',
    password: process.env.AZURE_SQL_PASSWORD || 'Jaihind@12345',
    database: process.env.AZURE_SQL_DATABASE || 'asiacup25-db',
    port: parseInt(process.env.AZURE_SQL_PORT) || 3306,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true,
        ca: process.env.SSL_CERT // Optional: if you have SSL cert
    } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000, // 10 seconds
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

console.log('🔧 Database Configuration:', {
    host: dbConfig.host,
    database: dbConfig.database,
    port: dbConfig.port,
    ssl: dbConfig.ssl ? 'Enabled' : 'Disabled'
});

// Database connection pool
let pool = null;
let isDatabaseConnected = false;

async function initializeDatabaseConnection() {
    try {
        console.log('🔌 Attempting to connect to MySQL database...');

        // Create connection pool
        pool = mysql.createPool(dbConfig);

        // Test the connection
        const connection = await pool.getConnection();
        console.log('✅ Database connection successful!');

        // Initialize tables
        await createTables(connection);
        connection.release();

        isDatabaseConnected = true;
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Error number:', error.errno);
        isDatabaseConnected = false;
        return false;
    }
}

async function createTables(connection) {
    try {
        console.log('📊 Creating/verifying database tables...');

        // Create GroupMatches table
        await connection.query(`
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

        // Create Standings table
        await connection.query(`
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

        // Create PlayerStats table
        await connection.query(`
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
        await insertSampleData(connection);

        console.log('✅ Database tables verified and ready');
    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
        throw error;
    }
}

async function insertSampleData(connection) {
    try {
        // Check and insert GroupMatches
        const [matchRows] = await connection.query('SELECT COUNT(*) as count FROM GroupMatches');
        if (matchRows[0].count === 0) {
            await connection.query(`
                INSERT INTO GroupMatches (MatchDate, Team1, Team2, Venue, Stage) VALUES
                ('2025-09-01', 'India', 'Pakistan', 'Dubai', 'Group A'),
                ('2025-09-02', 'Sri Lanka', 'Bangladesh', 'Abu Dhabi', 'Group B'),
                ('2025-09-03', 'Afghanistan', 'Nepal', 'Sharjah', 'Group A')
            `);
            console.log('✅ Sample matches inserted');
        }

        // Check and insert Standings
        const [standingRows] = await connection.query('SELECT COUNT(*) as count FROM Standings');
        if (standingRows[0].count === 0) {
            await connection.query(`
                INSERT INTO Standings (TeamName, MatchesPlayed, Wins, Losses, Points, GoalDifference) VALUES
                ('India', 2, 2, 0, 4, 15),
                ('Pakistan', 2, 1, 1, 2, 5),
                ('Sri Lanka', 2, 1, 1, 2, -3),
                ('Bangladesh', 2, 0, 2, 0, -17)
            `);
            console.log('✅ Sample standings inserted');
        }

        // Check and insert PlayerStats
        const [playerRows] = await connection.query('SELECT COUNT(*) as count FROM PlayerStats');
        if (playerRows[0].count === 0) {
            await connection.query(`
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

// ========== API ROUTES ==========

// Health check endpoint - FIXED with better error handling
app.get('/api/health', async (req, res) => {
    try {
        const healthStatus = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: isDatabaseConnected ? 'Connected' : 'Disconnected',
            environment: process.env.NODE_ENV || 'development',
            server: process.env.WEBSITE_SITE_NAME || 'Local'
        };

        // Test database connection if it's supposed to be connected
        if (isDatabaseConnected && pool) {
            try {
                await pool.query('SELECT 1');
                healthStatus.database = 'Connected and responsive';
            } catch (dbError) {
                healthStatus.database = 'Connection lost';
                healthStatus.databaseError = dbError.message;
                isDatabaseConnected = false;
            }
        }

        res.status(200).json(healthStatus);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(200).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: error.message,
            database: isDatabaseConnected ? 'Connected' : 'Disconnected'
        });
    }
});

// Debug endpoint to check environment
app.get('/api/debug', (req, res) => {
    res.json({
        environment: {
            AZURE_SQL_SERVER: process.env.AZURE_SQL_SERVER,
            AZURE_SQL_DATABASE: process.env.AZURE_SQL_DATABASE,
            AZURE_SQL_USERNAME: process.env.AZURE_SQL_USERNAME ? '***' : null,
            AZURE_SQL_PASSWORD: process.env.AZURE_SQL_PASSWORD ? '***' : null,
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME
        },
        app: {
            databaseConnected: isDatabaseConnected,
            poolExists: !!pool,
            uptime: process.uptime()
        }
    });
});

// Group matches endpoint
app.get('/api/group-matches', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                message: 'Please try again later'
            });
        }

        const [rows] = await pool.query('SELECT * FROM GroupMatches ORDER BY MatchDate');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching group matches:', error);
        res.status(500).json({
            error: 'Failed to fetch matches',
            details: error.message
        });
    }
});

// Standings endpoint
app.get('/api/standings', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                message: 'Please try again later'
            });
        }

        const [rows] = await pool.query('SELECT * FROM Standings ORDER BY Points DESC, GoalDifference DESC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching standings:', error);
        res.status(500).json({
            error: 'Failed to fetch standings',
            details: error.message
        });
    }
});

// Player stats endpoint
app.get('/api/player-stats', async (req, res) => {
    try {
        if (!isDatabaseConnected || !pool) {
            return res.status(503).json({
                error: 'Database not available',
                message: 'Please try again later'
            });
        }

        const [rows] = await pool.query('SELECT * FROM PlayerStats ORDER BY Runs DESC, Wickets DESC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({
            error: 'Failed to fetch player stats',
            details: error.message
        });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ========== START SERVER ==========
async function startServer() {
    try {
        // Initialize database connection
        await initializeDatabaseConnection();

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server started successfully!`);
            console.log(`🌐 Local: http://localhost:${PORT}`);
            console.log(`📡 Health: http://localhost:${PORT}/api/health`);
            console.log(`🔧 Debug: http://localhost:${PORT}/api/debug`);
            console.log(`📊 Database: ${isDatabaseConnected ? '✅ Connected' : '❌ Not connected'}`);

            if (!isDatabaseConnected) {
                console.log('⚠️  App is running without database connection');
                console.log('📝 API endpoints will return 503 for database queries');
            }
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.log('⚠️  Starting server in fallback mode (without database)...');

        // Start server even without database
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT} (fallback mode)`);
            console.log(`⚠️  Database is not available`);
        });
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (pool) {
        await pool.end();
        console.log('✅ Database connections closed');
    }
    process.exit(0);
});

// Start the application
startServer();