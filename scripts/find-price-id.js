/**
 * Script to find the active price ID for a Stripe product
 * 
 * Usage: node scripts/find-price-id.js
 */

require('dotenv').config({ path: '.env.local' });
const Stripe = require('stripe');

async function findPriceId() {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
      process.exit(1);
    }

    const stripe = new Stripe(stripeSecretKey);
    const productId = 'prod_SraoEdrNSHuQ1W';

    console.log(`🔍 Looking up prices for product: ${productId}\n`);

    // List all prices for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true, // Only get active prices
      limit: 100
    });

    if (prices.data.length === 0) {
      console.log('❌ No active prices found for this product.');
      console.log('\n💡 Checking inactive prices...\n');
      
      // Check inactive prices too
      const allPrices = await stripe.prices.list({
        product: productId,
        limit: 100
      });

      if (allPrices.data.length === 0) {
        console.log('❌ No prices found at all for this product.');
        console.log('\n💡 Please verify the product ID is correct.');
        return;
      }

      console.log('Found inactive prices:');
      allPrices.data.forEach(price => {
        console.log(`  - ${price.id} (active: ${price.active}, type: ${price.type})`);
        if (price.recurring) {
          console.log(`    Amount: $${(price.unit_amount / 100).toFixed(2)}/${price.recurring.interval}`);
        }
      });
      return;
    }

    console.log(`✅ Found ${prices.data.length} active price(s):\n`);
    
    prices.data.forEach((price, index) => {
      console.log(`Price ${index + 1}:`);
      console.log(`  ID: ${price.id}`);
      console.log(`  Active: ${price.active}`);
      console.log(`  Type: ${price.type}`);
      
      if (price.recurring) {
        console.log(`  Recurring: ${price.recurring.interval}`);
        console.log(`  Amount: $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
      } else {
        console.log(`  One-time: $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
      }
      
      console.log(`  Nickname: ${price.nickname || '(none)'}`);
      console.log('');
    });

    // If there's exactly one active price, suggest updating the env var
    if (prices.data.length === 1) {
      const priceId = prices.data[0].id;
      console.log('💡 Recommendation:');
      console.log(`   Update STRIPE_PRICE_STARTER in .env.local to:`);
      console.log(`   STRIPE_PRICE_STARTER=${priceId}`);
    } else if (prices.data.length > 1) {
      console.log('⚠️  Multiple active prices found. Please choose the correct one.');
      console.log('   The most common one for a monthly subscription would be the recurring monthly price.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('\n💡 This might mean:');
      console.error('   - The product ID is incorrect');
      console.error('   - The product doesn\'t exist in your Stripe account');
      console.error('   - You\'re using the wrong Stripe API key (test vs live)');
    }
    process.exit(1);
  }
}

findPriceId();
