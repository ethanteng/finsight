import * as fs from 'fs';
import * as path from 'path';

interface CategorizationDetail {
  transaction: {
    id: string;
    name: string;
    amount: number;
    date: string;
    category: string[];
    category_id?: string;
    personal_finance_category: { primary: string; detailed: string } | null;
    payment_channel?: string;
    merchant_name?: string;
    iso_currency_code?: string;
    pending?: boolean;
  };
  account: {
    account_id: string;
    type: string;
    subtype?: string;
    name: string;
  };
  categorization: {
    transaction_type: string;
    confidence: number;
    method: 'gpt' | 'plaid';
    reason?: string;
  };
}

interface CategorizationDetails {
  transactions: CategorizationDetail[];
  summary: {
    total: number;
    gptCategorized: number;
    plaidFallback: number;
    averageConfidence: number;
  };
}

interface GPTContext {
  userId?: string;
  question: string;
  systemPrompt: string;
  conversationHistory: any[];
  accountSummary: string;
  transactionSummary: string;
  investmentSummary?: string;
  marketContextSummary?: string;
  searchContext?: string;
  categorizationDetails?: CategorizationDetails;
  timestamp: Date;
}

/**
 * Log GPT context to persistent storage for debugging
 * Saves to /opt/render/project/src/logs on Render, or ./logs locally
 */
export async function logGPTContext(context: GPTContext): Promise<void> {
  try {
    console.log('GPT Logger: logGPTContext called with userId:', context.userId);
    console.log('GPT Logger: userId type:', typeof context.userId, 'length:', context.userId?.length, 'contains dlf:', context.userId?.includes('dlf'), 'contains d1f:', context.userId?.includes('d1f'));
    
    // Determine log directory based on environment
    const logDir = process.env.NODE_ENV === 'production' 
      ? '/opt/render/project/src/logs'
      : path.join(process.cwd(), 'logs');
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`GPT Logger: Created log directory at ${logDir}`);
    }
    
    // Generate filename with timestamp
    const timestamp = context.timestamp.toISOString().replace(/[:.]/g, '-');
    const userId = context.userId || 'anonymous';
    const filename = `gpt-context-${userId}-${timestamp}.json`;
    const filepath = path.join(logDir, filename);
    
    console.log(`GPT Logger: Saving context for userId: ${userId}`);
    
    // Prepare context data
    const logData = {
      userId: context.userId,
      timestamp: context.timestamp.toISOString(),
      question: context.question,
      systemPrompt: context.systemPrompt,
      conversationHistory: context.conversationHistory.map(conv => ({
        question: conv.question,
        answer: conv.answer.substring(0, 500) + (conv.answer.length > 500 ? '...' : ''), // Truncate long answers
        createdAt: conv.createdAt,
      })),
      context: {
        accountSummary: context.accountSummary,
        transactionSummary: context.transactionSummary.substring(0, 2000) + (context.transactionSummary.length > 2000 ? '...' : ''),
        investmentSummary: context.investmentSummary?.substring(0, 2000) + (context.investmentSummary && context.investmentSummary.length > 2000 ? '...' : ''),
        marketContextSummary: context.marketContextSummary?.substring(0, 2000) + (context.marketContextSummary && context.marketContextSummary.length > 2000 ? '...' : ''),
        searchContext: context.searchContext?.substring(0, 2000) + (context.searchContext && context.searchContext.length > 2000 ? '...' : ''),
      },
      categorizationDetails: context.categorizationDetails || undefined,
      metadata: {
        systemPromptLength: context.systemPrompt.length,
        conversationHistoryLength: context.conversationHistory.length,
        accountSummaryLength: context.accountSummary.length,
        transactionSummaryLength: context.transactionSummary.length,
        investmentSummaryLength: context.investmentSummary?.length || 0,
        marketContextSummaryLength: context.marketContextSummary?.length || 0,
        searchContextLength: context.searchContext?.length || 0,
        categorizationDetailsLength: context.categorizationDetails ? context.categorizationDetails.transactions.length : 0,
      },
    };
    
    // Write to file
    fs.writeFileSync(filepath, JSON.stringify(logData, null, 2), 'utf-8');
    console.log(`GPT Logger: Saved context to ${filepath}`);
    
    // Cleanup old logs (keep last 100 per user)
    await cleanupOldLogs(logDir, userId);
  } catch (error) {
    console.error('GPT Logger: Error logging context:', error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Cleanup old log files, keeping only the last N files per user
 */
async function cleanupOldLogs(logDir: string, userId: string, keepCount: number = 100): Promise<void> {
  try {
    // Get all log files for this user
    const files = fs.readdirSync(logDir)
      .filter(file => file.startsWith(`gpt-context-${userId}-`) && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(logDir, file),
        stat: fs.statSync(path.join(logDir, file)),
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Sort by modified time, newest first
    
    // Delete old files if we have more than keepCount
    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`GPT Logger: Deleted old log file ${file.name}`);
      }
    }
  } catch (error) {
    console.error('GPT Logger: Error cleaning up old logs:', error);
  }
}

