# 🔐 Password Security Specification

## Overview

This specification defines enhanced password security requirements for the Finsight financial analysis platform. Given the sensitive nature of financial data and user privacy concerns, robust password security is essential.

## Current State

The application currently implements basic password validation with the following requirements:
- Minimum 8 characters
- At least one lowercase letter
- At least one uppercase letter  
- At least one number

## Enhanced Requirements

### 1. Password Complexity Requirements

**Minimum Requirements:**
- **Length**: 8-128 characters
- **Lowercase**: At least one lowercase letter (a-z)
- **Uppercase**: At least one uppercase letter (A-Z)
- **Numbers**: At least one number (0-9)
- **Special Characters**: At least one special character from: `!@#$%^&*()_+-=[]{}|;':",./<>?`

### 2. Password Strength Validation

**Weak Password Detection:**
- Check against common weak passwords
- Prevent sequential patterns (123456, abcdef, etc.)
- Prevent keyboard patterns (qwerty, asdfgh, etc.)
- Prevent repeated characters (aaaaaa, 111111, etc.)

**Common Weak Passwords to Block:**
```
password, 123456, qwerty, admin, letmein, welcome, 
monkey, dragon, master, football, baseball, shadow,
michael, jennifer, thomas, jessica, charlie, andrew,
michelle, joshua, amanda, daniel, christopher, matthew
```

### 3. Password History

**Implementation:**
- Store hashed versions of previous passwords
- Prevent reuse of last 5 passwords
- Maintain password history for 1 year

### 4. Password Expiration

**Policy:**
- Require password change every 90 days
- Send reminder emails at 80 days
- Grace period of 7 days after expiration

## Implementation Details

### 1. Enhanced Validation Function

```typescript
export interface PasswordValidationResult {
  isValid: boolean;
  error?: string;
  strength?: 'weak' | 'medium' | 'strong';
  suggestions?: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  // Basic length check
  if (password.length < 8) {
    return { 
      isValid: false, 
      error: 'Password must be at least 8 characters long' 
    };
  }
  
  if (password.length > 128) {
    return { 
      isValid: false, 
      error: 'Password must be no more than 128 characters' 
    };
  }
  
  // Character type checks
  if (!/(?=.*[a-z])/.test(password)) {
    return { 
      isValid: false, 
      error: 'Password must contain at least one lowercase letter' 
    };
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return { 
      isValid: false, 
      error: 'Password must contain at least one uppercase letter' 
    };
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return { 
      isValid: false, 
      error: 'Password must contain at least one number' 
    };
  }
  
  if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
    return { 
      isValid: false, 
      error: 'Password must contain at least one special character' 
    };
  }
  
  // Weak password checks
  const weakPasswords = [
    'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome',
    'monkey', 'dragon', 'master', 'football', 'baseball', 'shadow',
    'michael', 'jennifer', 'thomas', 'jessica', 'charlie', 'andrew',
    'michelle', 'joshua', 'amanda', 'daniel', 'christopher', 'matthew'
  ];
  
  if (weakPasswords.some(weak => password.toLowerCase().includes(weak))) {
    return { 
      isValid: false, 
      error: 'Password is too common or weak' 
    };
  }
  
  // Pattern checks
  if (/(.)\1{2,}/.test(password)) {
    return { 
      isValid: false, 
      error: 'Password cannot contain repeated characters' 
    };
  }
  
  if (/123456|abcdef|qwerty/i.test(password)) {
    return { 
      isValid: false, 
      error: 'Password cannot contain sequential patterns' 
    };
  }
  
  // Calculate strength
  const strength = calculatePasswordStrength(password);
  
  return { 
    isValid: true, 
    strength,
    suggestions: generateSuggestions(password, strength)
  };
}
```

### 2. Password Strength Calculator

```typescript
export function calculatePasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  let score = 0;
  
  // Length bonus
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  
  // Character variety bonus
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
  
  // Complexity bonus
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 8) score += 1;
  
  if (score >= 5) return 'strong';
  if (score >= 3) return 'medium';
  return 'weak';
}
```

### 3. Password History Management

```typescript
export interface PasswordHistory {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: Date;
}

export async function checkPasswordHistory(
  prisma: PrismaClient,
  userId: string,
  newPassword: string
): Promise<{ canReuse: boolean; error?: string }> {
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  for (const entry of history) {
    const isMatch = await bcrypt.compare(newPassword, entry.passwordHash);
    if (isMatch) {
      return { 
        canReuse: false, 
        error: 'Password cannot be the same as your last 5 passwords' 
      };
    }
  }
  
  return { canReuse: true };
}
```

### 4. Password Expiration System

