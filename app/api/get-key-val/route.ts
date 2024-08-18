import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { key, val } = await req.json();

  if (!key || !val) {
    return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
  }

  try {
    const blob = await put(key, JSON.stringify(val), {
      access: 'public',
    });

    return NextResponse.json(blob);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload blob' }, { status: 500 });
  }
}
