'use client';

import React, { useState } from 'react';
import { useAnalytics } from './Analytics';

interface AnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}

export default function AnalyticsDashboard() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const { trackEvent } = useAnalytics();

  // Mock analytics data for demonstration
  const mockAnalytics = {
    pageViews: 1247,
    questionsAsked: 892,
    accountsConnected: 156,
    conversionRate: 12.5,
    topQuestions: [
      'How much did I spend on dining?',
      'What\'s my current balance?',
      'Show me my investment portfolio',
      'How much did I save this month?'
    ]
  };

  const addEvent = (eventName: string, properties: Record<string, unknown> = {}) => {
    const newEvent: AnalyticsEvent = {
      event: eventName,
      properties,
      timestamp: new Date()
    };
    setEvents(prev => [newEvent, ...prev.slice(0, 9)]); // Keep last 10 events
    trackEvent(eventName, properties);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      <h2 className="text-2xl font-bold text-white mb-4">Analytics Overview</h2>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-400">{mockAnalytics.pageViews}</div>
          <div className="text-sm text-gray-300">Page Views</div>
        </div>
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-400">{mockAnalytics.questionsAsked}</div>
          <div className="text-sm text-gray-300">Questions Asked</div>
        </div>
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-400">{mockAnalytics.accountsConnected}</div>
          <div className="text-sm text-gray-300">Accounts Connected</div>
        </div>
        <div className="bg-gray-700 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-400">{mockAnalytics.conversionRate}%</div>
          <div className="text-sm text-gray-300">Conversion Rate</div>
        </div>
      </div>

      {/* Top Questions */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Top Questions</h3>
        <ul className="space-y-2">
          {mockAnalytics.topQuestions.map((question, index) => (
            <li key={index} className="text-gray-300 text-sm">
              "{question}"
            </li>
          ))}
        </ul>
      </div>

      {/* Recent Events */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Recent Events</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {events.map((event, index) => (
            <div key={index} className="text-xs text-gray-300 border-l-2 border-blue-500 pl-2">
              <div className="font-medium">{event.event}</div>
              <div className="text-gray-400">
                {event.timestamp.toLocaleTimeString()} - {JSON.stringify(event.properties)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Buttons */}
      <div className="space-x-2">
        <button 
          onClick={() => addEvent('test_event', { category: 'demo', value: 1 })}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Test Event
        </button>
        <button 
          onClick={() => addEvent('conversion_test', { value: 100 })}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          Test Conversion
        </button>
      </div>
    </div>
  );
} 