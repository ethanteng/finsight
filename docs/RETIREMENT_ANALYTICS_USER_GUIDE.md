# Retirement Portfolio Analysis - User Guide

This guide explains how end users interact with the Retirement Portfolio Analysis feature in Ask Linc.

## ⚠️ Implementation Status

**Current State**: The retirement analysis module is fully implemented and can be called directly via API. However, **automatic integration with Ask Linc conversations is not yet complete**. 

**What Works Now**:
- ✅ Direct API endpoint: `/api/ai/retirement-analysis`
- ✅ Standalone analysis function
- ✅ LLM prompt formatting (ready to use)

**What Needs Integration**:
- ⚠️ Automatic triggering from retirement questions
- ⚠️ Storing results in database
- ⚠️ Including analysis in context snapshot for LLM

**This guide describes the intended user experience once fully integrated.**

## Overview

The Retirement Portfolio Analysis feature helps users understand how their current investment portfolio might perform during retirement withdrawal periods, based on historical market patterns. It's designed to be **informational and educational**, not prescriptive financial advice.

## Prerequisites

Before using this feature, users need:

1. **Investment Accounts Connected**: Users must have investment accounts linked via Plaid or SnapTrade
2. **Holdings Data**: The accounts must have actual holdings (stocks, ETFs, bonds, etc.)
3. **User Profile Information**: Age, retirement age (optional), and life expectancy (defaults to 95)

## How Users Access the Feature

### Option 1: Natural Language Questions (Recommended)

Users simply ask retirement-related questions to Ask Linc:

**Example Questions:**
- "How is my portfolio positioned for retirement?"
- "Will my current investments support a $100,000 annual withdrawal starting at age 68?"
- "What's my retirement readiness?"
- "Analyze my portfolio for retirement planning"
- "How risky is my portfolio for someone retiring in 20 years?"

**What Happens:**
1. User asks a retirement-related question
2. The semantic planner reads the complete active decision and selects retirement context
3. If user has investment holdings, system automatically runs retirement analysis
4. Analysis results are included in the AI's context
5. Linc provides a personalized explanation based on the analysis

### Option 2: Direct API Call (For Developers/Advanced Users)

Users can call the retirement analysis endpoint directly:

```bash
POST /api/ai/retirement-analysis
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json

{
  "currentAge": 48,
  "retirementAge": 68,
  "lifeExpectancy": 95,
  "annualWithdrawalAmount": 100000,
  "withdrawalStartAge": 68
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "characteristics": {...},
      "tradeoffs": {...},
      "primaryObservation": "...",
      "confidence": "high|medium|low"
    },
    "metrics": {...},
    "stressTest": {...},
    "dataQuality": {...},
    "disclaimers": [...]
  }
}
```

## User Flow Example

### Scenario: User wants to understand retirement readiness

**Step 1: User asks a question**
```
User: "I'm 48 years old and plan to retire at 68. I want to withdraw $100,000 per year. 
       How does my portfolio look for retirement?"
```

**Step 2: System processes the request**
- Extracts user inputs: age (48), retirement age (68), withdrawal amount ($100,000)
- Checks if user has investment holdings
- Runs retirement analysis automatically
- Includes analysis in AI context

**Step 3: Linc responds with analysis**
```
Linc: "Based on your current portfolio, here's what historical analysis shows:

Your portfolio's 75% equity allocation has historically delivered strong growth 
potential, with median inflation-adjusted returns of 4.8% annually across 
historical sequences. However, this allocation is sequence-sensitive given 
your 20-year withdrawal horizon.

Historical analysis across 420 rolling 20-year periods shows your portfolio 
would have sustained $100,000 annual withdrawals in 82% of sequences. In the 
worst 10% of historical periods, portfolio depletion occurred between years 
15 and 18 of withdrawals.

Key observations:
• Upside: Strong growth potential with historically high inflation protection
• Downside: Sequence-sensitive and historically fragile in upper tercile 
  relative to portfolios with similar equity allocations and horizon, 
  particularly when market declines occur early

Your 3.2% withdrawal rate falls within the historical range of sustainable 
rates for this allocation. Analysis shows that 3.2% withdrawals were 
sustainable in approximately 82% of 20-year historical sequences.

[Additional details about stress test results, data quality, disclaimers...]"
```

## What Users Need to Provide

### Required Information

1. **Current Age**: User's current age
   - Can be extracted from user profile
   - Or explicitly stated in the question

