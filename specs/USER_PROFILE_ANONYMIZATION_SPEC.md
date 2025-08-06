# 🔒 User Profile Anonymization - Implementation Specification

## **Overview**

This specification outlines the implementation of user profile anonymization to protect user privacy when profile data is included in AI prompts, aligning with the platform's existing dual-data privacy system.

## **Current State Analysis**

### **Privacy Gap Identified**
- **User profiles are sent to GPT without anonymization** - unlike account and transaction data
- **Personal information exposed**: Names, income amounts, family details, specific locations
- **Inconsistent with platform privacy approach**: Other data types use comprehensive anonymization
- **Direct inclusion in AI prompts**: Profiles bypass the existing anonymization system

### **Current Profile Data Flow**
```typescript
// Current implementation in src/openai.ts
${userProfile && userProfile.trim() ? `USER PROFILE:
${userProfile}  // Raw profile data sent directly to GPT

Use this profile information to provide more personalized and relevant financial advice.
Consider the user's personal situation, family status, occupation, and financial goals when making recommendations.

` : ''}
```

### **Example of Exposed Data**
```
I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)
```

## **Requirements**

### **Functional Requirements**

1. **Profile Anonymization**: Anonymize user profiles before sending to AI models
2. **Context Preservation**: Maintain personalization value while protecting privacy
3. **Consistent Tokenization**: Use same tokenization system as account/transaction data
4. **Session Consistency**: Maintain anonymization maps across requests
5. **Demo Mode Support**: Handle demo profiles appropriately
6. **Backward Compatibility**: Support existing profile enhancement features

### **Privacy Requirements**

1. **Personal Information Protection**: Anonymize names, ages, locations
2. **Financial Data Protection**: Anonymize specific amounts and balances
3. **Family Information Protection**: Anonymize family member details
4. **Institution Protection**: Anonymize financial institution names
5. **Income Protection**: Anonymize specific income amounts
6. **Goal Protection**: Anonymize specific financial targets

### **Security Requirements**

1. **Consistent Anonymization**: Same approach as account/transaction data
2. **Token Mapping**: Maintain session-consistent tokenization maps
3. **No Data Leakage**: Ensure no raw data reaches AI models
4. **Audit Trail**: Log anonymization operations for security monitoring
5. **Error Handling**: Graceful fallback if anonymization fails

## **Technical Design**

### **Profile Anonymization Service**

