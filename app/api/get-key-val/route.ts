import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  try {
    const val = await get(key as string);
    return NextResponse.json({ val });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get key-value' }, { status: 500 });
  }
}
