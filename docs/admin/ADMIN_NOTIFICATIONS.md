# 📧 Admin Notifications for User Account Actions

## Overview

The system automatically sends email notifications to administrators when users perform certain account actions. This provides visibility into user behavior and helps admins monitor account activity.

## Supported Notifications

### 1. Account Disconnection
- **Trigger**: User disconnects their Plaid accounts via the privacy settings
- **Action**: `account_disconnected`
- **Email Content**: User email, action description, timestamp
- **Endpoint**: `POST /privacy/disconnect-accounts`

### 2. Account Deactivation
- **Trigger**: User deletes all their data and deactivates their account
- **Action**: `account_deactivated`
- **Email Content**: User email, action description, timestamp
- **Endpoint**: `DELETE /privacy/delete-all-data`

## Configuration

### Environment Variables

#### Required
- `ADMIN_EMAILS`: Comma-separated list of admin email addresses
  ```bash
  # Single admin
  ADMIN_EMAILS=admin@example.com
  
  # Multiple admins
  ADMIN_EMAILS=admin@example.com,manager@example.com,owner@example.com
  
  # With spaces (automatically trimmed)
  ADMIN_EMAILS= admin@example.com , manager@example.com , owner@example.com
  ```

#### Optional
- `RESEND_API_KEY`: API key for Resend email service
- `FRONTEND_URL`: Frontend URL for admin dashboard links

## Email Format

### Subject Line
- Account Disconnection: `User disconnected their accounts - Ask Linc`
- Account Deactivation: `User deactivated their account - Ask Linc`

### Email Content
Each notification email includes:
- **User Email**: The email address of the user who performed the action
- **Action**: Description of what the user did
- **Timestamp**: When the action occurred
- **Admin Dashboard Link**: Direct link to view the admin dashboard

### Email Template
- Professional design with Ask Linc branding
- Responsive HTML layout
- Plain text fallback
- Clear call-to-action button

## Implementation Details

### Function: `sendAdminNotification()`
```typescript
export async function sendAdminNotification(
  action: 'account_disconnected' | 'account_deactivated',
  userEmail: string
): Promise<boolean>
```

### Error Handling
- **Missing Admin Emails**: Returns `false` if `ADMIN_EMAILS` is not configured
- **Resend Not Configured**: Returns `true` for testing purposes when email service is unavailable
- **Email Send Failures**: Returns `false` if email delivery fails
- **Graceful Degradation**: Main user operations continue even if admin notifications fail

### Integration Points
- **Privacy Endpoints**: Automatically triggered during account disconnection and deletion
- **Non-blocking**: Admin notification failures don't prevent user operations
- **Logging**: All notification attempts are logged for debugging

## Testing

### Unit Tests
- Test file: `src/__tests__/unit/admin-notifications.test.ts`
- Covers all error scenarios and edge cases
- Tests environment variable handling
- Verifies function behavior with and without email service

### Test Scenarios
- Missing `ADMIN_EMAILS` environment variable
- Empty or whitespace-only `ADMIN_EMAILS`
- Missing `RESEND_API_KEY`
- Valid configuration scenarios
- Both action types (`account_disconnected`, `account_deactivated`)

## Monitoring and Debugging

### Console Logs
- **Success**: `Admin notification email sent successfully for {action}: {userEmail}`
- **No Admin Emails**: `No admin emails configured for admin notifications`
- **Resend Not Configured**: `Resend not configured, skipping admin notification email send`
- **Errors**: `Error sending admin notification email: {error}`

### Common Issues
1. **No Emails Sent**: Check `ADMIN_EMAILS` environment variable
2. **Resend Errors**: Verify `RESEND_API_KEY` is valid
3. **Missing Notifications**: Check server logs for error messages

## Security Considerations

### Data Privacy
- Only user email addresses are included in notifications
- No financial data or personal information is shared
- Admin emails are sent to configured admin addresses only

### Access Control
- Notifications are sent automatically by the system
- No user input is accepted for notification content
- Admin email addresses are configured server-side only

## Future Enhancements

### Potential Features
- **Notification Preferences**: Allow admins to customize notification types
- **Webhook Support**: Send notifications to external systems
- **Notification History**: Track sent notifications in database
- **Rate Limiting**: Prevent notification spam for high-volume actions
- **Custom Templates**: Allow admins to customize email content

### Additional Triggers
- User registration
- Failed login attempts
- Tier upgrades/downgrades
- Data sync failures
- Suspicious activity detection