```typescript
// src/profile/anonymizer.ts
import { tokenizeAccount, tokenizeMerchant } from '../privacy';

interface ProfileAnonymizationResult {
  anonymizedProfile: string;
  tokenizationMap: Map<string, string>;
  originalProfile: string;
}

export class ProfileAnonymizer {
  private tokenizationMap: Map<string, string> = new Map();
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  anonymizeProfile(profileText: string): ProfileAnonymizationResult {
    if (!profileText || profileText.trim() === '') {
      return {
        anonymizedProfile: '',
        tokenizationMap: new Map(),
        originalProfile: profileText
      };
    }

    let anonymizedProfile = profileText;

    // Anonymize personal names
    anonymizedProfile = this.anonymizeNames(anonymizedProfile);
    
    // Anonymize specific amounts and balances
    anonymizedProfile = this.anonymizeAmounts(anonymizedProfile);
    
    // Anonymize locations
    anonymizedProfile = this.anonymizeLocations(anonymizedProfile);
    
    // Anonymize financial institutions
    anonymizedProfile = this.anonymizeInstitutions(anonymizedProfile);
    
    // Anonymize income information
    anonymizedProfile = this.anonymizeIncome(anonymizedProfile);
    
    // Anonymize family details
    anonymizedProfile = this.anonymizeFamilyDetails(anonymizedProfile);
    
    // Anonymize specific goals and targets
    anonymizedProfile = this.anonymizeGoals(anonymizedProfile);

    return {
      anonymizedProfile,
      tokenizationMap: new Map(this.tokenizationMap),
      originalProfile: profileText
    };
  }

  private anonymizeNames(text: string): string {
    // Pattern: "I am [Name], a [age]-year-old..."
    text = text.replace(/(?:I am|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, name) => {
      const token = this.getOrCreateToken(`PERSON_${name}`, 'person');
      return match.replace(name, token);
    });

    // Pattern: "my husband [Name]", "my wife [Name]", "my spouse [Name]"
    text = text.replace(/(?:my\s+(?:husband|wife|spouse)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, name) => {
      const token = this.getOrCreateToken(`SPOUSE_${name}`, 'spouse');
      return match.replace(name, token);
    });

    // Pattern: "our children [names]" or "children (ages [ages])"
    text = text.replace(/(?:our\s+)?children\s+(?:\(ages\s+)?([^)]+)(?:\))?/g, (match, children) => {
      const token = this.getOrCreateToken(`CHILDREN_${children}`, 'children');
      return match.replace(children, token);
    });

    return text;
  }

  private anonymizeAmounts(text: string): string {
    // Pattern: "$[amount]" or "[amount] dollars"
    text = text.replace(/\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`AMOUNT_${numAmount}`, 'amount');
      return match.replace(amount, token);
    });

    // Pattern: "[amount]% interest rate"
    text = text.replace(/(\d+(?:\.\d+)?)%\s+(?:interest\s+)?rate/g, (match, rate) => {
      const token = this.getOrCreateToken(`RATE_${rate}`, 'rate');
      return match.replace(rate, token);
    });

    return text;
  }

  private anonymizeLocations(text: string): string {
    // Pattern: "living in [City], [State]"
    text = text.replace(/living\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.getOrCreateToken(`LOCATION_${city}_${state}`, 'location');
      return match.replace(`${city}, ${state}`, token);
    });

    // Pattern: "in [City], [State]"
    text = text.replace(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.getOrCreateToken(`LOCATION_${city}_${state}`, 'location');
      return match.replace(`${city}, ${state}`, token);
    });

    return text;
  }

  private anonymizeInstitutions(text: string): string {
    // Common financial institutions
    const institutions = [
      'Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'US Bank', 'PNC', 'Capital One',
      'Ally Bank', 'Marcus', 'Fidelity', 'Vanguard', 'Schwab', 'TD Ameritrade', 'Robinhood',
      'Navy Federal', 'PenFed', 'Alliant', 'State Employees'
    ];

    institutions.forEach(institution => {
      const regex = new RegExp(`\\b${institution}\\b`, 'gi');
      text = text.replace(regex, (match) => {
        const token = this.getOrCreateToken(`INSTITUTION_${institution}`, 'institution');
        return token;
      });
    });

    return text;
  }

  private anonymizeIncome(text: string): string {
    // Pattern: "income is $[amount] annually"
    text = text.replace(/income\s+is\s+\$([0-9,]+(?:\.\d{2})?)\s+annually/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(amount, token);
    });

    // Pattern: "earning $[amount] as a"
    text = text.replace(/earning\s+\$([0-9,]+(?:\.\d{2})?)\s+as\s+a/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(amount, token);
    });

    return text;
  }

  private anonymizeFamilyDetails(text: string): string {
    // Pattern: "ages [ages]"
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return match.replace(ages, token);
    });

    // Pattern: "[age]-year-old"
    text = text.replace(/(\d+)-year-old/g, (match, age) => {
      const token = this.getOrCreateToken(`AGE_${age}`, 'age');
      return match.replace(age, token);
    });

    return text;
  }

  private anonymizeGoals(text: string): string {
    // Pattern: "$[amount] target" or "$[amount] emergency fund"
    text = text.replace(/\$([0-9,]+(?:\.\d{2})?)\s+(?:target|emergency\s+fund|down\s+payment)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`GOAL_${numAmount}`, 'goal');
      return match.replace(amount, token);
    });

    return text;
  }

  private getOrCreateToken(original: string, type: string): string {
    if (this.tokenizationMap.has(original)) {
      return this.tokenizationMap.get(original)!;
    }

    const token = `${type.toUpperCase()}_${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.tokenizationMap.set(original, token);
    return token;
  }

  getTokenizationMap(): Map<string, string> {
    return new Map(this.tokenizationMap);
  }
}
```

### **Updated Profile Manager**

```typescript
// src/profile/manager.ts
import { ProfileAnonymizer } from './anonymizer';

export class ProfileManager {
  private anonymizer: ProfileAnonymizer;

  constructor(sessionId: string) {
    this.anonymizer = new ProfileAnonymizer(sessionId);
  }

  async getOrCreateProfile(userId: string): Promise<string> {
    const prisma = getPrismaClient();
    
    // ... existing profile retrieval logic ...
    
    let profileText = '';
    if (profile) {
      profileText = profile.profileText || '';
    }
    
    // Anonymize the profile before returning
    const anonymizationResult = this.anonymizer.anonymizeProfile(profileText);
    
    console.log('ProfileManager: Anonymized profile, original length:', profileText.length, 'anonymized length:', anonymizationResult.anonymizedProfile.length);
    
    return anonymizationResult.anonymizedProfile;
  }

