/** Expected request rejection with a safe message for the user. */
export class PromptValidationError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
    public readonly userMessage: string = message
  ) {
    super(message);
    this.name = 'PromptValidationError';
  }
}
