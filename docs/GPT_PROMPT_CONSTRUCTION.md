# GPT Prompt Construction Documentation

## Overview

This document explains how the GPT prompt is constructed in the Finsight system. The system uses a sophisticated, multi-layered prompt construction approach that dynamically builds context-aware prompts for financial analysis. The AI persona is "Linc" - an AI-powered financial analyst.

## Prompt Structure & Sections

The prompt is built in several distinct sections, assembled in this specific order:

### 1. Real-Time Financial Data (Conditional)
- **When**: Only for Standard/Premium tier users
- **Content**: Search results from real-time financial APIs
- **Format**: Wrapped in `=== REAL-TIME FINANCIAL DATA ===` markers
- **Purpose**: Provides current rates, prices, and market information
- **Source**: External search APIs (Brave Search, etc.)
- **Example**:
```
=== REAL-TIME FINANCIAL DATA ===
Current CD rates: 1-year: 5.25%, 2-year: 5.15%, 5-year: 4.85%
Mortgage rates: 30-year fixed: 7.12%, 15-year fixed: 6.45%
=== END REAL-TIME FINANCIAL DATA ===
```

### 2. Core AI Identity & Instructions
- **AI Name**: "Linc, an AI-powered financial analyst"
- **Primary Role**: Help users understand finances through account data analysis
- **Tone**: Professional but conversational, focused on actionable insights
- **Source**: Hardcoded in `buildEnhancedSystemPrompt()` function

### 3. Conversation Context Instructions
- **Purpose**: Build context across multiple conversation turns
- **Behavior**: Proactively connect new information to previous questions
- **Example**: If user asked about portfolio analysis earlier and now provides age, immediately offer complete age-appropriate analysis
- **Source**: Hardcoded in the system prompt builder
- **Key Instructions**:
  - Analyze conversation history to build context across multiple turns
  - When user provides new information (age, income, goals), immediately connect to previous questions
  - Proactively offer to complete previous incomplete analyses
  - Build comprehensive insights by combining information across conversation turns

### 4. User Profile (Conditional)
- **When**: Only for authenticated users (not demo mode)
- **Content**: Natural language profile built from conversations
- **Purpose**: Personalize advice based on personal situation, family status, occupation, financial goals
- **Source**: AI-extracted from previous conversations and Plaid data
- **Example**:
```
USER PROFILE:
I am 35 years old with 2 children. I work as a software engineer earning $120k annually. 
My financial goals include saving for college and retirement. I have moderate risk tolerance.
```

### 5. Financial Data Section
- **Accounts**: List of all accounts with balances and types
- **Recent Transactions**: Last 50 transactions with merchant names, categories, amounts, dates
- **Investment Data**: Portfolio overview, asset allocation, holdings (Premium tier only)
- **Source**: Plaid API or demo data
- **Format**:
```
USER'S FINANCIAL DATA:
Accounts:
- Chase Checking (checking/checking): $2,450.75
- Chase Savings (depository/savings): $15,200.00
- Chase Credit Card (credit/credit card): $1,245.50

Recent Transactions:
- Starbucks (Food and Drink): -$4.75 on 2025-01-15
- Amazon (Shopping): -$89.99 on 2025-01-14
```

### 6. Critical Data Interpretation Rules
- **Credit Card Rules**: Balance vs. credit limit clarification
- **Account Type Rules**: How to interpret different account balances
- **Debt Analysis Rules**: Proper debt calculation methods
- **Source**: Hardcoded business logic
- **Key Rules**:
  - Credit card "balance" = outstanding balance (money owed), NOT credit limit
  - Checking/savings "balance" = available balance (money you have)
  - Never assume credit limits without explicit data
  - Never say "maxed out" without credit limit verification

### 7. User Tier Information
- **Current Tier**: Starter/Standard/Premium
- **Available Data Sources**: What the user can access
- **Unavailable Sources**: What requires upgrade
- **Source**: Tier system configuration
- **Example**:
```
USER TIER: STANDARD

AVAILABLE DATA SOURCES:
• Account data
• Market context
• Real-time search

UNAVAILABLE DATA SOURCES (upgrade to access):
• Investment portfolio analysis
• Advanced market indicators
```

### 8. Market Context (Conditional)
- **Economic Indicators**: CPI, Fed rates, mortgage rates, credit card APRs
- **Live Market Data**: CD rates, treasury yields, current mortgage rates
- **Source**: FRED API, Alpha Vantage, market data aggregators
- **Example**:
```
MARKET CONTEXT:
Economic Indicators:
- CPI Index: 3.1% (2025-01-15)
- Fed Funds Rate: 5.50%
- Average 30-year Mortgage Rate: 7.12%
- Average Credit Card APR: 24.59%
```

### 9. Response Formatting Guidelines
- **Markdown**: Use ## for headers, bullet points for lists
- **Lists**: Keep bullet/number and text on same line
- **Style**: Clean, professional, conversational
- **Source**: Hardcoded formatting rules
- **Formatting Rules**:
  - Use bullet points (- ) for lists, keeping bullet and text on same line
  - Use numbered lists (1. 2. 3.) for steps or rankings
  - Use ## for section headers
  - Keep paragraphs concise with single line breaks between them
  - Format numbers and percentages clearly
  - Make the response clean and professional