  async updateProfile(userId: string, newProfileText: string): Promise<void> {
    const prisma = getPrismaClient();
    
    // ... existing profile update logic ...
    
    // Store the original (non-anonymized) profile text
    await prisma.userProfile.update({
      where: { id: profile.id },
      data: { 
        profileText: newProfileText, // Store original text
        lastUpdated: new Date()
      }
    });
  }

  // Method to get original profile for user display
  async getOriginalProfile(userId: string): Promise<string> {
    const prisma = getPrismaClient();
    
    const profile = await prisma.userProfile.findUnique({
      where: { userId }
    });
    
    return profile?.profileText || '';
  }
}
```

### **Updated OpenAI Integration**

```typescript
// src/openai.ts
import { ProfileAnonymizer } from './profile/anonymizer';

export async function askOpenAIWithEnhancedContext(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model?: string,
  demoProfile?: string
): Promise<string> {
  // ... existing logic ...

  // Get user profile if available
  let userProfile: string = '';
  if (isDemo && demoProfile) {
    // Use provided demo profile (already anonymized)
    userProfile = demoProfile;
    console.log('OpenAI Enhanced: Using provided demo profile, length:', userProfile.length);
  } else if (userId && !isDemo) {
    // Get and anonymize user profile
    const profileManager = new ProfileManager(userId); // Use userId as sessionId
    userProfile = await profileManager.getOrCreateProfile(userId);
    console.log('OpenAI Enhanced: User profile retrieved and anonymized, length:', userProfile.length);
  }

  // ... rest of function remains the same ...
}
```

## **Anonymization Examples**

### **Before Anonymization**
```
I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.
```

### **After Anonymization**
```
I am PERSON_123456789, a AGE_35-year-old software engineer living in LOCATION_456789 with my husband SPOUSE_987654321 (AGE_37, Marketing Manager) and our CHILDREN_AGES_5_AND_8. 

