'use client';

import { useEffect } from 'react';

interface AnalyticsProps {
  type: 'plausible' | 'google-analytics';
  domain?: string;
  gaId?: string;
}

interface PlausibleEvent {
  (eventName: string, options?: { props?: Record<string, unknown> }): void;
}

interface GtagEvent {
  (command: 'event', eventName: string, parameters?: Record<string, unknown>): void;
}

declare global {
  interface Window {
    plausible?: PlausibleEvent;
    gtag?: GtagEvent;
  }
}

export default function Analytics({ type, domain = 'asklinc.com', gaId }: AnalyticsProps) {
  useEffect(() => {
    if (type === 'plausible') {
      // Plausible Analytics is loaded via script tag in layout
      console.log('Plausible Analytics enabled for domain:', domain);
    } else if (type === 'google-analytics' && gaId) {
      // Google Analytics 4
      const script1 = document.createElement('script');
      script1.async = true;
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(script1);

      const script2 = document.createElement('script');
      script2.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaId}', {
          page_title: document.title,
          page_location: window.location.href,
        });
      `;
      document.head.appendChild(script2);
    }
  }, [type, domain, gaId]);

  return null;
}

// Custom hook for tracking events
export const useAnalytics = () => {
  const trackEvent = (eventName: string, properties?: Record<string, unknown>) => {
    // Track with Plausible
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible(eventName, { props: properties });
    }
    
    // Track with Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, properties);
    }
  };

  const trackPageView = (url: string) => {
    // Plausible tracks pageviews automatically
    // Google Analytics 4 tracks pageviews automatically
    console.log('Page view tracked:', url);
  };

  const trackConversion = (conversionName: string, value?: number) => {
    trackEvent(conversionName, { value });
  };

  return {
    trackEvent,
    trackPageView,
    trackConversion,
  };
}; 