const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Database configuration
const dbConfig = {
    user: process.env.AZURE_SQL_USERNAME,
    password: process.env.AZURE_SQL_PASSWORD,
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    port: parseInt(process.env.AZURE_SQL_PORT) || 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false
    },
    pool: {
        max: 10,
        min: 0,
        createRetryIntervalMillis: 5000
    }
};

console.log('📋 Environment Variables Check:');
console.log('AZURE_SQL_USERNAME:', process.env.AZURE_SQL_USERNAME ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_SERVER:', process.env.AZURE_SQL_SERVER ? '✓ Set' : '✗ Missing');
console.log('AZURE_SQL_DATABASE:', process.env.AZURE_SQL_DATABASE ? '✓ Set' : '✗ Missing');
console.log('DB_USER (your code expects):', process.env.DB_USER ? '✓ Set' : '✗ Missing');

// Database connection
let pool;
async function connectToDatabase() {
    try {
        console.log('🔌 Connecting to Azure SQL...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to Azure SQL Database');
        await initializeDatabase();
        return pool;
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        return null;
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        // Create tables if they don't exist
        await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GroupMatches' AND xtype='U')
      CREATE TABLE GroupMatches (
        MatchID INT PRIMARY KEY IDENTITY(1,1),
        MatchDate DATE NOT NULL,
        Team1 VARCHAR(100) NOT NULL,
        Team2 VARCHAR(100) NOT NULL,
        Venue VARCHAR(100),
        Result VARCHAR(100),
        Stage VARCHAR(50)
      )
    `);

        await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Standings' AND xtype='U')
      CREATE TABLE Standings (
        TeamID INT PRIMARY KEY IDENTITY(1,1),
        TeamName VARCHAR(100) NOT NULL,
        MatchesPlayed INT DEFAULT 0,
        Wins INT DEFAULT 0,
        Losses INT DEFAULT 0,
        Points INT DEFAULT 0,
        GoalDifference INT DEFAULT 0
      )
    `);

        await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PlayerStats' AND xtype='U')
      CREATE TABLE PlayerStats (
        PlayerID INT PRIMARY KEY IDENTITY(1,1),
        PlayerName VARCHAR(100) NOT NULL,
        Team VARCHAR(100),
        Matches INT DEFAULT 0,
        Runs INT DEFAULT 0,
        Wickets INT DEFAULT 0,
        Catches INT DEFAULT 0
      )
    `);

        // Insert sample data if tables are empty
        const matchesCount = await pool.request().query('SELECT COUNT(*) as count FROM GroupMatches');
        if (matchesCount.recordset[0].count === 0) {
            await pool.request().query(`
        INSERT INTO GroupMatches (MatchDate, Team1, Team2, Venue, Stage) VALUES
        ('2025-09-01', 'India', 'Pakistan', 'Dubai', 'Group A'),
        ('2025-09-02', 'Sri Lanka', 'Bangladesh', 'Abu Dhabi', 'Group B'),
        ('2025-09-03', 'Afghanistan', 'Nepal', 'Sharjah', 'Group A')
      `);
        }

        const standingsCount = await pool.request().query('SELECT COUNT(*) as count FROM Standings');
        if (standingsCount.recordset[0].count === 0) {
            await pool.request().query(`
        INSERT INTO Standings (TeamName, MatchesPlayed, Wins, Losses, Points, GoalDifference) VALUES
        ('India', 2, 2, 0, 4, +15),
        ('Pakistan', 2, 1, 1, 2, +5),
        ('Sri Lanka', 2, 1, 1, 2, -3),
        ('Bangladesh', 2, 0, 2, 0, -17)
      `);
        }

        const playersCount = await pool.request().query('SELECT COUNT(*) as count FROM PlayerStats');
        if (playersCount.recordset[0].count === 0) {
            await pool.request().query(`
        INSERT INTO PlayerStats (PlayerName, Team, Matches, Runs, Wickets, Catches) VALUES
        ('Virat Kohli', 'India', 2, 156, 0, 3),
        ('Babar Azam', 'Pakistan', 2, 128, 0, 2),
        ('Wanindu Hasaranga', 'Sri Lanka', 2, 45, 5, 1)
      `);
        }

        console.log('✅ Database initialized');
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
    }
}

// API Routes
app.get('/api/group-matches', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const result = await pool.request().query('SELECT * FROM GroupMatches ORDER BY MatchDate');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching matches:', err);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

app.get('/api/standings', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const result = await pool.request().query('SELECT * FROM Standings ORDER BY Points DESC, GoalDifference DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching standings:', err);
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

app.get('/api/player-stats', async (req, res) => {
    try {
        if (!pool) throw new Error('Database not connected');
        const result = await pool.request().query('SELECT * FROM PlayerStats ORDER BY Runs DESC, Wickets DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching player stats:', err);
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        if (pool) {
            await pool.request().query('SELECT 1');
            res.json({
                status: 'OK',
                database: 'Connected',
                region: process.env.WEBSITE_LOCATION || 'Unknown'
            });
        } else {
            res.status(503).json({
                status: 'Error',
                database: 'Disconnected',
                region: process.env.WEBSITE_LOCATION || 'Unknown'
            });
        }
    } catch (err) {
        res.status(500).json({
            status: 'Error',
            database: 'Error: ' + err.message
        });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server
connectToDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Frontend: http://localhost:${PORT}`);
        console.log(`📡 API: http://localhost:${PORT}/api/health`);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
});