## Data Sources & Flow

### Primary Data Sources
1. **Plaid API**: Account balances, transactions, investments
2. **FRED API**: Economic indicators and rates
3. **Alpha Vantage**: Market data and financial metrics
4. **Search APIs**: Real-time financial information
5. **User Conversations**: Profile building and context

### Data Processing Pipeline
1. **Raw Data Collection**: From various APIs
2. **Tier Filtering**: Based on user subscription level
3. **Data Enhancement**: Enriched transaction data, profile building
4. **Context Building**: Market context, search results
5. **Prompt Assembly**: Dynamic prompt construction
6. **AI Processing**: OpenAI API call with assembled prompt

### Data Flow Diagram
```
User Question → Tier Detection → Data Collection → Context Building → Prompt Assembly → OpenAI API → Response
     ↓              ↓              ↓              ↓              ↓              ↓
  Question    User Tier    Plaid/APIs    Market Data    System    GPT-4o    Formatted
  String      Level        Data          + Search       Prompt    Response  Answer
```

## Configuration Options

### Currently Configurable (Environment Variables)
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o                    # Default: gpt-4o
OPENAI_TEMPERATURE=0.7                 # Default: 0.7
OPENAI_MAX_TOKENS=1000                 # Default: 1000

# Tier System
ENABLE_TIER_ENFORCEMENT=true
TEST_USER_TIER=starter

# Data Source API Keys
FRED_API_KEY=your_fred_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
SEARCH_API_KEY=your_search_key
```

### Hardcoded Values (Require Code Changes)
- **AI Persona**: "Linc" identity and role
- **Tone**: Professional but conversational style
- **Response Formatting**: Markdown structure and list formatting
- **Data Interpretation Rules**: Business logic for financial analysis
- **Conversation Context Instructions**: How to build context across turns

## Customization Guide

### Option 1: Environment Variables (Easy)
Add these to your `.env` file for quick adjustments:
```bash
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=1000
```

### Option 2: Code Changes (More Control)
To change the AI persona, modify the `buildEnhancedSystemPrompt` function in `src/openai.ts`:

```typescript
// Current:
systemPrompt += `You are Linc, an AI-powered financial analyst...`;

// Change to:
systemPrompt += `You are [YOUR_PERSONA], a [YOUR_DESCRIPTION]...`;
```

### Option 3: Dynamic Configuration (Advanced)
Create a configuration system that allows you to:
- Switch between different AI personas
- Adjust tone (formal, casual, friendly, etc.)
- Modify response formatting preferences
- Change conversation context behavior

## Current AI Characteristics

- **Name**: Linc
- **Role**: Financial analyst
- **Tone**: Professional but conversational
- **Focus**: Actionable financial insights
- **Style**: Data-driven with personalization
- **Formatting**: Clean markdown with structured lists
- **Context**: Builds understanding across conversations
- **Temperature**: 0.7 (moderate creativity)
- **Model**: GPT-4o (default)

## Code Locations

### Main Functions
- **`buildEnhancedSystemPrompt()`**: Main prompt builder in `src/openai.ts`
- **`buildTierAwareSystemPrompt()`**: Alternative prompt builder
- **`askOpenAIWithEnhancedContext()`**: Enhanced OpenAI integration
- **`askOpenAI()`**: Standard OpenAI integration

### Key Files
- `src/openai.ts`: Main prompt construction logic
- `src/profile/manager.ts`: User profile management
- `src/data/orchestrator.ts`: Data source orchestration
- `src/market-news/manager.ts`: Market context management

## Testing & Debugging

### Logging
The system provides extensive logging for prompt construction:
```typescript
console.log('OpenAI: System prompt length:', systemPrompt.length);
console.log('OpenAI: System prompt preview:', systemPrompt.substring(0, 500));
```

### Prompt Inspection
To inspect the final prompt, check the console logs when making API calls. The system logs:
- Prompt length
- Prompt preview (first 500 characters)
- Data availability
- Tier information
- Context building opportunities

## Future Enhancement Ideas

### 1. Configurable AI Personas
- Multiple personality options
- Tone adjustment controls
- Style switching capabilities

### 2. Dynamic Prompt Templates
- Template-based prompt construction
- A/B testing for different prompt styles
- User preference-based customization

### 3. Advanced Context Management
- Semantic context building
- User behavior analysis
- Predictive context generation

### 4. Response Quality Metrics
- User satisfaction tracking
- Response accuracy measurement
- Continuous prompt optimization

## Troubleshooting

### Common Issues
1. **Prompt too long**: Reduce `max_tokens` or trim data sources
2. **Inconsistent responses**: Adjust temperature setting
3. **Missing context**: Check data source availability
4. **Formatting issues**: Verify markdown formatting rules

### Debug Steps
1. Check console logs for prompt construction
2. Verify data source availability
3. Confirm tier configuration
4. Test with different models/temperatures

---

*This document provides a comprehensive overview of the GPT prompt construction system. For implementation details, refer to the source code in `src/openai.ts` and related files.*
