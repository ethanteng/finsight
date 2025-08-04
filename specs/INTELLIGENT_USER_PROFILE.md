# 🧠 **Intelligent User Profile System**

## **Concept Overview**

A dynamic AI-built user profile system that intelligently builds and maintains user profiles by:

1. **Extracting context from conversations** - AI analyzes user questions and responses to infer personal details
2. **Incremental learning** - Profile gets richer over time as users interact more
3. **Privacy-first** - All profile data is anonymized and stored securely
4. **Dynamic & flexible** - Profile is stored as natural language text, not constrained to predefined fields

## **Simplified Database Schema**

Instead of complex structured fields, we use a simple text-based approach:

```prisma
model UserProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  
  // Dynamic profile as natural language text
  profileText     String   @db.Text // "I am 47 years old. I have 2 children, ages 10 and 14..."
  
  // Metadata
  lastUpdated     DateTime @updatedAt
  createdAt       DateTime @default(now())
  
  @@map("user_profiles")
}
```

## **Implementation Phases**

### **Phase 1: Basic Conversation Extraction & Profile Building**
- Extract context from user conversations
- Build initial profile text
- Integrate with existing OpenAI system

### **Phase 2: Frontend Profile Display & Management**
- Display profile to users
- Allow manual editing
- Profile privacy controls
- Help with testing and validation

### **Phase 3: Advanced AI Synthesis & Profile Quality**
- Improve profile text quality and coherence
- Better extraction prompts and context awareness
- Profile cleanup and summarization
- Enhanced conversation analysis

### **Phase 4: Plaid Data Enhancement (Future)**
- Integrate with additional Plaid products (`/investments`, `/liabilities`, `/assets`)
- Enhance profile with financial data insights

## **Core Components**

### **1. Profile Extractor**

```typescript
// src/profile/extractor.ts
class ProfileExtractor {
  async extractAndUpdateProfile(
    userId: string,
    conversation: Conversation,
    existingProfile?: string
  ): Promise<string> {
    
    const prompt = `
    Analyze this financial conversation and update the user's profile.
    
    Current conversation:
    Q: ${conversation.question}
    A: ${conversation.answer}
    
    ${existingProfile ? `Current profile: ${existingProfile}` : 'No existing profile.'}
    
    Extract any new information about the user and update the profile text.
    Include details like:
    - Age or age range
    - Occupation or employer
    - Education level
    - Family status and children
    - Location or city
    - Income level or financial situation
    - Financial goals and priorities
    - Investment style or risk tolerance
    - Debt situation
    - Any other relevant personal or financial information
    
    Return ONLY the updated profile text in natural language format.
    If no new information is found, return the existing profile unchanged.
    `;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    });
    
    return response.choices[0].message.content || existingProfile || '';
  }
}
```

### **2. Profile Manager**

```typescript
// src/profile/manager.ts
class ProfileManager {
  async getOrCreateProfile(userId: string): Promise<string> {
    const prisma = getPrismaClient();
    
    let profile = await prisma.userProfile.findUnique({
      where: { userId }
    });
    
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId,
          profileText: ''
        }
      });
    }
    
    return profile.profileText;
  }
  
  async updateProfile(userId: string, newProfileText: string): Promise<void> {
    const prisma = getPrismaClient();
    
    await prisma.userProfile.upsert({
      where: { userId },
      update: { profileText: newProfileText },
      create: { userId, profileText: newProfileText }
    });
  }
  
  async updateProfileFromConversation(
    userId: string,
    conversation: Conversation
  ): Promise<void> {
    const extractor = new ProfileExtractor();
    const currentProfile = await this.getOrCreateProfile(userId);
    
    const updatedProfile = await extractor.extractAndUpdateProfile(
      userId,
      conversation,
      currentProfile
    );
    
    if (updatedProfile !== currentProfile) {
      await this.updateProfile(userId, updatedProfile);
    }
  }
}
```

### **3. Enhanced OpenAI Integration**

```typescript
// Modified src/openai.ts
export async function askOpenAIWithUserProfile(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier = UserTier.STARTER,
  isDemo: boolean = false,
  userId?: string,
  model?: string
): Promise<string> {
  
  // Get user profile if available
  let userProfile: string = '';
  if (userId && !isDemo) {
    const profileManager = new ProfileManager();
    userProfile = await profileManager.getOrCreateProfile(userId);
  }
  
  // Build enhanced system prompt with profile
  const systemPrompt = buildSystemPromptWithProfile(
    tierContext,
    accountSummary,
    transactionSummary,
    marketContextSummary,
    userProfile
  );
  
  // Rest of the function remains the same...
}

function buildSystemPromptWithProfile(
  tierContext: TierAwareContext,
  accountSummary: string,
  transactionSummary: string,
  marketContextSummary: string,
  userProfile?: string
): string {
  
  let profileSection = '';
  if (userProfile && userProfile.trim()) {
    profileSection = `
