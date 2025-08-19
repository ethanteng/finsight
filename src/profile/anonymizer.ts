import { tokenizeInstitution } from '../privacy';

interface ProfileAnonymizationResult {
  anonymizedProfile: string;
  tokenizationMap: Map<string, string>;
  originalProfile: string;
}

export class ProfileAnonymizer {
  private tokenizationMap: Map<string, string> = new Map();
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
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
      tokenizationMap: new Map(this.tokenizationMap),
      originalProfile: profileText
    };
  }

  private anonymizeNames(text: string): string {
    // Pattern: "I am [Name], a [age]-year-old..."
    text = text.replace(/(?:I am|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, (match, name) => {
      const token = this.getOrCreateToken(`PERSON_${name}`, 'person');
      return match.replace(name, token);
    });

    // Pattern: "my husband [Name]", "my wife [Name]", "my spouse [Name]" - case-insensitive
    text = text.replace(/my\s+wife\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.getOrCreateToken(`SPOUSE_${name}`, 'spouse');
      return match.replace(name, token);
    });
    
    text = text.replace(/my\s+husband\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.getOrCreateToken(`SPOUSE_${name}`, 'spouse');
      return match.replace(name, token);
    });
    
    text = text.replace(/my\s+spouse\s+([A-Z][a-z]+)/gi, (match, name) => {
      const token = this.getOrCreateToken(`SPOUSE_${name}`, 'spouse');
      return match.replace(name, token);
    });

    // Pattern: "[Name] earning" - catch spouse income patterns
    text = text.replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+earning/g, (match, name) => {
      const token = this.getOrCreateToken(`SPOUSE_${name}`, 'spouse');
      return match.replace(name, token);
    });

    return text;
  }

  private anonymizeIncome(text: string): string {
    // Pattern: "income is $[amount] annually" - more specific to avoid conflicts with general amount anonymization
    text = text.replace(/income\s+is\s+\$([0-9,]+(?:\.\d{2})?)\s+annually/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(`$${amount}`, token);
    });

    // Pattern: "earning $[amount] as a" - more specific to avoid conflicts
    text = text.replace(/earning\s+\$([0-9,]+(?:\.\d{2})?)\s+as\s+a/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(`$${amount}`, token);
    });

    // Pattern: "[Name] earning $[amount]" - catch spouse income patterns
    text = text.replace(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, name, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(`$${amount}`, token);
    });

    // Pattern: "me earning $[amount]" - catch first person income
    text = text.replace(/me\s+earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(`$${amount}`, token);
    });

    // Pattern: "earning $[amount]" - catch any earning pattern
    text = text.replace(/earning\s+\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`INCOME_${numAmount}`, 'income');
      return match.replace(`$${amount}`, token);
    });

    return text;
  }

  private anonymizeGoals(text: string): string {
    // Pattern: "$[amount] target" or "$[amount] emergency fund" - more specific
    text = text.replace(/\$([0-9,]+(?:\.\d{2})?)\s+(?:target|emergency\s+fund|down\s+payment)/g, (match, amount) => {
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`GOAL_${numAmount}`, 'goal');
      return match.replace(`$${amount}`, token);
    });

    return text;
  }

  private anonymizeAmounts(text: string): string {
    // Pattern: "$[amount]" or "[amount] dollars" - but NOT if already processed by income or goals
    text = text.replace(/\$([0-9,]+(?:\.\d{2})?)/g, (match, amount) => {
      // Skip if this amount was already processed by income or goals
      if (text.includes(`INCOME_${parseFloat(amount.replace(/,/g, ''))}`) || 
          text.includes(`GOAL_${parseFloat(amount.replace(/,/g, ''))}`)) {
        return match;
      }
      
      const numAmount = parseFloat(amount.replace(/,/g, ''));
      const token = this.getOrCreateToken(`AMOUNT_${numAmount}`, 'amount');
      return match.replace(amount, token);
    });

    // Pattern: "[amount]% interest rate"
    text = text.replace(/(\d+(?:\.\d+)?)%\s+(?:interest\s+)?rate/g, (match, rate) => {
      const token = this.getOrCreateToken(`RATE_${rate}`, 'rate');
      return match.replace(rate, token);
    });

    return text;
  }

  private anonymizeLocations(text: string): string {
    // Pattern: "living in [City], [State]"
    text = text.replace(/living\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.getOrCreateToken(`LOCATION_${city}_${state}`, 'location');
      return match.replace(`${city}, ${state}`, token);
    });

    // Pattern: "in [City], [State]"
    text = text.replace(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/g, (match, city, state) => {
      const token = this.getOrCreateToken(`LOCATION_${city}_${state}`, 'location');
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
        const token = this.getOrCreateToken(`INSTITUTION_${institution}`, 'institution');
        return token;
      });
    });

    return text;
  }

  private anonymizeAges(text: string): string {
    // Pattern: "ages [ages]" - more specific and comprehensive
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return match.replace(ages, token);
    });

    // Pattern: "ages [ages]" - catch this pattern more broadly
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `ages ${token}`;
    });

    // Pattern: "ages [ages]" - catch this pattern specifically for children
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `ages ${token}`;
    });

    // Pattern: "ages [ages]" - catch this pattern more specifically
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `ages ${token}`;
    });

    // Pattern: "[age]-year-old" - more specific
    text = text.replace(/(\d+)-year-old/g, (match, age) => {
      const token = this.getOrCreateToken(`AGE_${age}`, 'age');
      return match.replace(age, token);
    });

    // Pattern: "([age], [profession])" - catch age in parentheses
    text = text.replace(/\((\d+),\s+([^)]+)\)/g, (match, age, profession) => {
      const ageToken = this.getOrCreateToken(`AGE_${age}`, 'age');
      return `(${ageToken}, ${profession})`;
    });

    // Pattern: "([age])" - catch standalone age in parentheses
    text = text.replace(/\((\d+)\)/g, (match, age) => {
      const token = this.getOrCreateToken(`AGE_${age}`, 'age');
      return `(${token})`;
    });

    // Pattern: "([age], [profession])" - catch age in parentheses with comma (more flexible)
    text = text.replace(/\((\d+),\s*([^)]+)\)/g, (match, age, profession) => {
      const ageToken = this.getOrCreateToken(`AGE_${age}`, 'age');
      return `(${ageToken}, ${profession})`;
    });

    // Pattern: "([age], [profession])" - catch age in parentheses with comma (alternative format)
    text = text.replace(/\((\d+),\s*([^)]+)\)/g, (match, age, profession) => {
      const ageToken = this.getOrCreateToken(`AGE_${age}`, 'age');
      return `(${ageToken}, ${profession})`;
    });

    // Pattern: "([age], [profession])" - catch age in parentheses with comma (more specific)
    text = text.replace(/\((\d+),\s*([^)]+)\)/g, (match, age, profession) => {
      const ageToken = this.getOrCreateToken(`AGE_${age}`, 'age');
      return `(${ageToken}, ${profession})`;
    });

    // Pattern: "ages [ages]" in parentheses - catch this pattern specifically
    text = text.replace(/\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `(${token})`;
    });

    // Pattern: "children (ages [ages])" - catch this specific pattern
    text = text.replace(/children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `children (${token})`;
    });

    // Pattern: "our children (ages [ages])" - catch this specific pattern with "our"
    text = text.replace(/our\s+children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `our children (${token})`;
    });

    // Pattern: "two children (ages [ages])" - catch this specific pattern with "two"
    text = text.replace(/two\s+children\s+\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `two children (${token})`;
    });

    return text;
  }

  private anonymizeFamilyDetails(text: string): string {
    // Pattern: "ages [ages]" - catch the "ages 5 and 8" pattern FIRST
    text = text.replace(/ages\s+(\d+(?:\s+and\s+\d+)?)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return match.replace(ages, token);
    });

    // Pattern: "(ages [ages])" - catch ages in parentheses
    text = text.replace(/\(ages\s+(\d+(?:\s+and\s+\d+)?)\)/g, (match, ages) => {
      const token = this.getOrCreateToken(`AGES_${ages}`, 'ages');
      return `(${token})`;
    });

    // Pattern: "our children [names or processed ages]" - handle both cases LAST
    // But preserve AGES_ tokens that were already processed
    text = text.replace(/(?:our\s+)?children\s+\(([^)]+)\)/g, (match, children) => {
      // If children contains an AGES_ token, create a CHILDREN_ token that includes the ages
      if (children.includes('AGES_')) {
        const token = this.getOrCreateToken(`CHILDREN_${children}`, 'children');
        return `children (${token})`;
      }
      const token = this.getOrCreateToken(`CHILDREN_${children}`, 'children');
      return match.replace(children, token);
    });

    // Pattern: "two children [names or processed ages]" - handle both cases
    text = text.replace(/two\s+children\s+\(([^)]+)\)/g, (match, children) => {
      // If children contains an AGES_ token, create a CHILDREN_ token that includes the ages
      if (children.includes('AGES_')) {
        const token = this.getOrCreateToken(`CHILDREN_${children}`, 'children');
        return `two children (${token})`;
      }
      const token = this.getOrCreateToken(`CHILDREN_${children}`, 'children');
      return match.replace(children, token);
    });

    return text;
  }

  private getOrCreateToken(original: string, type: string): string {
    if (this.tokenizationMap.has(original)) {
      return this.tokenizationMap.get(original)!;
    }

    const token = `${type.toUpperCase()}_${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.tokenizationMap.set(original, token);
    return token;
  }

  getTokenizationMap(): Map<string, string> {
    return new Map(this.tokenizationMap);
  }
}
