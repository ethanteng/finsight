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
    Analyze this financial conversation and update the user's profile.
    
    Current conversation:
    Q: ${conversation.question}
    ${hasAnswer ? `A: ${conversation.answer}` : 'A: (No answer yet - extracting from question only)'}
    
    ${existingProfile ? `Current profile: ${existingProfile}` : 'No existing profile.'}
    
    Extract any new information about the user from the question${hasAnswer ? ' and answer' : ''} and update the profile text.
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
    
    IMPORTANT: Only return the updated profile text in natural language format.
    Do NOT include the original question or answer in the profile.
    Focus on extracting factual information about the user's personal and financial situation.
    
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
      
      return extractedProfile;
    } catch (error) {
      console.error('Error extracting profile from conversation:', error);
      return existingProfile || '';
    }
  }
} 