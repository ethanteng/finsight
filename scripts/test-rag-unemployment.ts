import { getDataOrchestrator } from '../src/data/orchestrator';
import { UserTier } from '../src/data/types';
import dotenv from 'dotenv';

async function testRAGUnemployment() {
  // Load environment variables from .env.local first, then .env
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
  
  console.log('🔍 Testing RAG system with unemployment rate query...');
  console.log('🔍 Environment variables:');
  console.log('🔍 SEARCH_API_KEY:', process.env.SEARCH_API_KEY ? 'SET' : 'NOT SET');
  console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
  
  try {
    // Get the orchestrator after environment variables are loaded
    const dataOrchestrator = getDataOrchestrator();
    
    // Test with Premium tier (should have search context access)
    const searchContext = await dataOrchestrator.getSearchContext(
      'What is the current unemployment rate?',
      UserTier.PREMIUM,
      false
    );

    if (searchContext) {
      console.log('✅ RAG system is working!');
      console.log(`📊 Found ${searchContext.results.length} results:`);
      console.log('📝 Summary:', searchContext.summary);
      
      searchContext.results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title}`);
        console.log(`   ${result.snippet.substring(0, 100)}...`);
        console.log(`   Source: ${result.source}`);
        console.log('');
      });
    } else {
      console.log('❌ No search context returned');
    }

  } catch (error) {
    console.error('❌ RAG system test failed:', error);
  }
}

testRAGUnemployment(); 