2. **Annual Withdrawal Amount**: How much they want to withdraw per year (in today's dollars)
   - Must be explicitly stated or asked by Linc
   - Example: "$100,000 per year"

3. **Withdrawal Start Age**: When withdrawals begin
   - Usually same as retirement age
   - Can be extracted from retirement age or explicitly stated

### Optional Information

1. **Retirement Age**: When user plans to retire
   - If not provided, system assumes user is already retired
   - Can be extracted from user profile or question

2. **Life Expectancy**: How long user expects to live
   - Defaults to 95 if not provided
   - Can be explicitly stated

## What Users Get Back

### 1. Portfolio Characteristics

Four descriptive characteristics:
- **Growth Potential**: High/Moderate/Low
- **Drawdown Resistance**: High/Moderate/Low  
- **Withdrawal Fragility**: High/Moderate/Low
- **Inflation Protection**: High/Moderate/Low

### 2. Tradeoffs

Every portfolio gets both:
- **Upside**: What this allocation historically provided
- **Downside**: What this allocation historically lacked or risked

### 3. Key Metrics

- **Equity Allocation**: Percentage of portfolio in stocks
- **Withdrawal Rate**: Annual withdrawal as % of portfolio
- **Years of Expenses**: How many years portfolio could cover expenses
- **Historical Sustainable Withdrawal Rates**: Percentiles (10th, 25th, 50th, 75th, 90th)

### 4. Stress Test Results

- **Survival Rate**: % of historical sequences where portfolio sustained withdrawals
- **Depletion Percentiles**: Years until depletion at different percentiles
- **Worst Sequences**: Historical periods that were most challenging

### 5. Data Quality Information

- **Confidence Level**: High/Medium/Low
- **Completeness**: % of holdings with full data
- **Assumptions**: What proxies or inferences were used

## Important Limitations & Disclaimers

Users will see these disclaimers automatically:

1. **Past performance does not predict future results**
2. **Analysis assumes fixed real-dollar withdrawals** (adaptive strategies may improve outcomes)
3. **Portfolio mapped to broad market indices** (actual holdings may behave differently)
4. **Does not account for taxes, fees, or transaction costs**
5. **For informational purposes only** - not financial advice

## Integration with Ask Linc

### Current implementation

Retirement analysis is automatically available through Ask Linc's semantic context planner. The planner reads the complete active Q&A decision, so follow-ups such as “what if I wait two more years?” can retain the retirement meaning without repeating a particular word. It also reads short answers in the context of the assistant question they answer.

When selected, the retirement pack brings its investment, profile, and market dependencies. The primary analysis model performs a second constrained pack audit before it answers. If required user inputs or investment holdings are unavailable, Linc asks for the missing information instead of estimating it.

### Contextual Responses

Linc uses the analysis to provide:
- **Personalized insights** based on user's actual portfolio
- **Historical context** without making predictions
- **Tradeoff explanations** (upside + downside)
- **Data quality awareness** (confidence levels, assumptions)

## Example Conversations

### Example 1: First-Time User

```
User: "I'm 45 and want to retire at 65. Can I withdraw $80,000 per year?"

Linc: "I'll analyze your portfolio for retirement planning. To provide the most 
       accurate analysis, I need to know:
       
       1. Your current age: 45 ✓
       2. Retirement age: 65 ✓
       3. Annual withdrawal amount: $80,000 ✓
       4. When withdrawals start: Assuming 65 ✓
       
       [Runs analysis automatically]
       
       Based on your current portfolio, here's what historical analysis shows:
       [Provides detailed analysis]"
```

### Example 2: Follow-Up Question

```
User: "What if I reduce my withdrawal to $60,000?"

Linc: "Let me re-analyze with a $60,000 annual withdrawal...
       [Runs new analysis]
       
       With a lower withdrawal rate of 2.4%, historical analysis shows..."
```

### Example 3: Already Retired User

```
User: "I'm already retired at 68. I'm withdrawing $50,000 per year. 
       How does my portfolio look?"

Linc: "Since you're already retired, I'll analyze your portfolio for the 
       withdrawal phase...
       [Runs analysis with withdrawalStartAge = 68]
       
       Your portfolio shows..."
```

## Data Privacy & Security

- **Analysis is user-specific**: Only analyzes the authenticated user's holdings
- **Results are cached**: Stored in `retirement_analyses` table (user-scoped)
- **No external sharing**: Analysis results are never shared with third parties
- **Secure storage**: All data encrypted at rest

## Troubleshooting for Users

### "I don't have investment accounts"
**Solution**: Connect investment accounts via Plaid or SnapTrade first

### "Analysis says 'No holdings found'"
**Solution**: 
- Ensure investment accounts are connected
- Wait for account sync to complete
- Check that accounts have actual holdings (not just cash)

### "Analysis confidence is low"
**Solution**: 
- Some holdings may not have complete metadata
- System will use proxies/inferences
- Check disclaimers for specific assumptions

### "Analysis takes a long time"
**Solution**: 
- First run: 30-60 seconds (fetching historical data)
- Subsequent runs: 5-10 seconds (uses cache)
- This is normal behavior

## Best Practices for Users

1. **Be specific**: Provide exact withdrawal amounts and ages
2. **Update regularly**: Re-run analysis when portfolio changes significantly
3. **Understand limitations**: Read disclaimers and data quality information
4. **Ask follow-ups**: Use Linc's conversational interface to explore different scenarios
5. **Review assumptions**: Check what proxies/inferences were used

## Next Steps

After getting retirement analysis:

1. **Explore scenarios**: Ask "What if I retire earlier?" or "What if I withdraw more?"
2. **Understand tradeoffs**: Ask Linc to explain the upside/downside in more detail
3. **Review data quality**: Check confidence levels and assumptions
4. **Compare allocations**: Ask about different equity allocation patterns
5. **Plan adjustments**: Use insights to inform (not dictate) portfolio decisions

## Support

If users encounter issues:
- Check that investment accounts are connected
- Verify holdings data is available
- Review error messages in Linc's response
- Contact support if analysis consistently fails
