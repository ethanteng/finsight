# Database Setup Guide

## Overview

This guide explains how to set up and use the local PostgreSQL database for development with proper user permissions and database initialization.

## Quick Start

### 1. Start the Database
```bash
./scripts/start-db.sh
```

This will:
- Start a PostgreSQL 16 container with proper user setup
- Create the `finsight` database
- Set up the `postgres` user with admin privileges
- Display connection details

### 2. Connection Details
- **Host**: localhost
- **Port**: 5432
- **Database**: finsight
- **User**: postgres
- **Password**: postgres
- **Connection String**: `postgresql://postgres:postgres@localhost:5432/finsight`

## Database Management Scripts

### Quick Local Reset
```bash
./scripts/quick-clear.sh
```
- Resets local database to match current Prisma schema
- No production sync required
- Perfect for development iterations

### Production Sync
```bash
./scripts/dev-reset.sh
```
- Syncs local database with production schema
- Requires `PRODUCTION_DATABASE_URL` or `RENDER_DATABASE_URL` environment variable
- Use when you need to match production exactly

## Connecting with External Tools

### Beekeeper Studio
1. Create a new connection
2. Use these settings:
   - **Host**: localhost
   - **Port**: 5432
   - **Database**: finsight
   - **User**: postgres
   - **Password**: postgres
   - **SSL**: Disabled (for local development)

### Other Database Tools
Any PostgreSQL client can connect using:
```
postgresql://postgres:postgres@localhost:5432/finsight
```

## Docker Commands

### Start Database
```bash
docker-compose up -d db
```

### Stop Database
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs db
```

### Restart Database
```bash
docker-compose restart db
```

## Troubleshooting

### Port Conflicts
If you get port conflicts:
1. Check what's using port 5432: `lsof -i :5432`
2. Stop conflicting services or change the port in `docker-compose.yml`

### Connection Issues
1. Ensure Docker is running: `docker info`
2. Check container status: `docker-compose ps`
3. View container logs: `docker-compose logs db`

### Permission Issues
The database initialization script automatically:
- Creates the `finsight` database
- Grants all privileges to the `postgres` user
- Sets up proper authentication

If you still have issues, you can manually connect and run:
```sql
GRANT ALL PRIVILEGES ON DATABASE finsight TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;
```

## Environment Variables

The scripts automatically set the correct `DATABASE_URL`:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/finsight"
```

You don't need to set this in your `.env` file - the scripts handle it automatically.

## Security Notes

- This setup is for **local development only**
- The `postgres` user has full admin privileges
- Password is set to `postgres` for convenience
- SSL is disabled for local development
- **Never use these credentials in production**

## File Structure

```
├── docker-compose.yml              # Docker Compose configuration
├── scripts/
│   ├── start-db.sh                # Start database script
│   ├── quick-clear.sh             # Local database reset
│   ├── dev-reset.sh               # Production sync
│   └── db-init/
│       └── 01-init-user-db.sql    # Database initialization script
```

## Next Steps

After setting up the database:
1. Run migrations: `npx prisma db push`
2. Start development server: `npm run dev`
3. Begin development work with confidence
