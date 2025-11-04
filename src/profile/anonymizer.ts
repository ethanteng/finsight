import { AnonymizationService } from '../services/anonymization-service';

interface ProfileAnonymizationResult {
  anonymizedProfile: string;
  tokenizationMap: Map<string, string>; // Deprecated: tokens are now stored in AnonymizationService
  originalProfile: string;
}

export class ProfileAnonymizer {
  private anonymizationService: AnonymizationService;
  private userId: string;

  constructor(anonymizationService: AnonymizationService, userId: string) {
    this.anonymizationService = anonymizationService;
    this.userId = userId;
  }

  anonymizeProfile(profileText: string): ProfileAnonymizationResult {
    if (!profileText || profileText.trim() === '') {
      return {
        anonymizedProfile: profileText,
        tokenizationMap: new Map(),
        originalProfile: profileText
      };
    }

    let anonymizedProfile = profileText;

    // Anonymize personal names
    anonymizedProfile = this.anonymizeNames(anonymizedProfile);
    
    // Anonymize ages FIRST (before children)
    anonymizedProfile = this.anonymizeAges(anonymizedProfile);
    
    // Anonymize family details SECOND (children, but ages already processed)
    anonymizedProfile = this.anonymizeFamilyDetails(anonymizedProfile);
    
    // Anonymize income information THIRD (before general amounts)
    anonymizedProfile = this.anonymizeIncome(anonymizedProfile);
    
    // Anonymize goals FOURTH (before general amounts)
    anonymizedProfile = this.anonymizeGoals(anonymizedProfile);
    
    // Anonymize specific amounts and balances FIFTH
    anonymizedProfile = this.anonymizeAmounts(anonymizedProfile);
    
    // Anonymize locations
    anonymizedProfile = this.anonymizeLocations(anonymizedProfile);
    
    // Anonymize financial institutions
    anonymizedProfile = this.anonymizeInstitutions(anonymizedProfile);

    return {
      anonymizedProfile,
      tokenizationMap: new Map(), // Deprecated: tokens are now stored in AnonymizationService session maps
      originalProfile: profileText
    };
  }

  private anonymizeNames(text: string): string {
    // Pattern: "I am [Name], a [age]-year-old..."
    text = text.replace(/(?:I am|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, name) => {
      const token = this.anonymizationService.tokenizePerson(this.userId, name);
      return match.replace(name, token);
    });

    // Pattern: "my husband [Name]", "my wife [Name]", "my spouse [Name]" - case-insensitive
    text = text.replace(/my\s+wife\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.anonymizationService.tokenizeSpouse(this.userId, name);
      return match.replace(name, token);
    });
    
