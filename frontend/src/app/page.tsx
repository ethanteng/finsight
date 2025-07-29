"use client";
import NewHomepage from '../components/NewHomepage';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <NewHomepage />
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
        <Link
          href="/demo-mailerlite-test"
          style={{
            background: '#fff',
            color: '#222',
            border: '1px solid #ccc',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 14,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}
        >
          Test MailerLite Embed
        </Link>
      </div>
    </>
  );
}
