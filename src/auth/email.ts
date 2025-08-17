import { Resend } from 'resend';

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

// Generate random code/token
export function generateRandomCode(length: number = 6): string {
  return (Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000).toString();
}

export function generateRandomToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Send email verification code
export async function sendEmailVerificationCode(
  email: string, 
  verificationCode: string, 
  userName?: string
): Promise<boolean> {
  try {
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping email verification send');
      return true; // Return true to not break authentication flow
    }

    // Use localhost for development, production URL for production
    // Check if we're running locally (no NODE_ENV set or development)
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: 'Verify your Ask Linc email address',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your Ask Linc email address</title>
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
            .verification-code {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 20px;
              border-radius: 12px;
              text-align: center;
              margin: 32px 0;
              font-size: 32px;
              font-weight: 700;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
            }
            .expiration-notice {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .expiration-notice p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
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
            .security-note {
              background-color: #f0f9ff;
              border-left: 4px solid #0ea5e9;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .security-note p {
              margin: 0;
              color: #0c4a6e;
              font-size: 14px;
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
            @media (max-width: 600px) {
              .container {
                margin: 0;
                border-radius: 0;
              }
              .header, .content, .footer {
                padding: 20px;
              }
              .verification-code {
                font-size: 24px;
                letter-spacing: 2px;
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
              <div class="welcome-message">
                Welcome to Ask Linc! 🎉
              </div>
              
              <div class="description">
                Hi${userName ? ` ${userName}` : ''}! Thank you for signing up for Ask Linc. 
                To complete your account setup, please verify your email address using the code below.
              </div>
              
              <div class="verification-code">
                ${verificationCode}
              </div>
              
              <div class="expiration-notice">
                <p><strong>⏰ This code expires in 15 minutes</strong></p>
              </div>
              
              <div style="text-align: center;">
                <a href="${baseUrl}" 
                   class="cta-button">
                  Visit Ask Linc →
                </a>
              </div>
              
              <div class="security-note">
                <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                  <strong>🔒 Security Note:</strong> If you didn't create an account with Ask Linc, 
                  you can safely ignore this email. Your email address will not be used for any other purpose.
                </p>
              </div>
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
                This email was sent to ${email} to verify your account.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Email verification code sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending email verification code:', error);
    return false;
  }
}

// Send password reset email
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<boolean> {
  try {
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping password reset email send');
      return true; // Return true to not break authentication flow
    }
    
    // Use localhost for development, production URL for production
    // Check if we're running locally (no NODE_ENV set or development)
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: 'Reset your Ask Linc password',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset your Ask Linc password</title>
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
            .fallback-link {
              background-color: #f3f4f6;
              border: 1px solid #d1d5db;
              padding: 16px;
              border-radius: 8px;
              margin: 24px 0;
              font-family: 'Courier New', monospace;
              font-size: 14px;
              color: #374151;
              word-break: break-all;
            }
            .time-limit {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .time-limit p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
            .security-note {
              background-color: #f0f9ff;
              border-left: 4px solid #0ea5e9;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .security-note p {
              margin: 0;
              color: #0c4a6e;
              font-size: 14px;
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
              <div class="welcome-message">
                Reset Your Password 🔐
              </div>
              
              <div class="description">
                Hi${userName ? ` ${userName}` : ''}! We received a request to reset your Ask Linc password. 
                Click the button below to create a new password.
              </div>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="cta-button">
                  Reset Password →
                </a>
              </div>
              
              <div class="fallback-link">
                <strong>If the button doesn't work, copy and paste this link:</strong><br>
                ${resetUrl}
              </div>
              
              <div class="time-limit">
                <p><strong>⏰ This link expires in 1 hour</strong></p>
              </div>
              
              <div class="security-note">
                <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                  <strong>🔒 Security Note:</strong> If you didn't request a password reset, 
                  you can safely ignore this email. Your password will remain unchanged.
                </p>
              </div>
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
                This email was sent to ${email} to reset your password.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}

// Test email configuration
export async function testEmailConfiguration(): Promise<boolean> {
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
      subject: 'Ask Linc Email System Test',
      html: '<p>This is a test email to verify the email system is working.</p>',
    });

    if (error) {
      console.error('Resend test error:', error);
      return false;
    }

    console.log('Email configuration is valid');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
} 