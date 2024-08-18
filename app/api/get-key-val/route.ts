import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
  }

  try {
    const blob = await get(key);
    const json = await blob.text(); // Assuming the blob contains JSON data

    return NextResponse.json(JSON.parse(json));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve blob' }, { status: 500 });
  }
}
