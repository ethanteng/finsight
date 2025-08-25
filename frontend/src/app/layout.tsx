import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Ask Linc - AI Financial Assistant | Transform Your Financial Life',
  description: 'Ask Linc is your AI-powered financial assistant that transforms how you manage money. Get personalized financial advice, securely connect your bank accounts, and gain real-time insights with cutting-edge AI technology.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
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
      <body className={inter.className}>{children}</body>
    </html>
  )
}
