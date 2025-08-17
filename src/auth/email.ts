import nodemailer from 'nodemailer';
import crypto from 'crypto';

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

// Generate random code/token
export function generateRandomCode(length: number = 6): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Send email verification code
export async function sendEmailVerificationCode(
  email: string,
  code: string,
  userName?: string
): Promise<boolean> {
  try {
    const transporter = createTransporter();
    
    // Use localhost for development, production URL for production
    // Check if we're running locally (no NODE_ENV set or development)
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your Ask Linc account',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your Ask Linc account</title>
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
              background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
              border: 2px solid #10b981;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              margin: 32px 0;
            }
            .code-display {
              font-size: 36px;
              font-weight: 700;
              color: #10b981;
              letter-spacing: 12px;
              font-family: 'Courier New', monospace;
              margin: 16px 0;
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
            .security-note {
              background-color: #f0f9ff;
              border-left: 4px solid #0ea5e9;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
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
              .code-display {
                font-size: 28px;
                letter-spacing: 8px;
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
              <div class="welcome-message">
                Welcome to Ask Linc! 🎉
              </div>
              
              <div class="description">
                Hi${userName ? ` ${userName}` : ''}! Thank you for signing up for Ask Linc. 
                To complete your registration and start getting intelligent financial insights, 
                please enter the verification code below:
              </div>
              
              <div class="verification-code">
                <div style="color: #0c4a6e; font-weight: 600; margin-bottom: 16px;">
                  Your Verification Code
                </div>
                <div class="code-display">
                  ${code}
                </div>
                <div style="color: #64748b; font-size: 14px;">
                  This code will expire in 15 minutes
                </div>
              </div>
              
              <div style="text-align: center;">
                <a href="${isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com')}" 
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
                <a href="${isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com')}" class="footer-link">Home</a>
                <a href="${isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com')}/pricing" class="footer-link">Pricing</a>
                <a href="${isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com')}/how-we-protect-your-data" class="footer-link">Privacy</a>
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
    };

    await transporter.sendMail(mailOptions);
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
    const transporter = createTransporter();
    
    // Use localhost for development, production URL for production
    // Check if we're running locally (no NODE_ENV set or development)
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com');
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: EMAIL_FROM,
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
            .security-note {
              background-color: #f0f9ff;
              border-left: 4px solid #0ea5e9;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .fallback-link {
              background-color: #f8f9fa;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 16px;
              margin: 24px 0;
              word-break: break-all;
            }
            .fallback-link a {
              color: #10b981;
              text-decoration: none;
              font-family: 'Courier New', monospace;
              font-size: 12px;
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
              <div class="welcome-message">
                Password Reset Request 🔐
              </div>
              
              <div class="description">
                Hi${userName ? ` ${userName}` : ''}! We received a request to reset your password 
                for your Ask Linc account. Click the button below to create a new password and 
                regain access to your financial insights.
              </div>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="cta-button">
                  Reset Password →
                </a>
              </div>
              
              <div class="security-note">
                <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                  <strong>⏰ Time Limit:</strong> This link will expire in 1 hour for security reasons. 
                  If you didn't request a password reset, you can safely ignore this email.
                </p>
              </div>
              
              <div style="margin: 24px 0;">
                <p style="color: #4b5563; font-size: 14px; margin-bottom: 12px;">
                  <strong>Having trouble with the button?</strong> Copy and paste this link into your browser:
                </p>
                <div class="fallback-link">
                  <a href="${resetUrl}">${resetUrl}</a>
                </div>
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
    };

    await transporter.sendMail(mailOptions);
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
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email configuration is valid');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
} 