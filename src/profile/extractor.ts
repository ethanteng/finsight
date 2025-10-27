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
      // Check if profile already has home data
      const hasHomeData = /HOME_ADDRESS:/.test(profileText);
      if (hasHomeData) {
        console.log('ProfileExtractor: Home data already exists in profile, skipping detection');
        return;
      }

      // Detect ownership indicators
      const ownershipIndicators = [
        /\b(I|we) own (a|my|our) (home|house|property)\b/i,
        /\bmy (home|house|property)\b/i,
        /\bour (home|house|property)\b/i,
        /\bowned? (home|house|property)\b/i
      ];

      const hasOwnership = ownershipIndicators.some(pattern => pattern.test(question));
      
      if (!hasOwnership) {
        return;
      }

      // Detect address patterns
      // Pattern: street number + street name (with ordinals like 10th) + city + state + optional zip
      const addressPatterns = [
        // Pattern with explicit street type (Street, Ave, Dr, etc.)
        /\b(\d+\s+[\w\s]+?(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir|Place|Pl|Highway|Hwy|Parkway|Pkwy),?\s+[\w\s]+?,?\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i,
        // Pattern after "at" keyword (more flexible)
        /\bat\s+(\d+\s+[\w\s]+?,\s+[\w\s]+?,\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i,
        // Pattern for standard format: number + street, city, state zip
        /\b(\d+(?:\s+[NSEW]\.?)?\s+\d+(?:st|nd|rd|th)?\s+[\w\s]+?,\s+[\w\s]+?,\s+[A-Z]{2}(?:,?\s+\d{5})?)\b/i
      ];

      let detectedAddress: string | null = null;
      
      for (const pattern of addressPatterns) {
        const match = question.match(pattern);
        if (match) {
          detectedAddress = match[1].trim();
          break;
        }
      }

      if (!detectedAddress) {
        console.log('ProfileExtractor: Ownership detected but no address found');
        return;
      }

      console.log('ProfileExtractor: Detected home ownership with address:', detectedAddress);

      // Import ProfileManager to update home value
      const { ProfileManager } = await import('./manager');
      const profileManager = new ProfileManager();
      
      const homeValue = await profileManager.updateHomeValue(userId, detectedAddress);
      
      if (homeValue) {
        console.log(`ProfileExtractor: Successfully fetched and stored home value: $${homeValue}`);
      } else {
        console.log('ProfileExtractor: Failed to fetch home value, but ownership detected');
      }
    } catch (error) {
      console.error('ProfileExtractor: Error detecting and fetching home value:', error);
      // Don't throw - this is a non-critical enhancement
    }
  }
} 