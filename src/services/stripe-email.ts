import { Resend } from 'resend';
import { createEmailHtml, getBaseUrl } from '../email/templates';

// Initialize Resend client function
function getResendClient(): Resend | null {
  try {
    if (process.env.RESEND_API_KEY) {
      return new Resend(process.env.RESEND_API_KEY);
    }
    console.log('Resend not configured, skipping email send');
    return null;
  } catch (error) {
    console.error('Error initializing Resend client:', error);
    return null;
  }
}

// Generate the complete setup link for new users
const generateSetupLink = (email: string, tier: string): string => {
  const baseUrl = getBaseUrl();
  const encodedEmail = encodeURIComponent(email);
  const encodedTier = encodeURIComponent(tier);
  return `${baseUrl}/register?email=${encodedEmail}&tier=${encodedTier}&source=stripe`;
};

// Send welcome email for new users
export async function sendWelcomeEmail(
  email: string, 
  tier: string, 
  customerName?: string
): Promise<boolean> {
  try {
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping welcome email send');
      return true; // Return true to not break webhook processing
    }

    const baseUrl = getBaseUrl();
    const setupLink = generateSetupLink(email, tier);
    
    // Get tier-specific features
    const tierFeatures = getTierFeatures(tier);
    
    const content = `
      <div class="welcome-message">
        Welcome to Ask Linc
      </div>
      
      <div class="description">
        Thank you for choosing Ask Linc. Your payment has been processed, and your account is ready for setup.
      </div>
      
      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-check">✓</span>
          Your ${tier} plan includes:
        </div>
        ${tierFeatures.map(feature => `
          <div class="feature-item">
            <span class="feature-check">✓</span>
            ${feature}
          </div>
        `).join('')}
      </div>
      
      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${setupLink}" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          Complete account setup
        </a>
      </div>
      
      <div class="description">
        <strong>Next steps:</strong><br>
        1. Click the button above to set up your account<br>
        2. Connect your financial accounts securely<br>
        3. Begin asking Linc your financial questions
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: 'Welcome to Ask Linc! Complete Your Account Setup',
      html: createEmailHtml(content, {
      title: 'Welcome to Ask Linc',
      footerNote: 'This email was sent to you as part of your Ask Linc subscription.',
    }),
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Welcome email sent to ${email} for ${tier} plan`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
}

// Send tier change confirmation email
export async function sendTierChangeEmail(
  email: string, 
  newTier: string, 
  oldTier: string, 
  customerName?: string
): Promise<boolean> {
  try {
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping tier change email send');
      return true; // Return true to not break webhook processing
    }

    const baseUrl = getBaseUrl();
    
    // Get tier-specific features
    const tierFeatures = getTierFeatures(newTier);
    
    const content = `
      <div class="welcome-message">
        Plan updated
      </div>
      
      <div class="tier-badge">
        ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} Plan
      </div>
      
      <div class="description">
        Your Ask Linc subscription has been updated from ${oldTier} to ${newTier}. Your new plan is now active.
      </div>
      
      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-check">✓</span>
          Your ${newTier} plan includes:
        </div>
        ${tierFeatures.map(feature => `
          <div class="feature-item">
            <span class="feature-check">✓</span>
            ${feature}
          </div>
        `).join('')}
      </div>
      
      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${baseUrl}/app" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          Access your account
        </a>
      </div>
      
      <div class="description">
        <strong>Next steps:</strong><br>
        1. Log in to access your new features<br>
        2. Review your updated capabilities<br>
        3. Configure any new ${newTier} features as needed
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: `Ask Linc Plan Updated: ${oldTier.charAt(0).toUpperCase() + oldTier.slice(1)} → ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}`,
      html: createEmailHtml(content, {
      title: 'Plan Updated',
      footerNote: 'This email was sent to you as part of your Ask Linc subscription.',
    }),
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Tier change email sent to ${email} from ${oldTier} to ${newTier}`);
    return true;
  } catch (error) {
    console.error('Error sending tier change email:', error);
    return false;
  }
}

// Send subscription cancellation email
export async function sendCancellationEmail(
  email: string,
  oldTier: string,
  customerName?: string
): Promise<boolean> {
  try {
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping cancellation email send');
      return true; // Return true to not break webhook processing
    }
    
    const baseUrl = getBaseUrl();

    const content = `
      <div class="welcome-message">
        Subscription cancelled
      </div>
      
      <div class="description">
        Your Ask Linc subscription has been cancelled as requested.
      </div>
      
      <div style="background-color: #fef2f2; border-left: 3px solid #dc2626; padding: 14px 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
          <strong>Important:</strong> You will lose access to your <strong>${oldTier}</strong> plan features at the end of your current billing period.
        </p>
      </div>
      
      <div class="description">
        <strong>What happens next:</strong><br>
        1. You retain access until the end of your billing period<br>
        2. Your account will then be downgraded to the starter tier<br>
        3. You may reactivate at any time in your account settings
      </div>
      
      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${baseUrl}/app" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          Access your account
        </a>
      </div>
      
      <div class="security-note">
        <p><strong>Reactivate:</strong> You may reactivate your subscription at any time in your account settings.</p>
      </div>
      
      <div class="security-note">
        <p><strong>Support:</strong> If you have questions or believe this cancellation was made in error, contact support.</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: `Ask Linc Subscription Cancelled`,
      html: createEmailHtml(content, {
      title: 'Subscription Cancelled',
      footerNote: 'This email was sent to you as part of your Ask Linc subscription.',
    }),
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Cancellation email sent to ${email} for ${oldTier} plan`);
    return true;
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    return false;
  }
}

// Helper function to get tier-specific features
function getTierFeatures(tier: string): string[] {
  switch (tier) {
    case 'starter':
      return [
        'Basic financial analysis',
        'Account balances',
        'Transaction history'
      ];
    case 'standard':
      return [
        'Everything in Starter, plus:',
        'Economic indicators',
        'RAG system access',
        'Enhanced insights'
      ];
    case 'premium':
      return [
        'Advanced market context and news',
        'Real-time portfolio tracking',
        'Advanced investment insights',
        'Priority support and features'
      ];
    default:
      return ['Basic financial analysis'];
  }
}

// Test email configuration
export async function testStripeEmailConfiguration(): Promise<boolean> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log('Resend not configured');
      return false;
    }
    
    // Test by sending a test email to yourself
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: testEmail,
      subject: 'Stripe Email System Test',
      html: '<p>This is a test email to verify the Stripe email system is working.</p>',
    });

    if (error) {
      console.error('Resend test error:', error);
      return false;
    }

    console.log('Stripe email configuration is valid');
    return true;
  } catch (error) {
    console.error('Stripe email configuration error:', error);
    return false;
  }
}
