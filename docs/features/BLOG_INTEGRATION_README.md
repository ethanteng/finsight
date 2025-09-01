# Ghost Blog Integration

This project integrates with Ghost.io to display blog posts on the `/blog` route.

## Setup

### 1. Environment Variables

Set the following environment variables in your Vercel deployment:

```bash
GHOST_URL=https://your-ghost-blog.ghost.io
GHOST_CONTENT_KEY=your_content_api_key_here
```

### 2. Ghost Configuration

1. Go to your Ghost Admin panel
2. Navigate to **Settings → Integrations**
3. Click **Add custom integration**
4. Copy the **Content API Key** and your Ghost URL

## Features

### Blog Index Page (`/blog`)
- Displays a grid of blog posts with feature images
- Shows post metadata (title, excerpt, author, reading time, publish date)
- Responsive design with hover effects
- Tags display
- Author information with profile images

### Individual Blog Post (`/blog/[slug]`)
- Full post content with proper HTML rendering
- Feature image display
- Author information and metadata
- Tags display
- Back to blog navigation
- Responsive typography using Tailwind Typography plugin

## Technical Details

### Dependencies
- `@tryghost/content-api` - Ghost Content API client
- `@tailwindcss/typography` - Enhanced typography for blog content

### File Structure
```
src/app/blog/
├── layout.tsx          # Blog layout with metadata
├── page.tsx            # Blog index page
└── [slug]/
    └── page.tsx        # Individual blog post page

src/lib/
└── ghost.ts            # Ghost API configuration and types
```

### Key Features
- **ISR (Incremental Static Regeneration)**: Pages revalidate every 60 seconds
- **Image Optimization**: Uses Next.js Image component with Ghost domain allowlist
- **Type Safety**: Full TypeScript support with proper type definitions
- **Error Handling**: Graceful fallbacks when Ghost client is unavailable
- **SEO**: Proper meta tags and Open Graph support
- **Responsive Design**: Mobile-first design with Tailwind CSS

### Image Domains
The following domains are allowed for images:
- `images.ghost.io`
- `static.ghost.org`
- `ask-linc-blog.ghost.io`
- `blog.asklinc.com`

## Development

### Local Development
The blog will show "No posts found" in local development unless you set the environment variables in a `.env.local` file.

### Building
The application builds successfully even without Ghost environment variables, making it suitable for CI/CD pipelines.

## Customization

### Styling
- Blog styling uses Tailwind CSS classes
- Typography is enhanced with the `@tailwindcss/typography` plugin
- Custom CSS utilities for line clamping are available in `globals.css`

### Content Processing
- HTML content from Ghost is processed to fix absolute links
- Links from `https://*.ghost.io/` and `https://blog.asklinc.com/` are converted to `/blog/` for proper routing
- Ghost's original formatting classes and structure are preserved
- Enhanced typography with Tailwind Typography plugin and custom CSS
- Support for Ghost-specific elements like galleries, callouts, and toggle cards

### Metadata
- Blog pages include proper SEO meta tags
- Open Graph tags for social media sharing
- Twitter Card support

## Troubleshooting

### Common Issues

1. **"No posts found" message**
   - Check that `GHOST_URL` and `GHOST_CONTENT_KEY` are set correctly
   - Verify the Ghost integration is active and has the correct permissions

2. **Build errors**
   - Ensure all dependencies are installed
   - Check that TypeScript types are properly configured

3. **Images not loading**
   - Verify the Ghost domain is in the `next.config.ts` allowlist
   - Check that the image URLs are accessible

### Debug Mode
The Ghost client logs warnings when not configured, which helps with debugging during development.
