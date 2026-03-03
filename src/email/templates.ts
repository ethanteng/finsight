/**
 * Shared email template module for Ask Linc.
 * Professional, clean design for financial planning communications.
 */

// Get base URL for development vs production
export function getBaseUrl(): string {
  const isDevelopment =
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === 'development' ||
    process.env.FRONTEND_URL?.includes('localhost');
  return isDevelopment ? 'http://localhost:3001' : (process.env.FRONTEND_URL || 'http://localhost:3001');
}

export interface CreateEmailHtmlOptions {
  /** Page title (used in <title>) */
  title?: string;
  /** Optional header subtitle override (default: "Your AI Financial Assistant") */
  headerSubtitle?: string;
  /** Footer note shown below copyright (e.g. "This email was sent to X") */
  footerNote?: string;
}

/**
 * Creates a full HTML email with Ask Linc branding.
 * @param content - HTML content for the main body area
 * @param options - Optional title, header subtitle, and footer note
 */
export function createEmailHtml(content: string, options: CreateEmailHtmlOptions = {}): string {
  const baseUrl = getBaseUrl();
  const { title = 'Ask Linc', headerSubtitle = 'Your AI Financial Assistant', footerNote } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .header {
      background-color: #0f766e;
      padding: 32px 24px;
      text-align: center;
      color: white;
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }
    .logo-text {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .header-subtitle {
      font-size: 14px;
      opacity: 0.9;
      margin: 0;
      font-weight: 400;
    }
    .content {
      padding: 32px 24px;
      background-color: #ffffff;
    }
    .welcome-message {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 20px;
    }
    .description {
      font-size: 16px;
      color: #4b5563;
      line-height: 1.7;
      margin-bottom: 32px;
    }
    .verification-code {
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      color: #111827;
      padding: 20px;
      border-radius: 4px;
      text-align: center;
      margin: 24px 0;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: 4px;
      font-family: 'Courier New', monospace;
    }
    .expiration-notice {
      background-color: #fffbeb;
      border-left: 3px solid #d97706;
      padding: 14px 16px;
      margin: 20px 0;
      border-radius: 0 4px 4px 0;
    }
    .expiration-notice p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      background-color: #ffffff;
      color: #0f766e;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
      font-size: 15px;
      margin: 20px 0;
      text-align: center;
      border: 2px solid #0f766e;
    }
    .fallback-link {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 14px 16px;
      border-radius: 4px;
      margin: 20px 0;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #374151;
      word-break: break-all;
    }
    .time-limit {
      background-color: #fffbeb;
      border-left: 3px solid #d97706;
      padding: 14px 16px;
      margin: 20px 0;
      border-radius: 0 4px 4px 0;
    }
    .time-limit p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }
    .security-note {
      background-color: #f8fafc;
      border-left: 3px solid #64748b;
      padding: 14px 16px;
      margin: 20px 0;
      border-radius: 0 4px 4px 0;
    }
    .security-note p {
      margin: 0;
      color: #0c4a6e;
      font-size: 14px;
    }
    .tier-badge {
      display: inline-block;
      background-color: #f3f4f6;
      color: #374151;
      padding: 6px 14px;
      border-radius: 4px;
      font-weight: 500;
      font-size: 13px;
      margin-bottom: 20px;
    }
    .feature-list {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 20px;
      margin: 20px 0;
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
      color: #6b7280;
      margin-right: 10px;
      font-size: 14px;
    }
    .message-block {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 18px;
      margin: 18px 0;
    }
    .footer {
      background-color: #f1f5f9;
      color: #334155;
      padding: 24px;
      text-align: center;
    }
    .footer-links {
      margin-bottom: 20px;
    }
    .footer-link {
      color: #0f766e;
      text-decoration: none;
      margin: 0 12px;
      font-size: 13px;
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
      .verification-code {
        font-size: 24px;
        letter-spacing: 2px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="background-color: #0f766e; padding: 32px 24px; text-align: center; color: #ffffff;">
      <div class="logo">
        <div class="logo-text" style="font-size: 22px; font-weight: 600; color: #ffffff;">Ask Linc</div>
      </div>
      <p class="header-subtitle" style="font-size: 14px; margin: 0; color: #ffffff; opacity: 0.95;">${headerSubtitle}</p>
    </div>

    <div class="content">
      ${content}
    </div>

    <div class="footer" style="background-color: #f1f5f9; color: #334155; padding: 24px; text-align: center;">
      <div class="footer-links" style="margin-bottom: 20px;">
        <a href="${baseUrl}" style="color: #0f766e; text-decoration: none; margin: 0 12px; font-size: 13px;">Home</a>
        <a href="https://asklinc.com/features" style="color: #0f766e; text-decoration: none; margin: 0 12px; font-size: 13px;">Features</a>
        <a href="${baseUrl}/how-we-protect-your-data" style="color: #0f766e; text-decoration: none; margin: 0 12px; font-size: 13px;">Privacy</a>
        <a href="https://blog.asklinc.com/" style="color: #0f766e; text-decoration: none; margin: 0 12px; font-size: 13px;">Blog</a>
      </div>

      <p style="margin: 0; color: #475569;">© ${new Date().getFullYear()} Ask Linc. All rights reserved.</p>
      ${footerNote ? `<p style="margin: 5px 0 0 0; color: #475569; font-size: 12px;">${footerNote}</p>` : ''}
    </div>
  </div>
</body>
</html>
`;
}
