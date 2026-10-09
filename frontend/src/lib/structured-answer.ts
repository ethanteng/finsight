import type { DisplayKeyNumber } from './formatKeyNumber';
import type { DisplayInputRequest } from './input-request';

export interface DisplayStructuredResponse {
  summary: string;
  key_numbers?: Record<string, DisplayKeyNumber | number>;
  insights?: string[];
  suggested_actions?: string[];
  /** Figures a calculator is waiting on, as a form under the answer. Server-set. */
  input_request?: DisplayInputRequest;
}

export interface StructuredPromptHistory {
  id: string;
  question: string;
  answer: string;
  structuredResponse?: DisplayStructuredResponse | null;
  threadId?: string | null;
  timestamp: number;
}
