import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';
import { BlockState } from '@/lib/sync';
import { broadcastToDocument } from '@/lib/sse';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';
const MAX_MUTATIONS_PER_SYNC = 200;
const MAX_PAYLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  try {
    // 1. Security check: Content Length limit to prevent Out Of Memory (OOM)
    const contentLengthStr = request.headers.get('content-length');
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > MAX_PAYLOAD_SIZE_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }

    // 2. Authenticate user via JWT Cookie
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ error: 'Unauthorized: No session cookie' }, { status: 401 });
    }

    let decoded: { userId: string; email: string; name: string };
    try {
      decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as any;
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // 3. Parse and validate payload
    const body = await request.json();
    const { documentId, clientId, mutations } = body as {
      documentId: string;
      clientId: string;
      mutations: BlockState[];
    };

    if (!documentId || !clientId || !Array.isArray(mutations)) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
    }

    if (mutations.length > MAX_MUTATIONS_PER_SYNC) {
      return NextResponse.json({ error: 'Too many operations in a single sync batch' }, { status: 400 });
    }

    // 4. Authorize User role for document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const permission = await prisma.documentPermission.findFirst({
      where: { documentId, userId: decoded.userId },
    });

    const userRole = document.ownerId === decoded.userId ? 'OWNER' : permission?.role;

    if (!userRole) {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to view this document' }, { status: 403 });
    }

    // 5. Enforce Viewers are read-only
    if (userRole === 'VIEWER' && mutations.length > 0) {
      return NextResponse.json({ error: 'Forbidden: Viewers are not allowed to submit document edits' }, { status: 403 });
    }

    // 6. Process mutations with transaction-level Last-Write-Wins (LWW)
    if (mutations.length > 0 && (userRole === 'OWNER' || userRole === 'EDITOR')) {
      await prisma.$transaction(async (tx) => {
        for (const mut of mutations) {
          // Verify block is associated with correct document to prevent malicious hijacking
          if (mut.documentId !== documentId) {
            throw new Error(`Security breach: Mutation block document ID mismatch`);
          }

          const dbBlock = await tx.documentBlock.findUnique({
            where: { id: mut.id },
          });

          if (!dbBlock) {
            // Block does not exist: create it
            await tx.documentBlock.create({
              data: {
                id: mut.id,
                documentId: mut.documentId,
                type: mut.type,
                content: mut.content,
                position: mut.position,
                updatedAt: new Date(mut.updatedAt),
                updatedBy: decoded.userId,
                isDeleted: mut.isDeleted,
              },
            });
          } else {
            // Block exists: perform Last-Write-Wins merging
            const localTime = new Date(mut.updatedAt).getTime();
            const dbTime = new Date(dbBlock.updatedAt).getTime();

            if (localTime > dbTime || (localTime === dbTime && mut.updatedBy > dbBlock.updatedBy)) {
              await tx.documentBlock.update({
                where: { id: mut.id },
                data: {
                  type: mut.type,
                  content: mut.content,
                  position: mut.position,
                  updatedAt: new Date(mut.updatedAt),
                  updatedBy: decoded.userId,
                  isDeleted: mut.isDeleted,
                },
              });
            }
          }
        }
      });

      // 7. Broadcast mutations to other connected collaborators
      broadcastToDocument(documentId, clientId, 'SYNC_MUTATIONS', mutations);
    }

    // 8. Retrieve updated document status
    const serverBlocks = await prisma.documentBlock.findMany({
      where: { documentId },
    });

    const mappedBlocks: BlockState[] = serverBlocks.map((b) => ({
      id: b.id,
      documentId: b.documentId,
      type: b.type,
      content: b.content,
      position: b.position,
      updatedAt: b.updatedAt.toISOString(),
      updatedBy: b.updatedBy,
      isDeleted: b.isDeleted,
    }));

    return NextResponse.json({
      success: true,
      serverBlocks: mappedBlocks,
      syncTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
