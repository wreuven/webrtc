import { kv } from '@vercel/kv';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  console.log('Received GET request with key:', key);

  if (!key) {
    console.error('Error: Key parameter is required');
    return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
  }

  try {
    // Retrieve the value from Vercel KV storage
    const value = await kv.get(key);
    console.log(`Value retrieved for key "${key}":`, value);

    if (value === null) {
      console.warn(`Warning: Key "${key}" not found in KV storage`);
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    console.log('Returning value for key:', key);
    return NextResponse.json({ value });
  } catch (error) {
    console.error('Error retrieving value from KV storage:', error);
    return NextResponse.json({ error: 'Failed to retrieve value' }, { status: 500 });
  }
}
