async function testDeduplication() {
  const API_URL = 'http://localhost:3000';
  
  console.log('Testing account deduplication...\n');
  
  // Test accounts endpoint directly
  console.log('1. Testing accounts endpoint...');
  const accountsResponse = await fetch(`${API_URL}/plaid/all-accounts`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const accountsData = await accountsResponse.json();
  console.log('Accounts response:', {
    count: accountsData.accounts?.length || 0,
    accounts: accountsData.accounts?.map((acc) => ({
      id: acc.id,
      name: acc.name,
      type: acc.type
    }))
  });
  
  console.log('\n2. Summary:');
  console.log(`- Total accounts returned: ${accountsData.accounts?.length || 0}`);
  
  // Check if there are duplicates by account ID
  if (accountsData.accounts) {
    const accountIds = accountsData.accounts.map(acc => acc.id);
    const uniqueIds = new Set(accountIds);
    console.log(`- Unique account IDs: ${uniqueIds.size}`);
    console.log(`- Duplicate accounts: ${accountIds.length - uniqueIds.size}`);
  }
}

testDeduplication().catch(console.error); 