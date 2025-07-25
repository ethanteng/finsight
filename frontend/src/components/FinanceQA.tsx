"use client";

import React, { useState } from 'react';

export default function FinanceQA() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (data.answer) {
        setAnswer(data.answer);
      } else {
        setError('No answer returned.');
      }
    } catch (err) {
      setError('Error contacting backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 32 }}>
      <form onSubmit={askQuestion}>
        <label htmlFor="finance-question" style={{ fontWeight: 500 }}>
          Ask a question about your finances:
        </label>
        <div style={{ display: 'flex', marginTop: 8 }}>
          <input
            id="finance-question"
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            style={{
              flex: 1,
              marginRight: 8,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#23272f',
              color: '#f3f6fa',
              fontSize: 16,
            }}
            disabled={loading}
            placeholder="e.g. How much did I spend last month?"
            required
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              background: '#4f8cff',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Asking...' : 'Ask'}
          </button>
        </div>
      </form>
      {answer && (
        <div
          style={{
            marginTop: 16,
            background: '#181c20',
            color: '#f3f6fa',
            padding: 16,
            borderRadius: 8,
            fontSize: 16,
            whiteSpace: 'pre-line',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <strong>Answer:</strong>
          <div>{answer}</div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, color: '#ff6b6b' }}>{error}</div>
      )}
    </div>
  );
} 