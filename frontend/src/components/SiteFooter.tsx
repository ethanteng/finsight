"use client";
import { Brain } from 'lucide-react';
import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="bg-muted/50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-90 transition-opacity">
            <Brain className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold gradient-text">Ask Linc</span>
          </Link>
          <div className="flex items-center space-x-6 text-sm text-muted-foreground">
            <Link href="/faq" className="hover:text-primary transition-colors">
              FAQ
            </Link>
            <Link href="/how-we-protect-your-data" className="hover:text-primary transition-colors">
              How We Protect Your Data
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-primary transition-colors">
              Contact
            </Link>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Ask Linc. Your AI financial analyst. Built with privacy in mind.
            </p>
            <div className="flex items-center space-x-4">
              <a 
                href="https://bsky.app/profile/asklinc.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <img 
                  src="/logos/bluesky.jpeg" 
                  alt="Bluesky" 
                  className="w-4 h-4"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="w-4 h-4 bg-blue-500 rounded hidden"></div>
                <span>Bluesky</span>
              </a>
              <a 
                href="https://asklinc.substack.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <img 
                  src="/logos/substack.png" 
                  alt="Substack" 
                  className="w-4 h-4"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="w-4 h-4 bg-orange-500 rounded hidden"></div>
                <span>Substack</span>
              </a>
              <a 
                href="https://www.linkedin.com/company/ask-linc/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <img 
                  src="/logos/linkedin.png" 
                  alt="LinkedIn" 
                  className="w-4 h-4"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="w-4 h-4 bg-[#0A66C2] rounded hidden"></div>
                <span>LinkedIn</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
