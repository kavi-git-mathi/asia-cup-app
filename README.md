# Asia Cup 2025 Application

A Node.js web application for tracking Asia Cup 2025 matches, standings, and player statistics with Azure SQL Database integration.

## Features
- Real-time match schedules
- Tournament standings
- Player statistics
- Azure SQL Database integration
- Responsive design
- Auto-refresh data

## Deployment to Azure

### Prerequisites
- Azure account
- Azure SQL Database
- GitHub account

### Steps
1. Create Azure App Service (Linux, Node.js)
2. Create Azure SQL Database
3. Set environment variables in Azure App Service Configuration
4. Connect GitHub repository
5. The GitHub Actions workflow will auto-deploy

## Local Development
```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start development server
npm run dev