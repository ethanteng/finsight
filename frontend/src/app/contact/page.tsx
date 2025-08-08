"use client";
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Brain, MessageCircle, Send, CheckCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

const ContactPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/auth/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSubmitted(true);
        setFormData({ email: '', message: '' });
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to send message. Please try again.');
      }
    } catch (_err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
                Home
              </Link>
              <a 
                href="https://ask-linc-blog.ghost.io/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Our Blog
              </a>
              <Link href="/demo" className="text-muted-foreground hover:text-primary transition-colors">
                Demo
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 bg-gradient-to-br from-primary/20 to-secondary/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        
        <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-8">
            <Badge variant="secondary" className="animate-pulse-glow">
              <MessageCircle className="h-4 w-4 mr-2" />
              Get in Touch
            </Badge>
            
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Contact <span className="gradient-text">Ask Linc</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Have questions, feedback, or need help? We'd love to hear from you. 
              Our team is here to help you get the most out of your financial AI assistant.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {!isSubmitted ? (
            <Card className="glass-card">
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                      placeholder="your@email.com"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      required
                      rows={6}
                      className="w-full px-4 py-3 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors resize-none"
                      placeholder="Tell us about your question, feedback, or how we can help..."
                    />
                  </div>

                  {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-destructive text-sm">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="hero"
                    size="xl"
                    className="w-full group"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Send className="h-4 w-4" />
                        <span>Send Message</span>
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <div className="flex justify-center mb-4">
                  <CheckCircle className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  Thanks for your feedback!
                </h3>
                <p className="text-muted-foreground">
                  We'll reply as soon as we can. In the meantime, feel free to explore our demo or check out our latest updates.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/demo">
                    <Button variant="outline">
                      Try the Demo
                    </Button>
                  </Link>
                  <Link href="/">
                    <Button variant="outline">
                      Back to Home
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Social Links Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Follow <span className="gradient-text">Ask Linc</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Stay updated with our latest insights, tips, and financial AI developments
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a 
              href="https://bsky.app/profile/asklinc.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-6 py-3 bg-input border border-border rounded-lg hover:bg-accent transition-colors group"
            >
              <img 
                src="/logos/bluesky.jpeg" 
                alt="Bluesky" 
                className="w-5 h-5"
                onError={(e) => {
                  // Fallback to colored square if logo fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="w-5 h-5 bg-blue-500 rounded hidden"></div>
              <span>Bluesky</span>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
            
            <a 
              href="https://asklinc.substack.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-6 py-3 bg-input border border-border rounded-lg hover:bg-accent transition-colors group"
            >
              <img 
                src="/logos/substack.png" 
                alt="Substack" 
                className="w-5 h-5"
                onError={(e) => {
                  // Fallback to colored square if logo fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="w-5 h-5 bg-orange-500 rounded hidden"></div>
              <span>Substack</span>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold gradient-text">Ask Linc</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
              <Link 
                href="/privacy" 
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                href="/terms" 
                className="hover:text-primary transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                href="/contact" 
                className="hover:text-primary transition-colors"
              >
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-muted-foreground">
                &copy; 2025 Ask Linc. Your AI financial analyst. Built with privacy in mind.
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
                      // Fallback to colored square if logo fails to load
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
                      // Fallback to colored square if logo fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="w-4 h-4 bg-orange-500 rounded hidden"></div>
                  <span>Substack</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ContactPage;
