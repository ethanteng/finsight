import dotenv from 'dotenv';

// Load environment variables first, before importing anything else
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Now import the orchestrator after environment variables are loaded
import { getDataOrchestrator } from '../src/data/orchestrator';
import { UserTier } from '../src/data/types';

async function testProductionRAG() {
  console.log('🔍 Testing RAG system in production-like environment...');
  console.log('🔍 Environment variables:');
  console.log('🔍 SEARCH_API_KEY:', process.env.SEARCH_API_KEY ? 'SET' : 'NOT SET');
  console.log('🔍 SEARCH_PROVIDER:', process.env.SEARCH_PROVIDER || 'brave (default)');
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

testProductionRAG(); 