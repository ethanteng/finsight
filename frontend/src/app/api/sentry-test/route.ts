import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Create a performance span for this API call
  return Sentry.startSpan(
    {
      op: 'http.server',
      name: 'GET /api/sentry-test',
    },
    async () => {
      try {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Add some context to the span
        Sentry.setTag('api_endpoint', 'sentry-test');
        Sentry.setContext('request', {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent'),
        });
        
        // Log some information
        const { logger } = Sentry;
        logger.info('Sentry test API endpoint called', {
          endpoint: '/api/sentry-test',
          method: 'GET',
          timestamp: new Date().toISOString(),
        });
        
        // Simulate occasional errors (10% chance)
        if (Math.random() < 0.1) {
          throw new Error('Random test error from API endpoint');
        }
        
        return NextResponse.json({
          success: true,
          message: 'Sentry test API working correctly',
          timestamp: new Date().toISOString(),
          features: [
            'Error monitoring',
            'Performance tracing',
            'Structured logging',
            'User context',
            'Session replay'
          ]
        });
        
      } catch (error) {
        // Capture the error in Sentry
        Sentry.captureException(error, {
          tags: {
            endpoint: 'sentry-test',
            error_type: 'api_error'
          },
          extra: {
            requestMethod: request.method,
            requestUrl: request.url,
          }
        });
        
        // Return error response
        return NextResponse.json(
          {
            success: false,
            error: 'Test error occurred',
            message: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
    }
  );
}
