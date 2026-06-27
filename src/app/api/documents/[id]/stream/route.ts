import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { addSSEClient, removeSSEClient } from '@/lib/sse';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const documentId = (await params).id;
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const token = searchParams.get('token');

    if (!clientId) {
      return new Response('Client ID is required', { status: 400 });
    }

    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return new Response('Invalid session token', { status: 401 });
    }

    const stream = new ReadableStream({
      start(controller) {
        // Heartbeat interval to keep connection alive in serverless/proxies
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch (err) {
            clearInterval(pingInterval);
          }
        }, 15000);

        addSSEClient(documentId, clientId, controller);

        request.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
          removeSSEClient(documentId, clientId);
        });
      },
      cancel() {
        removeSSEClient(documentId, clientId);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('SSE connection error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
