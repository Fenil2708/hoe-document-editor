import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';
import { BlockState } from '@/lib/sync';
import { broadcastToDocument } from '@/lib/sse';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: documentId, versionId } = await params;
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded: { userId: string; name: string };
    try {
      decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as any;
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // 1. Authorize User
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
    if (!userRole || userRole === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden: Only Owner or Editors can restore versions' }, { status: 403 });
    }

    // 2. Fetch Version Snapshot
    const version = await prisma.version.findUnique({
      where: { id: versionId },
    });

    if (!version || version.documentId !== documentId) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const snapshotBlocks = JSON.parse(version.blocksData) as BlockState[];
    const snapshotIds = new Set(snapshotBlocks.map(b => b.id));

    // 3. Fetch Current Blocks
    const currentBlocks = await prisma.documentBlock.findMany({
      where: { documentId },
    });

    const now = new Date();
    const mutations: BlockState[] = [];

    // Blocks in snapshot need to be restored
    for (const snapBlock of snapshotBlocks) {
      mutations.push({
        id: snapBlock.id,
        documentId,
        type: snapBlock.type,
        content: snapBlock.content,
        position: snapBlock.position,
        updatedAt: now.toISOString(),
        updatedBy: decoded.userId,
        isDeleted: false,
      });
    }

    // Blocks currently active but NOT in snapshot need to be marked deleted
    for (const curBlock of currentBlocks) {
      if (!curBlock.isDeleted && !snapshotIds.has(curBlock.id)) {
        mutations.push({
          id: curBlock.id,
          documentId,
          type: curBlock.type,
          content: curBlock.content,
          position: curBlock.position,
          updatedAt: now.toISOString(),
          updatedBy: decoded.userId,
          isDeleted: true,
        });
      }
    }

    // 4. Apply mutations to Database in a transaction
    await prisma.$transaction(async (tx) => {
      for (const mut of mutations) {
        await tx.documentBlock.upsert({
          where: { id: mut.id },
          create: {
            id: mut.id,
            documentId: mut.documentId,
            type: mut.type,
            content: mut.content,
            position: mut.position,
            updatedAt: now,
            updatedBy: decoded.userId,
            isDeleted: mut.isDeleted,
          },
          update: {
            type: mut.type,
            content: mut.content,
            position: mut.position,
            updatedAt: now,
            updatedBy: decoded.userId,
            isDeleted: mut.isDeleted,
          },
        });
      }
    });

    // 5. Broadcast changes to all active SSE listeners (sender is null to update all)
    broadcastToDocument(documentId, null, 'SYNC_MUTATIONS', mutations);

    // Create an auto-save checkpoint indicating version was restored
    await prisma.version.create({
      data: {
        documentId,
        name: `Restored: "${version.name}"`,
        blocksData: JSON.stringify(snapshotBlocks),
        createdBy: decoded.name,
      },
    });

    return NextResponse.json({ success: true, restoredBlocks: snapshotBlocks });
  } catch (error: any) {
    console.error('Version Restore Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
