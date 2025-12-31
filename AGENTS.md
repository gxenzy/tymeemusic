# Agent Instructions

## Development Commands

### Running the Bot
```bash
npm start          # Start the bot with sharding
npm run dev        # Start with hot reload (watch mode)
```

### Dashboard
```bash
npm run dashboard  # Run only the web dashboard
```

### Testing
```bash
npm test           # Run tests
```

### Setup
```bash
npm run setup      # Create .env file from template
```

## Database Notes

- Uses SQLite (`better-sqlite3`)
- Database file: `data/guild.db`
- Schema migrations are handled automatically in `src/database/repo/Guild.js`
- When adding new columns, they're added via `ALTER TABLE` in `initTable()`

## ESLint

The project has `eslint-formatter-pretty` as a dev dependency but no ESLint config file. To run linting:

```bash
# Install ESLint globally or locally
npm install -g eslint

# Create a basic config (ESLint 9+ uses flat config)
npx eslint init

# Or use the legacy format if you have .eslintrc files
```

## Project Structure

```
src/
├── commands/       # Slash and prefix commands
├── config/         # Configuration files
├── database/       # Database schemas and managers
├── events/         # Discord and system events
├── managers/       # Business logic managers
├── structures/     # Base classes and handlers
├── utils/          # Utility functions
└── web/            # Dashboard frontend and API
    ├── public/     # HTML, CSS, JS
    └── routes/     # API endpoints
```

## Key Files for Tier System

- `src/utils/permissionUtil.js` - `getUserTier()` function
- `src/database/repo/Guild.js` - Database schema and methods
- `src/web/server.js` - API endpoints for settings
- `src/web/public/app.js` - Frontend dashboard logic
- `src/commands/info/help.js` - Tier-filtered help command

## Tier Priority

```
Owner > Premium Users > Premium Roles > VIP Users > VIP Roles > Allowed Users > Allowed Roles > Server Tier
```