Our household income is INCOME_157000 annually, with me earning INCOME_85000 as a software engineer and SPOUSE_987654321 earning INCOME_72000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a AMOUNT_485000 mortgage at RATE_3.25 interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a GOAL_50000 emergency fund (currently at AMOUNT_28450)
- Saving for a family vacation to Europe (GOAL_8000 target, currently at AMOUNT_3200)
- Building a house down payment fund (GOAL_100000 target, currently at AMOUNT_45000)
- Long-term retirement planning (currently have AMOUNT_246200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.
```

## **Implementation Strategy**

### **Phase 1: Core Anonymization**
1. **Implement ProfileAnonymizer**: Create the anonymization service
2. **Update ProfileManager**: Integrate anonymization into profile retrieval
3. **Update OpenAI Integration**: Use anonymized profiles in AI prompts
4. **Testing**: Create comprehensive tests for anonymization

### **Phase 2: Enhanced Features**
1. **Session Management**: Implement proper session-based tokenization maps
2. **Demo Mode Support**: Handle demo profile anonymization
3. **Error Handling**: Robust fallback mechanisms
4. **Performance Optimization**: Caching and optimization

### **Phase 3: Validation & Monitoring**
1. **Privacy Validation**: Verify no personal data reaches AI models
2. **Performance Monitoring**: Track anonymization performance
3. **User Experience**: Ensure personalization still works effectively
4. **Documentation**: Update privacy documentation

## **Testing Strategy**

### **Unit Tests**
```typescript
// src/__tests__/unit/profile-anonymizer.test.ts
describe('ProfileAnonymizer', () => {
  test('should anonymize personal names', () => {
    const anonymizer = new ProfileAnonymizer('test-session');
    const original = 'I am Sarah Chen, a 35-year-old software engineer';
    const anonymized = anonymizer.anonymizeProfile(original);
    
    expect(anonymized.anonymizedProfile).not.toContain('Sarah Chen');
    expect(anonymized.anonymizedProfile).toContain('PERSON_');
  });

  test('should anonymize financial amounts', () => {
    const anonymizer = new ProfileAnonymizer('test-session');
    const original = 'Our household income is $157,000 annually';
    const anonymized = anonymizer.anonymizeProfile(original);
    
    expect(anonymized.anonymizedProfile).not.toContain('$157,000');
    expect(anonymized.anonymizedProfile).toContain('INCOME_');
  });

  test('should maintain context while protecting privacy', () => {
    const anonymizer = new ProfileAnonymizer('test-session');
    const original = 'I am a software engineer with a $485,000 mortgage';
    const anonymized = anonymizer.anonymizeProfile(original);
    
    expect(anonymized.anonymizedProfile).toContain('software engineer');
    expect(anonymized.anonymizedProfile).not.toContain('$485,000');
    expect(anonymized.anonymizedProfile).toContain('AMOUNT_');
  });
});
```

### **Integration Tests**
```typescript
// src/__tests__/integration/profile-anonymization-integration.test.ts
describe('Profile Anonymization Integration', () => {
  test('should anonymize profiles before sending to AI', async () => {
    const profileManager = new ProfileManager('test-session');
    const testProfile = 'I am John Doe, earning $100,000 in New York, NY';
    
    await profileManager.updateProfile('test-user', testProfile);
    const anonymizedProfile = await profileManager.getOrCreateProfile('test-user');
    
    expect(anonymizedProfile).not.toContain('John Doe');
    expect(anonymizedProfile).not.toContain('$100,000');
    expect(anonymizedProfile).not.toContain('New York, NY');
    expect(anonymizedProfile).toContain('PERSON_');
    expect(anonymizedProfile).toContain('INCOME_');
    expect(anonymizedProfile).toContain('LOCATION_');
  });
});
```

## **Privacy Validation**

### **Data Flow Verification**
1. **Profile Storage**: Original profiles stored in database
2. **Profile Retrieval**: Anonymized profiles retrieved for AI
3. **AI Processing**: Only anonymized data reaches OpenAI
4. **User Display**: Original profiles shown to users

### **Security Checks**
1. **No Personal Data**: Verify no names, amounts, or locations in AI prompts
2. **Token Consistency**: Ensure consistent tokenization across sessions
3. **Error Handling**: Verify graceful fallback if anonymization fails
4. **Audit Trail**: Log anonymization operations for monitoring

## **Performance Considerations**

### **Optimization Strategies**
1. **Caching**: Cache anonymized profiles for frequently accessed data
2. **Batch Processing**: Process multiple anonymization operations efficiently
3. **Regex Optimization**: Use efficient regex patterns for text processing
4. **Memory Management**: Proper cleanup of tokenization maps

### **Expected Performance Impact**
- **Anonymization Overhead**: ~1-2ms per profile anonymization
- **Memory Usage**: Minimal increase for tokenization maps
- **Storage Impact**: No additional storage requirements
- **User Experience**: No impact on response times

## **Migration Plan**

### **Backward Compatibility**
1. **Gradual Rollout**: Implement anonymization without breaking existing features
2. **Feature Flag**: Add flag to enable/disable anonymization
3. **Fallback Mechanism**: Use original profiles if anonymization fails
4. **User Notification**: Inform users about enhanced privacy protection

### **Deployment Strategy**
1. **Staging Testing**: Test anonymization in staging environment
2. **Production Deployment**: Deploy with monitoring and rollback capability
3. **Monitoring**: Track anonymization success rates and performance
4. **Validation**: Verify privacy protection in production

## **Success Metrics**

### **Privacy Metrics**
- [ ] 100% of profiles anonymized before AI processing
- [ ] Zero personal data exposure in AI prompts
- [ ] Consistent tokenization across sessions
- [ ] Successful privacy validation

### **Performance Metrics**
- [ ] <5ms anonymization overhead
- [ ] <1% impact on AI response times
- [ ] Zero impact on user experience
- [ ] Successful caching implementation

### **Functional Metrics**
- [ ] Maintained personalization quality
- [ ] Successful demo mode support
- [ ] Robust error handling
- [ ] Comprehensive test coverage

## **Future Enhancements**

### **Advanced Anonymization**
1. **Context-Aware Anonymization**: Smarter anonymization based on context
2. **Selective Anonymization**: Allow users to choose what to anonymize
3. **Temporal Anonymization**: Different anonymization for different time periods
4. **Hierarchical Anonymization**: Different levels of anonymization

### **Privacy Features**
1. **User Control**: Allow users to control anonymization levels
2. **Privacy Settings**: User-configurable privacy preferences
3. **Data Retention**: Automatic anonymization of old profile data
4. **Compliance**: Enhanced GDPR and privacy compliance features

---

**This specification provides a comprehensive plan for implementing user profile anonymization to align with the platform's privacy-first approach and protect user data when profiles are included in AI prompts.** 