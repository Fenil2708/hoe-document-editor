import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export async function ensureSeedData() {
  try {
    // Check if we already have users
    const userCount = await prisma.user.count();
    if (userCount > 0) return;

    console.log('Seeding demo database...');

    const pwdHash = hashPassword('password123');

    // 1. Create Users
    const owner = await prisma.user.create({
      data: {
        id: 'user-owner',
        name: 'Owner Admin',
        email: 'owner@demo.com',
        passwordHash: pwdHash,
      },
    });

    const editor = await prisma.user.create({
      data: {
        id: 'user-editor',
        name: 'Jane Editor',
        email: 'editor@demo.com',
        passwordHash: pwdHash,
      },
    });

    const viewer = await prisma.user.create({
      data: {
        id: 'user-viewer',
        name: 'John Viewer',
        email: 'viewer@demo.com',
        passwordHash: pwdHash,
      },
    });

    // 2. Create Document
    const document = await prisma.document.create({
      data: {
        id: 'demo-doc',
        title: 'House of Edtech Collaboration Doc',
        ownerId: owner.id,
      },
    });

    // 3. Create Permissions
    await prisma.documentPermission.createMany({
      data: [
        { documentId: document.id, userId: owner.id, role: 'OWNER' },
        { documentId: document.id, userId: editor.id, role: 'EDITOR' },
        { documentId: document.id, userId: viewer.id, role: 'VIEWER' },
      ],
    });

    // 4. Create Initial Blocks
    await prisma.documentBlock.createMany({
      data: [
        {
          id: 'block-1',
          documentId: document.id,
          type: 'h1',
          content: 'Welcome to House of Edtech Collaborative Document Editor!',
          position: 'm',
          updatedBy: owner.id,
          updatedAt: new Date(),
        },
        {
          id: 'block-2',
          documentId: document.id,
          type: 'text',
          content: 'This is a local-first editor. Try toggling "Simulated Offline Mode" in the sidebar and make changes! Your edits will be saved locally in IndexedDB and synchronized to the server when you go online.',
          position: 'r',
          updatedBy: owner.id,
          updatedAt: new Date(),
        },
        {
          id: 'block-3',
          documentId: document.id,
          type: 'todo',
          content: JSON.stringify({ text: 'Check out the AI rewrite helper by highlighting text in the editor', completed: false }),
          position: 't',
          updatedBy: owner.id,
          updatedAt: new Date(),
        },
        {
          id: 'block-4',
          documentId: document.id,
          type: 'todo',
          content: JSON.stringify({ text: 'Toggle Simulated Offline mode and edit the same paragraph in two different tabs to test deterministic merging!', completed: true }),
          position: 'v',
          updatedBy: owner.id,
          updatedAt: new Date(),
        },
      ],
    });

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Automatically trigger seeding on server load
ensureSeedData();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
