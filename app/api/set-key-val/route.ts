import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { key, val } = await req.json();

  if (!key || !val) {
    return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
  }

  try {
    const blob = new Blob([JSON.stringify(val)], { type: 'application/json' });

    const formData = new FormData();
    formData.append('file', blob, key);

    const response = await fetch('https://vercel.com/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload the blob');
    }

    const result = await response.json();
    return NextResponse.json({ url: result.url });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload blob' }, { status: 500 });
  }
}
