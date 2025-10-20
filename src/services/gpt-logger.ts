import * as fs from 'fs';
import * as path from 'path';

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
  timestamp: Date;
}

/**
 * Log GPT context to persistent storage for debugging
 * Saves to /opt/render/project/src/logs on Render, or ./logs locally
 */
export async function logGPTContext(context: GPTContext): Promise<void> {
  try {
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
      metadata: {
        systemPromptLength: context.systemPrompt.length,
        conversationHistoryLength: context.conversationHistory.length,
        accountSummaryLength: context.accountSummary.length,
        transactionSummaryLength: context.transactionSummary.length,
        investmentSummaryLength: context.investmentSummary?.length || 0,
        marketContextSummaryLength: context.marketContextSummary?.length || 0,
        searchContextLength: context.searchContext?.length || 0,
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
    const files = fs.readdirSync(logDir)
      .filter(file => file.startsWith(`gpt-context-${userId}-`) && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(logDir, file),
        stat: fs.statSync(path.join(logDir, file)),
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Sort by modified time, newest first
    
    if (files.length === 0) {
      return null;
    }
    
    // Read and return the latest file
    const latestFile = files[0];
    const content = fs.readFileSync(latestFile.path, 'utf-8');
    return JSON.parse(content);
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

