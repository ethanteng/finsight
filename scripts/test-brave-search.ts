import { SearchProvider } from './src/data/providers/search';
import dotenv from 'dotenv';

async function testBraveSearch() {
  // Load environment variables
  dotenv.config();
  
  const apiKey = process.env.SEARCH_API_KEY;
  
  if (!apiKey) {
    console.error('❌ SEARCH_API_KEY not found in environment variables');
    console.log('Please add your Brave Search API key to your .env file');
    return;
  }

  console.log('🔍 Testing Brave Search API...');
  
  try {
    const searchProvider = new SearchProvider(apiKey, 'brave');
    
    const results = await searchProvider.search('current mortgage rates 2024', {
      maxResults: 5,
      timeRange: 'day'
    });

    console.log('✅ Brave Search API is working!');
    console.log(`📊 Found ${results.length} results:`);
    
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   ${result.snippet.substring(0, 100)}...`);
      console.log(`   Source: ${result.source}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Brave Search API test failed:', error);
    console.log('Please check your API key and try again');
  }
}

testBraveSearch(); 