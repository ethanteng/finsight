import { Resend } from 'resend';
import { getPrismaClient } from '../prisma-client';

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

// Get base URL for development vs production
const getBaseUrl = (): string => {
  const isDevelopment = !process.env.NODE_ENV || 
                       process.env.NODE_ENV === 'development' || 
                       process.env.FRONTEND_URL?.includes('localhost');
  return isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');
};

// Generate the complete setup link for new users
const generateSetupLink = (email: string, tier: string): string => {
  const baseUrl = getBaseUrl();
  const encodedEmail = encodeURIComponent(email);
  const encodedTier = encodeURIComponent(tier);
  return `${baseUrl}/register?email=${encodedEmail}&tier=${encodedTier}&source=stripe`;
};

// Email template with Ask Linc branding
const createEmailTemplate = (content: string, subject: string): string => {
  const baseUrl = getBaseUrl();
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
          background-color: #f8f9fa;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          padding: 40px 30px;
          text-align: center;
          color: white;
        }
        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .logo-icon {
          width: 40px;
          height: 40px;
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 16px;
        }
        .logo-text {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header-subtitle {
          font-size: 18px;
          opacity: 0.9;
          margin: 0;
          font-weight: 500;
        }
        .content {
          padding: 40px 30px;
          background-color: #ffffff;
        }
        .welcome-message {
          font-size: 24px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 24px;
        }
        .description {
          font-size: 16px;
          color: #4b5563;
          line-height: 1.7;
          margin-bottom: 32px;
        }
        .tier-badge {
          display: inline-block;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 24px;
        }
        .feature-list {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 24px;
          margin: 24px 0;
        }
        .feature-item {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          color: #4b5563;
        }
        .feature-item:last-child {
          margin-bottom: 0;
        }
        .feature-check {
          color: #10b981;
          margin-right: 12px;
          font-size: 16px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 16px 32px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 24px 0;
          text-align: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
        }
        .footer {
          background-color: #1f2937;
          color: #9ca3af;
          padding: 30px;
          text-align: center;
        }
        .footer-links {
          margin-bottom: 20px;
        }
        .footer-link {
          color: #9ca3af;
          text-decoration: none;
          margin: 0 12px;
          font-size: 14px;
        }
        .footer-link:hover {
          color: #d1d5db;
        }
        .social-links {
          margin-top: 20px;
        }
        .social-icon {
          display: inline-block;
          width: 32px;
          height: 32px;
          background-color: #374151;
          border-radius: 50%;
          margin: 0 8px;
          text-align: center;
          line-height: 32px;
          color: #9ca3af;
          text-decoration: none;
        }
        .social-icon:hover {
          background-color: #4b5563;
          color: #d1d5db;
        }
        @media (max-width: 600px) {
          .container {
            margin: 0;
            border-radius: 0;
          }
          .header, .content, .footer {
            padding: 20px;
          }
          .cta-button {
            display: block;
            margin: 20px 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <div class="logo-icon">🧠</div>
            <div class="logo-text">Ask Linc</div>
          </div>
          <p class="header-subtitle">Your AI Financial Assistant</p>
        </div>
        
        <div class="content">
          ${content}
        </div>
        
        <div class="footer">
          <div class="footer-links">
            <a href="${baseUrl}" class="footer-link">Home</a>
            <a href="${baseUrl}/pricing" class="footer-link">Pricing</a>
            <a href="${baseUrl}/how-we-protect-your-data" class="footer-link">Privacy</a>
            <a href="https://ask-linc-blog.ghost.io/" class="footer-link">Blog</a>
          </div>
          
          <p style="margin: 0; color: #6b7280;">© 2024 Ask Linc. All rights reserved.</p>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">
            This email was sent to you as part of your Ask Linc subscription.
          </p>
          
          <div class="social-links">
            <a href="#" class="social-icon">📧</a>
            <a href="#" class="social-icon">🐦</a>
            <a href="#" class="social-icon">💼</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
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
        Welcome to Ask Linc! 🎉
      </div>
      
      <div class="tier-badge">
        ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan
      </div>
      
      <div class="description">
        Hi${customerName ? ` ${customerName}` : ''}! Thank you for choosing Ask Linc. 
        Your payment has been processed successfully, and you're now ready to set up your account 
        and start getting intelligent financial insights.
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
      
      <div style="text-align: center;">
        <a href="${setupLink}" class="cta-button">
          Complete Your Account Setup →
        </a>
      </div>
      
      <div class="description">
        <strong>Next Steps:</strong><br>
        1. Click the button above to set up your account<br>
        2. Connect your financial accounts securely<br>
        3. Start asking Linc your financial questions!
      </div>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
          <strong>🔒 Security Note:</strong> Your financial data is protected with bank-grade encryption.
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: `Welcome to Ask Linc! Complete Your ${tier.charAt(0).toUpperCase() + tier.slice(1)} Account Setup`,
      html: createEmailTemplate(content, 'Welcome to Ask Linc'),
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
        Your Ask Linc Plan Has Been Updated! 🚀
      </div>
      
      <div class="tier-badge">
        ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} Plan
      </div>
      
      <div class="description">
        Hi${customerName ? ` ${customerName}` : ''}! Your Ask Linc subscription has been successfully updated 
        from ${oldTier} to ${newTier}. Welcome to your enhanced experience!
      </div>
      
      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-check">✓</span>
          Your new ${newTier} plan includes:
        </div>
        ${tierFeatures.map(feature => `
          <div class="feature-item">
            <span class="feature-check">✓</span>
            ${feature}
          </div>
        `).join('')}
      </div>
      
      <div style="text-align: center;">
        <a href="${baseUrl}/app" class="cta-button">
          Access Your Account →
        </a>
      </div>
      
      <div class="description">
        <strong>What's Next:</strong><br>
        1. Log in to your account to access new features<br>
        2. Explore your enhanced capabilities<br>
        3. Start using your new ${newTier} features!
      </div>
      
      <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #713f12; font-size: 14px;">
          <strong>🎉 Upgrade Bonus:</strong> You now have access to more powerful features and insights.
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: `Ask Linc Plan Updated: ${oldTier.charAt(0).toUpperCase() + oldTier.slice(1)} → ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}`,
      html: createEmailTemplate(content, 'Plan Updated'),
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
    
    // Use localhost for development, production URL for production
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');
    
    const content = `
      <div class="welcome-message">
        Your Ask Linc Subscription Has Been Cancelled 📋
      </div>
      
      <div class="description">
        Hi${customerName ? ` ${customerName}` : ''}! We're sorry to see you go. Your Ask Linc subscription 
        has been successfully cancelled as requested.
      </div>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
          <strong>⚠️ Important:</strong> Your subscription has been cancelled and you will lose access to 
          your <strong>${oldTier}</strong> plan features at the end of your current billing period.
        </p>
      </div>
      
      <div class="description">
        <strong>What happens next:</strong><br>
        1. You'll continue to have access to your current plan until the end of your billing period<br>
        2. After that, your account will be downgraded to the starter tier<br>
        3. You can reactivate your subscription at any time by visiting your account settings
      </div>
      
      <div style="text-align: center;">
        <a href="${baseUrl}/app" class="cta-button">
          Access Your Account →
        </a>
      </div>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="${baseUrl}/pricing" class="cta-button" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);">
          View Plans Again →
        </a>
      </div>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
          <strong>💡 Change your mind?</strong> You can reactivate your subscription at any time by visiting 
          your account settings. We'd love to have you back!
        </p>
      </div>
      
      <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #713f12; font-size: 14px;">
          <strong>📧 Need help?</strong> If you have any questions or if this cancellation was made in error, 
          please contact our support team. We're here to help!
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: `Ask Linc Subscription Cancelled`,
      html: createEmailTemplate(content, 'Subscription Cancelled'),
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
        'Everything in Standard, plus:',
        'Live market data and news',
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
