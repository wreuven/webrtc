import { kv } from '@vercel/kv';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
  }

  try {
    // Retrieve the value from Vercel KV storage
    const value = await kv.get(key);

    if (value === null) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({ value });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve value' }, { status: 500 });
  }
}
