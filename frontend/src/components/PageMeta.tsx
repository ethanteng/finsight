"use client";
import { useEffect } from 'react';

interface PageMetaProps {
  title: string;
  description: string;
}

export default function PageMeta({ title, description }: PageMetaProps) {
  useEffect(() => {
    // Force update document title
    document.title = title;
    
    // Remove any existing meta description tags first
    const existingMetaDescriptions = document.querySelectorAll('meta[name="description"]');
    existingMetaDescriptions.forEach(meta => meta.remove());
    
    // Create new meta description
    const metaDescription = document.createElement('meta');
    metaDescription.setAttribute('name', 'description');
    metaDescription.setAttribute('content', description);
    document.head.appendChild(metaDescription);
    
    // Remove any existing Open Graph description tags
    const existingOgDescriptions = document.querySelectorAll('meta[property="og:description"]');
    existingOgDescriptions.forEach(meta => meta.remove());
    
    // Create new Open Graph description
    const ogDescription = document.createElement('meta');
    ogDescription.setAttribute('property', 'og:description');
    ogDescription.setAttribute('content', description);
    document.head.appendChild(ogDescription);
    
    // Remove any existing Open Graph title tags
    const existingOgTitles = document.querySelectorAll('meta[property="og:title"]');
    existingOgTitles.forEach(meta => meta.remove());
    
    // Create new Open Graph title
    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.setAttribute('content', title);
    document.head.appendChild(ogTitle);
    
    // Also update any existing title tags in the head
    const existingTitles = document.querySelectorAll('title');
    if (existingTitles.length > 0) {
      existingTitles[0].textContent = title;
    }
  }, [title, description]);

  return null;
}
