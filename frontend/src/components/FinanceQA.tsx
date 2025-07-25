import React, { useState } from 'react';

export default function FinanceQA() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch('http://localhost:3000/ask', {
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
        <label htmlFor="finance-question">Ask a question about your finances:</label>
        <div style={{ display: 'flex', marginTop: 8 }}>
          <input
            id="finance-question"
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            style={{ flex: 1, marginRight: 8 }}
            disabled={loading}
            placeholder="e.g. How much did I spend last month?"
            required
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? 'Asking...' : 'Ask'}
          </button>
        </div>
      </form>
      {answer && (
        <div style={{ marginTop: 16, background: '#f6f8fa', padding: 12, borderRadius: 6 }}>
          <strong>Answer:</strong>
          <div>{answer}</div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, color: 'red' }}>{error}</div>
      )}
    </div>
  );
} 