const axios = require('axios');

/**
 * RAG System Verification Script
 * 
 * This script verifies that the RAG system is working correctly:
 * - Starter tier: Should mention limitations, no RAG data
 * - Standard tier: Should use RAG data, no limitations
 * - Premium tier: Should use RAG data, no limitations
 */
async function verifyRAGSystem() {
  console.log('🧪 RAG System Verification\n');
  
  const testCases = [
    {
      name: 'Starter Tier - No RAG Access',
      tier: 'starter',
      question: 'What is the current unemployment rate?',
      shouldHaveRAG: false,
      shouldMentionLimitations: true
    },
    {
      name: 'Standard Tier - RAG Access',
      tier: 'standard',
      question: 'What is the current unemployment rate?',
      shouldHaveRAG: true,
      shouldMentionLimitations: false
    },
    {
      name: 'Premium Tier - RAG Access',
      tier: 'premium',
      question: 'What are current mortgage rates?',
      shouldHaveRAG: true,
      shouldMentionLimitations: false
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`📋 Testing: ${testCase.name}`);
    console.log(`🎯 Expected: RAG ${testCase.shouldHaveRAG ? 'YES' : 'NO'}, Limitations ${testCase.shouldMentionLimitations ? 'YES' : 'NO'}`);
    
    try {
      const response = await axios.post('http://localhost:3000/ask', {
        question: testCase.question,
        userTier: testCase.tier,
        isDemo: true
      }, {
        headers: {
          'x-session-id': `verify-rag-${testCase.tier}-${Date.now()}`
        }
      });
      
      const answer = response.data.answer.toLowerCase();
      
      // Check for RAG indicators
      const hasRAGData = answer.includes('4.2') || answer.includes('4.20') || answer.includes('july 2025') || 
                         answer.includes('as of july') || answer.includes('current') || answer.includes('latest');
      
      // Check for limitations
      const mentionsLimitations = answer.includes('tier') || answer.includes('limitation') || 
                                 answer.includes('subscription') || answer.includes('upgrade') ||
                                 answer.includes('starter') || answer.includes('standard');
      
      const ragUsed = hasRAGData && !mentionsLimitations;
      const limitationsMentioned = mentionsLimitations;
      
      console.log(`📄 Response preview: ${answer.substring(0, 150)}...`);
      console.log(`🔍 Analysis:`);
      console.log(`   RAG used: ${ragUsed ? 'YES' : 'NO'}`);
      console.log(`   Mentions limitations: ${limitationsMentioned ? 'YES' : 'NO'}`);
      
      const ragCorrect = (ragUsed === testCase.shouldHaveRAG);
      const limitationsCorrect = (limitationsMentioned === testCase.shouldMentionLimitations);
      const testPassed = ragCorrect && limitationsCorrect;
      
      if (testPassed) {
        console.log(`🎉 SUCCESS: Test passed!`);
        passedTests++;
      } else {
        console.log(`❌ FAILED: Test did not meet expectations`);
        if (!ragCorrect) {
          console.log(`   - RAG: Expected ${testCase.shouldHaveRAG ? 'YES' : 'NO'}, got ${ragUsed ? 'YES' : 'NO'}`);
        }
        if (!limitationsCorrect) {
          console.log(`   - Limitations: Expected ${testCase.shouldMentionLimitations ? 'YES' : 'NO'}, got ${limitationsMentioned ? 'YES' : 'NO'}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ ERROR: Test failed: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  console.log(`🏁 VERIFICATION SUMMARY:`);
  console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);
  
  if (passedTests === totalTests) {
    console.log(`🎉 ALL TESTS PASSED! RAG system is working correctly.`);
    console.log(`\n✅ VERIFICATION COMPLETE:`);
    console.log(`✅ RAG results are used for Standard and Premium tiers`);
    console.log(`✅ RAG results are NOT used for Starter tier`);
    console.log(`✅ Tier limitations are mentioned appropriately`);
    console.log(`✅ No upgrade suggestions when RAG data is available`);
  } else {
    console.log(`⚠️  Some tests failed. RAG system needs attention.`);
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyRAGSystem().catch(console.error);
}

module.exports = { verifyRAGSystem }; 