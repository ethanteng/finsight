/**
 * Security incident logging for GPT layer.
 * Logs rejected prompts, flagged outputs, and policy violations.
 * Logs are stored separately from GPT context - never exposed to LLM.
 * Uses same log dir and file persistence approach as gpt-logger.
 */

import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';

export interface RejectedPromptLog {
  type: 'rejected_prompt';
  input: string;
  reason: string;
  userId?: string;
  sessionId?: string;
  timestamp: string;
}

export interface FlaggedOutputLog {
  type: 'flagged_output';
  outputPreview: string;
  reason: string;
  userId?: string;
  timestamp: string;
}

export interface PolicyViolationLog {
  type: 'policy_violation';
  userId?: string;
  sessionId?: string;
  violationCount: number;
  timestamp: string;
}

type SecurityLogEntry = RejectedPromptLog | FlaggedOutputLog | PolicyViolationLog;

function getLogDir(): string {
  return process.env.NODE_ENV === 'production'
    ? '/opt/render/project/src/logs'
    : path.join(process.cwd(), 'logs');
}

function getIdentifier(entry: SecurityLogEntry): string {
  if ('userId' in entry && entry.userId) return entry.userId;
  if ('sessionId' in entry && entry.sessionId) return entry.sessionId;
  return 'anonymous';
}

async function cleanupOldLogs(logDir: string, identifier: string, keepCount: number = 100): Promise<void> {
  try {
    const files = fs.readdirSync(logDir)
      .filter(file => file.startsWith(`security-incident-${identifier}-`) && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(logDir, file),
        stat: fs.statSync(path.join(logDir, file)),
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`Security Logger: Deleted old log file ${file.name}`);
      }
    }
  } catch (error) {
    console.error('Security Logger: Error cleaning up old logs:', error);
  }
}

function writeLog(entry: SecurityLogEntry): void {
  try {
    const logDir = getLogDir();
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`Security Logger: Created log directory at ${logDir}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const identifier = getIdentifier(entry);
    const filename = `security-incident-${identifier}-${timestamp}.json`;
    const filepath = path.join(logDir, filename);

    console.log(`Security Logger: Saving incident for ${identifier}`);

    fs.writeFileSync(filepath, JSON.stringify(entry, null, 2), 'utf8');
    console.log(`Security Logger: Saved incident to ${filepath}`);

    void cleanupOldLogs(logDir, identifier);
  } catch (error) {
    console.error('Security Logger: Error writing log:', error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Log a rejected user prompt (blocked before reaching LLM).
 */
export function logRejectedPrompt(
  input: string,
  reason: string,
  options?: { userId?: string; sessionId?: string }
): void {
  const entry: RejectedPromptLog = {
    type: 'rejected_prompt',
    input: input.substring(0, 500), // Truncate to avoid huge logs
    reason,
    userId: options?.userId,
    sessionId: options?.sessionId,
    timestamp: new Date().toISOString(),
  };
  writeLog(entry);
  Sentry.addBreadcrumb({
    category: 'security',
    message: 'Rejected prompt',
    level: 'warning',
    data: { hasUserId: !!options?.userId },
  });
}

/**
 * Log a flagged LLM output (sanitized before returning to user).
 */
export function logFlaggedOutput(
  output: string,
  reason: string,
  options?: { userId?: string }
): void {
  const entry: FlaggedOutputLog = {
    type: 'flagged_output',
    outputPreview: output.substring(0, 300), // Truncate
    reason,
    userId: options?.userId,
    timestamp: new Date().toISOString(),
  };
  writeLog(entry);
  Sentry.captureMessage('Flagged LLM output', {
    level: 'warning',
    tags: { security: 'llm_output_filter' },
  });
}

/**
 * Log repeated policy violation attempts (abuse detection).
 */
export function logPolicyViolationAttempt(
  options: { userId?: string; sessionId?: string; count: number }
): void {
  const entry: PolicyViolationLog = {
    type: 'policy_violation',
    userId: options.userId,
    sessionId: options.sessionId,
    violationCount: options.count,
    timestamp: new Date().toISOString(),
  };
  writeLog(entry);
  if (options.count >= 3) {
    Sentry.captureMessage(`Repeated policy violations: ${options.count}`, {
      level: 'warning',
      tags: { security: 'policy_violation' },
    });
  }
}
