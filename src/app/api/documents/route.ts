import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

export async function GET() {
  try {
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

    // Retrieve documents where user is Owner OR has permissions
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { ownerId: decoded.userId },
          {
            permissions: {
              some: { userId: decoded.userId },
            },
          },
        ],
      },
      include: {
        owner: {
          select: { name: true, email: true },
        },
        permissions: {
          select: { role: true, userId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ success: true, documents });
  } catch (error: any) {
    console.error('Fetch documents error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const { title } = await request.json();
    const docTitle = title || 'Untitled Document';

    // 1. Create Document
    const document = await prisma.document.create({
      data: {
        title: docTitle,
        ownerId: decoded.userId,
      },
    });

    // 2. Set OWNER permission
    await prisma.documentPermission.create({
      data: {
        documentId: document.id,
        userId: decoded.userId,
        role: 'OWNER',
      },
    });

    // 3. Seed starter block
    await prisma.documentBlock.create({
      data: {
        id: crypto.randomUUID(),
        documentId: document.id,
        type: 'h1',
        content: docTitle,
        position: 'm',
        updatedBy: decoded.userId,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, document });
  } catch (error: any) {
    console.error('Create document error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
