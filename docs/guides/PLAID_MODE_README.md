# Plaid Mode Switching

This project now supports switching between Plaid sandbox and production modes without modifying environment variables.

## Available Scripts

### Sandbox Mode (Default)
```bash
npm run dev:sandbox
# or
npm run dev:backend:sandbox
```

### Production Mode
```bash
npm run dev:production
# or
npm run dev:backend:production
```

### Default Mode (Sandbox)
```bash
npm run dev
# or
npm run dev:backend
```

## Environment Variables

### Sandbox Mode (Default)
- `PLAID_CLIENT_ID` - Your Plaid sandbox client ID
- `PLAID_SECRET` - Your Plaid sandbox secret
- `PLAID_ENV` - Set to 'sandbox' (default)

### Production Mode
- `PLAID_CLIENT_ID_PROD` - Your Plaid production client ID
- `PLAID_SECRET_PROD` - Your Plaid production secret
- `PLAID_ENV_PROD` - Set to 'production' (default)

## How It Works

The system automatically detects the mode based on the `PLAID_MODE` environment variable:

- When `PLAID_MODE=production`, it uses the `*_PROD` environment variables
- When `PLAID_MODE=sandbox` or undefined, it uses the regular environment variables

## Example Usage

1. **Test in Sandbox Mode:**
   ```bash
   npm run dev:sandbox
   ```

2. **Test in Production Mode:**
   ```bash
   npm run dev:production
   ```

3. **Switch modes without restarting:**
   Stop the current dev server and run the desired mode script.

## Benefits

- No need to modify `.env` file between testing and production
- Easy switching between environments
- Consistent credential management across all Plaid integrations
- Clear logging of which mode is active

## Logging

When you start the backend, you'll see a log message showing:
- Current Plaid mode
- Environment being used
- Whether production or sandbox credentials are active
- Source of credentials being used
