import OpenAI from 'openai';

// Create a separate OpenAI client for profile extraction to avoid circular dependencies
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export class ProfileExtractor {
  async extractAndUpdateProfile(
    userId: string,
    conversation: Conversation,
    existingProfile?: string
  ): Promise<string> {
    
    // If there's no answer yet, extract profile info from just the question
    const hasAnswer = conversation.answer && conversation.answer.trim().length > 0;
    
    const prompt = `
    Analyze this financial conversation and intelligently update the user's profile.
    
    Current conversation:
    Q: ${conversation.question}
    ${hasAnswer ? `A: ${conversation.answer}` : 'A: (No answer yet - extracting from question only)'}
    
    ${existingProfile ? `Current profile: ${existingProfile}` : 'No existing profile.'}
    
    Extract and integrate ANY relevant information about the user from the question${hasAnswer ? ' and answer' : ''} to build a comprehensive profile.
    
    Include and expand on:
    - Age or age range
    - Occupation or employer
    - Education level
    - Family status and children
    - Location or city
    - Income level or financial situation
    - Financial goals and priorities
    - Investment style or risk tolerance
    - Debt situation
    - Account types and financial institutions mentioned
    - Investment preferences or strategies
    - Spending patterns or budget concerns
    - Financial challenges or questions
    - Home ownership and address (if mentioned with indicators like "I own", "my home", "our house")
    - Any other relevant personal or financial information
    
    IMPORTANT: 
    - Return ONLY the updated profile text in natural language format
    - Do NOT include the original question or answer in the profile
    - Focus on building a comprehensive, coherent profile
    - If the conversation reveals financial context (like asking about asset allocation), note this as part of their financial profile
    - Combine new information with existing information intelligently
    - Make the profile more detailed and useful over time
    - If the user mentions owning a home with an address, include the full address in the profile
    - CRITICAL: If you see structured data fields like HOME_ADDRESS, HOME_VALUE, HOME_VALUE_LOW, HOME_VALUE_HIGH, HOME_VALUE_LAST_UPDATED, or HOME_VALUE_MANUAL, you MUST preserve them exactly as they appear at the end of the profile. These are system fields that must not be removed or modified. If HOME_VALUE_MANUAL exists, preserve only ONE instance (the most recent value).
    
    If no new information is found, return the existing profile unchanged.
    `;
    
    try {
      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });
      
      const extractedProfile = response.choices[0].message.content || existingProfile || '';
      
      // Validate that we're not just returning the raw conversation
      if (extractedProfile === conversation.question || extractedProfile === conversation.answer) {
        console.warn('ProfileExtractor: Extracted profile appears to be raw conversation, returning existing profile');
        return existingProfile || '';
      }

      // Check if home ownership and address were detected in the conversation
      await this.detectAndFetchHomeValue(userId, conversation.question, extractedProfile);
      
      return extractedProfile;
    } catch (error) {
      console.error('Error extracting profile from conversation:', error);
      return existingProfile || '';
    }
  }

  /**
   * Detect if user mentioned home ownership with address and fetch home value
   */
  private async detectAndFetchHomeValue(
    userId: string,
    question: string,
    profileText: string
  ): Promise<void> {
    try {
      // Check if profile already has structured home data with value
      const hasStructuredHomeData = /HOME_ADDRESS:/.test(profileText);
      if (hasStructuredHomeData) {
        // Check if value exists and is > 0
        const valueMatch = profileText.match(/HOME_VALUE:\s*(\d+(?:\.\d+)?)/);
        if (valueMatch && parseFloat(valueMatch[1]) > 0) {
          console.log('ProfileExtractor: Home data with value already exists in profile, skipping detection');
          return;
        }
        // If address exists but value is 0, we should try to fetch
        console.log('ProfileExtractor: Home address exists but value is 0 or missing, attempting to fetch value');
      }

      // Detect ownership indicators in both question and extracted profile
      const ownershipIndicators = [
        /\b(I|we) own (a|my|our) (home|house|property)\b/i,
        /\bmy (home|house|property)\b/i,
        /\bour (home|house|property)\b/i,
        /\bowned? (home|house|property)\b/i,
        /\bown (a|my|our) (home|house|property)\b/i
      ];

      const hasOwnership = ownershipIndicators.some(pattern => 
        pattern.test(question) || pattern.test(profileText)
      );
      
      if (!hasOwnership) {
        return;
      }

      // Detect address patterns in both question and extracted profile
      // Pattern: street number + street name (with ordinals like 10th) + city + state + optional zip
      const addressPatterns = [
        // Pattern with explicit street type (Street, Ave, Dr, etc.)
        /\b(\d+\s+[\w\s]+?(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir|Place|Pl|Highway|Hwy|Parkway|Pkwy),?\s+[\w\s]+?,?\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i,
        // Pattern after "at" keyword (more flexible)
        /\bat\s+(\d+\s+[\w\s]+?,\s+[\w\s]+?,\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i,
        // Pattern for standard format: number + street, city, state zip
        /\b(\d+(?:\s+[NSEW]\.?)?\s+\d+(?:st|nd|rd|th)?\s+[\w\s]+?,\s+[\w\s]+?,\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i,
        // More flexible pattern: number + street name + city, state
        /\b(\d+\s+[\w\s]+?,\s+[\w\s]+?,\s+[A-Z]{2}(?:\s+\d{5})?)\b/i
      ];

      let detectedAddress: string | null = null;
      
      // First check structured format
      const structuredMatch = profileText.match(/HOME_ADDRESS:\s*(.+?)(?:\n|$)/);
      if (structuredMatch) {
        detectedAddress = structuredMatch[1].trim();
      } else {
        // Check question first, then profile text
        for (const pattern of addressPatterns) {
          const questionMatch = question.match(pattern);
          if (questionMatch) {
            detectedAddress = questionMatch[1].trim();
            break;
          }
          
          const profileMatch = profileText.match(pattern);
          if (profileMatch) {
            detectedAddress = profileMatch[1].trim();
            break;
          }
        }
      }

      if (!detectedAddress) {
        console.log('ProfileExtractor: Ownership detected but no address found in question or profile');
        return;
      }

      console.log('ProfileExtractor: Detected home ownership with address:', detectedAddress);

      // Import ProfileManager to update home value
      const { ProfileManager } = await import('./manager');
      const profileManager = new ProfileManager();
      
      // Fetch home value from RentCast and update profile
      const homeValue = await profileManager.updateHomeValue(userId, detectedAddress);
      
      if (homeValue) {
        console.log(`ProfileExtractor: Successfully fetched and stored home value: $${homeValue}`);
      } else {
        console.log('ProfileExtractor: Failed to fetch home value from RentCast, but address was detected and saved');
      }
    } catch (error) {
      console.error('ProfileExtractor: Error detecting and fetching home value:', error);
      // Don't throw - this is a non-critical enhancement
    }
  }
} 