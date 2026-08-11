import { Inter } from 'next/font/google'
import './globals.css'
import StructuredData from '../components/StructuredData'
import HeyCatchRouteGuard from '../components/HeyCatchRouteGuard'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

// Organization structured data
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Ask Linc",
  "url": "https://asklinc.com",
  "logo": "https://asklinc.com/logo.png",
  "description": "AI-powered financial reasoning platform that helps users understand and optimize their financial health using real data, goals, and live market conditions.",
  "sameAs": [
    "https://bsky.app/profile/asklinc.com",
    "https://asklinc.substack.com/",
    "https://www.linkedin.com/company/ask-linc/",
    "https://www.linkedin.com/in/ethanteng"
  ],
  "founder": {
    "@type": "Person",
    "name": "Ethan Teng",
    "url": "https://www.linkedin.com/in/ethanteng"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "Customer Service",
    "url": "https://asklinc.com/contact"
  }
};

// Website structured data
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Ask Linc",
  "url": "https://asklinc.com",
  "description": "AI Financial Reasoning Platform - Get decisions-ready answers about your finances using your real data, goals, and live market conditions.",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://asklinc.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
};

export const metadata: Metadata = {
  metadataBase: new URL('https://asklinc.com'),
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light">
      <head>
        {/* Structured Data */}
        <StructuredData data={organizationSchema} />
        <StructuredData data={websiteSchema} />
        
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-PL362L36');
            `,
          }}
        />
        {/* End Google Tag Manager */}
        
        {/* Plausible Analytics - Privacy-focused analytics */}
        <script 
          defer 
          data-domain="asklinc.com" 
          src="https://plausible.io/js/script.js"
        />
        
        {/* Google Analytics 4 (Alternative) */}
        {/* 
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                page_title: document.title,
                page_location: window.location.href,
              });
            `,
          }}
        />
        */}
      </head>
      <body className={inter.className}>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe 
            src="https://www.googletagmanager.com/ns.html?id=GTM-PL362L36"
            height="0" 
            width="0" 
            style={{display:'none',visibility:'hidden'}}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <HeyCatchRouteGuard />
        {children}
      </body>
    </html>
  )
}
