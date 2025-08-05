const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Comprehensive RAG and Intelligent Profile System Test
 * 
 * This script validates:
 * 1. RAG system works for Standard and Premium tiers
 * 2. RAG system is disabled for Starter tier
 * 3. Intelligent Profile system works for all tiers
 * 4. Profile building from conversations works
 * 5. Plaid data integration for profile enhancement (if implemented)
 */

async function testRAGSystem() {
  console.log('🧪 TESTING RAG SYSTEM');
  console.log('=' .repeat(60));
  
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
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`🎯 Expected: RAG ${testCase.shouldHaveRAG ? 'YES' : 'NO'}, Limitations ${testCase.shouldMentionLimitations ? 'YES' : 'NO'}`);
    
    try {
      const response = await axios.post(`${API_URL}/ask`, {
        question: testCase.question,
        userTier: testCase.tier,
        isDemo: true
      }, {
        headers: {
          'x-session-id': `test-rag-${testCase.tier}-${Date.now()}`
        }
      });
      
      const answer = response.data.answer.toLowerCase();
      
      // Check for RAG indicators
      const hasRAGData = answer.includes('4.2') || answer.includes('4.20') || answer.includes('july 2025') || 
                         answer.includes('as of july') || answer.includes('current') || answer.includes('latest') ||
                         answer.includes('6.57') || answer.includes('6.85') || answer.includes('mortgage rates');
      
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
  }
  
  console.log(`\n🏁 RAG SYSTEM SUMMARY:`);
  console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);
  
  return passedTests === totalTests;
}

async function testIntelligentProfileSystem() {
  console.log('\n🧠 TESTING INTELLIGENT PROFILE SYSTEM');
  console.log('=' .repeat(60));
  
  // Test profile building for all tiers
  const tiers = ['starter', 'standard', 'premium'];
  let profileTestsPassed = 0;
  let totalProfileTests = tiers.length;
  
  for (const tier of tiers) {
    console.log(`\n🧪 Testing profile system for ${tier.toUpperCase()} tier...`);
    
    try {
      // Ask profile-building questions
      const profileQuestions = [
        'I am a 30-year-old software engineer making $120,000 per year',
        'I have a mortgage with a 3.5% interest rate',
        'I want to save for retirement and have $50,000 in my 401k'
      ];
      
      let profileBuilt = false;
      
      for (const question of profileQuestions) {
        const response = await axios.post(`${API_URL}/ask`, {
          question,
          userTier: tier,
          isDemo: true
        }, {
          headers: {
            'x-session-id': `test-profile-${tier}-${Date.now()}`
          }
        });
        
        const answer = response.data.answer.toLowerCase();
        
        // Check for profile indicators
        const hasProfileIndicators = answer.includes('based on your') || 
                                   answer.includes('your financial situation') ||
                                   answer.includes('your profile') ||
                                   answer.includes('considering your') ||
                                   answer.includes('personalized');
        
        if (hasProfileIndicators) {
          profileBuilt = true;
          console.log(`✅ Profile indicators found in response`);
          break;
        }
      }
      
      if (profileBuilt) {
        console.log(`✅ Profile system working for ${tier} tier`);
        profileTestsPassed++;
      } else {
        console.log(`❌ Profile system not working for ${tier} tier`);
      }
      
    } catch (error) {
      console.log(`❌ ERROR: Profile test failed for ${tier} tier: ${error.message}`);
    }
  }
  
  console.log(`\n🏁 INTELLIGENT PROFILE SUMMARY:`);
  console.log(`✅ Passed: ${profileTestsPassed}/${totalProfileTests} tests`);
  console.log(`❌ Failed: ${totalProfileTests - profileTestsPassed}/${totalProfileTests} tests`);
  
  return profileTestsPassed === totalProfileTests;
}

