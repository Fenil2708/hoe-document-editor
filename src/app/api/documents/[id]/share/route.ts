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

    // Fetch all current permissions on this document
    const permissions = await prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ success: true, permissions });
  } catch (error: any) {
    console.error('Fetch permissions error:', error);
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

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as any;
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const { email, role } = await request.json();

    if (!email || !role || !['EDITOR', 'VIEWER'].includes(role)) {
      return NextResponse.json({ error: 'Valid email and role (EDITOR or VIEWER) are required' }, { status: 400 });
    }

    // 1. Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      return NextResponse.json({ error: `User with email ${email} not found. Seeding database ensures owner@demo.com, editor@demo.com, and viewer@demo.com exist.` }, { status: 404 });
    }

    // 2. Verify current user is OWNER of document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.ownerId !== decoded.userId) {
      return NextResponse.json({ error: 'Forbidden: Only the document Owner can modify permissions' }, { status: 403 });
    }

    if (targetUser.id === document.ownerId) {
      return NextResponse.json({ error: 'Cannot change the Owner\'s permission level' }, { status: 400 });
    }

    // 3. Upsert permission role
    const permission = await prisma.documentPermission.upsert({
      where: {
        documentId_userId: {
          documentId,
          userId: targetUser.id,
        },
      },
      update: { role },
      create: {
        documentId,
        userId: targetUser.id,
        role,
      },
    });

    return NextResponse.json({ success: true, permission });
  } catch (error: any) {
    console.error('Share permission error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
