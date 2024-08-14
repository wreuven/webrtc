'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export default function HomePage() {
  const [isSender, setIsSender] = useState(false);
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
  const iceGatheringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vercelSetKeyVal = async (key: string, val: any): Promise<void> => {
    const response = await fetch('/api/set-key-val', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, val }),
    });
  
    if (!response.ok) {
      throw new Error('Failed to set key-value in Vercel Edge Config');
    }
  };

  const vercelGetKeyVal = async (key: string): Promise<any> => {
    const response = await fetch(`/api/get-key-val?key=${key}`);
  
    if (!response.ok) {
      throw new Error('Failed to get key-value from Vercel Edge Config');
    }
  
    const data = await response.json();
    return data.val;
  };

  const vercelEventOnKeyValueChange = (
    key: string,
    callback: (newVal: any) => void,
    interval = 1000
  ): void => {
    let currentValue: any;
  
    const checkForChange = async () => {
      try {
        const newVal = await vercelGetKeyVal(key);
        if (newVal !== currentValue) {
          currentValue = newVal;
          callback(newVal);
        }
      } catch (error) {
        console.error('Error checking key value change:', error);
      }
    };
  
    setInterval(checkForChange, interval);
  };
  
  const setupWebRTC = useCallback(
    async (createOffer: boolean = false) => {
      console.log('Creating RTCPeerConnection...');
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      peerConnectionRef.current = peerConnection;

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          console.log('ICE gathering complete');
          clearTimeout(iceGatheringTimeoutRef.current!);
          finalizeOfferOrAnswer();
        } else {
          console.log('ICE candidate:', event.candidate);
        }
      };

      iceGatheringTimeoutRef.current = setTimeout(() => {
        console.log('ICE gathering timeout');
        finalizeOfferOrAnswer();
      }, 10000);

      console.log('isSender during WebRTC setup:', isSender);

      if (isSender) {
        console.log('Setting up video stream for WebRTC...');
        const videoElement = videoRef.current!;
        const stream = (videoElement as any).captureStream();

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
          console.log('WebRTC offer created and set:', offerElementRef.current!.value);
        }
      } else {
        console.log('Receiver setup complete, waiting for offer.');
      }

      offerFromPeerElementRef.current!.addEventListener('input', async () => {
        console.log('Offer from peer received');
        const offer = JSON.parse(offerFromPeerElementRef.current!.value);
        await peerConnection.setRemoteDescription(offer);
        console.log('Remote description set');

        if (!isSender) {
          console.log('Creating WebRTC answer...');
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
        }
      });

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

      answerFromPeerElementRef.current!.addEventListener('input', async () => {
        console.log('Answer from peer received');
        const answer = JSON.parse(answerFromPeerElementRef.current!.value);
        await peerConnection.setRemoteDescription(answer);
        console.log('Remote description set');
      });

      if (!isSender) {
        monitorBitrate('inbound-rtp');
      } else {
        monitorBitrate('outbound-rtp');
      }
    },
    [isSender]
  );

  useEffect(() => {
    if (shouldSetupWebRTC && isSender) {
      setupWebRTC(true);
      setShouldSetupWebRTC(false); // Reset the trigger
    } else if (shouldSetupWebRTC && !isSender) {
      setupWebRTC(false);
      setShouldSetupWebRTC(false); // Reset the trigger
    }
  }, [shouldSetupWebRTC, setupWebRTC]);

  const startSender = async () => {
    console.log('Start Sender clicked');
    setIsSender(true);
    roleTitleRef.current!.textContent = 'Running as Sender';
    offerContainerRef.current!.classList.remove('hidden');
    answerFromPeerContainerRef.current!.classList.remove('hidden');

    console.log('Setting up video...');
    await setupVideo();
    console.log('Video setup complete. Triggering WebRTC setup...');
    setShouldSetupWebRTC(true); // Trigger WebRTC setup after state update
  };

  const startReceiver = async () => {
    console.log('Start Receiver clicked');
    setIsSender(false);
    roleTitleRef.current!.textContent = 'Running as Receiver';
    offerFromPeerContainerRef.current!.classList.remove('hidden');
    answerContainerRef.current!.classList.remove('hidden');

    console.log('Setting up WebRTC as Receiver...');
    setShouldSetupWebRTC(true);
    console.log('WebRTC setup complete.');
  };

  const setupVideo = async () => {
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
  };

  const finalizeOfferOrAnswer = () => {
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
  };

  const monitorBitrate = (type: string) => {
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
  };

  return (
    <div>
      <h1 ref={roleTitleRef}>WebRTC Setup</h1>
      <button onClick={startSender}>Start Sender</button>
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