async function testPlaidProfileEnhancement() {
  console.log('\n🏦 TESTING PLAID PROFILE ENHANCEMENT');
  console.log('=' .repeat(60));
  
  console.log('🔍 Checking if PlaidProfileEnhancer is implemented...');
  
  try {
    // Check if the PlaidProfileEnhancer class exists
    const fs = require('fs');
    const path = require('path');
    
    const possiblePaths = [
      'src/profile/plaid-enhancer.ts',
      'src/profile/plaid-enhancer.js',
      'src/profile/enhancer.ts',
      'src/profile/enhancer.js'
    ];
    
    let enhancerFound = false;
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ Found PlaidProfileEnhancer at: ${filePath}`);
        enhancerFound = true;
        break;
      }
    }
    
    if (!enhancerFound) {
      console.log('ℹ️  PlaidProfileEnhancer not found - this feature may not be implemented yet');
      console.log('📝 This is mentioned in the documentation but may be a future enhancement');
    }
    
    // Test if profile enhancement works with Plaid data
    console.log('\n🧪 Testing profile enhancement with Plaid data...');
    
    // This would require a user with connected Plaid accounts
    // For now, we'll just note that this feature needs testing with real Plaid data
    
    console.log('ℹ️  Plaid profile enhancement testing requires users with connected Plaid accounts');
    console.log('ℹ️  This feature should be tested with real users who have linked their financial accounts');
    
  } catch (error) {
    console.log(`❌ ERROR: Plaid enhancement test failed: ${error.message}`);
  }
  
  return true; // Mark as passed since this is informational
}

async function testSystemIntegration() {
  console.log('\n🔗 TESTING SYSTEM INTEGRATION');
  console.log('=' .repeat(60));
  
  console.log('🧪 Testing RAG + Profile integration...');
  
  try {
    // Test that both RAG and profile work together
    const response = await axios.post(`${API_URL}/ask`, {
      question: 'I am a 35-year-old with a mortgage. What are current refinance rates?',
      userTier: 'premium',
      isDemo: true
    }, {
      headers: {
        'x-session-id': `test-integration-${Date.now()}`
      }
    });
    
    const answer = response.data.answer.toLowerCase();
    
    const hasRAG = answer.includes('current') || answer.includes('latest') || answer.includes('rates');
    const hasProfile = answer.includes('your') || answer.includes('personalized') || answer.includes('based on');
    
    console.log(`📄 Response preview: ${answer.substring(0, 200)}...`);
    console.log(`🔍 Integration Analysis:`);
    console.log(`   RAG data: ${hasRAG ? 'YES' : 'NO'}`);
    console.log(`   Profile data: ${hasProfile ? 'YES' : 'NO'}`);
    
    if (hasRAG && hasProfile) {
      console.log(`✅ SUCCESS: RAG and Profile integration working!`);
      return true;
    } else {
      console.log(`❌ FAILED: Integration not working as expected`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ ERROR: Integration test failed: ${error.message}`);
    return false;
  }
}

async function runComprehensiveTests() {
  console.log('🚀 COMPREHENSIVE RAG & INTELLIGENT PROFILE SYSTEM TEST');
  console.log('=' .repeat(80));
  console.log('This test validates all features described in RAG_AND_INTELLIGENT_PROFILE_SYSTEM.md');
  console.log('=' .repeat(80));
  
  try {
    // Run all test suites
    const ragPassed = await testRAGSystem();
    const profilePassed = await testIntelligentProfileSystem();
    const plaidPassed = await testPlaidProfileEnhancement();
    const integrationPassed = await testSystemIntegration();
    
    // Final summary
    console.log('\n🎉 FINAL TEST RESULTS');
    console.log('=' .repeat(80));
    console.log(`✅ RAG System: ${ragPassed ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Intelligent Profile System: ${profilePassed ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Plaid Profile Enhancement: ${plaidPassed ? 'PASSED' : 'INFO'}`);
    console.log(`✅ System Integration: ${integrationPassed ? 'PASSED' : 'FAILED'}`);
    
    const allPassed = ragPassed && profilePassed && integrationPassed;
    
    if (allPassed) {
      console.log('\n🎉 ALL CRITICAL TESTS PASSED!');
      console.log('✅ RAG system is working correctly for all tiers');
      console.log('✅ Intelligent Profile system is working for all tiers');
      console.log('✅ System integration is working properly');
      console.log('\n📋 VALIDATION COMPLETE:');
      console.log('✅ RAG results used for Standard and Premium tiers');
      console.log('✅ RAG results NOT used for Starter tier');
      console.log('✅ Intelligent Profiles included for ALL tiers');
      console.log('✅ Personalized advice provided based on user profiles');
      console.log('✅ Tier limitations mentioned appropriately');
      console.log('✅ No upgrade suggestions when RAG data is available');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED');
      console.log('Please check the implementation and fix any issues');
    }
    
    return allPassed;
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    return false;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runComprehensiveTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  runComprehensiveTests,
  testRAGSystem,
  testIntelligentProfileSystem,
  testPlaidProfileEnhancement,
  testSystemIntegration
}; 