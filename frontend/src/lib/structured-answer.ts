import type { DisplayKeyNumber } from './formatKeyNumber';

export interface DisplayStructuredResponse {
  summary: string;
  key_numbers?: Record<string, DisplayKeyNumber | number>;
  insights?: string[];
  suggested_actions?: string[];
}

export interface StructuredPromptHistory {
  id: string;
  question: string;
  answer: string;
  structuredResponse?: DisplayStructuredResponse | null;
  threadId?: string | null;
  timestamp: number;
}
