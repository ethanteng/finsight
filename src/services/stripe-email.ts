import nodemailer from 'nodemailer';
import { getPrismaClient } from '../prisma-client';

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@asklinc.com';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
};

// Get base URL for development vs production
const getBaseUrl = (): string => {
  const isDevelopment = !process.env.NODE_ENV || 
                       process.env.NODE_ENV === 'development' || 
                       process.env.FRONTEND_URL?.includes('localhost');
  return isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com');
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
          text-transform: capitalize;
          margin-bottom: 24px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 24px 0;
          transition: all 0.2s ease;
        }
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
        }
        .features {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 24px;
          margin: 32px 0;
        }
        .feature-item {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }
        .feature-item:last-child {
          margin-bottom: 0;
        }
        .feature-icon {
          width: 20px;
          height: 20px;
          background-color: #10b981;
          border-radius: 50%;
          margin-right: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .feature-text {
          color: #4b5563;
          font-size: 14px;
        }
        .footer {
          background-color: #1f2937;
          color: #9ca3af;
          padding: 30px;
          text-align: center;
          font-size: 14px;
        }
        .footer-links {
          margin-bottom: 20px;
        }
        .footer-link {
          color: #9ca3af;
          text-decoration: none;
          margin: 0 12px;
        }
        .footer-link:hover {
          color: #10b981;
        }
        .social-links {
          margin-bottom: 20px;
        }
        .social-link {
          display: inline-block;
          width: 32px;
          height: 32px;
          background-color: #374151;
          border-radius: 50%;
          margin: 0 8px;
          text-decoration: none;
          color: #9ca3af;
          line-height: 32px;
          text-align: center;
          transition: background-color 0.2s ease;
        }
        .social-link:hover {
          background-color: #10b981;
          color: white;
        }
        @media (max-width: 600px) {
          .container {
            margin: 20px;
            border-radius: 8px;
          }
          .header, .content, .footer {
            padding: 30px 20px;
          }
          .logo-text {
            font-size: 24px;
          }
          .welcome-message {
            font-size: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <div class="logo-icon">
              <span style="color: white; font-size: 20px; font-weight: bold;">🧠</span>
            </div>
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
          
          <div class="social-links">
            <a href="#" class="social-link">📧</a>
            <a href="#" class="social-link">🐦</a>
            <a href="#" class="social-link">💼</a>
          </div>
          
          <p style="margin: 0; color: #6b7280;">© 2024 Ask Linc. All rights reserved.</p>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">
            This email was sent to you because you completed a payment with Ask Linc.
          </p>
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
    const transporter = createTransporter();
    const setupLink = generateSetupLink(email, tier);
    
    const tierFeatures = {
      starter: [
        'Basic financial analysis and insights',
        'Account balance monitoring',
        'Transaction categorization',
        'Basic financial questions answered'
      ],
      standard: [
        'Everything in Starter, plus:',
        'Economic context and market insights',
        'Advanced financial analysis',
        'RAG-powered intelligent responses',
        'Enhanced data visualization'
      ],
      premium: [
        'Everything in Standard, plus:',
        'Live market data and news',
        'Real-time portfolio tracking',
        'Advanced investment insights',
        'Priority support and features'
      ]
    };

    const features = tierFeatures[tier as keyof typeof tierFeatures] || tierFeatures.starter;
    
    const content = `
      <div class="welcome-message">
        Welcome to Ask Linc! 🎉
      </div>
      
      <div class="tier-badge">
        ${tier} Plan
      </div>
      
      <div class="description">
        Hi${customerName ? ` ${customerName}` : ''}! Thank you for choosing Ask Linc. 
        Your payment has been processed successfully, and you're now ready to set up your account 
        and start getting intelligent financial insights.
      </div>
      
      <div class="features">
        <h3 style="margin-top: 0; color: #1a1a1a; font-size: 18px;">Your ${tier} plan includes:</h3>
        ${features.map(feature => `
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <div class="feature-text">${feature}</div>
          </div>
        `).join('')}
      </div>
      
      <div style="text-align: center;">
        <a href="${setupLink}" class="cta-button">
          Complete Your Account Setup →
        </a>
      </div>
      
      <div class="description" style="text-align: center; margin-top: 24px;">
        <strong>Next Steps:</strong><br>
        1. Click the button above to set up your account<br>
        2. Connect your financial accounts securely<br>
        3. Start asking Linc your financial questions!
      </div>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
          <strong>🔒 Security Note:</strong> Your financial data is protected with bank-grade encryption. 
          We never store your banking credentials and use industry-standard security protocols.
        </p>
      </div>
    `;

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Welcome to Ask Linc! Complete Your ${tier.charAt(0).toUpperCase() + tier.slice(1)} Account Setup`,
      html: createEmailTemplate(content, 'Welcome to Ask Linc'),
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email} for ${tier} plan`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
}

// Send tier upgrade/downgrade confirmation email for existing users
export async function sendTierChangeEmail(
  email: string,
  newTier: string,
  oldTier: string,
  customerName?: string
): Promise<boolean> {
  try {
    const transporter = createTransporter();
    const baseUrl = getBaseUrl();
    
    const tierFeatures = {
      starter: [
        'Basic financial analysis and insights',
        'Account balance monitoring',
        'Transaction categorization',
        'Basic financial questions answered'
      ],
      standard: [
        'Everything in Starter, plus:',
        'Economic context and market insights',
        'Advanced financial analysis',
        'RAG-powered intelligent responses',
        'Enhanced data visualization'
      ],
      premium: [
        'Everything in Standard, plus:',
        'Live market data and news',
        'Real-time portfolio tracking',
        'Advanced investment insights',
        'Priority support and features'
      ]
    };

    const features = tierFeatures[newTier as keyof typeof tierFeatures] || tierFeatures.starter;
    const isUpgrade = ['starter', 'standard', 'premium'].indexOf(newTier) > ['starter', 'standard', 'premium'].indexOf(oldTier);
    
    const content = `
      <div class="welcome-message">
        Your Ask Linc Plan Has Been Updated! ${isUpgrade ? '🚀' : '✅'}
      </div>
      
      <div class="tier-badge">
        ${newTier} Plan
      </div>
      
      <div class="description">
        Hi${customerName ? ` ${customerName}` : ''}! Your Ask Linc subscription has been successfully updated 
        from <strong>${oldTier}</strong> to <strong>${newTier}</strong>. 
        ${isUpgrade ? 'Welcome to your enhanced experience!' : 'Your plan has been adjusted as requested.'}
      </div>
      
      <div class="features">
        <h3 style="margin-top: 0; color: #1a1a1a; font-size: 18px;">Your new ${newTier} plan includes:</h3>
        ${features.map(feature => `
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <div class="feature-text">${feature}</div>
          </div>
        `).join('')}
      </div>
      
      <div style="text-align: center;">
        <a href="${baseUrl}/app" class="cta-button">
          Access Your Account →
        </a>
      </div>
      
      <div class="description" style="text-align: center; margin-top: 24px;">
        <strong>What's Next:</strong><br>
        ${isUpgrade ? 
          '1. Log in to your account to access new features<br>2. Explore your enhanced capabilities<br>3. Start using your new ${newTier} features!' :
          '1. Log in to your account to continue using Ask Linc<br>2. Your access has been adjusted to match your new plan<br>3. Contact support if you have any questions'
        }
      </div>
      
      ${isUpgrade ? `
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; color: #064e3b; font-size: 14px;">
            <strong>🎉 Upgrade Bonus:</strong> You now have access to more powerful features and insights. 
            Make the most of your enhanced Ask Linc experience!
          </p>
        </div>
      ` : ''}
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
          <strong>💳 Billing Note:</strong> Your subscription has been updated and billing will reflect your new plan. 
          If you have any questions about your billing, please contact our support team.
        </p>
      </div>
    `;

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Ask Linc Plan Updated: ${oldTier.charAt(0).toUpperCase() + oldTier.slice(1)} → ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}`,
      html: createEmailTemplate(content, 'Ask Linc Plan Updated'),
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tier change email sent to ${email}: ${oldTier} → ${newTier}`);
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
    const transporter = createTransporter();
    
    // Use localhost for development, production URL for production
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com');
    
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

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Ask Linc Subscription Cancelled`,
      html: createEmailTemplate(content, 'Subscription Cancelled'),
    };

    await transporter.sendMail(mailOptions);
    console.log(`Cancellation email sent to ${email} for ${oldTier} plan`);
    return true;
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    return false;
  }
}

// Test email configuration
export async function testStripeEmailConfiguration(): Promise<boolean> {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Stripe email configuration is valid');
    return true;
  } catch (error) {
    console.error('Stripe email configuration error:', error);
    return false;
  }
}
