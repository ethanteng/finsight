import { Resend } from 'resend';
import crypto from 'crypto';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

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
    // Use localhost for development, production URL for production
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    
    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: [email],
      subject: 'Verify your Ask Linc account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Ask Linc</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Verify your email address</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello${userName ? ` ${userName}` : ''}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Thanks for signing up for Ask Linc! To complete your registration, please enter the verification code below:
            </p>
            
            <div style="background: #fff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
              <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                ${code}
              </div>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              This code will expire in 15 minutes. If you didn't create an account with Ask Linc, you can safely ignore this email.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com')}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Visit Ask Linc
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2024 Ask Linc. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email was sent to ${email}</p>
          </div>
        </div>
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
    // Use localhost for development, production URL for production
    const isDevelopment = !process.env.NODE_ENV || 
                         process.env.NODE_ENV === 'development' || 
                         process.env.FRONTEND_URL?.includes('localhost');
    const baseUrl = isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'https://asklinc.com');
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: [email],
      subject: 'Reset your Ask Linc password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Ask Linc</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello${userName ? ` ${userName}` : ''}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              We received a request to reset your password for your Ask Linc account. Click the button below to create a new password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; font-size: 12px;">
              ${resetUrl}
            </p>
          </div>
          
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2024 Ask Linc. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email was sent to ${email}</p>
          </div>
        </div>
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
    // Test by sending a verification email to a test address
    const testResult = await sendEmailVerificationCode(
      'test@example.com',
      '123456',
      'Test User'
    );
    console.log('Email configuration is valid');
    return testResult;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
} 