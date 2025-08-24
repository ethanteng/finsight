# MailerLite Environment Variables Template

## Required Environment Variables

Add these variables to your `.env` file for local development or to your Render environment variables for production:

```bash
# MailerLite API Configuration
MAILER_LITE_API_KEY=your_mailerlite_api_key_here
MAILER_LITE_GROUP_ID=your_mailerlite_group_id_here
```

## How to Get These Values

### 1. MAILER_LITE_API_KEY

1. Log into your [MailerLite account](https://app.mailerlite.com/)
2. Go to **Integrations** → **Developers** → **API**
3. Click **Generate new token**
4. Give your token a name (e.g., "Finsight User Sync")
5. Copy the generated API key
6. Paste it as the value for `MAILER_LITE_API_KEY`

### 2. MAILER_LITE_GROUP_ID

1. In MailerLite, go to **Subscribers** → **Groups**
2. Find the group you want to sync users to (or create a new one)
3. Click on the group name
4. The group ID will be visible in the URL: `https://app.mailerlite.com/subscribers/groups/{GROUP_ID}`
5. Copy the group ID number
6. Paste it as the value for `MAILER_LITE_GROUP_ID`

## Environment-Specific Setup

### Local Development (.env)

```bash
# Local development - use test API key and group
MAILER_LITE_API_KEY=ml_test_1234567890abcdef
MAILER_LITE_GROUP_ID=12345678
```

### Production (Render)

```bash
# Production - use real API key and group
MAILER_LITE_API_KEY=ml_live_1234567890abcdef
MAILER_LITE_GROUP_ID=87654321
```

## Testing Your Configuration

After setting up the environment variables, test the configuration:

```bash
# Test the full sync
node scripts/test-mailerlite-sync.js

# Test with a specific user (optional)
node scripts/test-mailerlite-sync.js <userIdentifier>
```

## Security Notes

- **Never commit API keys to version control**
- **Use different API keys for development and production**
- **Rotate API keys periodically for security**
- **Limit API key permissions to only what's necessary**

## Troubleshooting

If you encounter issues:

1. **Verify API key format**: Should start with `ml_test_` or `ml_live_`
2. **Check group ID**: Should be a numeric string
3. **Test API access**: Try creating a test subscriber manually in MailerLite
4. **Check permissions**: Ensure your API key has subscriber management permissions
