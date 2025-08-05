import { getPrismaClient } from '../prisma-client';
import { ProfileExtractor } from './extractor';

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export class ProfileManager {
  async getOrCreateProfile(userId: string): Promise<string> {
    const prisma = getPrismaClient();
    
    // First check if the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found, cannot create profile for userId:', userId);
      return '';
    }
    
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
      console.log('Profile updated for user:', userId);
    }
  }
} 