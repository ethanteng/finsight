# Ask Linc - Site Map

## Overview
This document provides a comprehensive overview of the asklinc.com website structure, including all pages, routes, and their purposes.

## Main Navigation Structure

### 🏠 Homepage (`/`)
- **Purpose**: Main landing page with product overview, features, and pricing
- **Content**: Hero section, features overview, pricing plans, testimonials, FAQ
- **Priority**: High (Primary entry point)

### 🔐 Authentication Pages
- **Login** (`/login`) - User authentication
- **Register** (`/register`) - New user registration
- **Forgot Password** (`/forgot-password`) - Password recovery
- **Reset Password** (`/reset-password`) - Password reset
- **Verify Email** (`/verify-email`) - Email verification

### 👤 User Account Pages
- **Profile** (`/profile`) - User profile management
- **App Dashboard** (`/app`) - Main application interface

### 💳 Payment & Success
- **Payment Success** (`/payment-success`) - Post-payment confirmation

### 📚 Blog Section
- **Blog Home** (`/blog`) - Main blog listing page
- **Individual Posts** (`/blog/[slug]`) - Dynamic blog post pages
- **Content**: Financial market insights, product updates, industry analysis

### 📄 Legal & Information Pages
- **Privacy Policy** (`/privacy-policy`) - Data privacy information
- **Privacy** (`/privacy`) - Privacy overview
- **Terms of Service** (`/terms`) - Terms and conditions
- **How We Protect Your Data** (`/how-we-protect-your-data`) - Security information
- **Contact** (`/contact`) - Contact information and form

### 🔧 Administrative
- **Admin Panel** (`/admin`) - Administrative interface

## URL Structure Summary

```
asklinc.com/
├── / (homepage)
├── /login
├── /register
├── /forgot-password
├── /reset-password
├── /verify-email
├── /profile
├── /app
├── /payment-success
├── /contact
├── /privacy
├── /privacy-policy
├── /terms
├── /how-we-protect-your-data
├── /admin
└── /blog
    ├── / (blog listing)
    └── /[slug] (individual posts)
```

## Content Priorities

### High Priority (0.9-1.0)
- Homepage (`/`) - Primary entry point
- App Dashboard (`/app`) - Core application

### Medium-High Priority (0.7-0.8)
- Login/Register - User acquisition
- Blog section - Content marketing
- Profile - User engagement

### Medium Priority (0.5-0.6)
- Contact - User support
- Payment success - User experience
- Password recovery - User support

### Lower Priority (0.3-0.4)
- Legal pages - Compliance
- Admin panel - Internal use

## Update Frequencies

- **Daily**: Blog section (new content)
- **Weekly**: Homepage, app dashboard
- **Monthly**: User pages and contact
- **Yearly**: Legal pages, privacy policies

## SEO Considerations

- XML sitemap available at `/sitemap.xml`
- Blog posts use dynamic routing with SEO-friendly slugs
- All pages include proper meta tags and structured data
- Mobile-responsive design for all pages
- Fast loading times optimized for Core Web Vitals

## Technical Notes

- Built with Next.js 14+ (App Router)
- Dynamic blog posts powered by Ghost CMS
- Authentication system with encrypted user data
- Stripe integration for payments
- Plaid integration for financial data
- Responsive design with Tailwind CSS

## Future Considerations

- Consider adding category pages for blog posts
- Potential for user-generated content sections
- Integration with additional financial data providers
- Enhanced admin analytics dashboard
- API documentation pages for developers
