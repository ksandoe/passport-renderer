import React, { useEffect, useState } from 'react';
import './index.css';
import PresenceTile from '../PresenceTile';
import type { Question } from './types';
import { logEvent } from '../utils/logEvent';
import { fetchResponses, submitAnswer } from '../utils/api';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';

// Reusable function to get launch params
function getLaunchParams() {
  if (typeof window !== 'undefined' && (window as any).INITIAL_DATA) return (window as any).INITIAL_DATA;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const examId = params.get('examId');
    if (userId && examId) return { user: { id: userId }, examId };
  }
  return null;
}

console.log('App.tsx loaded');

// Clear exam_finished on first run or if no valid user/exam context
(function() {
  const launchParams = (() => {
    if (typeof window !== 'undefined' && (window as any).INITIAL_DATA) return (window as any).INITIAL_DATA;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('userId');
      const examId = params.get('examId');
      if (userId && examId) return { user: { id: userId }, examId };
    }
    return null;
  })();
  if (!launchParams || !launchParams.user || !launchParams.examId) {
    localStorage.removeItem('exam_finished');
  }
})();

// Main App function and all React logic migrated from index.tsx
function handleExitApp() {
  try {
    // Electron IPC (if available)
    const ipcRenderer = (window as any).require ? (window as any).require('electron').ipcRenderer : null;
    if (ipcRenderer) {
      ipcRenderer.send('app-quit');
    } else if ((window as any).electronAPI && (window as any).electronAPI.quitApp) {
      (window as any).electronAPI.quitApp();
    } else {
      window.close();
    }
  } catch {
    window.close();
  }
}

