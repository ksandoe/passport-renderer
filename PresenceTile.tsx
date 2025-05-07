import React, { useEffect, useRef, useState } from 'react';
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
}

const PresenceTile: React.FC<PresenceTileProps> = ({ onBlocked, onGranted }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track if camera preview is working
  const [previewStarted, setPreviewStarted] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(s => {
        setStream(s);
        if (onGranted) onGranted();
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().then(() => {
            setPreviewStarted(true);
            setError(null); // Clear any previous error
          }).catch(err => {
            setError('Could not start camera preview.');
            console.error('videoRef.current.play() error:', err);
          });
        }
      })
      .catch(err => {
        setError('Camera access denied or unavailable. Presence monitoring is required.');
        if (onBlocked) onBlocked();
        console.error('getUserMedia error:', err);
      });
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBlocked, onGranted]);

  // If preview starts after an initial error, clear the error message
  useEffect(() => {
    if (previewStarted && error) {
      setError(null);
    }
  }, [previewStarted, error]);

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
