'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export default function HomePage() {
  const [isSender, setIsSender] = useState(false);
  const [useWebcam, setUseWebcam] = useState(false);
  const [shouldSetupWebRTC, setShouldSetupWebRTC] = useState(false);
  const roleTitleRef = useRef<HTMLHeadingElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const offerContainerRef = useRef<HTMLDivElement>(null);
  const offerElementRef = useRef<HTMLTextAreaElement>(null);
  const offerFromPeerContainerRef = useRef<HTMLDivElement>(null);
  const offerFromPeerElementRef = useRef<HTMLTextAreaElement>(null);
  const answerContainerRef = useRef<HTMLDivElement>(null);
  const answerElementRef = useRef<HTMLTextAreaElement>(null);
  const answerFromPeerContainerRef = useRef<HTMLDivElement>(null);
  const answerFromPeerElementRef = useRef<HTMLTextAreaElement>(null);
  const bitrateRef = useRef<HTMLSpanElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const lastBytesRef = useRef(0);

  const vercelSetBlob = async (blobName: string, data: any): Promise<void> => {
    try {
      const serializedData = JSON.stringify(data); // Serialize the data before sending
      const response = await fetch('/api/set-key-val', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: blobName, val: serializedData }), // Store as a string
      });
  
      if (!response.ok) {
        throw new Error('Failed to upload blob to Vercel');
      }
      console.log(`Blob "${blobName}" uploaded successfully.`);
    } catch (error) {
      console.error(`Failed to upload blob "${blobName}":`, (error as Error).message);
    }
  };
  
  const vercelGetBlob = async (blobName: string): Promise<any> => {
    try {
      console.log(`Fetching blob: ${blobName}`);
      const response = await fetch(`/api/get-key-val?key=${blobName}`);
  
      if (!response.ok) {
        console.error(`Server responded with status: ${response.status}`);
        throw new Error(`Failed to retrieve blob "${blobName}" from Vercel`);
      }
  
      const data = await response.json();
      console.log(`Blob data fetched for ${blobName}:`, data);
  
      // Correctly access the value
      const value = data.value;
      if (!value) {
        console.warn(`Blob "${blobName}" fetched but is null or undefined`);
        return null;
      }
   
      return value;
    } catch (error) {
      console.error(`Error retrieving blob "${blobName}":`, (error as Error).message);
      throw error;
    }
  };
        
  const vercelEventOnBlobChange = (
    blobName: string,
    callback: (newVal: any) => void,
    interval = 1000
  ): void => {
    let currentValue: any;
  
    const checkForChange = async () => {
      try {
        const newVal = await vercelGetBlob(blobName);
        if (newVal !== currentValue) {
          currentValue = newVal;
          console.log('Blob value changed name=', blobName, 'newVal=', newVal);
          callback(newVal);
        }
      } catch (error) {
        console.error('Error checking blob value change:', error);
      }
    };
  
    setInterval(checkForChange, interval);
  };

  const waitForBlob = async (blobName: string, retries: number = 30, delay: number = 1000): Promise<any> => {
    let blobData = null;
  
    while (retries > 0 && !blobData) {
      try {
        console.log(`Attempting to retrieve ${blobName}...`);
        blobData = await vercelGetBlob(blobName);
  
        if (blobData) {
          console.log(`${blobName} retrieved successfully:`, blobData);
          return blobData;
        }
      } catch (error) {
        console.error(`Error retrieving ${blobName}:`, (error as Error).message);
      }
  
      console.log(`${blobName} not yet available, retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
      retries--;
    }
  
    throw new Error(`Failed to retrieve ${blobName} after multiple attempts`);
  };

  const setupWebRTC = useCallback(
    async (createOffer: boolean = false) => {
      try {
        console.log('Creating RTCPeerConnection...');
        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        peerConnectionRef.current = peerConnection;

        peerConnection.onicecandidate = (event) => {
          if (!event.candidate) {
            console.log('ICE gathering complete');
            finalizeOfferOrAnswer();
          } else {
            console.log('ICE candidate:', event.candidate);
          }
        };

        console.log('isSender during WebRTC setup:', isSender);

        if (isSender) {
          console.log('Setting up video stream for WebRTC...');
          const videoElement = videoRef.current!;
          let stream: MediaStream;

          if (useWebcam) {
            console.log('Using webcam as video source');
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } else {
            console.log('Using pre-recorded video as video source');
            stream = (videoElement as any).captureStream();
          }

          stream.getTracks().forEach((track: MediaStreamTrack) => {
            peerConnection.addTrack(track, stream);
          });

          if (createOffer) {
            console.log('Creating WebRTC offer...');
            const offer = await peerConnection.createOffer();

            if (!offer.sdp) {
              throw new Error('Failed to create offer: SDP is undefined.');
            }          

            let modifiedSDP = offer.sdp;

            console.log('Modifying SDP for H.264 prioritization...');
            modifiedSDP = modifiedSDP.replace(
              /m=video (\d+) UDP\/TLS\/RTP\/SAVPF 96 97 102/g,
              'm=video $1 UDP/TLS/RTP/SAVPF 102 97 96'
            );
            modifiedSDP = modifiedSDP.replace(
              /a=mid:1\r\n/g,
              'a=mid:1\r\nb=AS:5000\r\n'
            );

            modifiedSDP = modifiedSDP.replace(
              /a=rtpmap:102 H264\/90000\r\n/g,
              'a=rtpmap:102 H264/90000\r\na=fmtp:102 max-fs=8160;max-fr=30;x-google-min-bitrate=3000; x-google-max-bitrate=5000;\r\n'
            );

            const modifiedOffer = new RTCSessionDescription({
              type: offer.type,
              sdp: modifiedSDP,
            });

            console.log('Setting local description with modified SDP...');
            await peerConnection.setLocalDescription(modifiedOffer);

            offerElementRef.current!.value = JSON.stringify(
              peerConnection.localDescription
            );

            console.log('Uploading offer to Vercel Blob...');
            await vercelSetBlob('offer', peerConnection.localDescription);

            console.log('WebRTC offer created and uploaded:', offerElementRef.current!.value);

            console.log('Listening for answer changes...');
            vercelEventOnBlobChange('answer', async (newAnswer) => {
              try {
                console.log('New answer detected:', newAnswer);
                await peerConnection.setRemoteDescription(new RTCSessionDescription(newAnswer));
                console.log('Remote description set with new answer');
              } catch (error) {
                console.error('Error setting remote description with new answer:', error);
              }
            });
          }
        } else {
          console.log('Receiver setup complete, waiting for offer.');

          let offerReceived = false;

          // Set up a listener for manual pasting of the offer
          vercelEventOnBlobChange('offer', async (newOffer) => {
            if (!offerReceived && newOffer) {
              offerReceived = true;
              console.log('Offer received via listener:', newOffer);
              await peerConnection.setRemoteDescription(new RTCSessionDescription(newOffer));
              console.log('Remote description set with received offer');
              finalizeWebRTCAnswer();
            }
          });

          // Proceed with waiting for the offer, but allow early exit if offer is manually pasted
          const offer = await waitForBlob('offer', 30, 1000).catch((error) => {
            if (offerReceived) {
              console.log('Offer was already manually pasted.');
            } else {
              console.error('Failed to retrieve offer:', error);
            }
          });

          if (offer && !offerReceived) {
            offerReceived = true;
            console.log('Offer received via waitForBlob:', offer);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('Remote description set with received offer');
            finalizeWebRTCAnswer();
          }
        }

        peerConnection.ontrack = (event) => {
          console.log('Incoming stream received');
          const videoElement = videoRef.current!;
          
          // Clear previous srcObject if any
          if (videoElement.srcObject !== event.streams[0]) {
            videoElement.srcObject = event.streams[0];
          }

          videoElement.oncanplay = () => {
            videoElement.play().catch((error) => {
              console.error('Error playing the video stream:', error);
            });
          };
        };

        if (!isSender) {
          monitorBitrate('inbound-rtp');
        } else {
          monitorBitrate('outbound-rtp');
        }
      } catch (error) {
        console.error('Error during WebRTC setup:', error);
      }
    },
    [isSender, useWebcam]
  );

  useEffect(() => {
    if (shouldSetupWebRTC && isSender) {
      setupWebRTC(true).catch((error) => console.error('Error setting up WebRTC as Sender:', error));
      setShouldSetupWebRTC(false); // Reset the trigger
    } else if (shouldSetupWebRTC && !isSender) {
      setupWebRTC(false).catch((error) => console.error('Error setting up WebRTC as Receiver:', error));
      setShouldSetupWebRTC(false); // Reset the trigger
    }
  }, [shouldSetupWebRTC, setupWebRTC]);

  const startSender = async () => {
    try {
      console.log('Start Sender clicked');
      setIsSender(true);
      setUseWebcam(false);
      roleTitleRef.current!.textContent = 'Running as Sender';
      offerContainerRef.current!.classList.remove('hidden');
      answerFromPeerContainerRef.current!.classList.remove('hidden');

      console.log('Setting up video...');
      await setupVideo();
      console.log('Video setup complete. Triggering WebRTC setup...');
      setShouldSetupWebRTC(true); // Trigger WebRTC setup after state update
    } catch (error) {
      console.error('Error starting Sender:', error);
    }
  };

  const startWebcamSender = async () => {
    try {
      console.log('Start Webcam Sender clicked');
      setIsSender(true);
      setUseWebcam(true);
      roleTitleRef.current!.textContent = 'Running as Webcam Sender';
      offerContainerRef.current!.classList.remove('hidden');
      answerFromPeerContainerRef.current!.classList.remove('hidden');

      console.log('Setting up webcam...');
      setShouldSetupWebRTC(true); // Trigger WebRTC setup after state update
    } catch (error) {
      console.error('Error starting Webcam Sender:', error);
    }
  };

  const startReceiver = async () => {
    try {
      console.log('Start Receiver clicked');
      setIsSender(false);
      roleTitleRef.current!.textContent = 'Running as Receiver';
      offerFromPeerContainerRef.current!.classList.remove('hidden');
      answerContainerRef.current!.classList.remove('hidden');

      console.log('Setting up WebRTC as Receiver...');
      let offerReceived = false;

      // Set up a listener for manual pasting of the offer
      vercelEventOnBlobChange('offer', async (newOffer) => {
        if (!offerReceived && newOffer) {
          offerReceived = true;
          console.log('Offer received via listener:', newOffer);
          await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(newOffer));
          console.log('Remote description set with received offer');
          finalizeWebRTCAnswer();
        }
      });

      // Proceed with waiting for the offer, but allow early exit if offer is manually pasted
      const offer = await waitForBlob('offer', 30, 1000).catch((error) => {
        if (offerReceived) {
          console.log('Offer was already manually pasted.');
        } else {
          console.error('Failed to retrieve offer:', error);
        }
      });

      if (offer && !offerReceived) {
        offerReceived = true;
        console.log('Offer received via waitForBlob:', offer);
        await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description set with received offer');
        finalizeWebRTCAnswer();
      }

      console.log('WebRTC setup complete.');
    } catch (error) {
      console.error('Error starting Receiver:', error);
    }
  };

  const finalizeWebRTCAnswer = async () => {
    try {
      console.log('Creating WebRTC answer...');
      const answer = await peerConnectionRef.current!.createAnswer();
      await peerConnectionRef.current!.setLocalDescription(answer);

      console.log('Uploading answer to Vercel Blob...');
      await vercelSetBlob('answer', peerConnectionRef.current!.localDescription);

      console.log('WebRTC answer created and uploaded:', JSON.stringify(answer));
    } catch (error) {
      console.error('Error finalizing WebRTC answer:', error);
    }
  };

  const setupVideo = async () => {
    try {
      const videoElement = videoRef.current!;
      const videoSource = "sintel_trailer-1080p.mp4";

      videoElement.src = videoSource;

      console.log('Waiting for video to load...');
      await new Promise<void>((resolve) => {
        videoElement.onloadeddata = () => {
          console.log('Video data loaded');
          resolve();
        };
      });

      await videoElement.play();
      console.log('Video is playing');
    } catch (error) {
      console.error('Error setting up video:', error);
    }
  };

  const finalizeOfferOrAnswer = () => {
    try {
      if (isSender) {
        console.log('Finalizing offer');
        offerElementRef.current!.value = JSON.stringify(
          peerConnectionRef.current!.localDescription
        );
      } else {
        console.log('Finalizing answer');
        answerElementRef.current!.value = JSON.stringify(
          peerConnectionRef.current!.localDescription
        );
      }
    } catch (error) {
      console.error('Error finalizing offer or answer:', error);
    }
  };

  const monitorBitrate = (type: string) => {
    try {
      setInterval(() => {
        peerConnectionRef.current!.getStats().then((stats) => {
          stats.forEach((report) => {
            if (
              report.type === type &&
              (report.bytesSent || report.bytesReceived)
            ) {
              const bytes = report.bytesSent || report.bytesReceived;
              const bitrate = ((bytes - lastBytesRef.current) * 8) / 1000; // kbps
              console.log(`Bitrate: ${bitrate.toFixed(2)} kbps`);
              bitrateRef.current!.textContent = `${bitrate.toFixed(2)} kbps`;
              lastBytesRef.current = bytes;
            }
          });
        });
      }, 1000);
    } catch (error) {
      console.error('Error monitoring bitrate:', error);
    }
  };

  return (
    <div>
      <h1 ref={roleTitleRef}>WebRTC Setup</h1>
      <button onClick={startSender}>Start Sender</button>
      <button onClick={startWebcamSender}>Start Webcam Sender</button>
      <button onClick={startReceiver}>Start Receiver</button>

      <video ref={videoRef} autoPlay loop muted></video>
      <p>
        Current Bitrate: <span ref={bitrateRef}>Calculating...</span>
      </p>

      <div ref={offerContainerRef} className="container hidden">
        <textarea
          ref={offerElementRef}
          placeholder="OFFER (computing...)"
          readOnly
        ></textarea>
        <button
          onClick={() =>
            navigator.clipboard.writeText(offerElementRef.current!.value)
          }
        >
          Copy Offer
        </button>
      </div>

      <div ref={offerFromPeerContainerRef} className="container hidden">
        <textarea
          ref={offerFromPeerElementRef}
          placeholder="OFFER FROM PEER"
        ></textarea>
        <button
          onClick={async () => {
            const text = await navigator.clipboard.readText();
            offerFromPeerElementRef.current!.value = text;
            offerFromPeerElementRef.current!.dispatchEvent(new Event('input'));
          }}
        >
          Paste Offer
        </button>
      </div>

      <div ref={answerContainerRef} className="container hidden">
        <textarea
          ref={answerElementRef}
          placeholder="ANSWER (after Offer From Peer)"
          readOnly
        ></textarea>
        <button
          onClick={() =>
            navigator.clipboard.writeText(answerElementRef.current!.value)
          }
        >
          Copy Answer
        </button>
      </div>

      <div ref={answerFromPeerContainerRef} className="container hidden">
        <textarea
          ref={answerFromPeerElementRef}
          placeholder="ANSWER FROM PEER"
        ></textarea>
        <button
          onClick={async () => {
            const text = await navigator.clipboard.readText();
            answerFromPeerElementRef.current!.value = text;
            answerFromPeerElementRef.current!.dispatchEvent(new Event('input'));
          }}
        >
          Paste Answer
        </button>
      </div>
    </div>
  );
}
