import React, { useEffect, useState, useRef } from 'react';

/**
 * PresenceTile: Shows a live webcam preview for perceived monitoring.
 * No video is recorded or transmitted. If camera access is denied, shows a warning.
 */
interface PresenceTileProps {
  onBlocked?: () => void;
  onGranted?: () => void;
  cameraGranted?: boolean;
}

const PresenceTile: React.FC<PresenceTileProps> = ({ onBlocked, onGranted, cameraGranted }) => {
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Acquire camera stream only
  useEffect(() => {
    let localStream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(localStream);
        console.log('[PresenceTile] Stream received:', localStream);
      } catch (err: any) {
        setError('Camera access denied or unavailable. Presence monitoring is required.');
        if (!cameraGranted && onBlocked) onBlocked();
        console.error('getUserMedia error:', err);
      }
    };
    startCamera();
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraGranted, onBlocked]);

  // Attach stream to video element when available, only if not already attached
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => {
          setStreaming(true);
          setError(null);
          if (onGranted) onGranted();
          console.log('[PresenceTile] Video streaming started.');
        }).catch(err => {
          setError('Could not start camera preview.');
          if (!cameraGranted && onBlocked) onBlocked();
          console.error('videoRef.current.play() error:', err);
        });
      }
    }
  }, [stream, onGranted, onBlocked, cameraGranted]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-[160px] h-[120px] bg-black rounded overflow-hidden flex items-center justify-center">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="rounded-md border border-gray-300 w-[150px] h-[110px] object-cover bg-black"
            style={{ background: '#000' }}
          />
        ) : (
          <div className="text-xs text-gray-300">
            Camera preview unavailable<br />
            <span className="text-[10px]">Check permissions and camera use in other apps.</span>
          </div>
        )}
      </div>
      <div className="text-[11px] text-gray-500 mt-1 text-center max-w-[150px]">
        No video is recorded or transmitted. This is for exam integrity only.
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
};

export default PresenceTile;
