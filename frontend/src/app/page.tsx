"use client";
import React from 'react';

const navy = '#10192A';
const green = '#3CB371';
const lightNavy = '#1A2336';
const mutedGreen = '#A3D9B1';
const white = '#fff';
const gray = '#B0B8C1';

const sectionStyle = {
  maxWidth: 700,
  margin: '0 auto',
  padding: '2.5rem 1.25rem',
};

const headingStyle = {
  fontWeight: 800,
  fontSize: '2.2rem',
  marginBottom: '0.5rem',
  color: white,
  letterSpacing: '-1px',
};

const subheadStyle = {
  fontSize: '1.2rem',
  color: gray,
  marginBottom: '1.5rem',
  fontWeight: 400,
};

const ctaStyle = {
  background: green,
  color: white,
  border: 'none',
  borderRadius: 8,
  padding: '1rem 2.5rem',
  fontSize: '1.1rem',
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 24,
  marginBottom: 8,
  boxShadow: '0 2px 8px rgba(60,179,113,0.15)'
};

const cardStyle = {
  background: lightNavy,
  borderRadius: 12,
  padding: '1.5rem',
  margin: '1rem 0',
  color: white,
  boxShadow: '0 2px 8px rgba(16,25,42,0.08)'
};

const faqQStyle = {
  fontWeight: 700,
  color: mutedGreen,
  marginTop: 16,
};

const faqAStyle = {
  color: gray,
  marginBottom: 8,
};

