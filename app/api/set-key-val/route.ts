import { NextRequest, NextResponse } from 'next/server';
import { set } from '@vercel/edge-config';

export async function POST(req: NextRequest) {
  const { key, val } = await req.json();
  
  try {
    await set(key, val);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to set key-value' }, { status: 500 });
  }
}
