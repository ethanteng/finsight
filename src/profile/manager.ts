import { PrismaClient } from '@prisma/client';
import { ProfileEncryptionService } from './encryption';
import { PersonalContextExtractor } from './personal-context-extractor';
import {
  formatPersonalContextForModel,
  parseStoredPersonalContextDocument,
  personalContextFromLegacyText,
  personalContextValues,
  replacePersonalContextManually,
  serializePersonalContextDocument,
  type PersonalContextFacts,
  type PersonalContextValues,
  type StoredHomeContext,
} from './personal-context';

export class ProfileManager {
  private encryptionService: ProfileEncryptionService;
  private personalContextExtractor: PersonalContextExtractor;

  constructor() {
    const encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('PROFILE_ENCRYPTION_KEY environment variable is required');
    }
    
    // Validate encryption key format
    if (!ProfileEncryptionService.validateKey(encryptionKey)) {
      throw new Error('Invalid PROFILE_ENCRYPTION_KEY format');
    }
    
    this.encryptionService = new ProfileEncryptionService(encryptionKey);
    this.personalContextExtractor = new PersonalContextExtractor();
  }

  // Internal raw-storage read used by migration and the separate home-value feature.
  // User/model-facing callers should use getPersonalContext* instead.
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

  private factsFromStoredText(profileText: string): PersonalContextFacts {
    const document = parseStoredPersonalContextDocument(profileText);
    return document?.facts ?? personalContextFromLegacyText(profileText);
  }

  private storedHomeFromExtracted(profileText: string): StoredHomeContext | null {
    const document = parseStoredPersonalContextDocument(profileText);
    if (document) return document.home;
    const home = this.extractHomeData(profileText);
    if (!home.address) return null;
    return {
      address: home.address,
      propertyId: home.propertyId,
      rentCastValue: home.rentCastValue,
      manualValue: home.manualValue,
      valueLow: home.valueLow,
      valueHigh: home.valueHigh,
      lastUpdated: home.lastUpdated?.toISOString() ?? null,
    };
  }

  async getPersonalContextFacts(userId: string): Promise<PersonalContextFacts> {
    return this.factsFromStoredText(await this.getOriginalProfile(userId));
  }

  async getPersonalContext(userId: string): Promise<PersonalContextValues> {
    return personalContextValues(await this.getPersonalContextFacts(userId));
  }

  async getPersonalContextForModel(userId: string): Promise<string> {
    return formatPersonalContextForModel(await this.getPersonalContextFacts(userId));
  }

  async replacePersonalContext(userId: string, input: Record<string, unknown>): Promise<PersonalContextValues> {
    const profileText = await this.getOriginalProfile(userId);
    const facts = replacePersonalContextManually(input);
    const home = this.storedHomeFromExtracted(profileText);
    await this.updateProfile(userId, serializePersonalContextDocument(facts, home));
    return personalContextValues(facts);
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
        await prisma.userProfile.create({
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
    const currentStoredText = await this.getOriginalProfile(userId);
    const currentFacts = this.factsFromStoredText(currentStoredText);
    const updatedFacts = await this.personalContextExtractor.extractAndMerge(
      {
        id: conversation.id,
        question: conversation.question,
        createdAt: conversation.createdAt ?? new Date(),
      },
      currentFacts
    );

    const alreadyStructured = Boolean(parseStoredPersonalContextDocument(currentStoredText));
    if (alreadyStructured && JSON.stringify(updatedFacts) === JSON.stringify(currentFacts)) {
      console.log(`No new personal context found for user: ${userId}`);
      return;
    }

    // Writing the first structured document also removes stale financial prose
    // left by the former profile builder while retaining the independent home record.
    const home = this.storedHomeFromExtracted(currentStoredText);
    await this.updateProfile(userId, serializePersonalContextDocument(updatedFacts, home));
    console.log(`Personal context updated for user: ${userId}`);
  }

  /**
   * Extract home data from profile text.
   * Uses LAST occurrence for each field when duplicates exist (most recent wins).
   * Returns rentCastValue and manualValue separately so both can be included in the profile.
   */
  extractHomeData(profileText: string): {
    address: string | null;
    propertyId: string | null;
    value: number | null;
    rentCastValue: number | null;
    manualValue: number | null;
    valueLow: number | null;
    valueHigh: number | null;
    lastUpdated: Date | null;
    isManualOverride: boolean;
  } {
    const result = {
      address: null as string | null,
      propertyId: null as string | null,
      value: null as number | null,
      rentCastValue: null as number | null,
      manualValue: null as number | null,
      valueLow: null as number | null,
      valueHigh: null as number | null,
      lastUpdated: null as Date | null,
      isManualOverride: false
    };

    const document = parseStoredPersonalContextDocument(profileText);
    if (document?.home) {
      const home = document.home;
      result.address = home.address;
      result.propertyId = home.propertyId ?? null;
      result.rentCastValue = typeof home.rentCastValue === 'number' && home.rentCastValue > 0
        ? home.rentCastValue
        : null;
      result.manualValue = typeof home.manualValue === 'number' && home.manualValue > 0
        ? home.manualValue
        : null;
      result.valueLow = typeof home.valueLow === 'number' ? home.valueLow : null;
      result.valueHigh = typeof home.valueHigh === 'number' ? home.valueHigh : null;
      if (home.lastUpdated) {
        const parsed = new Date(home.lastUpdated);
        if (!Number.isNaN(parsed.getTime())) result.lastUpdated = parsed;
      }
      result.isManualOverride = result.manualValue != null;
      result.value = result.manualValue ?? result.rentCastValue;
      return result;
    }

    // Extract home address (use last occurrence)
    const addressMatches = [...profileText.matchAll(/HOME_ADDRESS:\s*(.+?)(?:\n|$)/g)];
    if (addressMatches.length > 0) {
      result.address = addressMatches[addressMatches.length - 1][1].trim();
    }

    const propertyIdMatches = [...profileText.matchAll(/HOME_RENTCAST_PROPERTY_ID:\s*(.+?)(?:\n|$)/g)];
    if (propertyIdMatches.length > 0) {
      result.propertyId = propertyIdMatches[propertyIdMatches.length - 1][1].trim();
    }

    // Extract manual override - use LAST as most recent
    const manualValueMatches = [...profileText.matchAll(/HOME_VALUE_MANUAL:\s*([\d,]+(?:\.\d+)?)/g)];
    const manualValueMatch = manualValueMatches.length > 0 ? manualValueMatches[manualValueMatches.length - 1] : null;
    if (manualValueMatch) {
      const cleanedValue = manualValueMatch[1].replace(/,/g, '');
      const manualValue = parseFloat(cleanedValue);
      if (manualValue > 0) {
        result.manualValue = manualValue;
        result.value = manualValue;
        result.isManualOverride = true;
      }
    }

    // Extract RentCast value - always parse for section inclusion; use LAST occurrence
    const rentCastMatches = [...profileText.matchAll(/HOME_VALUE:\s*([\d,]+(?:\.\d+)?)/g)];
    const rentCastMatch = rentCastMatches.length > 0 ? rentCastMatches[rentCastMatches.length - 1] : null;
    if (rentCastMatch) {
      const cleanedValue = rentCastMatch[1].replace(/,/g, '');
      const parsedValue = parseFloat(cleanedValue);
      if (parsedValue > 0) {
        result.rentCastValue = parsedValue;
        if (!result.isManualOverride) result.value = parsedValue;
      }
    }

    // Extract home value low/high - use LAST occurrence for each
    const valueLowMatches = [...profileText.matchAll(/HOME_VALUE_LOW:\s*([\d,]+(?:\.\d+)?)/g)];
    if (valueLowMatches.length > 0) {
      result.valueLow = parseFloat(valueLowMatches[valueLowMatches.length - 1][1].replace(/,/g, ''));
    }
    const valueHighMatches = [...profileText.matchAll(/HOME_VALUE_HIGH:\s*([\d,]+(?:\.\d+)?)/g)];
    if (valueHighMatches.length > 0) {
      result.valueHigh = parseFloat(valueHighMatches[valueHighMatches.length - 1][1].replace(/,/g, ''));
    }

    // Extract last updated - use LAST occurrence (most recent RentCast fetch)
    const lastUpdatedMatches = [...profileText.matchAll(/HOME_VALUE_LAST_UPDATED:\s*(.+?)(?:\n|$)/g)];
    if (lastUpdatedMatches.length > 0) {
      try {
        const dateStr = lastUpdatedMatches[lastUpdatedMatches.length - 1][1].trim();
        if (dateStr && dateStr.toLowerCase() !== 'not specified' && dateStr !== '') {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) result.lastUpdated = parsedDate;
        }
      } catch {
        // ignore
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

      const currentStoredText = await this.getOriginalProfile(userId);
      const facts = this.factsFromStoredText(currentStoredText);
      const currentHome = this.extractHomeData(currentStoredText);
      const providerPropertyId = homeValueData.subjectProperty.id.trim().replace(/[\r\n]/g, '');
      const normalizeAddress = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isSameStoredAddress = currentHome.address
        ? normalizeAddress(currentHome.address) === normalizeAddress(address)
        : false;

      if (
        isSameStoredAddress &&
        currentHome.propertyId &&
        providerPropertyId &&
        currentHome.propertyId !== providerPropertyId
      ) {
        console.error('RentCast property identity changed for the stored address', {
          previousPropertyId: currentHome.propertyId,
          returnedPropertyId: providerPropertyId,
        });
        return null;
      }

      const canonicalAddress = homeValueData.subjectProperty.formattedAddress.replace(/\s+/g, ' ').trim();
      const home: StoredHomeContext = {
        address: canonicalAddress || address,
        propertyId: providerPropertyId || null,
        rentCastValue: homeValueData.price,
        manualValue: currentHome.manualValue,
        valueLow: homeValueData.priceRangeLow,
        valueHigh: homeValueData.priceRangeHigh,
        lastUpdated: new Date().toISOString(),
      };
      await this.updateProfile(userId, serializePersonalContextDocument(facts, home));

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

    const now = new Date().toISOString();
    const home: StoredHomeContext = {
      address: currentHomeData.address,
      propertyId: currentHomeData.propertyId,
      rentCastValue: currentHomeData.rentCastValue,
      manualValue: manualValue > 0 ? manualValue : null,
      valueLow: currentHomeData.valueLow,
      valueHigh: currentHomeData.valueHigh,
      lastUpdated: now,
    };
    const updatedProfile = serializePersonalContextDocument(this.factsFromStoredText(currentProfile), home, now);
    await this.updateProfile(userId, updatedProfile);
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
    
    const currentHome = this.extractHomeData(currentProfile);
    if (!currentHome.address) throw new Error('No home address found.');
    const now = new Date().toISOString();
    const updatedProfile = serializePersonalContextDocument(
      this.factsFromStoredText(currentProfile),
      {
        address: currentHome.address,
        propertyId: currentHome.propertyId,
        rentCastValue: currentHome.rentCastValue,
        manualValue: null,
        valueLow: currentHome.valueLow,
        valueHigh: currentHome.valueHigh,
        lastUpdated: now,
      },
      now
    );
    await this.updateProfile(userId, updatedProfile);
    return this.extractHomeData(updatedProfile);
  }

  /**
   * Remove home data from user profile
   * @param userId - User ID
   */
  async removeHomeData(userId: string): Promise<void> {
    const currentProfile = await this.getOriginalProfile(userId);
    await this.updateProfile(
      userId,
      serializePersonalContextDocument(this.factsFromStoredText(currentProfile), null)
    );
    console.log(`Home data removed for user ${userId}`);
  }
}
