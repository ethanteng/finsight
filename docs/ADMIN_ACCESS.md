# 🔐 Admin Access Control

## Overview

The admin dashboard (`/admin`) is protected by email-based access control. Only users with email addresses listed in the `ADMIN_EMAILS` environment variable can access the admin functionality.

## Configuration

### Environment Variable Setup

Set the `ADMIN_EMAILS` environment variable with a comma-separated list of admin email addresses:

#### Local Development (.env file)
```bash
# Single admin
ADMIN_EMAILS=admin@example.com

# Multiple admins
ADMIN_EMAILS=admin@example.com,manager@example.com,owner@example.com

# With spaces (automatically trimmed)
ADMIN_EMAILS= admin@example.com , manager@example.com , owner@example.com
```

#### Production (Render Environment Variables)
1. Go to your Render dashboard
2. Navigate to your backend service
3. Go to "Environment" tab
4. Add environment variable:
   - **Key**: `ADMIN_EMAILS`
   - **Value**: `admin@example.com,manager@example.com`

### Email Matching Rules

- **Case Insensitive**: `ADMIN@EXAMPLE.COM` will match `admin@example.com`
- **Whitespace Tolerant**: Spaces around emails are automatically trimmed
- **Multiple Admins**: Comma-separated list supports multiple admin emails
- **Empty Protection**: Empty strings and whitespace-only entries are ignored

## Access Control Behavior

### ✅ Allowed Access
- User is authenticated (has valid JWT token)
- User's email is in the `ADMIN_EMAILS` list
- User's account is active

### ❌ Denied Access
- User is not authenticated (401 Unauthorized)
- User's email is not in the `ADMIN_EMAILS` list (403 Forbidden)
- `ADMIN_EMAILS` environment variable is not set (403 Forbidden)
- `ADMIN_EMAILS` environment variable is empty (403 Forbidden)

## Admin Dashboard Features

### Demo Tab
- View demo session statistics
- Analyze demo conversation patterns
- Monitor user engagement metrics

### Production Tab
- View production user statistics
- Analyze production conversation patterns
- Monitor user activity and tier distribution

### User Management Tab
- List all production users
- Update user tiers (Starter/Standard/Premium)
- View user conversation counts and activity
- **View user financial profiles** - See the financial profile text that users see on their profile page
- **View linked financial institutions** - See real-time data of users' connected financial institutions and accounts
- **Account details** - View account names, types, and subtypes without sensitive balance information

## Financial Data Access

### Real-Time Financial Institution Data
The admin dashboard provides access to users' linked financial institutions through live Plaid API integration:

- **Live Data Fetching**: When users don't have accounts stored in the database, the system automatically fetches live data from Plaid
- **Environment Detection**: Automatically detects production vs sandbox Plaid tokens and uses appropriate credentials
- **Institution Grouping**: Groups accounts by financial institution for clear organization
- **Account Details**: Shows account names, types (investment, credit, etc.), and subtypes (ira, brokerage, etc.)
- **Privacy-First**: **No balance information** is displayed or fetched, respecting user privacy

### Supported Financial Institutions
The system intelligently detects institution names from account data:
- **Pattern Matching**: Recognizes common institutions like Robinhood, Chase, Bank of America, Betterment, Vanguard, Fidelity
- **Smart Extraction**: Falls back to extracting institution names from account naming patterns
- **Dynamic Detection**: Works with any financial institution without hardcoded limitations

### Data Sources
- **Database Accounts**: Stored account information from previous syncs
- **Live Plaid Data**: Real-time account information for active connections
- **Combined View**: Merges both sources for comprehensive user financial overview

## Security Features

### Authentication Required
- All admin endpoints require valid JWT authentication
- Users must be logged in to access admin functionality

### Email-Based Authorization
- Only specific email addresses can access admin features
- No role-based permissions - simple email whitelist

### Environment-Based Configuration
- Admin access is controlled via environment variables
- No hardcoded admin emails in the codebase
- Easy to update admin list without code changes

### Audit Logging
- All admin access attempts are logged
- Successful access: `Admin access granted for email: user@example.com`
- Denied access: `Admin access denied for email: user@example.com`
- Configuration issues: `ADMIN_EMAILS environment variable not set - admin access disabled`

## Error Messages

### Frontend Error Display
When access is denied, users see a clear error message:
```
Admin Access Required
Authentication required for admin access
Please log in with an admin account to access this dashboard.
```

### Backend Error Responses
- **401 Unauthorized**: `Authentication required for admin access`
- **403 Forbidden**: `Admin access denied` or `Admin access not configured`

## Testing

### Unit Tests
- `src/__tests__/unit/admin-auth.test.ts`: Tests admin authentication middleware
- `src/__tests__/unit/admin-endpoints.test.ts`: Tests admin endpoint functionality

### New Admin Endpoints
- **`GET /admin/user-financial-data/:userId`**: Fetches user's financial profile and linked institutions
  - Returns financial profile text and last updated timestamp
  - Returns linked financial institutions with account details
  - Automatically fetches live Plaid data when database accounts are unavailable
  - Groups accounts by institution for organized display

### Test Coverage
- Authentication requirement validation
- Email-based access control
- Environment variable configuration
- Multiple admin email support
- Case insensitive email matching
- Whitespace handling

## Best Practices

### Security
1. **Use Strong Passwords**: Ensure admin accounts have strong passwords
2. **Limit Admin Emails**: Only add necessary email addresses to `ADMIN_EMAILS`
3. **Regular Review**: Periodically review and update the admin email list
4. **Environment Separation**: Use different admin emails for development vs production

### Financial Data Privacy
1. **No Balance Display**: Financial balances are never shown in the admin dashboard
2. **Minimal Data Access**: Only account metadata (names, types, institutions) is accessible
3. **Live Data Only**: Real-time data is fetched but not stored permanently
4. **User Consent**: Data access is limited to users who have connected their financial accounts

### Configuration
1. **Environment Variables**: Always use environment variables, never hardcode admin emails
2. **Backup Configuration**: Keep a backup of your admin email list
3. **Documentation**: Document who has admin access and why
4. **Rotation**: Consider rotating admin access periodically

### Monitoring
1. **Access Logs**: Monitor admin access logs for unusual activity
2. **Failed Attempts**: Watch for repeated failed admin access attempts
3. **Configuration**: Ensure `ADMIN_EMAILS` is properly set in all environments

## Troubleshooting

### Common Issues

#### "Admin access not configured"
- **Cause**: `ADMIN_EMAILS` environment variable is not set or is empty
- **Solution**: Set the `ADMIN_EMAILS` environment variable with valid email addresses

#### "Authentication required for admin access"
- **Cause**: User is not logged in or has invalid/expired token
- **Solution**: Log in with a valid admin account

#### "Admin access denied"
- **Cause**: User's email is not in the `ADMIN_EMAILS` list
- **Solution**: Add the user's email to the `ADMIN_EMAILS` environment variable

### Debug Steps
1. Check if user is authenticated: Verify JWT token is valid
2. Check environment variable: Ensure `ADMIN_EMAILS` is set correctly
3. Check email matching: Verify the user's email is in the admin list
4. Check logs: Look for admin access log messages

## Example Configuration

### Development (.env)
```bash
ADMIN_EMAILS=developer@example.com,admin@example.com
```

### Production (Render)
```bash
ADMIN_EMAILS=admin@finsight.com,manager@finsight.com
```

### Testing
```bash
ADMIN_EMAILS=test-admin@example.com
```

This admin access control system provides secure, configurable access to the admin dashboard while maintaining simplicity and ease of use. 