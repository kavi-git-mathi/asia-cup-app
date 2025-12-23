const API_URL = window.location.origin + '/api';

// DOM Elements
const regionInfo = document.getElementById('region-info');
const serverRegion = document.getElementById('server-region');
const matchesContainer = document.getElementById('matches-container');
const standingsContainer = document.getElementById('standings-container');
const statsContainer = document.getElementById('stats-container');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Stage selector
    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stage-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadStandings();
        });
    });

    // Stats tabs
    document.querySelectorAll('.stat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadPlayerStats();
        });
    });

    // Year selector
    document.getElementById('year-select').addEventListener('change', loadAllData);
}

// Load all data
async function loadAllData() {
    try {
        const health = await testConnection();

        if (health.status === 'OK') {
            await Promise.all([
                loadMatches(),
                loadStandings(),
                loadPlayerStats()
            ]);
        } else {
            showErrorMessage('Backend service is unavailable. Please try again later.');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showErrorMessage('Failed to load data. Please check your connection.');
    }
}

// Test backend connection
async function testConnection() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();

        updateRegionInfo(data.region);
        return data;
    } catch (error) {
        console.error('Connection test failed:', error);
        updateRegionInfo('Disconnected');
        return { status: 'Error', region: 'Disconnected' };
    }
}

// Update region information
function updateRegionInfo(region) {
    const status = region === 'Disconnected' ? '🔴' : '🟢';
    regionInfo.innerHTML = `<i class="fas fa-server"></i> Server Status: ${status} | Region: ${region}`;
    serverRegion.textContent = `Region: ${region}`;
}

// Load matches
async function loadMatches() {
    try {
        matchesContainer.innerHTML = '<div class="loading">Loading matches...</div>';

        const response = await fetch(`${API_URL}/group-matches`);
        if (!response.ok) throw new Error('Failed to fetch matches');

        const matches = await response.json();
        displayMatches(matches);
    } catch (error) {
        console.error('Error loading matches:', error);
        matchesContainer.innerHTML = '<div class="error-message">Failed to load matches</div>';
    }
}

// Load standings
async function loadStandings() {
    try {
        standingsContainer.innerHTML = '<div class="loading">Loading standings...</div>';

        const response = await fetch(`${API_URL}/standings`);
        if (!response.ok) throw new Error('Failed to fetch standings');

        const standings = await response.json();
        displayStandings(standings);
    } catch (error) {
        console.error('Error loading standings:', error);
        standingsContainer.innerHTML = '<div class="error-message">Failed to load standings</div>';
    }
}

// Load player stats
async function loadPlayerStats() {
    try {
        statsContainer.innerHTML = '<div class="loading">Loading player stats...</div>';

        const response = await fetch(`${API_URL}/player-stats`);
        if (!response.ok) throw new Error('Failed to fetch player stats');

        const stats = await response.json();
        displayPlayerStats(stats);
    } catch (error) {
        console.error('Error loading player stats:', error);
        statsContainer.innerHTML = '<div class="error-message">Failed to load player stats</div>';
    }
}

// Display matches
function displayMatches(matches) {
    if (!matches || matches.length === 0) {
        matchesContainer.innerHTML = '<div class="no-data">No matches scheduled</div>';
        return;
    }

    matchesContainer.innerHTML = matches.map(match => `
        <div class="match-card">
            <div class="match-date">
                <i class="far fa-calendar"></i>
                ${new Date(match.MatchDate).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })}
            </div>
            <div class="match-stage">${match.Stage}</div>
            <div class="match-teams">
                <span class="team">${match.Team1}</span>
                <span class="match-vs">vs</span>
                <span class="team">${match.Team2}</span>
            </div>
            <div class="match-venue">
                <i class="fas fa-map-marker-alt"></i>
                ${match.Venue}
            </div>
            ${match.Result ? `
                <div class="match-result">
                    <i class="fas fa-trophy"></i>
                    ${match.Result}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Display standings
function displayStandings(standings) {
    if (!standings || standings.length === 0) {
        standingsContainer.innerHTML = '<div class="no-data">No standings available</div>';
        return;
    }

    standingsContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>MP</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PTS</th>
                    <th>GD</th>
                </tr>
            </thead>
            <tbody>
                ${standings.map((team, index) => `
                    <tr>
                        <td><strong>${index + 1}</strong></td>
                        <td class="team-name">
                            <div>${team.TeamName}</div>
                        </td>
                        <td>${team.MatchesPlayed}</td>
                        <td>${team.Wins}</td>
                        <td>${team.Losses}</td>
                        <td><strong class="points">${team.Points}</strong></td>
                        <td class="${team.GoalDifference > 0 ? 'positive' : team.GoalDifference < 0 ? 'negative' : 'neutral'}">
                            ${team.GoalDifference > 0 ? '+' : ''}${team.GoalDifference}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Display player stats
function displayPlayerStats(stats) {
    if (!stats || stats.length === 0) {
        statsContainer.innerHTML = '<div class="no-data">No player stats available</div>';
        return;
    }

    statsContainer.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Matches</th>
                    <th>Runs</th>
                    <th>Wickets</th>
                    <th>Catches</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(player => `
                    <tr>
                        <td>
                            <div class="player-name">${player.PlayerName}</div>
                        </td>
                        <td class="player-team">${player.Team}</td>
                        <td>${player.Matches}</td>
                        <td><strong class="runs">${player.Runs}</strong></td>
                        <td>${player.Wickets}</td>
                        <td>${player.Catches}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Show error message
function showErrorMessage(message) {
    const main = document.querySelector('main');
    const existingError = document.querySelector('.global-error');

    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'global-error error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        ${message}
    `;

    if (main) {
        main.insertBefore(errorDiv, main.firstChild);
    }
}

// Auto-refresh every 30 seconds
setInterval(() => {
    testConnection();
}, 30000);