export default function LandingPage() {
  return (
    <div style={{ background: navy, minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: white }}>
      {/* Hero Section */}
      <section style={{ ...sectionStyle, textAlign: 'center', paddingTop: 56 }}>
        <img src="https://placehold.co/80x80?text=FS" alt="AskLinc Logo" style={{ borderRadius: 16, marginBottom: 16 }} />
        <h1 style={headingStyle}>Meet Linc</h1>
        <div style={subheadStyle}>ChatGPT + your financial life + real-world context.</div>
        <div style={{ color: gray, fontSize: '1.1rem', marginBottom: 24 }}>
          No dashboards. No spreadsheets. Just connect your accounts and ask a question — Linc analyzes your actual data, plus what’s happening in the market, to give you smart answers.
        </div>
        <button style={ctaStyle}>Join the Waitlist</button>
      </section>

      {/* What You Can Ask */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>What You Can Ask</h2>
        <div style={{ color: gray, marginBottom: 16 }}>Real-world questions Linc can answer, using your data and today’s market:</div>
        <ul style={{ color: white, fontSize: '1.05rem', lineHeight: 1.7, paddingLeft: 24 }}>
          <li>What’s our actual asset allocation across all accounts?</li>
          <li>Are we overpaying in fees?</li>
          <li>Which of our CDs mature next month?</li>
          <li>How much cash is just sitting in low-yield savings?</li>
          <li>Can we realistically retire at 62? If not, what would need to change?</li>
          <li>Are Treasuries a better move than CDs right now?</li>
          <li>Should we refinance with today’s mortgage rates?</li>
        </ul>
      </section>

      {/* How It Works */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>How It Works</h2>
        <ol style={{ color: white, fontSize: '1.05rem', lineHeight: 1.7, paddingLeft: 24 }}>
          <li>Connect your accounts (via Plaid)</li>
          <li>Ask a question in plain English</li>
          <li>Linc uses your data + live market info to give you an actionable answer</li>
        </ol>
        <div style={{ color: gray, marginTop: 8 }}>No dashboards. No spreadsheets. No setup required.</div>
      </section>

      {/* Pricing & Plans */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>Pricing & Plans</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <strong>Free Tier</strong>
            <ul style={{ margin: 0, paddingLeft: 20, color: gray }}>
              <li>Link up to 3 accounts</li>
              <li>Ask 5 GPT-powered questions/month</li>
              <li>No market data or scenario modeling</li>
              <li>Perfect for light users or early exploration</li>
            </ul>
          </div>
          <div style={cardStyle}>
            <strong>Standard — $9.99/mo</strong>
            <ul style={{ margin: 0, paddingLeft: 20, color: gray }}>
              <li>Unlimited accounts</li>
              <li>Unlimited financial questions</li>
              <li>Full access to your data across accounts</li>
              <li>No real-time economic context</li>
            </ul>
          </div>
          <div style={cardStyle}>
            <strong>Premium — $29.99/mo</strong>
            <ul style={{ margin: 0, paddingLeft: 20, color: gray }}>
              <li>Everything in Standard</li>
              <li>Live market context: CD rates, Treasury yields, mortgage trends</li>
              <li>Smart “what-if” analysis and planning</li>
              <li>More powerful GPT answers with real-world inputs</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Why It's Different */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>Why It’s Different</h2>
        <div style={{ color: gray, fontSize: '1.1rem', marginBottom: 8 }}>
          Not a tracker. Not a robo-advisor. Not a static dashboard.<br />
          This is <strong style={{ color: mutedGreen }}>on-demand financial analysis</strong>, powered by ChatGPT + real-time market awareness.<br />
          You ask the questions. Linc finds the answers — in your data <em>and</em> in the world.
        </div>
      </section>

      {/* Trust & Security */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>Trust & Security</h2>
        <div style={{ color: gray, fontSize: '1.05rem', marginBottom: 8 }}>
          <img src="https://placehold.co/120x32?text=Plaid" alt="Plaid logo" style={{ display: 'block', margin: '0 auto 12px', background: '#fff', borderRadius: 6 }} />
          Powered by <strong>Plaid</strong> — the same secure tech used by Venmo, AmEx, and thousands of banks<br />
          <strong>Read-only access</strong> to your financial accounts — we can’t move your money<br />
          Your account data is <strong>not stored, sold, or shared</strong><br />
          Your questions and data are processed by ChatGPT <strong>in a privacy-protected environment</strong><br />
          You’re always in control — disconnect anytime with one click<br />
          <br /><strong>Your data, your rules.</strong>
        </div>
      </section>

      {/* What GPT Can and Can't Do */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.4rem', color: mutedGreen }}>What ChatGPT Can and Can’t Do Out of the Box</h2>
        <div style={{ color: gray, fontSize: '1.05rem', marginBottom: 8 }}>
          <strong>✅ Knows:</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Financial theory (e.g. asset allocation, tax optimization)</li>
            <li>Best practices for budgeting and investing</li>
            <li>How to reason through questions with logic</li>
          </ul>
          <strong style={{ display: 'block', marginTop: 12 }}>🚫 Doesn’t know:</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Today’s CD or Treasury rates</li>
            <li>Current economic headlines or Fed moves</li>
            <li>Anything that’s happened since late 2023</li>
          </ul>
          <div style={{ marginTop: 12 }}>
            That’s where <strong style={{ color: mutedGreen }}>Linc</strong> makes a real difference.<br />
            We feed trusted real-time data into ChatGPT behind the scenes — so when you ask, <em>“Should I roll over this CD?”</em>, you get an answer based on <strong>today’s best rates</strong> and <strong>your actual accounts</strong>.
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ ...sectionStyle, textAlign: 'center' }}>
        <h2 style={{ ...headingStyle, fontSize: '1.5rem', color: green, marginBottom: 8 }}>You’ve got financial questions. Linc has answers — based on your real data and the real world.</h2>
        <button style={ctaStyle}>Join the Waitlist</button>
      </section>

      {/* FAQ */}
      <section style={sectionStyle}>
        <h2 style={{ ...headingStyle, fontSize: '1.3rem', color: mutedGreen }}>FAQ</h2>
        <div style={faqQStyle}>“I don’t want to give ChatGPT all my financial data…”</div>
        <div style={faqAStyle}>Totally fair. That’s why we use <strong>Plaid</strong>, not your login info — and your data is read-only, never stored, and never used to train models.</div>
        <div style={faqQStyle}>“How does GPT know what’s going on in the market?”</div>
        <div style={faqAStyle}>On its own, it doesn’t. That’s why Linc pulls in real-time data — like CD rates, bond yields, and current news — and feeds it into ChatGPT as context for your questions.</div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', color: gray, fontSize: '0.95rem', padding: '2rem 0 1rem' }}>
        &copy; {new Date().getFullYear()} Linc. All rights reserved.
      </footer>
    </div>
  );
}
