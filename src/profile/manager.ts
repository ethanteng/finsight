import { PrismaClient } from '@prisma/client';
import { ProfileEncryptionService } from './encryption';
import { ProfileExtractor } from './extractor';
import { ProfileAnonymizer } from './anonymizer';

export class ProfileManager {
  private encryptionService: ProfileEncryptionService;
  private profileExtractor: ProfileExtractor;
  private anonymizer: ProfileAnonymizer;

  constructor(sessionId?: string) {
    const encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('PROFILE_ENCRYPTION_KEY environment variable is required');
    }
    
    // Validate encryption key format
    if (!ProfileEncryptionService.validateKey(encryptionKey)) {
      throw new Error('Invalid PROFILE_ENCRYPTION_KEY format');
    }
    
    this.encryptionService = new ProfileEncryptionService(encryptionKey);
    this.profileExtractor = new ProfileExtractor();
    this.anonymizer = new ProfileAnonymizer(sessionId || 'default-session');
  }

  async getOrCreateProfile(userId: string): Promise<string> {
    const prisma = new PrismaClient();
    
    try {
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
        where: { userId },
        include: { encrypted_profile_data: true }
      });
      
      if (!profile) {
        // Try to find by email as fallback
        profile = await prisma.userProfile.findUnique({
          where: { email: user.email },
          include: { encrypted_profile_data: true }
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
            profileText: '', // Keep for backward compatibility
            isActive: true,
            conversationCount: 0
          },
          include: { encrypted_profile_data: true }
        });
      }
      
      // Get decrypted profile text if available
      let profileText = '';
      if (profile.encrypted_profile_data) {
        try {
          profileText = this.encryptionService.decrypt(
            profile.encrypted_profile_data.encryptedData,
            profile.encrypted_profile_data.iv,
            profile.encrypted_profile_data.tag
          );
        } catch (error) {
          console.error('Failed to decrypt profile data:', error);
          // Fallback to plain text if decryption fails
          profileText = profile.profileText || '';
        }
      } else {
        // Fallback to plain text for backward compatibility
        profileText = profile.profileText || '';
      }
      
      // Anonymize the profile before returning for AI use
      const anonymizationResult = this.anonymizer.anonymizeProfile(profileText);
      
      console.log('ProfileManager: Profile anonymized, original length:', profileText.length, 'anonymized length:', anonymizationResult.anonymizedProfile.length);
      
      return anonymizationResult.anonymizedProfile;
    } finally {
      await prisma.$disconnect();
    }
  }

  // Method to get original (non-anonymized) profile for user display
  async getOriginalProfile(userId: string): Promise<string> {
    const prisma = new PrismaClient();
    
    try {
      const profile = await prisma.userProfile.findUnique({
        where: { userId },
        include: { encrypted_profile_data: true }
      });
      
      if (!profile) {
        return '';
      }
      
      // Get decrypted profile text if available
      let profileText = '';
      if (profile.encrypted_profile_data) {
        try {
          profileText = this.encryptionService.decrypt(
            profile.encrypted_profile_data.encryptedData,
            profile.encrypted_profile_data.iv,
            profile.encrypted_profile_data.tag
          );
        } catch (error) {
          console.error('Failed to decrypt profile data:', error);
          // Fallback to plain text if decryption fails
          profileText = profile.profileText || '';
        }
      } else {
        // Fallback to plain text for backward compatibility
        profileText = profile.profileText || '';
      }
      
      return profileText;
    } finally {
      await prisma.$disconnect();
    }
  }

  // Method to get anonymized profile for AI services
  async getAnonymizedProfile(userId: string): Promise<string> {
    const originalProfile = await this.getOriginalProfile(userId);
    if (!originalProfile) {
      return '';
    }
    
    // Anonymize the profile for AI consumption
    return this.anonymizeProfile(originalProfile);
  }

  // Anonymize profile by replacing sensitive values with tokens (for AI services)
  private anonymizeProfile(profileText: string): string {
    let anonymizedProfile = profileText;
    
    // Replace amounts with tokens
    anonymizedProfile = anonymizedProfile.replace(/\$[\d,]+(?:\.\d{2})?/g, (match, index) => {
      return `$AMOUNT_${index + 1}`;
    });
    
    // Replace rates with tokens
    anonymizedProfile = anonymizedProfile.replace(/(\d+(?:\.\d+)?)%/g, (match, index) => {
      return `RATE_${index + 1}%`;
    });
    
    // Replace locations with tokens
    anonymizedProfile = anonymizedProfile.replace(/([A-Z][a-z]+(?:[\s,]+[A-Z]{2})?)/g, (match, index) => {
      if (match.length > 2 && /^[A-Z][a-z]/.test(match)) {
        return `LOCATION_${index + 1}`;
      }
      return match;
    });
    
    // Replace ages with tokens
    anonymizedProfile = anonymizedProfile.replace(/(\d+)-year-old|age (\d+)/gi, (match, index) => {
      return `AGE_${index + 1}`;
    });
    
    // Replace names with tokens
    anonymizedProfile = anonymizedProfile.replace(/\b([A-Z][a-z]+)\b/g, (match, index) => {
      if (match.length > 2 && !['The', 'Our', 'We', 'You', 'Your'].includes(match)) {
        return `PERSON_${index + 1}`;
      }
      return match;
    });
    
    return anonymizedProfile;
  }

  async updateProfile(userId: string, newProfileText: string): Promise<void> {
    const prisma = new PrismaClient();
    
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        console.log('User not found, cannot update profile for userId:', userId);
        return;
      }
      
      // Try to find existing profile
      let profile = await prisma.userProfile.findUnique({
        where: { userId },
        include: { encrypted_profile_data: true }
      });
      
      if (!profile) {
        // Try to find by email as fallback
        profile = await prisma.userProfile.findUnique({
          where: { email: user.email },
          include: { encrypted_profile_data: true }
        });
      }
      
      // Encrypt the profile data (without anonymization)
      const encrypted = this.encryptionService.encrypt(newProfileText);
      
      if (profile) {
        // Update existing profile
        await prisma.userProfile.update({
          where: { id: profile.id },
          data: { 
            lastUpdated: new Date()
          }
        });
        
        // Update or create encrypted data
        if (profile.encrypted_profile_data) {
          await prisma.encrypted_profile_data.update({
            where: { profileHash: profile.profileHash },
            data: {
              encryptedData: encrypted.encryptedData,
              iv: encrypted.iv,
              tag: encrypted.tag,
              keyVersion: encrypted.keyVersion,
              updatedAt: new Date()
            }
          });
        } else {
          await prisma.encrypted_profile_data.create({
            data: {
              id: profile.profileHash,
              profileHash: profile.profileHash,
              encryptedData: encrypted.encryptedData,
              iv: encrypted.iv,
              tag: encrypted.tag,
              keyVersion: encrypted.keyVersion,
              algorithm: 'aes-256-gcm',
              updatedAt: new Date()
            }
          });
        }
      } else {
        // Create new profile
        const profileHash = `profile_${userId}_${Date.now()}`;
        const newProfile = await prisma.userProfile.create({
          data: { 
            email: user.email,
            profileHash,
            userId,
            profileText: '', // Keep for backward compatibility
            isActive: true,
            conversationCount: 0
          }
        });
        
        // Create encrypted data
        await prisma.encrypted_profile_data.create({
          data: {
            id: profileHash,
            profileHash,
            encryptedData: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag,
            keyVersion: encrypted.keyVersion,
            algorithm: 'aes-256-gcm',
            updatedAt: new Date()
          }
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  async updateProfileFromConversation(userId: string, conversation: any): Promise<void> {
    // Use the intelligent ProfileExtractor to analyze the conversation
    // and intelligently update the profile instead of dumb appending
    const currentProfile = await this.getOriginalProfile(userId); // Use original profile for enhancement
    
    const updatedProfile = await this.profileExtractor.extractAndUpdateProfile(
      userId,
      conversation,
      currentProfile
    );
    
    // Only update if the profile actually changed
    if (updatedProfile !== currentProfile) {
      await this.updateProfile(userId, updatedProfile);
      console.log(`Profile intelligently updated for user: ${userId}`);
    } else {
      console.log(`No new profile information found for user: ${userId}`);
    }
  }

  private extractProfileFromConversation(conversation: any): string {
    // This method is now deprecated - use ProfileExtractor instead
    // Keeping for backward compatibility but it should not be used
    console.warn('extractProfileFromConversation is deprecated - use ProfileExtractor instead');
    
    if (conversation.question && conversation.answer) {
      return `Q: ${conversation.question}\nA: ${conversation.answer}`;
    }
    return conversation.question || conversation.answer || '';
  }

  /**
   * Emergency recovery method for profiles that may have been overwritten
   * This can help restore profile data from backup or other sources
   */
  async recoverProfile(userId: string, backupProfileText: string): Promise<void> {
    console.log(`Attempting to recover profile for user: ${userId}`);
    
    const currentProfile = await this.getOriginalProfile(userId);
    
    if (currentProfile.trim() && currentProfile !== backupProfileText) {
      // If current profile exists and is different, append backup as recovery
      const recoveredProfile = `${currentProfile}\n\n--- RECOVERED DATA ---\n${backupProfileText}`;
      await this.updateProfile(userId, recoveredProfile);
      console.log(`Profile recovered and appended for user: ${userId}`);
    } else if (!currentProfile.trim()) {
      // If no current profile, restore from backup
      await this.updateProfile(userId, backupProfileText);
      console.log(`Profile fully restored from backup for user: ${userId}`);
    } else {
      console.log(`Profile recovery not needed for user: ${userId}`);
    }
  }

  /**
   * Get profile history to help with recovery
   */
  async getProfileHistory(userId: string): Promise<string[]> {
    // This could be enhanced to actually track profile history
    // For now, return current profile as single history item
    const currentProfile = await this.getOriginalProfile(userId);
    return currentProfile ? [currentProfile] : [];
  }
}