    text = text.replace(/my\s+husband\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.anonymizationService.tokenizeSpouse(this.userId, name);
      return match.replace(name, token);
    });
    
    text = text.replace(/my\s+spouse\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.anonymizationService.tokenizeSpouse(this.userId, name);
      return match.replace(name, token);
    });

    // Pattern: "[Name] earning" - catch spouse income patterns
    text = text.replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+earning/g, (match, name) => {
      const token = this.anonymizationService.tokenizeSpouse(this.userId, name);
      return match.replace(name, token);
    });

    return text;
  }

  private anonymizeIncome(text: string): string {
    // Pattern: "income is $[amount] annually" - more specific to avoid conflicts with general amount anonymization
    text = text.replace(/income\s+is\s+\$([0-9,]+(?:\.\d{2})?)\s+annually/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeIncome(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    // Pattern: "earning $[amount] as a" - more specific to avoid conflicts
    text = text.replace(/earning\s+\$([0-9,]+(?:\.\d{2})?)\s+as\s+a/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeIncome(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    // Pattern: "[Name] earning $[amount]" - catch spouse income patterns
    text = text.replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, name, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeIncome(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    // Pattern: "me earning $[amount]" - catch first person income
    text = text.replace(/me\s+earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeIncome(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    // Pattern: "earning $[amount]" - catch any earning pattern
    text = text.replace(/earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeIncome(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    return text;
  }

  private anonymizeGoals(text: string): string {
    // Pattern: "$[amount] target" or "$[amount] emergency fund" - more specific
    text = text.replace(/\$([0-9,]+(?:\.\d{2})?)\s+(?:target|emergency\s+fund|down\s+payment)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.anonymizationService.tokenizeGoal(this.userId, numAmount);
      return match.replace(`$${amount}`, `$${token}`);
    });

    return text;
  }

  private anonymizeAmounts(text: string): string {
    // Pattern: "$[amount]" - but NOT if already processed by income or goals
    // Since income and goals are processed FIRST, they replace amounts with $Income_X or $Goal_X
    // Any remaining $amount patterns are general amounts that we'll leave as-is for now
    // (General amounts in profiles are less critical than specific income/goal amounts)
    // 
    // Note: We could tokenize general amounts here if needed, but for now we preserve them
    // to maintain backward compatibility and avoid over-anonymization
    
    // Pattern: "[amount]% interest rate" - keep as is (not critical for profile anonymization)
    // This could be enhanced to use a rate tokenization service if needed
    
    return text; // Keep all remaining amounts as-is
  }

  private anonymizeLocations(text: string): string {
    // Pattern: "living in [City], [State]"
    text = text.replace(/living\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.anonymizationService.tokenizeLocation(this.userId, city, state);
      return match.replace(`${city}, ${state}`, token);
    });

    // Pattern: "in [City], [State]"
    text = text.replace(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.anonymizationService.tokenizeLocation(this.userId, city, state);
      return match.replace(`${city}, ${state}`, token);
    });

    return text;
  }

  private anonymizeInstitutions(text: string): string {
    // Common financial institutions
    const institutions = [
      'Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'US Bank', 'PNC', 'Capital One',
      'Ally Bank', 'Marcus', 'Fidelity', 'Vanguard', 'Schwab', 'TD Ameritrade', 'Robinhood',
      'Navy Federal', 'PenFed', 'Alliant', 'State Employees'
    ];

    institutions.forEach(institution => {
      const regex = new RegExp(`\\b${institution}\\b`, 'gi');
      text = text.replace(regex, (match) => {
        const token = this.anonymizationService.tokenizeInstitution(this.userId, institution);
        return token;
      });
    });

    return text;
  }

  private anonymizeAges(text: string): string {
    // Pattern: "ages [ages]" - for children ages (e.g., "ages 5 and 8")
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return match.replace(ages, token);
    });

    // Pattern: "[age]-year-old" - for person ages
    text = text.replace(/(\d+)-year-old/g, (match, age) => {
      const ageNum = parseInt(age, 10);
      const token = this.anonymizationService.tokenizeAge(this.userId, ageNum);
      return match.replace(age, token);
    });

    // Pattern: "([age], [profession])" - catch age in parentheses
    text = text.replace(/\((\d+),\s*([^)]+)\)/g, (match, age, profession) => {
      const ageNum = parseInt(age, 10);
      const ageToken = this.anonymizationService.tokenizeAge(this.userId, ageNum);
      return `(${ageToken}, ${profession})`;
    });

    // Pattern: "([age])" - catch standalone age in parentheses
    text = text.replace(/\((\d+)\)/g, (match, age) => {
      const ageNum = parseInt(age, 10);
      const token = this.anonymizationService.tokenizeAge(this.userId, ageNum);
      return `(${token})`;
    });

    // Pattern: "ages [ages]" in parentheses - catch this pattern specifically
    text = text.replace(/\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return `(${token})`;
    });

    // Pattern: "children (ages [ages])" - catch this specific pattern
    text = text.replace(/children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return `children (${token})`;
    });

    // Pattern: "our children (ages [ages])" - catch this specific pattern with "our"
    text = text.replace(/our\s+children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return `our children (${token})`;
    });

    // Pattern: "two children (ages [ages])" - catch this specific pattern with "two"
    text = text.replace(/two\s+children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return `two children (${token})`;
    });

    return text;
  }

  private anonymizeFamilyDetails(text: string): string {
    // Pattern: "ages [ages]" - catch the "ages 5 and 8" pattern FIRST
    // This is already handled in anonymizeAges, but we keep it here for safety
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return match.replace(ages, token);
    });

    // Pattern: "(ages [ages])" - catch ages in parentheses
    text = text.replace(/\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.anonymizationService.tokenizeAges(this.userId, ages);
      return `(${token})`;
    });

    // Pattern: "our children [names or processed ages]" - handle both cases LAST
    // But preserve Ages_ tokens that were already processed
    text = text.replace(/(?:our\s+)?children\s+\(([^)]+)\)/g, (match, children) => {
      // If children contains an Ages_ token, create a Children_ token that includes the ages
      if (children.includes('Ages_')) {
        const token = this.anonymizationService.tokenizeChildren(this.userId, children);
        return `children (${token})`;
      }
      const token = this.anonymizationService.tokenizeChildren(this.userId, children);
      return match.replace(children, token);
    });

    // Pattern: "two children [names or processed ages]" - handle both cases
    text = text.replace(/two\s+children\s+\(([^)]+)\)/g, (match, children) => {
      // If children contains an Ages_ token, create a Children_ token that includes the ages
      if (children.includes('Ages_')) {
        const token = this.anonymizationService.tokenizeChildren(this.userId, children);
        return `two children (${token})`;
      }
      const token = this.anonymizationService.tokenizeChildren(this.userId, children);
      return match.replace(children, token);
    });

    return text;
  }

  /**
   * Get tokenization map (deprecated - tokens are now stored in AnonymizationService)
   * Returns empty map for backward compatibility
   */
  getTokenizationMap(): Map<string, string> {
    return new Map(); // Tokens are now stored in AnonymizationService session maps
  }
}
