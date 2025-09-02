// Browser Test Script for SnapTrade Delete
// Copy and paste this into your browser's console while logged into the app

async function testSnapTradeDelete() {
  console.log('🧪 Testing SnapTrade Delete from Browser');
  console.log('=======================================');
  
  try {
    // Get the JWT token from localStorage or cookies
    const token = localStorage.getItem('token') || 
                  document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    
    if (!token) {
      console.log('❌ No JWT token found. Make sure you are logged in.');
      return;
    }
    
    console.log('✅ JWT token found');
    
    // Make the delete request
    const response = await fetch('/snaptrade/delete', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', data);
    
    if (data.success) {
      console.log('✅ SnapTrade user deleted successfully!');
      console.log('You can now try the "Connect Account" button again.');
    } else {
      console.log('❌ Delete failed:', data.error);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

// Run the test
testSnapTradeDelete();
