# MailerLite User Sync System

## Overview

The MailerLite User Sync System automatically synchronizes all production users to MailerLite for email marketing purposes. This system runs daily via a cron job and ensures that user data in MailerLite stays current with the application's user database.

## Features

- **Automatic Daily Sync**: Runs every day at 3 AM EST
- **Non-destructive Updates**: Uses MailerLite's upsert API to safely update existing subscribers
- **Production Users Only**: Excludes demo sessions and test data
- **Comprehensive User Data**: Syncs email, subscription status, tier, and conversation count
- **Error Handling**: Robust error handling with detailed logging and Sentry integration
- **Rate Limiting**: Built-in delays to respect MailerLite API limits

## Environment Variables

The following environment variables must be configured:

```bash
# MailerLite API credentials
MAILER_LITE_API_KEY=your_mailerlite_api_key_here
MAILER_LITE_GROUP_ID=your_mailerlite_group_id_here
```

### Environment Setup

#### Local Development (.env)
```bash
MAILER_LITE_API_KEY=your_test_api_key
MAILER_LITE_GROUP_ID=your_test_group_id
```

#### Production (Render)
```bash
MAILER_LITE_API_KEY=your_production_api_key
MAILER_LITE_GROUP_ID=your_production_group_id
```

## User Data Synced

For each user, the following data is synchronized to MailerLite:

### Required Fields
- **email**: User's email address (used as unique identifier)

### Groups
- **groups**: Array containing the `MAILER_LITE_GROUP_ID` value

### Custom Fields
- **active_user**: Boolean (1 or 0) indicating if user has an active subscription
- **current_tier**: String value (premium, standard, or starter)
- **conversation_count**: Number of conversations the user has had
- **user_created_at**: Date when the user account was created (YYYY-MM-DD format)
- **last_login_at**: Date of the user's last login (YYYY-MM-DD format, empty if never logged in)

### Active User Logic

The system determines if a user is active using a dual-check approach that **exactly matches the admin dashboard logic**:

1. **Primary Check**: `user.subscriptionStatus === 'active'` (from User model)
2. **Secondary Check**: Any subscription with `status === 'active'` (from Subscription model)

A user is considered active if **either** condition is true, ensuring maximum accuracy in identifying active users.

**Important**: The system fetches ALL subscriptions (not just active ones) to avoid circular logic issues where active subscriptions would be filtered out before checking their status.

## API Endpoint

The system uses MailerLite's Create/Upsert Subscriber API:

```
POST https://connect.mailerlite.com/api/subscribers
```

**Response Codes:**
- `201 Created`: New subscriber added
- `200 OK`: Existing subscriber updated
- `4xx/5xx`: Error responses are logged and handled gracefully

## Cron Job Schedule

The sync job runs automatically:

```typescript
// Daily at 3 AM EST
cron.schedule('0 3 * * *', async () => {
  // MailerLite sync logic
}, {
  timezone: 'America/New_York',
  name: 'mailerlite-sync'
});
```

## Monitoring

### Health Check Endpoint

Monitor the cron job status via:

```
GET /health/cron
```

Response includes MailerLite sync job status:

```json
{
  "status": "OK",
  "cronJobs": {
    "mailerLiteSync": {
      "running": true,
      "name": "mailerlite-sync"
    }
  }
}
```

### Logging

The system provides comprehensive logging:

- **Start/Completion**: Logs when sync begins and completes
- **Progress**: Shows number of users processed and synced
- **Performance**: Tracks execution time and success rates
- **Errors**: Detailed error logging with user context
- **Sentry Integration**: Automatic error reporting to Sentry

### Example Log Output

```
🔄 Starting daily MailerLite user sync...
📊 Found 150 users to sync
✅ Created new subscriber: user@example.com
✅ Updated existing subscriber: another@example.com
✅ MailerLite sync completed successfully in 15420ms
📊 Sync Results: 150/150 users synced, 0 errors
```

## Testing

### Test Script

Use the provided test script to verify functionality:

```bash
# Test full sync
node scripts/test-mailerlite-sync.js

# Test single user sync (by user ID or email)
node scripts/test-mailerlite-sync.js <userIdentifier>
```

### Manual Testing

The service can also be used programmatically:

```typescript
import { MailerLiteSyncService } from './services/mailerlite-sync';

const service = new MailerLiteSyncService();

// Sync all users
const result = await service.syncAllUsers();

// Sync single user (by user ID or email)
const success = await service.syncSingleUser('user-id-here');
// or
const success = await service.syncSingleUser('user@example.com');
```

## Error Handling

### Common Error Scenarios

1. **Missing Environment Variables**: Service initialization fails with clear error messages
2. **API Rate Limiting**: Built-in delays prevent overwhelming the MailerLite API
3. **Network Issues**: Failed requests are logged and don't stop the overall sync
4. **Invalid User Data**: Users with missing data are logged but don't crash the sync

### Error Recovery

- Individual user sync failures don't stop the overall process
- All errors are logged with context for debugging
- Sentry integration provides error tracking and alerting
- Failed users can be retried in subsequent runs

## Security Considerations

- **API Key Protection**: API keys are stored in environment variables
- **User Data Privacy**: Only necessary user data is synced
- **Demo Data Exclusion**: Demo sessions and test data are automatically filtered out
- **Rate Limiting**: Built-in delays prevent API abuse

## Performance

### Optimization Features

- **Batch Processing**: Users are processed sequentially with rate limiting
- **Selective Queries**: Only necessary user data is fetched from database
- **Efficient Updates**: Uses upsert API to avoid duplicate operations
- **Progress Tracking**: Real-time progress monitoring and metrics

### Expected Performance

- **Small User Base (<100)**: Completes in under 30 seconds
- **Medium User Base (100-1000)**: Completes in 2-10 minutes
- **Large User Base (1000+)**: Completes in 10-30 minutes

Performance varies based on:
- Number of users to sync
- Network latency to MailerLite API
- Rate limiting delays (100ms between requests)

## Troubleshooting

### Common Issues

1. **Environment Variables Missing**
   - Check `.env` file or Render environment variables
   - Verify variable names match exactly

2. **API Authentication Errors**
   - Verify `MAILER_LITE_API_KEY` is correct
   - Check if API key has proper permissions

3. **Group ID Errors**
   - Verify `MAILER_LITE_GROUP_ID` exists in MailerLite
   - Ensure group ID is a valid string

4. **Sync Failures**
   - Check application logs for detailed error messages
   - Verify database connectivity
   - Check Sentry for error reports

### Debug Mode

Enable verbose logging by setting:

```bash
NODE_ENV=development
```

## Future Enhancements

Potential improvements for future versions:

- **Incremental Sync**: Only sync users with recent changes
- **Webhook Integration**: Real-time sync on user updates
- **Multiple Groups**: Support for user segmentation across multiple MailerLite groups
- **Custom Field Mapping**: Configurable field mappings via environment variables
- **Sync History**: Track sync history and success rates over time
- **Retry Logic**: Automatic retry for failed syncs with exponential backoff

## Support

For issues or questions:

1. Check application logs for error details
2. Review Sentry error reports
3. Test with the provided test script
4. Verify environment variable configuration
5. Check MailerLite API status and documentation