/**
 * Get the latest GPT context for a user
 * FIXED: Now sorts by timestamp in JSON content instead of file modification time
 */
export async function getLatestGPTContext(userId: string): Promise<any | null> {
  try {
    const logDir = process.env.NODE_ENV === 'production' 
      ? '/opt/render/project/src/logs'
      : path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logDir)) {
      return null;
    }
    
    // Get all log files for this user
    const allFiles = fs.readdirSync(logDir);
    console.log(`GPT Logger: All files in ${logDir}:`, allFiles);
    console.log(`GPT Logger: Looking for files matching: gpt-context-${userId}-*.json`);
    
    // Helper function to get timestamp from file (from JSON content or filename)
    const getFileTimestamp = (filePath: string, fileName: string): number => {
      try {
        // First try to read timestamp from JSON content (most reliable)
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.timestamp) {
          return new Date(parsed.timestamp).getTime();
        }
      } catch (e) {
        // If reading JSON fails, fall back to filename parsing
      }
      
      // Fallback: parse timestamp from filename (format: gpt-context-{userId}-{timestamp}.json)
      // Timestamp format in filename: YYYY-MM-DDTHH-MM-SS-MMMZ (ISO with colons/dots replaced by dashes)
      // FIXED: Use non-greedy match for userId and specific pattern for timestamp to handle userIds with dashes
      try {
        // Match: gpt-context-{userId}-{timestamp}.json
        // Group 1: userId (non-greedy, can contain dashes)
        // Group 2: timestamp (specific pattern starting with 4-digit year)
        const match = fileName.match(/^gpt-context-(.+?)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z?)\.json$/);
        if (match && match[2]) {
          // Convert filename timestamp back to ISO format
          // Replace dashes with colons/dots: YYYY-MM-DDTHH-MM-SS-MMMZ -> YYYY-MM-DDTHH:MM:SS.MMMZ
          const timestampStr = match[2].replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})(Z?)/, '$1:$2:$3.$4$5');
          const date = new Date(timestampStr);
          if (!isNaN(date.getTime())) {
            return date.getTime();
          }
        }
      } catch (e) {
        // If filename parsing fails, use file modification time as last resort
      }
      
      // Last resort: use file modification time
      return fs.statSync(filePath).mtime.getTime();
    };
    
    // First try exact match
    let files = allFiles
      .filter(file => file.startsWith(`gpt-context-${userId}-`) && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(logDir, file);
        return {
          name: file,
          path: filePath,
          timestamp: getFileTimestamp(filePath, file),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first
    
    console.log(`GPT Logger: Found ${files.length} matching files for user ${userId}`);
    
    // If no exact match and userId looks like it might have 1/l confusion, try fuzzy match
    if (files.length === 0 && (userId.includes('1') || userId.includes('l'))) {
      console.log('GPT Logger: Trying fuzzy match for potential 1/l confusion...');
      // Get all context files and return the most recent one
      files = allFiles
        .filter(file => file.startsWith('gpt-context-') && file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(logDir, file);
          return {
            name: file,
            path: filePath,
            timestamp: getFileTimestamp(filePath, file),
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first
      
      console.log(`GPT Logger: Fuzzy match found ${files.length} total context files`);
    }
    
    if (files.length === 0) {
      return null;
    }
    
    // Read and return the latest file (sorted by timestamp)
    const latestFile = files[0];
    const content = fs.readFileSync(latestFile.path, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Log the timestamp for debugging
    console.log(`GPT Logger: Returning context with timestamp: ${parsed.timestamp}`);
    
    return parsed;
  } catch (error) {
    console.error('GPT Logger: Error reading latest context:', error);
    return null;
  }
}

/**
 * Get a specific GPT context by ID (timestamp)
 */
export async function getGPTContextById(userId: string, contextId: string): Promise<any | null> {
  try {
    const logDir = process.env.NODE_ENV === 'production' 
      ? '/opt/render/project/src/logs'
      : path.join(process.cwd(), 'logs');
    
    const filename = `gpt-context-${userId}-${contextId}.json`;
    const filepath = path.join(logDir, filename);
    
    if (!fs.existsSync(filepath)) {
      return null;
    }
    
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('GPT Logger: Error reading context by ID:', error);
    return null;
  }
}

