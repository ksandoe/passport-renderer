import React, { useEffect, useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

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
    <Box display="flex" flexDirection="column" alignItems="center">
      <Paper
        elevation={3}
        sx={{
          width: 160,
          height: 120,
          bgcolor: 'black',
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              borderRadius: 6,
              border: '1px solid #ccc',
              width: 150,
              height: 110,
              objectFit: 'cover',
              background: '#000',
            }}
          />
        ) : (
          <Typography variant="caption" color="grey.300" align="center">
            Camera preview unavailable<br />
            <span style={{ fontSize: 10 }}>Check permissions and camera use in other apps.</span>
          </Typography>
        )}
      </Paper>
      <Typography variant="caption" color="grey.600" align="center" sx={{ mt: 1, maxWidth: 150 }}>
        No video is recorded or transmitted. This is for exam integrity only.
      </Typography>
      {error && (
        <Typography variant="caption" color="error" align="center" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default PresenceTile;
