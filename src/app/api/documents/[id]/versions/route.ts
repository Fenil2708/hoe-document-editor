import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const documentId = (await params).id;
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      jwt.verify(tokenCookie.value, JWT_SECRET);
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const versions = await prisma.version.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, versions });
  } catch (error: any) {
    console.error('Versions GET Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const documentId = (await params).id;
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

    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Version name is required' }, { status: 400 });
    }

    // Verify document permission
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
      return NextResponse.json({ error: 'Forbidden: Only Owner or Editors can capture snapshots' }, { status: 403 });
    }

    // Capture active (non-deleted) blocks
    const activeBlocks = await prisma.documentBlock.findMany({
      where: { documentId, isDeleted: false },
      orderBy: { position: 'asc' },
    });

    const serializedBlocks = JSON.stringify(activeBlocks);

    const version = await prisma.version.create({
      data: {
        documentId,
        name,
        blocksData: serializedBlocks,
        createdBy: decoded.name,
      },
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    console.error('Versions POST Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
