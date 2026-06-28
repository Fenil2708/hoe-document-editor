import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';
const apiKey = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user session
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ error: 'Unauthorized: No session cookie' }, { status: 401 });
    }

    try {
      jwt.verify(tokenCookie.value, JWT_SECRET);
    } catch (err) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // 2. Parse request payload
    const { prompt, action, context } = await request.json();

    if (!action || !context) {
      return NextResponse.json({ error: 'Action and context are required' }, { status: 400 });
    }

    // 3. Fallback to mock responses if GEMINI_API_KEY is not defined
    if (!apiKey) {
      return NextResponse.json({
        result: getMockAIResponse(action, context, prompt),
        isMock: true,
      });
    }

    // 4. Request Gemini API
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let systemInstruction = '';
    let userPrompt = '';

    switch (action) {
      case 'summarize':
        systemInstruction = 'You are a professional co-writer. Summarize the following document content into a clear, concise bulleted list of 3-4 key points.';
        userPrompt = `Document Content:\n${context}`;
        break;
      case 'rewrite':
        systemInstruction = `You are a copyeditor. Rewrite the following highlighted text to make it sound ${prompt || 'professional, polished, and fluent'}. Return ONLY the rewritten text, with no extra commentary or formatting.`;
        userPrompt = `Text to rewrite:\n${context}`;
        break;
      case 'grammar':
        systemInstruction = 'You are a proofreader. Scan the following text for spelling, grammar, and punctuation mistakes, and return the corrected text. Return ONLY the corrected text. If the text has no issues, return it exactly as is.';
        userPrompt = `Text to scan:\n${context}`;
        break;
      case 'autocomplete':
        systemInstruction = 'You are a smart text completion engine. Based on the provided context of the document, predict and generate the next sentence. Return ONLY the predicted text completion. Do not repeat the context. Keep it under 20 words.';
        userPrompt = `Document Context:\n${context}`;
        break;
      case 'chat':
        systemInstruction = 'You are a context-aware writing assistant. Answer the user\'s question based on the document content provided. Be helpful, concise, and professional.';
        userPrompt = `Document Content:\n${context}\n\nUser Question: ${prompt}`;
        break;
      default:
        return NextResponse.json({ error: 'Unsupported action type' }, { status: 400 });
    }

    const result = await model.generateContent(`${systemInstruction}\n\n${userPrompt}`);
    const response = await result.response;
    const text = response.text().trim();

    return NextResponse.json({
      result: text,
      isMock: false,
    });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'AI Assistant failed: ' + (error.message || error) }, { status: 500 });
  }
}

function getMockAIResponse(action: string, context: string, prompt?: string): string {
  switch (action) {
    case 'summarize':
      return `• This document serves as the collaborative editor's workspace.
• Local-first sync handles offline edits automatically.
• Permissions are enforced so Viewers cannot modify content.`;
    case 'rewrite':
      return `${context} (Refined for professional clarity and flow)`;
    case 'grammar':
      return `${context} (Grammar and spelling verified)`;
    case 'autocomplete':
      return ` and collaborate in real-time with other developers on the team.`;
    case 'chat':
      return `Here is a summary response regarding your query "${prompt}". To enable active AI assistance, please ensure your GEMINI_API_KEY environment variable is configured in the deployment.`;
    default:
      return 'No response generated';
  }
}
