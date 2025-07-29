"use client";
import { useEffect } from 'react';

export default function MailerLiteScript() {
  useEffect(() => {
    // Load MailerLite script
    const script = document.createElement('script');
    script.src = 'https://assets.mailerlite.com/js/universal.js';
    script.async = true;
    script.onload = () => {
      console.log('MailerLite script loaded successfully');
      if (typeof window !== 'undefined' && (window as any).ml) {
        (window as any).ml('account', '1687893');
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