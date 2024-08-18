import { kv } from '@vercel/kv';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { key, val } = await req.json();

  if (!key || !val) {
    return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
  }

  try {
    // Store the value in KV storage
    await kv.set(key, val);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to store value in KV' }, { status: 500 });
  }
}