USER PROFILE:
${userProfile}

Use this profile information to provide more personalized and relevant financial advice.
Consider the user's personal situation, family status, occupation, and financial goals when making recommendations.
`;
  }
  
  return `
You are Linc, an AI-powered financial analyst.

${profileSection}

USER TIER: ${tierContext.tierInfo.currentTier.toUpperCase()}

AVAILABLE DATA SOURCES:
${tierContext.tierInfo.availableSources.map(source => `• ${source}`).join('\n')}

ACCOUNT SUMMARY:
${accountSummary}

TRANSACTION SUMMARY:
${transactionSummary}

MARKET CONTEXT:
${marketContextSummary}

INSTRUCTIONS:
- Provide personalized financial advice based on the user's profile and financial situation
- Consider their personal circumstances, family situation, occupation, and financial goals
- When relevant, mention upgrade benefits for unavailable features
- Focus on actionable, specific recommendations tailored to their situation
`;
}
```

### **4. Automatic Profile Updates**

```typescript
// Integration in existing ask endpoint
export async function askOpenAI(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier = UserTier.STARTER,
  isDemo: boolean = false,
  userId?: string,
  model?: string
): Promise<string> {
  
  // ... existing code ...
  
  // After generating the answer, update the user's profile
  if (userId && !isDemo) {
    try {
      const profileManager = new ProfileManager();
      await profileManager.updateProfileFromConversation(userId, {
        id: 'temp',
        question,
        answer: response,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to update user profile:', error);
      // Don't fail the main request if profile update fails
    }
  }
  
  return response;
}
```

## **API Endpoints**

```typescript
// New endpoints in src/index.ts

// Get user profile
app.get('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const profileManager = new ProfileManager();
    const profileText = await profileManager.getOrCreateProfile(userId);
    
    res.json({ profile: { profileText } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile manually
app.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { profileText } = req.body;
    
    const profileManager = new ProfileManager();
    await profileManager.updateProfile(userId, profileText);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
```

## **Frontend Integration**

```typescript
// frontend/src/components/UserProfile.tsx
interface UserProfileProps {
  userId?: string;
  isDemo?: boolean;
}

export default function UserProfile({ userId, isDemo }: UserProfileProps) {
  const [profileText, setProfileText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  
  useEffect(() => {
    if (userId && !isDemo) {
      loadProfile();
    }
  }, [userId, isDemo]);
  
  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/profile');
      const data = await response.json();
      setProfileText(data.profile?.profileText || '');
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const saveProfile = async (newText: string) => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileText: newText })
      });
      setProfileText(newText);
      setEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };
  
  if (loading) return <div>Loading profile...</div>;
  if (!profileText && !editing) return null;
  
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Your Financial Profile</h3>
        <button
          onClick={() => setEditing(!editing)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      
      {editing ? (
        <div>
          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            className="w-full h-32 p-3 border rounded-lg"
            placeholder="Your profile will be built automatically as you chat with Linc..."
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => saveProfile(profileText)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-gray-700 whitespace-pre-wrap">{profileText}</p>
          <div className="mt-4 text-xs text-gray-500">
            This profile is built automatically from your conversations with Linc.
          </div>
        </div>
      )}
    </div>
  );
}
```

## **Benefits of Simplified Approach**

1. **Flexibility**: No constraints from predefined data fields
2. **Natural Language**: Profile reads like a real person description
3. **Easy to Understand**: Users can easily read and edit their profile
4. **Future-Proof**: Can capture any type of information without schema changes
5. **Simple Implementation**: Much less complex than structured data approach
6. **Better AI Integration**: Natural language works better with LLMs

## **Privacy & Security Considerations**

1. **Anonymization**: Profile text is anonymized before AI processing
2. **User Control**: Users can view, edit, or delete their profile
3. **Data Retention**: Follows existing retention policies
4. **Consent**: Clear opt-in for profile building features
5. **Encryption**: Profile data encrypted at rest

## **Next Steps**

1. **Phase 1 Implementation**: Start with basic conversation extraction and integration
2. **Phase 2 Implementation**: Add frontend profile display for testing and validation
3. **Testing & Iteration**: Use the UI to test profile quality and refine extraction prompts
4. **Phase 3 Implementation**: Improve AI synthesis and profile quality based on real usage
5. **Future**: Consider Plaid integration when ready

This simplified approach provides maximum flexibility while maintaining the core benefits of personalized financial advice.