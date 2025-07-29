"use client";
import { useEffect } from 'react';

// Declare the MailerLite global type
declare global {
  interface Window {
    ml?: (command: string, ...args: unknown[]) => void;
  }
}

export default function MailerLiteScript() {
  useEffect(() => {
    // Load MailerLite script
    const script = document.createElement('script');
    script.src = 'https://assets.mailerlite.com/js/universal.js';
    script.async = true;
    script.onload = () => {
      console.log('MailerLite script loaded successfully');
      if (typeof window !== 'undefined' && window.ml) {
        window.ml('account', '1687893');
        console.log('MailerLite account initialized');
      }
    };
    script.onerror = () => {
      console.error('Failed to load MailerLite script');
    };
    
    document.head.appendChild(script);
    
    return () => {
      // Cleanup
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return null;
} 