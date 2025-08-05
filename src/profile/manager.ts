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
    
    // Try to find profile by userId first, then by email
    let profile = await prisma.userProfile.findUnique({
      where: { userId }
    });
    
    if (!profile) {
      // Try to find by email as fallback
      profile = await prisma.userProfile.findUnique({
        where: { email: user.email }
      });
    }
    
    if (!profile) {
      // Generate a unique profile hash
      const profileHash = `profile_${userId}_${Date.now()}`;
      
      profile = await prisma.userProfile.create({
        data: {
          email: user.email,
          profileHash,
          userId,
          profileText: '',
          isActive: true,
          conversationCount: 0
        }
      });
    }
    
    return profile.profileText;
  }
  
  async updateProfile(userId: string, newProfileText: string): Promise<void> {
    const prisma = getPrismaClient();
    
    // Get user to include email in create operation
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found, cannot update profile for userId:', userId);
      return;
    }
    
    // Try to find existing profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId }
    });
    
    if (!profile) {
      // Try to find by email as fallback
      profile = await prisma.userProfile.findUnique({
        where: { email: user.email }
      });
    }
    
    if (profile) {
      // Update existing profile
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { 
          profileText: newProfileText,
          lastUpdated: new Date()
        }
      });
    } else {
      // Create new profile
      const profileHash = `profile_${userId}_${Date.now()}`;
      await prisma.userProfile.create({
        data: { 
          email: user.email,
          profileHash,
          userId,
          profileText: newProfileText,
          isActive: true,
          conversationCount: 0
        }
      });
    }
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