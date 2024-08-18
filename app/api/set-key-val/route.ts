const vercelSetBlob = async (blobName: string, data: any): Promise<void> => {
    const response = await fetch('/api/set-keyval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: blobName, val: data }),
    });
  
    if (!response.ok) {
      throw new Error('Failed to upload blob to Vercel');
    }
  };
  
  const vercelGetBlob = async (blobName: string): Promise<any> => {
    const response = await fetch(`/api/get-keyval?key=${blobName}`);
  
    if (!response.ok) {
      throw new Error('Failed to retrieve blob from Vercel');
    }
  
    const data = await response.json();
    return data;
  };
  