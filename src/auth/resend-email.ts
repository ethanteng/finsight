import { Resend } from 'resend';
import crypto from 'crypto';
import { createEmailHtml, getBaseUrl } from '../email/templates';

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
    const resend = getResendClient();

    if (!resend) {
      console.log('Resend not configured, skipping email send');
      return true;
    }

    const baseUrl = getBaseUrl();

    const content = `
      <div class="welcome-message">
        Verify your email address
      </div>

      <div class="description">
        Thank you for signing up for Ask Linc. To complete your account setup, please enter the verification code below.
      </div>

      <div class="verification-code">
        ${code}
      </div>

      <div class="expiration-notice">
        <p><strong>This code expires in 15 minutes.</strong></p>
      </div>

      <div style="text-align: center;">
        <a href="${baseUrl}" class="cta-button" style="color: #0f766e; background-color: #ffffff; border: 2px solid #0f766e; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; display: inline-block;">
          Visit Ask Linc
        </a>
      </div>

      <div class="security-note">
        <p><strong>Security note:</strong> If you did not create an account with Ask Linc, you may safely ignore this email. Your address will not be used for any other purpose.</p>
      </div>
    `;

    const html = createEmailHtml(content, {
      title: 'Verify your Ask Linc email address',
      headerSubtitle: 'Verify your email address',
      footerNote: `This email was sent to ${email} to verify your account.`,
    });

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: 'Verify your Ask Linc email address',
      html,
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
    const resend = getResendClient();

    if (!resend) {
      console.log('Resend not configured, skipping email send');
      return true;
    }

    const baseUrl = getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    const content = `
      <div class="welcome-message">
        Password reset request
      </div>

      <div class="description">
        We received a request to reset the password for your Ask Linc account. Click the button below to create a new password.
      </div>

      <div style="text-align: center;">
        <a href="${resetUrl}" class="cta-button" style="color: #0f766e; background-color: #ffffff; border: 2px solid #0f766e; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; display: inline-block;">
          Reset password
        </a>
      </div>

      <div class="fallback-link">
        <strong>If the button does not work, copy and paste this link into your browser:</strong><br>
        ${resetUrl}
      </div>

      <div class="time-limit">
        <p><strong>This link expires in 1 hour.</strong></p>
      </div>

      <div class="security-note">
        <p><strong>Security note:</strong> If you did not request a password reset, you may safely ignore this email. Your password will remain unchanged.</p>
      </div>
    `;

    const html = createEmailHtml(content, {
      title: 'Reset your Ask Linc password',
      headerSubtitle: 'Password Reset Request',
      footerNote: `This email was sent to ${email} to reset your password.`,
    });

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc <noreply@asklinc.com>',
      to: email,
      subject: 'Reset your Ask Linc password',
      html,
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
    const adminEmails =
      process.env.ADMIN_EMAILS?.split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0) || [];

    const resend = getResendClient();

    if (!resend) {
      console.log('Resend not configured, skipping contact email send');
      return true;
    }

    if (adminEmails.length === 0) {
      console.warn('No admin emails configured for contact form');
      return false;
    }

    const baseUrl = getBaseUrl();

    const content = `
      <div class="welcome-message">
        Contact Form Message
      </div>

      <div class="message-block">
        <p style="color: #4b5563; margin-bottom: 10px;"><strong>From:</strong> ${userEmail}</p>
        <p style="color: #4b5563; margin-bottom: 10px;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
        <p style="color: #1a1a1a; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      </div>

      <div style="text-align: center;">
        <a href="${baseUrl}/contact" class="cta-button" style="color: #0f766e; background-color: #ffffff; border: 2px solid #0f766e; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; display: inline-block;">
          Contact support
        </a>
      </div>
    `;

    const html = createEmailHtml(content, {
      title: 'New Contact Form Submission',
      headerSubtitle: 'New Contact Form Submission',
      footerNote: 'This email was sent to admin team.',
    });

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc Contact Form <noreply@asklinc.com>',
      to: adminEmails,
      subject: 'New Contact Form Submission - Ask Linc',
      html,
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
    const adminEmails =
      process.env.ADMIN_EMAILS?.split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0) || [];

    if (adminEmails.length === 0) {
      console.warn('No admin emails configured for admin notifications');
      return false;
    }

    const resend = getResendClient();

    if (!resend) {
      console.log('Resend not configured, skipping admin notification email send');
      return true;
    }

    const actionText =
      action === 'account_disconnected'
        ? 'disconnected their accounts'
        : 'deactivated their account';
    const subject = `User ${actionText} - Ask Linc`;
    const timestamp = new Date().toLocaleString();
    const baseUrl = getBaseUrl();

    const content = `
      <div class="welcome-message">
        User Account Action
      </div>

      <div class="message-block">
        <p style="color: #4b5563; margin-bottom: 10px;"><strong>User Email:</strong> ${userEmail}</p>
        <p style="color: #4b5563; margin-bottom: 10px;"><strong>Action:</strong> ${actionText}</p>
        <p style="color: #4b5563; margin-bottom: 0;"><strong>Timestamp:</strong> ${timestamp}</p>
      </div>

      <div style="text-align: center;">
        <a href="${baseUrl}/admin" class="cta-button" style="color: #0f766e; background-color: #ffffff; border: 2px solid #0f766e; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 600; display: inline-block;">
          View admin dashboard
        </a>
      </div>
    `;

    const html = createEmailHtml(content, {
      title: 'Admin Notification',
      headerSubtitle: 'Admin Notification',
      footerNote: 'This email was sent to admin team.',
    });

    const { data, error } = await resend.emails.send({
      from: 'Ask Linc Admin Notifications <noreply@asklinc.com>',
      to: adminEmails,
      subject: subject,
      html,
      text: `Ask Linc Admin Notification

User Account Action

User Email: ${userEmail}
Action: ${actionText}
Timestamp: ${timestamp}

View Admin Dashboard: ${baseUrl}/admin

© ${new Date().getFullYear()} Ask Linc. All rights reserved.`,
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
