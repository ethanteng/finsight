async function testAuthFlow() {
  const API_URL = 'http://localhost:3000';
  
  console.log('Testing authentication and account creation flow...\n');
  
  // Step 1: Register a new user
  console.log('1. Registering new user...');
  const registerResponse = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'Password123'
    })
  });
  
  const registerData = await registerResponse.json();
  console.log('Register response:', registerData);
  
  if (!registerResponse.ok) {
    console.log('Registration failed, trying login...');
  }
  
  // Step 2: Login
  console.log('\n2. Logging in...');
  const loginResponse = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'Password123'
    })
  });
  
  const loginData = await loginResponse.json();
  console.log('Login response:', loginData);
  
  if (!loginResponse.ok) {
    console.log('Login failed');
    return;
  }
  
  const token = loginData.token;
  console.log('Token received:', token ? token.substring(0, 20) + '...' : 'none');
  
  // Step 3: Check accounts before linking
  console.log('\n3. Checking accounts before linking...');
  const accountsBeforeResponse = await fetch(`${API_URL}/plaid/all-accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const accountsBeforeData = await accountsBeforeResponse.json();
  console.log('Accounts before linking:', accountsBeforeData);
  
  // Step 4: Create link token
  console.log('\n4. Creating link token...');
  const linkTokenResponse = await fetch(`${API_URL}/plaid/create_link_token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const linkTokenData = await linkTokenResponse.json();
  console.log('Link token response:', linkTokenData);
  
  // Step 5: Check database for access tokens
  console.log('\n5. Checking database for access tokens...');
  const dbCheckResponse = await fetch(`${API_URL}/admin/access-tokens`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (dbCheckResponse.ok) {
    const dbData = await dbCheckResponse.json();
    console.log('Database access tokens:', dbData);
  } else {
    console.log('Database check failed:', dbCheckResponse.status);
  }
}

testAuthFlow().catch(console.error); 