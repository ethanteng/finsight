'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

export default function SentryTestPage() {
  const [isLoading, setIsLoading] = useState(false);

  const throwFrontendError = () => {
    throw new Error('This is a test frontend error for Sentry');
  };

  const testAPICall = async () => {
    setIsLoading(true);
    
    // Create a performance span for the API call
    await Sentry.startSpan(
      {
        op: 'http.client',
        name: 'Test API Call',
      },
      async (span) => {
        try {
          const response = await fetch('/api/sentry-test');
          if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
          }
          const data = await response.json();
          console.log('API response:', data);
          
          // Add some attributes to the span
          span.setAttribute('status', response.status);
          span.setAttribute('response_size', JSON.stringify(data).length);
          
          return data;
        } catch (error) {
          // Capture the error in Sentry
          Sentry.captureException(error);
          throw error;
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const testLogging = () => {
    const { logger } = Sentry;
    
    logger.info('This is an info log message', {
      userId: 'test-user-123',
      action: 'test_logging',
      timestamp: new Date().toISOString(),
    });
    
    logger.warn('This is a warning log message', {
      component: 'SentryTestPage',
      severity: 'medium',
    });
    
    logger.error('This is an error log message', {
      errorCode: 'TEST_ERROR',
      context: 'sentry_testing',
    });
    
    alert('Log messages sent to Sentry! Check your Sentry dashboard.');
  };

  const testUserContext = () => {
    Sentry.setUser({
      id: 'test-user-123',
      email: 'test@asklinc.com',
      username: 'testuser',
    });
    
    Sentry.setTag('user_type', 'test');
    Sentry.setTag('test_session', 'true');
    
    alert('User context set! Future events will include this user information.');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Sentry Integration Test
          </h1>
          <p className="text-xl text-gray-600">
            Test various Sentry features to ensure they're working correctly
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Error Testing */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Error Monitoring
            </h2>
            <div className="space-y-4">
              <button
                onClick={throwFrontendError}
                className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Throw Frontend Error
              </button>
              <p className="text-sm text-gray-600">
                This will throw an error that should be captured by Sentry
              </p>
            </div>
          </div>

          {/* Performance Testing */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Performance Tracing
            </h2>
            <div className="space-y-4">
              <button
                onClick={testAPICall}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Testing...' : 'Test API Call'}
              </button>
              <p className="text-sm text-gray-600">
                This will create a performance span for the API call
              </p>
            </div>
          </div>

          {/* Logging Testing */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Logging
            </h2>
            <div className="space-y-4">
              <button
                onClick={testLogging}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Test Logging
              </button>
              <p className="text-sm text-gray-600">
                Send test log messages to Sentry
              </p>
            </div>
          </div>

          {/* User Context Testing */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              User Context
            </h2>
            <div className="space-y-4">
              <button
                onClick={testUserContext}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors"
              >
                Set User Context
              </button>
              <p className="text-sm text-gray-600">
                Set user information and tags for future events
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What to Check
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                In Your Sentry Dashboard:
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Issues page for captured errors</li>
                <li>• Performance page for traces and spans</li>
                <li>• Replays page for session recordings</li>
                <li>• Logs page for log messages</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Features Tested:
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Error monitoring and capture</li>
                <li>• Performance tracing with spans</li>
                <li>• Structured logging</li>
                <li>• User context and tags</li>
                <li>• Session replay (automatic)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
