import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://vercel.com/api/blobs/${key}`, {
      headers: {
        'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to retrieve the blob');
    }

    const data = await response.json();
    return NextResponse.json({ val: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve blob' }, { status: 500 });
  }
}
