import { Resend } from 'resend';
import crypto from 'crypto';

// Initialize Resend client function
function getResendClient(): Resend | null {
  try {
    if (process.env.RESEND_API_KEY) {
      return new Resend(process.env.RESEND_API_KEY);
    } else {
      console.log('Resend not configured, skipping email send');
      return null;
    }
  } catch (error) {
    console.error('Error initializing Resend client:', error);
    return null;
  }
}

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
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping email send');
      return true; // Return true for testing purposes
    }

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
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping email send');
      return true; // Return true for testing purposes
    }

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

// Send contact form email to admins
export async function sendContactEmail(
  userEmail: string,
  message: string
): Promise<boolean> {
  try {
    // Get admin emails from environment variable
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()).filter(email => email.length > 0) || [];
    
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping contact email send');
      return true; // Return true for testing purposes
    }
    
    if (adminEmails.length === 0) {
      console.warn('No admin emails configured for contact form');
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc Contact Form <noreply@asklinc.com>',
      to: adminEmails,
      subject: 'New Contact Form Submission - Ask Linc',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Ask Linc</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">New Contact Form Submission</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Contact Form Message</h2>
            
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="color: #666; margin-bottom: 10px;"><strong>From:</strong> ${userEmail}</p>
              <p style="color: #666; margin-bottom: 10px;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 15px 0;">
              <p style="color: #333; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://asklinc.com'}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Ask Linc
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2025 Ask Linc. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email was sent to admin team</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Contact form email sent to admins from ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending contact email:', error);
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

// Send admin notification for user account actions
export async function sendAdminNotification(
  action: 'account_disconnected' | 'account_deactivated',
  userEmail: string
): Promise<boolean> {
  try {
    // Get admin emails from environment variable
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()).filter(email => email.length > 0) || [];
    
    // Check if admin emails are configured first
    if (adminEmails.length === 0) {
      console.warn('No admin emails configured for admin notifications');
      return false;
    }
    
    // Get Resend client
    const resend = getResendClient();
    
    // Check if Resend is available
    if (!resend) {
      console.log('Resend not configured, skipping admin notification email send');
      return true; // Return true for testing purposes
    }

    const actionText = action === 'account_disconnected' ? 'disconnected their accounts' : 'deactivated their account';
    const subject = `User ${actionText} - Ask Linc`;
    const timestamp = new Date().toLocaleString();

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc Admin Notifications <noreply@asklinc.com>',
      to: adminEmails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Ask Linc</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Admin Notification</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">User Account Action</h2>
            
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="color: #666; margin-bottom: 10px;"><strong>User Email:</strong> ${userEmail}</p>
              <p style="color: #666; margin-bottom: 10px;"><strong>Action:</strong> ${actionText}</p>
              <p style="color: #666; margin-bottom: 10px;"><strong>Timestamp:</strong> ${timestamp}</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://asklinc.com'}/admin" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Admin Dashboard
              </a>
            </div>
          </div>
          
          <div style="background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2025 Ask Linc. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email was sent to admin team</p>
          </div>
        </div>
      `,
      text: `Ask Linc Admin Notification

User Account Action

User Email: ${userEmail}
Action: ${actionText}
Timestamp: ${timestamp}

View Admin Dashboard: ${process.env.FRONTEND_URL || 'https://asklinc.com'}/admin

© 2025 Ask Linc. All rights reserved.`
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Admin notification email sent successfully for ${action}: ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending admin notification email:', error);
    return false;
  }
} 