```typescript
export interface PasswordExpiration {
  userId: string;
  expiresAt: Date;
  lastReminderSent?: Date;
}

export async function checkPasswordExpiration(
  prisma: PrismaClient,
  userId: string
): Promise<{ isExpired: boolean; daysUntilExpiry: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true }
  });
  
  if (!user?.passwordChangedAt) {
    return { isExpired: true, daysUntilExpiry: 0 };
  }
  
  const expiryDate = new Date(user.passwordChangedAt);
  expiryDate.setDate(expiryDate.getDate() + 90);
  
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    isExpired: daysUntilExpiry <= 0,
    daysUntilExpiry: Math.max(0, daysUntilExpiry)
  };
}
```

## Database Schema Updates

### 1. Password History Table

```sql
CREATE TABLE password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_password_history_user_id ON password_history(user_id);
CREATE INDEX idx_password_history_created_at ON password_history(created_at);
```

### 2. User Table Updates

```sql
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN password_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN last_password_reminder_sent TIMESTAMP;
```

## API Endpoints

### 1. Password Change Endpoint

```typescript
// POST /api/auth/change-password
{
  "currentPassword": "string",
  "newPassword": "string"
}

// Response
{
  "success": boolean,
  "message": "string",
  "strength": "weak" | "medium" | "strong",
  "suggestions": string[]
}
```

### 2. Password Strength Check Endpoint

```typescript
// POST /api/auth/check-password-strength
{
  "password": "string"
}

// Response
{
  "isValid": boolean,
  "strength": "weak" | "medium" | "strong",
  "suggestions": string[],
  "error": "string"
}
```

## Frontend Integration

### 1. Real-time Password Validation

```typescript
// Password strength indicator component
interface PasswordStrengthProps {
  password: string;
  onStrengthChange: (strength: 'weak' | 'medium' | 'strong') => void;
}

const PasswordStrengthIndicator: React.FC<PasswordStrengthProps> = ({ 
  password, 
  onStrengthChange 
}) => {
  const [strength, setStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  
  useEffect(() => {
    // Call API to check password strength
    checkPasswordStrength(password).then(result => {
      setStrength(result.strength);
      onStrengthChange(result.strength);
    });
  }, [password]);
  
  return (
    <div className="password-strength">
      <div className={`strength-bar strength-${strength}`} />
      <span className="strength-text">{strength}</span>
    </div>
  );
};
```

### 2. Password Requirements Display

```typescript
const PasswordRequirements: React.FC = () => (
  <div className="password-requirements">
    <h4>Password Requirements:</h4>
    <ul>
      <li>8-128 characters long</li>
      <li>At least one lowercase letter</li>
      <li>At least one uppercase letter</li>
      <li>At least one number</li>
      <li>At least one special character</li>
      <li>Cannot be a common password</li>
    </ul>
  </div>
);
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('Password Validation', () => {
  test('should validate strong passwords', () => {
    const result = validatePassword('StrongPass123!');
    expect(result.isValid).toBe(true);
    expect(result.strength).toBe('strong');
  });
  
  test('should reject weak passwords', () => {
    const result = validatePassword('password');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('too common');
  });
  
  test('should reject passwords without special characters', () => {
    const result = validatePassword('StrongPass123');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('special character');
  });
});
```

### 2. Integration Tests

```typescript
describe('Password Change Flow', () => {
  test('should allow valid password change', async () => {
    // Test complete password change flow
  });
  
  test('should prevent password reuse', async () => {
    // Test password history functionality
  });
  
  test('should enforce password expiration', async () => {
    // Test password expiration logic
  });
});
```

## Security Considerations

### 1. Rate Limiting

- Implement rate limiting on password change attempts
- Limit password strength check API calls
- Prevent brute force attacks

### 2. Audit Logging

- Log all password change attempts
- Track failed password validations
- Monitor for suspicious patterns

### 3. Data Protection

- Never store plain text passwords
- Use secure hashing (bcrypt with salt rounds 12+)
- Implement secure password reset flows

## Migration Plan

### Phase 1: Enhanced Validation
1. Implement new password validation function
2. Update registration and password change endpoints
3. Add frontend password strength indicators
4. Deploy with feature flag

### Phase 2: Password History
1. Create password history table
2. Implement password history checking
3. Update password change flow
4. Add cleanup job for old password history

### Phase 3: Password Expiration
1. Add expiration fields to user table
2. Implement expiration checking middleware
3. Add reminder email system
4. Create admin interface for password management

## Success Metrics

- **Security**: Reduced password-related security incidents
- **User Experience**: Password strength indicators improve user awareness
- **Compliance**: Meet financial industry security standards
- **Adoption**: Gradual rollout with user feedback

## Future Enhancements

1. **Multi-factor Authentication**: Add 2FA support
2. **Password Managers**: Integrate with password manager APIs
3. **Biometric Authentication**: Add fingerprint/face ID support
4. **Adaptive Security**: Adjust requirements based on user behavior
5. **Security Score**: Provide overall account security rating

---

*This specification provides a comprehensive framework for implementing robust password security while maintaining a good user experience.* 