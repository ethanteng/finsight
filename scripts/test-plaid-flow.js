async function testPlaidFlow() {
  const API_URL = 'http://localhost:3000';
  
  console.log('Testing complete Plaid Link flow...\n');
  
  // Step 1: Register and login
  console.log('1. Registering and logging in...');
  const registerResponse = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'plaidtest@example.com',
      password: 'Password123'
    })
  });
  
  const registerData = await registerResponse.json();
  console.log('Register response:', registerData);
  
  if (!registerResponse.ok) {
    console.log('Registration failed, trying login...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'plaidtest@example.com',
        password: 'Password123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (!loginResponse.ok) {
      console.log('Login failed');
      return;
    }
    
    var token = loginData.token;
  } else {
    var token = registerData.token;
  }
  
  console.log('Token received:', token ? token.substring(0, 20) + '...' : 'none');
  
  // Step 2: Check accounts before linking
  console.log('\n2. Checking accounts before linking...');
  const accountsBeforeResponse = await fetch(`${API_URL}/plaid/all-accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const accountsBeforeData = await accountsBeforeResponse.json();
  console.log('Accounts before linking:', accountsBeforeData);
  
  // Step 3: Create link token with authentication
  console.log('\n3. Creating link token with authentication...');
  const linkTokenResponse = await fetch(`${API_URL}/plaid/create_link_token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const linkTokenData = await linkTokenResponse.json();
  console.log('Link token response:', linkTokenData);
  
  if (!linkTokenResponse.ok) {
    console.log('Link token creation failed');
    return;
  }
  
  // Step 4: Simulate exchange of public token (this would normally happen after Plaid Link completes)
  console.log('\n4. Simulating exchange of public token...');
  const exchangeResponse = await fetch(`${API_URL}/plaid/exchange_public_token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      public_token: 'test-public-token',
      metadata: {
        institution: { institution_id: 'test-institution' },
        accounts: [{ id: 'test-account-1' }, { id: 'test-account-2' }]
      }
    })
  });
  
  const exchangeData = await exchangeResponse.json();
  console.log('Exchange response:', exchangeData);
  
  // Step 5: Check accounts after linking
  console.log('\n5. Checking accounts after linking...');
  const accountsAfterResponse = await fetch(`${API_URL}/plaid/all-accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const accountsAfterData = await accountsAfterResponse.json();
  console.log('Accounts after linking:', accountsAfterData);
}

testPlaidFlow().catch(console.error); 