import { PrismaClient } from '@prisma/client';
import { ProfileEncryptionService } from './encryption';
import { ProfileExtractor } from './extractor';
import { ProfileAnonymizer } from './anonymizer';
import { AnonymizationService } from '../services/anonymization-service';

export class ProfileManager {
  private encryptionService: ProfileEncryptionService;
  private profileExtractor: ProfileExtractor;
  private anonymizationService?: AnonymizationService;
  private anonymizer?: ProfileAnonymizer;

  constructor(sessionId?: string, anonymizationService?: AnonymizationService) {
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
    this.anonymizationService = anonymizationService;
    // ProfileAnonymizer will be created on-demand when needed with userId
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
      
      // ✅ Return original profile (no anonymization)
      return profileText;
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
  // ✅ NOTE: Now returns original profile (no anonymization)
  async getAnonymizedProfile(userId: string): Promise<string> {
    // Return original profile (no anonymization)
    return await this.getOriginalProfile(userId);
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
    
    // After extraction, check if home value was added by detectAndFetchHomeValue
    // Get the latest profile which may now have structured home data
    const latestProfile = await this.getOriginalProfile(userId);
    const existingHomeData = this.extractHomeData(latestProfile);
    
    // Only update if the profile actually changed
    if (updatedProfile !== currentProfile) {
      // Preserve structured home data if it exists
      let finalProfile = updatedProfile;
      
      // Check if the updated profile has home data
      const updatedHomeData = this.extractHomeData(updatedProfile);
      
      // If we have home data in the DB but not in the AI-generated profile, preserve it
      if (existingHomeData.address && !updatedHomeData.address) {
        console.log('💾 Preserving structured home data that was added during extraction');
        
        // Remove any existing home data markers (shouldn't be any, but just in case)
        finalProfile = finalProfile.replace(
          /HOME_ADDRESS:.*?\n|HOME_VALUE:.*?\n|HOME_VALUE_LOW:.*?\n|HOME_VALUE_HIGH:.*?\n|HOME_VALUE_LAST_UPDATED:.*?\n/g,
          ''
        ).trim();
        
        // Re-add the structured home data (even if value is 0 - address is still useful)
        if (existingHomeData.address) {
          const homeDataSection = `

HOME_ADDRESS: ${existingHomeData.address}
HOME_VALUE: ${existingHomeData.value ?? 0}
HOME_VALUE_LOW: ${existingHomeData.valueLow ?? existingHomeData.value ?? 0}
HOME_VALUE_HIGH: ${existingHomeData.valueHigh ?? existingHomeData.value ?? 0}
HOME_VALUE_LAST_UPDATED: ${existingHomeData.lastUpdated?.toISOString() || new Date().toISOString()}`;
          
          finalProfile = finalProfile + homeDataSection;
        }
      }
      
      await this.updateProfile(userId, finalProfile);
      console.log(`Profile intelligently updated for user: ${userId}`);
    } else {
      console.log(`No new profile information found for user: ${userId}`);
    }
    
    // ✅ After profile update, check if address was detected but value wasn't fetched
    // This handles the case where GPT added address in natural language but detectAndFetchHomeValue
    // didn't trigger (e.g., if it ran before the profile was saved)
    const finalProfile = await this.getOriginalProfile(userId);
    const finalHomeData = this.extractHomeData(finalProfile);
    
    // If we have an address but no value (or value is 0), try to fetch it
    if (finalHomeData.address && (!finalHomeData.value || finalHomeData.value === 0)) {
      console.log(`ProfileManager: Address detected but value missing, attempting to fetch home value for: ${finalHomeData.address}`);
      try {
        const homeValue = await this.updateHomeValue(userId, finalHomeData.address);
        if (homeValue) {
          console.log(`ProfileManager: Successfully fetched home value: $${homeValue}`);
        } else {
          console.log('ProfileManager: Failed to fetch home value, but address is saved');
        }
      } catch (error) {
        console.error('ProfileManager: Error fetching home value:', error);
        // Don't throw - address is still saved
      }
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

  /**
   * Extract home data from profile text
   * Returns structured home data if found in profile
   */
  extractHomeData(profileText: string): {
    address: string | null;
    value: number | null;
    valueLow: number | null;
    valueHigh: number | null;
    lastUpdated: Date | null;
    isManualOverride: boolean;
  } {
    const result = {
      address: null as string | null,
      value: null as number | null,
      valueLow: null as number | null,
      valueHigh: null as number | null,
      lastUpdated: null as Date | null,
      isManualOverride: false
    };

    // Extract home address
    const addressMatch = profileText.match(/HOME_ADDRESS:\s*(.+?)(?:\n|$)/);
    if (addressMatch) {
      result.address = addressMatch[1].trim();
    }

    // Extract manual override value first (takes precedence over RentCast estimate)
    // Regex handles numbers with optional decimals, and also handles commas (though they shouldn't be in stored values)
    const manualValueMatch = profileText.match(/HOME_VALUE_MANUAL:\s*([\d,]+(?:\.\d+)?)/);
    if (manualValueMatch) {
      // Remove commas if present (shouldn't happen, but handle it)
      const cleanedValue = manualValueMatch[1].replace(/,/g, '');
      const manualValue = parseFloat(cleanedValue);
      if (manualValue > 0) {
        result.value = manualValue;
        result.isManualOverride = true;
      }
    }

    // Extract home value (RentCast estimate) - only use if no manual override
    if (!result.isManualOverride) {
      const valueMatch = profileText.match(/HOME_VALUE:\s*([\d,]+(?:\.\d+)?)/);
      if (valueMatch) {
        const cleanedValue = valueMatch[1].replace(/,/g, '');
        const parsedValue = parseFloat(cleanedValue);
        if (parsedValue > 0) {
          result.value = parsedValue;
        }
      }
    }

    // Extract home value low (supports both integers and decimals, handles commas)
    const valueLowMatch = profileText.match(/HOME_VALUE_LOW:\s*([\d,]+(?:\.\d+)?)/);
    if (valueLowMatch) {
      const cleanedValue = valueLowMatch[1].replace(/,/g, '');
      result.valueLow = parseFloat(cleanedValue);
    }

    // Extract home value high (supports both integers and decimals, handles commas)
    const valueHighMatch = profileText.match(/HOME_VALUE_HIGH:\s*([\d,]+(?:\.\d+)?)/);
    if (valueHighMatch) {
      const cleanedValue = valueHighMatch[1].replace(/,/g, '');
      result.valueHigh = parseFloat(cleanedValue);
    }

    // Extract last updated timestamp
    const lastUpdatedMatch = profileText.match(/HOME_VALUE_LAST_UPDATED:\s*(.+?)(?:\n|$)/);
    if (lastUpdatedMatch) {
      try {
        const dateStr = lastUpdatedMatch[1].trim();
        // Skip if the value is "Not specified" or empty
        if (dateStr && dateStr.toLowerCase() !== 'not specified' && dateStr !== '') {
          const parsedDate = new Date(dateStr);
          // Only set if the date is valid
          if (!isNaN(parsedDate.getTime())) {
            result.lastUpdated = parsedDate;
          } else {
            console.warn(`Invalid date format for HOME_VALUE_LAST_UPDATED: "${dateStr}"`);
          }
        }
      } catch (error) {
        console.error('Failed to parse HOME_VALUE_LAST_UPDATED:', error);
      }
    }

    return result;
  }

  /**
   * Update home value for a user by fetching from RentCast API
   * @param userId - User ID
   * @param address - Home address
   * @returns Updated home value or null if fetch failed
   */
  async updateHomeValue(userId: string, address: string): Promise<number | null> {
    try {
      // Import RentCast service
      const { RentCastService } = await import('../services/rentcast');
      const rentCastService = new RentCastService();

      // Validate address
      if (!rentCastService.validateAddress(address)) {
        console.error('Invalid address format:', address);
        return null;
      }

      // Fetch home value from RentCast
      const homeValueData = await rentCastService.getHomeValue(address);
      
      if (!homeValueData) {
        console.log('No home value data found for address:', address);
        return null;
      }

      // Get current profile
      const currentProfile = await this.getOriginalProfile(userId);
      
      // Preserve manual override if it exists
      const manualOverrideMatch = currentProfile.match(/HOME_VALUE_MANUAL:\s*(\d+(?:\.\d+)?)/);
      const manualOverride = manualOverrideMatch ? manualOverrideMatch[0] : null;
      
      // Remove any existing home data (but preserve manual override)
      let updatedProfile = currentProfile.replace(
        /HOME_ADDRESS:.*?\n|HOME_VALUE:.*?\n|HOME_VALUE_LOW:.*?\n|HOME_VALUE_HIGH:.*?\n|HOME_VALUE_LAST_UPDATED:.*?\n/g,
        ''
      ).trim();

      // Add new home data to profile
      let homeDataSection = `

HOME_ADDRESS: ${address}
HOME_VALUE: ${homeValueData.price}
HOME_VALUE_LOW: ${homeValueData.priceRangeLow}
HOME_VALUE_HIGH: ${homeValueData.priceRangeHigh}
HOME_VALUE_LAST_UPDATED: ${new Date().toISOString()}`;

      // Re-add manual override if it existed (manual override takes precedence)
      if (manualOverride) {
        homeDataSection += `\n${manualOverride}`;
      }

      updatedProfile = updatedProfile + homeDataSection;

      // Save updated profile
      await this.updateProfile(userId, updatedProfile);

      console.log(`Home value updated for user ${userId}: $${homeValueData.price}`);
      
      return homeValueData.price;
    } catch (error) {
      console.error('Failed to update home value:', error);
      return null;
    }
  }

  /**
   * Get current home value for a user
   * @param userId - User ID
   * @returns Home value or null if not set
   */
  async getHomeValue(userId: string): Promise<number | null> {
    const profile = await this.getOriginalProfile(userId);
    const homeData = this.extractHomeData(profile);
    return homeData.value;
  }

  /**
   * Update manual home value override for a user
   * @param userId - User ID
   * @param manualValue - Manual override value
   * @returns Updated home data
   */
  async updateManualHomeValue(userId: string, manualValue: number): Promise<{
    address: string | null;
    value: number | null;
    valueLow: number | null;
    valueHigh: number | null;
    lastUpdated: Date | null;
    isManualOverride: boolean;
  }> {
    const currentProfile = await this.getOriginalProfile(userId);
    const currentHomeData = this.extractHomeData(currentProfile);
    
    if (!currentHomeData.address) {
      throw new Error('No home address found. Please add a home address first.');
    }

    // Remove existing manual override if present
    let updatedProfile = currentProfile.replace(
      /HOME_VALUE_MANUAL:.*?\n/g,
      ''
    );

    // Trim trailing whitespace but preserve at least one trailing newline for regex matching
    // This ensures regex patterns can match properly
    updatedProfile = updatedProfile.trimEnd();
    
    // Ensure profile ends with a newline for regex matching (after trimEnd)
    if (!updatedProfile.endsWith('\n')) {
      updatedProfile += '\n';
    }

    // Add or update manual override
    if (manualValue > 0) {
      // Check if home data section exists
      if (!updatedProfile.includes('HOME_ADDRESS:')) {
        throw new Error('Home data section not found in profile');
      }

      let overrideAdded = false;

      // Add manual override after the last home data field
      // Find the last HOME_VALUE_LAST_UPDATED line and add manual override after it
      if (updatedProfile.includes('HOME_VALUE_LAST_UPDATED:')) {
        // Match with or without trailing newline, ensure we add one
        updatedProfile = updatedProfile.replace(
          /(HOME_VALUE_LAST_UPDATED:.*?)(\n|$)/,
          `$1\nHOME_VALUE_MANUAL: ${manualValue}\n`
        );
        overrideAdded = true;
      } else {
        // If no LAST_UPDATED, add after HOME_VALUE_HIGH or HOME_VALUE
        if (updatedProfile.includes('HOME_VALUE_HIGH:')) {
          updatedProfile = updatedProfile.replace(
            /(HOME_VALUE_HIGH:.*?)(\n|$)/,
            `$1\nHOME_VALUE_MANUAL: ${manualValue}\n`
          );
          overrideAdded = true;
        } else if (updatedProfile.includes('HOME_VALUE:')) {
          updatedProfile = updatedProfile.replace(
            /(HOME_VALUE:.*?)(\n|$)/,
            `$1\nHOME_VALUE_MANUAL: ${manualValue}\n`
          );
          overrideAdded = true;
        } else {
          // If no anchor field exists, append after HOME_ADDRESS
          updatedProfile = updatedProfile.replace(
            /(HOME_ADDRESS:.*?)(\n|$)/,
            `$1HOME_VALUE_MANUAL: ${manualValue}\n`
          );
          overrideAdded = true;
        }
      }

      // Verify override was added
      if (!overrideAdded || !updatedProfile.includes(`HOME_VALUE_MANUAL: ${manualValue}`)) {
        throw new Error('Failed to add manual override to profile');
      }
    }

    // Update last updated timestamp
    const now = new Date().toISOString();
    if (updatedProfile.includes('HOME_VALUE_LAST_UPDATED:')) {
      updatedProfile = updatedProfile.replace(
        /HOME_VALUE_LAST_UPDATED:.*?\n/,
        `HOME_VALUE_LAST_UPDATED: ${now}\n`
      );
    }

    await this.updateProfile(userId, updatedProfile);
    
    // Return updated home data
    return this.extractHomeData(updatedProfile);
  }

  /**
   * Remove manual home value override (reset to estimate)
   * @param userId - User ID
   * @returns Updated home data
   */
  async removeManualHomeValue(userId: string): Promise<{
    address: string | null;
    value: number | null;
    valueLow: number | null;
    valueHigh: number | null;
    lastUpdated: Date | null;
    isManualOverride: boolean;
  }> {
    const currentProfile = await this.getOriginalProfile(userId);
    
    // Remove manual override
    let updatedProfile = currentProfile.replace(
      /HOME_VALUE_MANUAL:.*?\n/g,
      ''
    );

    // Trim trailing whitespace but preserve at least one trailing newline for regex matching
    // This ensures subsequent regex patterns in updateHomeValue can match properly
    updatedProfile = updatedProfile.trimEnd();
    
    // Ensure profile ends with a newline for regex matching (after trimEnd)
    if (!updatedProfile.endsWith('\n')) {
      updatedProfile += '\n';
    }

    await this.updateProfile(userId, updatedProfile);
    
    // Return updated home data (will now use estimate)
    return this.extractHomeData(updatedProfile);
  }

  /**
   * Remove home data from user profile
   * @param userId - User ID
   */
  async removeHomeData(userId: string): Promise<void> {
    const currentProfile = await this.getOriginalProfile(userId);
    
    // Remove home data (including manual override)
    const updatedProfile = currentProfile.replace(
      /HOME_ADDRESS:.*?\n|HOME_VALUE:.*?\n|HOME_VALUE_LOW:.*?\n|HOME_VALUE_HIGH:.*?\n|HOME_VALUE_MANUAL:.*?\n|HOME_VALUE_LAST_UPDATED:.*?\n/g,
      ''
    ).trim();

    await this.updateProfile(userId, updatedProfile);
    console.log(`Home data removed for user ${userId}`);
  }
}