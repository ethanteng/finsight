"use client";
import { Hero } from '../components/Hero';
import { WhatYouCanAsk } from '../components/WhatYouCanAsk';
import { HowItWorks } from '../components/HowItWorks';
import { Pricing } from '../components/Pricing';
import { WhyItsDifferent } from '../components/WhyItsDifferent';
import { TrustSecurity } from '../components/TrustSecurity';
import { GPTCapabilities } from '../components/GPTCapabilities';
import { FinalCTA } from '../components/FinalCTA';
import { FAQ } from '../components/FAQ';

export default function Home() {
  return (
    <div className="min-h-screen">
      <Hero />
      <WhatYouCanAsk />
      <HowItWorks />
      <Pricing />
      <WhyItsDifferent />
      <TrustSecurity />
      <GPTCapabilities />
      <FinalCTA />
      <FAQ />
    </div>
  );
}
