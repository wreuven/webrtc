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

  const vercelSetKeyValue = async (key: string, data: any): Promise<void> => {
    try {
      const serializedData = JSON.stringify(data); // Serialize the data before sending
      const response = await fetch('/api/set-key-val', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: key, val: serializedData }), // Store as a string
      });

      if (!response.ok) {
        throw new Error('Failed to upload key-value to Vercel');
      }
      console.log(`KeyValue "${key}" uploaded successfully.`);
    } catch (error) {
      console.error(`Failed to upload key-value "${key}":`, (error as Error).message);
    }
  };

  const vercelGetKeyValue = async (key: string): Promise<any> => {
    try {
      console.log(`Fetching key-value: ${key}`);
      const response = await fetch(`/api/get-key-val?key=${key}`);

      if (!response.ok) {
        console.error(`Server responded with status: ${response.status}`);
        throw new Error(`Failed to retrieve key-value "${key}" from Vercel`);
      }

      const data = await response.json();
      console.log(`KeyValue data fetched for ${key}:`, data);

      const value = data.value;
      if (!value) {
        console.warn(`KeyValue "${key}" fetched but is null or undefined`);
        return null;
      }

      return value;
    } catch (error) {
      console.error(`Error retrieving key-value "${key}":`, (error as Error).message);
      throw error;
    }
  };

  const vercelEventOnKeyValueChange = (
    key: string,
    callback: (newVal: any) => void,
    interval = 10000
  ): () => void => {
    let currentValue: any;
    let stopPolling = false;

    const checkForChange = async () => {
      try {
        if (stopPolling) return;
        const newVal = await vercelGetKeyValue(key);
        if (newVal !== currentValue) {
          currentValue = newVal;
          console.log('KeyValue value changed name=', key, 'newVal=', newVal);
          callback(newVal);
        }
      } catch (error) {
        console.error('Error checking key-value value change:', error);
      }
    };

    const intervalId = setInterval(checkForChange, interval);

    // Return a function to stop the polling
    return () => {
      clearInterval(intervalId);
      stopPolling = true;
    };
  };

  const setupWebRTC = useCallback(async () => {
    try {
      console.log('Creating RTCPeerConnection...');
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      peerConnectionRef.current = peerConnection;

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) { // null candidate indicates that ICE gathering is complete
          console.log('ICE gathering complete');

          if (!isSender) {
            console.log('Fetching offer from Vercel...');
            fetchOfferAndSetRemoteDescription();
          }
        } else {
          console.log('ICE candidate:', event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        console.log('Incoming stream received');
        const videoElement = videoRef.current!;

        if (videoElement.srcObject !== event.streams[0]) {
          videoElement.srcObject = event.streams[0];
        }

        videoElement.oncanplay = () => {
          videoElement.play().catch((error) => {
            console.error('Error playing the video stream:', error);
          });
        };
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

        console.log('Creating WebRTC offer...');
        const offer = await peerConnection.createOffer();

        let modifiedSDP = offer.sdp;

        console.log('Modifying SDP for H.264 prioritization...');
        modifiedSDP = modifiedSDP!.replace(
          /m=video (\d+) UDP\/TLS\/RTP\/SAVPF 96 97 102/g,
          'm=video $1 UDP/TLS/RTP/SAVPF 102 97 96'
        );
        modifiedSDP = modifiedSDP!.replace(
          /a=mid:1\r\n/g,
          'a=mid:1\r\nb=AS:5000\r\n'
        );
        modifiedSDP = modifiedSDP!.replace(
          /a=rtpmap:102 H264\/90000\r\n/g,
          'a=rtpmap:102 H264/90000\r\na=fmtp:102 max-fs=8160;max-fr=30;x-google-min-bitrate=3000; x-google-max-bitrate=5000;\r\n'
        );

        const modifiedOffer = new RTCSessionDescription({
          type: offer.type,
          sdp: modifiedSDP,
        });

        console.log('Setting local description with modified SDP...');
        await peerConnection.setLocalDescription(modifiedOffer);

        offerElementRef.current!.value = "Collecting ICE Candidates and Generating Offer... Please Wait (30+ seconds)...";
      } else {
        console.log('Receiver setup complete, waiting for ICE gathering to finish before fetching the offer.');
      }

      if (!isSender) {
        monitorBitrate('inbound-rtp');
      } else {
        monitorBitrate('outbound-rtp');
      }
    } catch (error) {
      console.error('Error during WebRTC setup:', error);
    }
  }, [isSender, useWebcam]);

  const fetchOfferAndSetRemoteDescription = async () => {
    try {
      const offer = await vercelGetKeyValue('offer');
      if (offer) {
        console.log('Offer fetched from Vercel:', offer);
        await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(offer));
        finalizeWebRTCAnswer();
      } else {
        console.log('No offer found in Vercel');
      }
    } catch (error) {
      console.error('Error fetching offer from Vercel:', error);
    }
  };

  const finalizeWebRTCAnswer = async () => {
    try {
      console.log('Creating WebRTC answer...');
      const answer = await peerConnectionRef.current!.createAnswer();
      await peerConnectionRef.current!.setLocalDescription(answer);

      console.log('Uploading answer to Vercel KeyValue...');
      await vercelSetKeyValue('answer', peerConnectionRef.current!.localDescription);

      console.log('WebRTC answer created and uploaded:', JSON.stringify(answer));
    } catch (error) {
      console.error('Error finalizing WebRTC answer:', error);
    }
  };

  const startSender = async () => {
    try {
      console.log('Start Sender clicked');
      setIsSender(true);
      setUseWebcam(false);
      roleTitleRef.current!.textContent = 'Running as Sender';
      offerContainerRef.current!.classList.remove('hidden');
      answerFromPeerContainerRef.current!.classList.remove('hidden');

      console.log('Removing old offer/answer from Vercel KeyValue...');
      await vercelSetKeyValue('answer', ""); // Remove any old answer by setting it to an empty string
      await vercelSetKeyValue('offer', "");  // Remove any old offer by setting it to an empty string

      console.log('Setting up video...');
      await setupVideo();
      console.log('Video setup complete. Triggering WebRTC setup...');
      setShouldSetupWebRTC(true);
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
      setShouldSetupWebRTC(true);
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
      setShouldSetupWebRTC(true);
    } catch (error) {
      console.error('Error starting Receiver:', error);
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

  useEffect(() => {
    if (shouldSetupWebRTC) {
      setupWebRTC().catch((error) => console.error('Error setting up WebRTC:', error));
      setShouldSetupWebRTC(false); // Reset the trigger
    }
  }, [shouldSetupWebRTC, setupWebRTC]);

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
