import { openai } from '../openai';

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
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });
      
      return response.choices[0].message.content || existingProfile || '';
    } catch (error) {
      console.error('Error extracting profile from conversation:', error);
      return existingProfile || '';
    }
  }
} 