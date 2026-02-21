#!/usr/bin/env node
/**
 * Send a fake/test email of any type to a specific email address.
 *
 * Usage:
 *   node scripts/send-test-email.js <type> <email>
 *
 * Types:
 *   verification    - Email verification code (code: 123456)
 *   password-reset - Password reset link (token: fake-reset-token)
 *   welcome        - Stripe welcome email (premium plan)
 *   tier-change    - Plan upgrade email (standard → premium)
 *   cancellation   - Subscription cancellation email
 *   contact        - Contact form submission (as if a user submitted the form)
 *   admin          - Admin notification (user deactivated account)
 *
 * Examples:
 *   node scripts/send-test-email.js verification you@example.com
 *   node scripts/send-test-email.js welcome you@example.com
 *
 * Prerequisites:
 *   - Run `npm run build` first
 *   - Set RESEND_API_KEY in .env or .env.local (local overrides)
 *   - For contact/admin types, the email is sent to the address you specify
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const EMAIL_TYPES = [
  'verification',
  'password-reset',
  'welcome',
  'tier-change',
  'cancellation',
  'contact',
  'admin',
];

function printUsage() {
  console.log(`
Send a fake/test email to a specific address.

Usage: node scripts/send-test-email.js <type> <email>

Types:
  verification    Email verification code (123456)
  password-reset  Password reset link
  welcome         Stripe welcome email (premium plan)
  tier-change     Plan upgrade (standard → premium)
  cancellation    Subscription cancellation
  contact         Contact form submission preview
  admin           Admin notification preview

Examples:
  node scripts/send-test-email.js verification you@example.com
  node scripts/send-test-email.js welcome you@example.com
`);
}

async function sendTestEmail(type, email) {
  const normalizedType = type.toLowerCase().replace(/_/g, '-');

  if (!EMAIL_TYPES.includes(normalizedType)) {
    console.error(`Unknown email type: ${type}`);
    console.error(`Valid types: ${EMAIL_TYPES.join(', ')}`);
    process.exit(1);
  }

  if (!email || !email.includes('@')) {
    console.error('Please provide a valid email address.');
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set. Add it to .env or .env.local');
    process.exit(1);
  }

  console.log(`Sending ${normalizedType} email to ${email}...`);

  try {
    let success = false;

    switch (normalizedType) {
      case 'verification': {
        const { sendEmailVerificationCode } = require('../dist/auth/resend-email');
        success = await sendEmailVerificationCode(email, '123456', 'Test User');
        break;
      }
      case 'password-reset': {
        const { sendPasswordResetEmail } = require('../dist/auth/resend-email');
        success = await sendPasswordResetEmail(
          email,
          'fake-reset-token-for-testing-only',
          'Test User'
        );
        break;
      }
      case 'welcome': {
        const { sendWelcomeEmail } = require('../dist/services/stripe-email');
        success = await sendWelcomeEmail(email, 'premium', 'Test User');
        break;
      }
      case 'tier-change': {
        const { sendTierChangeEmail } = require('../dist/services/stripe-email');
        success = await sendTierChangeEmail(email, 'premium', 'standard', 'Test User');
        break;
      }
      case 'cancellation': {
        const { sendCancellationEmail } = require('../dist/services/stripe-email');
        success = await sendCancellationEmail(email, 'premium', 'Test User');
        break;
      }
      case 'contact': {
        // Override ADMIN_EMAILS so the contact form email goes to the specified address
        const originalAdminEmails = process.env.ADMIN_EMAILS;
        process.env.ADMIN_EMAILS = email;
        const { sendContactEmail } = require('../dist/auth/resend-email');
        success = await sendContactEmail(
          'fake-sender@example.com',
          'This is a test contact form message.\n\nSent by the send-test-email script to preview the contact form email template.'
        );
        if (originalAdminEmails !== undefined) {
          process.env.ADMIN_EMAILS = originalAdminEmails;
        }
        break;
      }
      case 'admin': {
        // Override ADMIN_EMAILS so the admin notification goes to the specified address
        const originalAdminEmails = process.env.ADMIN_EMAILS;
        process.env.ADMIN_EMAILS = email;
        const { sendAdminNotification } = require('../dist/auth/resend-email');
        success = await sendAdminNotification('account_deactivated', 'test-user@example.com');
        if (originalAdminEmails !== undefined) {
          process.env.ADMIN_EMAILS = originalAdminEmails;
        }
        break;
      }
    }

    if (success) {
      console.log(`✅ ${normalizedType} email sent successfully to ${email}`);
    } else {
      console.error(`❌ Failed to send ${normalizedType} email`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error sending email:', err.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  printUsage();
  process.exit(1);
}

const [type, email] = args;
sendTestEmail(type, email).catch((err) => {
  console.error(err);
  process.exit(1);
});
