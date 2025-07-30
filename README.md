# Finsight - AI-Powered Financial Analysis

## Cost Optimization for OpenAI API

### Test vs Production Model Selection

To optimize costs, we use different OpenAI models for different environments:

- **Production (`/app`, `/demo`)**: Uses `gpt-4o` for best quality
- **Tests**: Uses `gpt-3.5-turbo` for cost efficiency

### Environment Variables

Set these environment variables to control model selection:

```bash
# For production (default: gpt-4o)
OPENAI_MODEL=gpt-4o

# For tests (default: gpt-3.5-turbo)
OPENAI_MODEL=gpt-3.5-turbo
```

### Cost Comparison

| Model | Input Cost | Output Cost | Use Case |
|-------|------------|-------------|----------|
| gpt-4o | $5.00/1M tokens | $15.00/1M tokens | Production endpoints |
| gpt-3.5-turbo | $0.50/1M tokens | $1.50/1M tokens | Tests |

**Savings**: Using gpt-3.5-turbo for tests reduces costs by ~90% while maintaining test coverage.

### Usage

- **Production code**: Uses `askOpenAI()` function (defaults to gpt-4o)
- **Test code**: Uses `askOpenAIForTests()` function (uses gpt-3.5-turbo)

This setup ensures high-quality responses for users while keeping test costs minimal.
