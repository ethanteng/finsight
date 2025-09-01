"use client";

import React from 'react';

interface UpgradeMessageProps {
  message?: string;
}

export default function UpgradeMessage({ message }: UpgradeMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
      <div className="text-blue-300 text-sm leading-relaxed">
        <MarkdownRenderer>{message}</MarkdownRenderer>
      </div>
    </div>
  );
}

// Simple markdown renderer for the upgrade message
function MarkdownRenderer({ children }: { children: string }) {
  // Convert markdown to HTML
  const html = children
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
