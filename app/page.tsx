'use client';

import { useState, useRef, useEffect } from 'react';

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

  async function vercelSetKeyValue(key: string, data: any): Promise<void> {
    try {
      const serializedData = JSON.stringify(data);
      const response = await fetch('/api/set-key-val', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: key, val: serializedData }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload key-value to Vercel');
      }
      console.log(`KeyValue "${key}" uploaded successfully.`);
    } catch (error) {
      console.error(`Failed to upload key-value "${key}":`, (error as Error).message);
    }
  }

  async function vercelGetKeyValue(key: string): Promise<any> {
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
  }

  async function waitForKeyValueFromVercel(key: string): Promise<any> {
    let value = null;
    while (!value || value.sdp === '') {
      value = await vercelGetKeyValue(key);
      if (!value || value.sdp === '') {
        console.log(`No ${key} found, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // wait for 10 seconds before retrying
      }
    }
    return value;
  }

  async function setupWebRTC() {
    try {
      console.log('Creating RTCPeerConnection...');
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      peerConnectionRef.current = peerConnection;

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) { // null candidate indicates that ICE gathering is complete
          console.log('ICE gathering complete');

          if (isSender) {
            finalizeAndSaveOffer();
          } else {
            finalizeAndSaveAnswer();
          }
        } else {
          console.log('ICE candidate:', event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        console.log('Incoming stream received');
        const videoElement = videoRef.current;

        if (videoElement!.srcObject !== event.streams[0]) {
          videoElement!.srcObject = event.streams[0];
        }

        videoElement!.oncanplay = () => {
          videoElement!.play().catch((error) => {
            console.error('Error playing the video stream:', error);
          });
        };
      };

      console.log('isSender during WebRTC setup:', isSender);

      if (isSender) {
        await setupSender(peerConnection);
      } else {
        console.log('Waiting for offer from Vercel...');
        const offer = await waitForKeyValueFromVercel('offer');
        console.log('Offer received:', offer);

        console.log('Setting remote description with received offer...');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description set with received offer');

        console.log('Creating interim WebRTC answer...');
        const interimAnswer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(interimAnswer);
        console.log('Interim answer created and set as local description');

        // Continue ICE candidate gathering and finalization in the onicecandidate event
      }

      monitorBitrate(isSender ? 'outbound-rtp' : 'inbound-rtp');
    } catch (error) {
      console.error('Error during WebRTC setup:', error);
    }
  }

  async function setupSender(peerConnection: RTCPeerConnection) {
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

    console.log('Creating initial WebRTC offer...');
    const offer = await peerConnection.createOffer();

    let modifiedSDP = modifySDPForH264(offer.sdp);

    const modifiedOffer = new RTCSessionDescription({
      type: offer.type,
      sdp: modifiedSDP,
    });

    console.log('Setting local description with modified SDP...');
    await peerConnection.setLocalDescription(modifiedOffer);

    offerElementRef.current!.value = "Collecting ICE Candidates and Generating Offer... Please Wait (30+ seconds)...";
  }

  async function finalizeAndSaveOffer() {
    try {
      console.log('Finalizing and saving offer to Vercel...');
      const localDescription = peerConnectionRef.current!.localDescription;
      await vercelSetKeyValue('offer', localDescription);
      console.log('Offer saved to Vercel:', JSON.stringify(localDescription));

      await waitForAnswerFromVercel();
    } catch (error) {
      console.error('Error finalizing and saving offer:', error);
    }
  }

  async function finalizeAndSaveAnswer() {
    try {
      console.log('Finalizing and saving answer to Vercel...');
      const localDescription = peerConnectionRef.current!.localDescription;
      await vercelSetKeyValue('answer', localDescription);
      console.log('Final answer saved to Vercel:', JSON.stringify(localDescription));
    } catch (error) {
      console.error('Error finalizing and saving answer:', error);
    }
  }

  function modifySDPForH264(sdp: string): string {
    console.log('Modifying SDP for H.264 prioritization...');
    let modifiedSDP = sdp.replace(
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
    return modifiedSDP;
  }

  async function waitForAnswerFromVercel() {
    const answer = await waitForKeyValueFromVercel('answer');
    console.log('Final answer received from Vercel:', answer);
    await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('Answer set on peer connection');
  }

  async function startSender() {
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
  }

  async function startWebcamSender() {
    try {
      console.log('Start Webcam Sender clicked');
      setIsSender(true);
      setUseWebcam(true);
      roleTitleRef.current!.textContent = 'Running as Webcam Sender';
      offerContainerRef.current!.classList.remove('hidden');
      answerFromPeerContainerRef.current!.classList.remove('hidden');

      console.log('Removing old offer/answer from Vercel KeyValue...');
      await vercelSetKeyValue('answer', ""); // Remove any old answer by setting it to an empty string
      await vercelSetKeyValue('offer', "");  // Remove any old offer by setting it to an empty string

      console.log('Setting up webcam...');
      setShouldSetupWebRTC(true);
    } catch (error) {
      console.error('Error starting Webcam Sender:', error);
    }
  }

  async function startReceiver() {
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
  }

  async function setupVideo() {
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
  }

  function monitorBitrate(type: string) {
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
  }

  useEffect(() => {
    if (shouldSetupWebRTC) {
      setupWebRTC().catch((error) => console.error('Error setting up WebRTC:', error));
      setShouldSetupWebRTC(false); // Reset the trigger
    }
  }, [shouldSetupWebRTC]);

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