function App() {
  console.log('App component mounted');

  // All useState declarations must come first
  const [examToken, setExamToken] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [examId, setExamId] = React.useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<{ [qid: string]: string }>({});
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(() => {
    const stored = localStorage.getItem('exam_finished');
    return stored === 'true';
  });
  const markFinished = (val: boolean) => {
    setFinished(val);
    localStorage.setItem('exam_finished', val ? 'true' : 'false');
  };

  // Reset finished state when starting a new exam attempt
  useEffect(() => {
    if (userId && examId) {
      markFinished(false);
    }
  }, [userId, examId]);
  const [timer, setTimer] = useState<number | null>(null); // seconds remaining
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  // Log on every render (after state is declared)
  console.log('Render: userId=', userId, 'examId=', examId);

  // --- Robust token extraction logic for all launch scenarios ---
  React.useEffect(() => {
    let foundToken: string | null = null;
    // 1. Check window.INITIAL_DATA (injected by Electron main process)
    if (typeof window !== 'undefined' && (window as any).INITIAL_DATA && (window as any).INITIAL_DATA.token) {
      foundToken = (window as any).INITIAL_DATA.token;
      console.log('Found token in window.INITIAL_DATA:', foundToken);
    }
    // 2. Check URL params (for browser or protocol handler)
    if (!foundToken && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paramToken = urlParams.get('token');
      if (paramToken) {
        foundToken = paramToken;
        console.log('Found token in URL params:', foundToken);
      }
    }
    // 3. Parse from protocol URL (e.g. passport://start?token=...) in window.location.href
    if (!foundToken && typeof window !== 'undefined') {
      const href = window.location.href;
      const match = href.match(/[?&]token=([^&]+)/);
      if (match && match[1]) {
        foundToken = decodeURIComponent(match[1]);
        console.log('Found token in protocol handler URL:', foundToken);
      }
    }
    // 4. Listen for Electron IPC event (for dynamic launches)
    let ipcCleanup: (() => void) | undefined;
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        const handler = (_event: any, token: string) => {
          console.log('Received token in renderer via IPC:', token);
          setExamToken(token);
        };
        ipcRenderer.on('exam-token', handler);
        ipcCleanup = () => ipcRenderer.removeListener('exam-token', handler);
      }
    }
    // Set state if found
    if (foundToken) {
      setExamToken(foundToken);
    } else {
      console.error('No exam token found in INITIAL_DATA, URL params, or protocol handler URL.');
    }
    return () => {
      if (ipcCleanup) ipcCleanup();
    };
  }, []);

  // --- Use examToken to fetch userId and examId from backend when it is set ---
  useEffect(() => {
    if (!examToken) return;
    const resolveToken = async () => {
      console.log('Resolving token:', examToken);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/exam/consume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: examToken }),
        });
        console.log('Resolved token response:', response);
        if (!response.ok) {
          throw new Error('Failed to resolve token');
        }
        const data = await response.json();
        console.log('Resolved token data:', data);
        // Wire up UI state from resolved token data
        if (data.user_id) {
          setUserId(data.user_id);
          console.log('setUserId:', data.user_id);
        }
        if (data.exam_id) {
          setExamId(data.exam_id);
          console.log('setExamId:', data.exam_id);
        }
        // Optionally set questions if returned in data
        if (data.questions) {
          setQuestions(data.questions);
          console.log('setQuestions:', data.questions);
        }
        // Set timer if exam duration is present
        console.log('[resolveToken] duration_minutes:', data.duration_minutes, '| Current timer:', timer);
        if (data.duration_minutes) {
          setTimer(data.duration_minutes > 0 ? data.duration_minutes * 60 : null);
          console.log('[resolveToken] setTimer:', data.duration_minutes > 0 ? data.duration_minutes * 60 : null);
        }
      } catch (err) {
        console.error('Error resolving token:', err);
        // TODO: show error to user
      }
    };
    resolveToken();
  }, [examToken]);

  const params = getLaunchParams();
  useEffect(() => {
    if (params?.testWarning) {
      setWarning('Warning: Running with hardcoded test user/exam. Integration not active.');
    }
  }, [params]);

  // --- Fetch exam and questions when user and examId are available ---
  React.useEffect(() => {
    const fetchAndRandomize = async () => {
      if (userId && examId) {
        setExamLoading(true);
        try {
          // Fetch exam from backend API
          console.log('Fetching exam:', `${import.meta.env.VITE_API_BASE_URL}/exams/${examId}`);
          const examRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/exams/${examId}`);
          console.log('Exam fetch response:', examRes);
          if (!examRes.ok) throw new Error('Failed to fetch exam');
          const examData = await examRes.json();
          console.log('Exam data:', examData);
          const examObj = examData.exam || examData;
          // setExam(examObj);
          console.log('Exam data:', examObj);

          // Questions are now returned from /api/exam/consume and set in resolveToken.
          // No need to fetch questions separately here.
          console.log('[fetchAndRandomize] duration_minutes:', examObj.duration_minutes, '| Current timer:', timer);
          if (examObj.duration_minutes) {
            setTimer(examObj.duration_minutes > 0 ? examObj.duration_minutes * 60 : null);
            console.log('[fetchAndRandomize] setTimer:', examObj.duration_minutes > 0 ? examObj.duration_minutes * 60 : null);
          }
        } catch (err: any) {
          console.error('Error in fetchAndRandomize:', err);
          setError(err.message);
        } finally {
          setExamLoading(false);
        }
      }
    };
    fetchAndRandomize();
  }, [userId, examId]);

  useEffect(() => {
    // Record exam start time for duration
    if (userId && examId && examStartedAt === null) {
      setExamStartedAt(Date.now());
    }
  }, [userId, examId, examStartedAt]);

  // Prevent duplicate autosubmit with a ref
  const autoSubmitTriggered = React.useRef(false);
  useEffect(() => {
    // Timer logic and autosubmit
    if (finished) return;
    if (timer === 0 && !autoSubmitTriggered.current) {
      autoSubmitTriggered.current = true;
      autoSubmit();
      setTimeUp(true);
      return;
    }
    if (!timer || timer < 0) return;
    const interval = setInterval(() => {
      setTimer(t => (t !== null ? t - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer, finished]);

  // Show exam complete message depending on how it finished


  useEffect(() => {
    // Log events
    if (userId && examId) {
      logEvent({ user_id: userId, exam_id: examId, event_type: 'start' });
    }
  }, [userId, examId]);

  useEffect(() => {
    if (finished && userId && examId) {
      logEvent({ user_id: userId, exam_id: examId, event_type: 'finish' });
    }
  }, [finished, userId, examId]);

  useEffect(() => {
    if (error && userId && examId) {
      logEvent({ user_id: userId, exam_id: examId, event_type: 'error', event_data: { message: error } });
    }
  }, [error, userId, examId]);

  // Auto-submit all answers and PATCH assignment with score at exam end
  const autoSubmit = async () => {
    if (!userId || !examId) return;
    try {
      for (const q of questions) {
        await submitAnswer({
          user_id: userId,
          question_id: q.question_id,
          answer: answers[q.question_id] || '',
        });
      }
      // Fetch responses to calculate score
      const responses = await fetchResponses({ user_id: userId, exam_id: examId });
      const score = responses.reduce((sum: number, r: { is_correct: boolean }) => sum + (r.is_correct ? 1 : 0), 0);
      const duration = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
      await logEvent({
        user_id: userId,
        exam_id: examId,
        event_type: 'exam_completed',
        event_data: { score, duration_seconds: duration, reason: 'timer_expired' }
      });
      // Find assignment_id for this user/exam
      const assignRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/assignments?user_id=${userId}&exam_id=${examId}`);
      if (assignRes.ok) {
        const assignData = await assignRes.json();
        const assignment = assignData.assignments && assignData.assignments[0];
        if (assignment && assignment.assignment_id) {
          // PATCH assignment with new score (increments attempts and updates score)
          const patchRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/assignments/${assignment.assignment_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score }),
          });
          if (patchRes.ok) {
            const patchData = await patchRes.json();
            console.log('[autoSubmit] assignment PATCH data:', patchData);
          } else {
            console.error('[autoSubmit] assignment PATCH failed:', patchRes.status, patchRes.statusText);
          }
        } else {
          console.warn('[autoSubmit] No assignment found for user/exam');
        }
      } else {
        console.error('[autoSubmit] Assignments fetch failed:', assignRes.status, assignRes.statusText);
      }
      markFinished(true);
    } catch (err: any) {
      setError('Auto-submit failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handler for answer changes
  const handleAnswerChange = (qid: string, value: string) => {
    setAnswers(a => ({ ...a, [qid]: value }));
    if (userId && examId) {
      submitAnswer({
        user_id: userId,
        question_id: qid,
        answer: value,
      }).catch(err => {
        setError('Failed to save answer: ' + err.message);
      });
    }
  };

  const handlePrev = () => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  };
  const handleNext = () => {
    setCurrentIndex(i => Math.min(i + 1, questions.length - 1));
  };
  const handleSubmitAll = async () => {
    setShowSubmitConfirm(true);
  };
  const cancelSubmitAll = () => setShowSubmitConfirm(false);
  const confirmSubmitAll = async () => {
    if (!userId || !examId) return;
    setShowSubmitConfirm(false);
    setSaving(true);
    try {
      for (const q of questions) {
        await submitAnswer({
          user_id: userId,
          question_id: q.question_id,
          answer: answers[q.question_id] || '',
        });
      }
      // Fetch responses to calculate score
      const responses = await fetchResponses({ user_id: userId, exam_id: examId });
      const score = responses.reduce((sum: number, r: { is_correct: boolean }) => sum + (r.is_correct ? 1 : 0), 0);
      const duration = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
      await logEvent({
        user_id: userId,
        exam_id: examId,
        event_type: 'exam_completed',
        event_data: { score, duration_seconds: duration, reason: 'manual_submit' }
      });
      // Find assignment_id for this user/exam
      const assignRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/assignments?user_id=${userId}&exam_id=${examId}`);
      if (assignRes.ok) {
        const assignData = await assignRes.json();
        const assignment = assignData.assignments && assignData.assignments[0];
        if (assignment && assignment.assignment_id) {
          // PATCH assignment with new score (increments attempts and updates score)
          const patchRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/assignments/${assignment.assignment_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score }),
          });
          if (patchRes.ok) {
            const patchData = await patchRes.json();
            console.log('[confirmSubmitAll] assignment PATCH data:', patchData);
          } else {
            console.error('[confirmSubmitAll] assignment PATCH failed:', patchRes.status, patchRes.statusText);
          }
        } else {
          console.warn('[confirmSubmitAll] No assignment found for user/exam');
        }
      } else {
        console.error('[confirmSubmitAll] Assignments fetch failed:', assignRes.status, assignRes.statusText);
      }
      markFinished(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // UI
  if (examLoading) return <Typography>Loading exam...</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (finished) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw' }}>
        <Typography variant="h4" gutterBottom>Exam Submitted</Typography>
        <Typography sx={{ mb: 2, textAlign: 'center' }}>Your exam has been submitted successfully.</Typography>
        <Typography sx={{ mb: 2, textAlign: 'center' }}>You may now close this window.</Typography>
        <Button
          variant="contained"
          color="error"
          size="large"
          onClick={handleExitApp}
          sx={{ mt: 2 }}
        >
          EXIT
        </Button>
      </Box>
    );
  }
  if (!userId || !examId) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw' }}>
        <Typography variant="h4" sx={{ mb: 2, textAlign: 'center' }}>
          Passport ExamLock Installed
        </Typography>
        <Typography sx={{ mb: 2, textAlign: 'center' }}>
          The application was installed successfully.<br />
          You may now close this window.
        </Typography>
        <Button
          variant="contained"
          color="error"
          size="large"
          onClick={handleExitApp}
          sx={{ mt: 2 }}
        >
          EXIT
        </Button>
      </Box>
    );
  }
  if (showSubmitConfirm) {
    return (
      <>
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <Paper sx={{ bgcolor: 'white', borderRadius: 2, boxShadow: 3, p: 4, maxWidth: 400, width: '100%', textAlign: 'center' }}>
            <Typography variant="h6" color="error" sx={{ mb: 2, fontWeight: 'bold' }}>Submit Exam?</Typography>
            <Typography sx={{ mb: 3 }}>This will complete your exam attempt. <b>The action is final.</b> Are you sure you want to submit?</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button onClick={confirmSubmitAll} variant="contained" color="primary" sx={{ fontWeight: 'bold' }}>Yes, Submit</Button>
              <Button onClick={cancelSubmitAll} variant="contained">Cancel</Button>
            </Box>
          </Paper>
        </Box>
      </>
    );
  }
  if (saving) {
    // Show a spinner or progress indicator while saving
    return (
      <Box sx={{ minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper sx={{ p: 4, width: 400, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Submitting your exam...</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', mt: 2 }}>
            <CircularProgress size={48} sx={{ color: '#1976d2', mr: 2 }} />
            <Typography variant="body1">Please wait while we securely submit your responses.</Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  // Show exam complete message depending on how it finished (always reachable)
  if (timeUp) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="success" sx={{ fontSize: 20, fontWeight: 'bold', p: 4, borderRadius: 2, textAlign: 'center' }}>
          Time has expired and your exam has been automatically submitted. You may close the window now.
        </Alert>
      </Box>
    );
  }
  // Debug: Log timer state on every render
  const question = questions[currentIndex];
  const isTimedExam = timer !== null;
  console.log('[render] Timer state:', timer, '| isTimedExam:', isTimedExam);

  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.50',
          overflow: 'hidden',
        }}
      >
      {/* Sidebar for question navigation */}
      <Box
        component="aside"
        sx={{
          mr: 4,
          mt: 4,
          height: 'calc(100vh - 32px)',
          width: 176,
          flexShrink: 0,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, width: 176, maxHeight: '100%', overflowY: 'auto' }}>
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const isAnswered = answers[q.question_id] && answers[q.question_id].trim() !== '';
            let btnColor: 'primary' | 'success' | 'inherit' = 'inherit';
            if (isCurrent) btnColor = 'primary';
            else if (isAnswered) btnColor = 'success';
            return (
              <Button
                key={q.question_id}
                variant={isCurrent || isAnswered ? 'contained' : 'outlined'}
                color={btnColor}
                sx={{ borderRadius: '50%', minWidth: 40, minHeight: 40, fontWeight: 'bold', boxShadow: 1 }}
                onClick={() => setCurrentIndex(idx)}
                disabled={finished}
                title={`Question ${idx + 1}`}
              >
                {idx + 1}
              </Button>
            );
          })}
        </Box>
      </Box>

      {/* Main exam content */}
      <Paper
        sx={{
          width: '100%',
          maxWidth: 600,
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'white',
          borderRadius: 2,
          boxShadow: 2,
          p: 4,
          mt: 4,
        }}
      >
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        {/* Removed exam title per user request */}
        {/* <Typography variant="h4" fontWeight="bold" sx={{ mb: 2 }}>Exam</Typography> */}

        <Typography sx={{ mb: 2, fontWeight: 500 }} variant="h6">Question {currentIndex + 1} of {questions.length}</Typography>
        {question && (
          <Box sx={{ mb: 4, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography sx={{ mb: 1, fontWeight: 500 }}>{question.prompt}</Typography>
            {/* Only show the timer here, nowhere else */}
            {isTimedExam && (
              <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 'bold', mb: 2 }}>
                Time Remaining: {Math.floor(timer! / 60).toString().padStart(2, '0')}:{(timer! % 60).toString().padStart(2, '0')}
              </Typography>
            )}
            {/* Render image if present */}
            {question.image_url && (
              <Box sx={{ mb: 2 }}>
                <img
                  src={question.image_url}
                  alt="Question image"
                  style={{ maxHeight: 192, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
              </Box>
            )}
            {question.type === 'multiple-choice' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                {question.choices && question.choices.map((choice, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="radio"
                      name={`q-${question.question_id}`}
                      value={choice}
                      checked={answers[question.question_id] === choice}
                      onChange={() => handleAnswerChange(question.question_id, choice)}
                      disabled={finished}
                      style={{ marginRight: 8 }}
                    />
                    <Typography>{choice}</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={answers[question.question_id] || ''}
                onChange={e => handleAnswerChange(question.question_id, e.target.value)}
                disabled={finished}
                sx={{ mt: 1 }}
              />
            )}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            variant="contained"
            sx={{ bgcolor: 'grey.300', color: 'black', '&:hover': { bgcolor: 'grey.400' } }}
          >
            Previous
          </Button>
          <Button
            onClick={handleNext}
            disabled={currentIndex === questions.length - 1}
            variant="contained"
            sx={{ bgcolor: 'grey.300', color: 'black', '&:hover': { bgcolor: 'grey.400' } }}
          >
            Next
          </Button>
          <Button
            onClick={handleSubmitAll}
            disabled={saving}
            variant="contained"
            color="primary"
          >
            {saving ? 'Submitting...' : 'Submit All'}
          </Button>
        </Box>
        {timeUp && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Time is up! Your answers have been submitted automatically.
          </Alert>
        )}
      </Paper>
    </Box>
    {/* Floating PresenceTile in lower right corner, only during exam */}
    {(questions.length > 0 && !finished && !saving && !examLoading && !error && !timeUp) && (
      <Box sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 2000 }}>
        <PresenceTile />
      </Box>
    )}
  </>
  );
}

export default App;
