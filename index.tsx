import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import type { Exam, Question } from './src/types';
import PresenceTile from './PresenceTile';
import { logEvent } from './utils/logEvent';
import { fetchQuestions, fetchResponses, submitAnswer } from './utils/api';
import { logToFile } from './utils/logToFile';
import { seededShuffle, hashStringToSeed } from './utils/shuffle';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';

console.log('index.tsx loaded');

function getLaunchParams() {
  // 1. Try window.INITIAL_DATA (set by preload or main process)
  if (typeof window !== 'undefined' && (window as any).INITIAL_DATA) {
    return (window as any).INITIAL_DATA;
  }
  // 2. Try URL params (for dev/testing)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const examId = params.get('examId');
    if (userId && examId) return { user: { id: userId }, examId };
  }
  // 3. No data: return null
  return null;
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
  const [finished, setFinished] = useState(false);
  const [timer, setTimer] = useState<number | null>(null); // seconds remaining
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [cameraTileKey, setCameraTileKey] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  // Log on every render (after state is declared)
  console.log('Render: userId=', userId, 'examId=', examId);

  // --- Electron protocol handler token reception ---
  React.useEffect(() => {
    console.log('Token useEffect running');
    const isElectron = !!(window && window.process && window.process.type);
    console.log('isElectron:', isElectron, window.process);
    if (!isElectron) return;
    // Check for token in window.INITIAL_DATA (injected by main process)
    if (window.INITIAL_DATA && window.INITIAL_DATA.token) {
      console.log('Received token from window.INITIAL_DATA:', window.INITIAL_DATA.token);
      setExamToken(window.INITIAL_DATA.token);
    }
    const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
    if (!ipcRenderer) return;
    const handler = (_event, token) => {
      console.log('Received token in renderer:', token);
      setExamToken(token);
    };
    ipcRenderer.on('exam-token', handler);
    return () => ipcRenderer.removeListener('exam-token', handler);
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
        // Optionally set other UI state (e.g., exam instructions, timer)
        // if (data.duration_minutes) {
        //   setTimer(data.duration_minutes > 0 ? data.duration_minutes * 60 : null);
        //   console.log('setTimer:', data.duration_minutes > 0 ? data.duration_minutes * 60 : null);
        // }
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

          // Fetch questions for the exam
          console.log('Fetching questions:', `${import.meta.env.VITE_API_BASE_URL}/questions?exam_id=${examId}`);
          const questionsRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/questions?exam_id=${examId}`);
          console.log('Questions fetch response:', questionsRes);
          if (!questionsRes.ok) throw new Error('Failed to fetch questions');
          const questionsData = await questionsRes.json();
          console.log('Questions data:', questionsData);
          let randomized = questionsData.questions || [];
          // Optionally shuffle questions if needed
          randomized = seededShuffle(randomized, hashStringToSeed(userId + examId));
          console.log('Randomized questions:', randomized);
          setQuestions(randomized);
          console.log('setQuestions:', randomized);
          // setTimer(examObj.duration_minutes > 0 ? examObj.duration_minutes * 60 : null);
          console.log('setTimer:', examObj.duration_minutes > 0 ? examObj.duration_minutes * 60 : null);
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
    const checkCompleted = async () => {
      if (userId && examId) {
        setExamLoading(true);
        try {
          // Check for exam_completed event via backend
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/events?user_id=${userId}&exam_id=${examId}&event_type=exam_completed`);
          if (!res.ok) throw new Error('Failed to check completion');
          const events = (await res.json()).events;
          if (events && events.length > 0) {
            setFinished(true);
            setExamLoading(false);
            return;
          }
          setExamLoading(false);
        } catch (err: any) {
          setError(err.message);
          setExamLoading(false);
        }
      }
    };
    checkCompleted();
  }, [userId, examId]);

  useEffect(() => {
    // Record exam start time for duration
    if (userId && examId && examStartedAt === null) {
      setExamStartedAt(Date.now());
    }
  }, [userId, examId, examStartedAt]);

  useEffect(() => {
    // Timer logic
    if (!timer || finished || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer(t => (t !== null ? t - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer, finished]);

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

  useEffect(() => {
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
        const score = responses.reduce((sum, r) => sum + (r.is_correct ? 1 : 0), 0);
        const duration = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
        await logEvent({
          user_id: userId,
          exam_id: examId,
          event_type: 'exam_completed',
          event_data: { score, duration_seconds: duration, reason: 'timer_expired' }
        });

        // Update assignment score in backend
        // First, fetch the assignment for this user/exam
        const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
          ? import.meta.env.VITE_API_BASE_URL
          : undefined;
        if (!API_BASE_URL) throw new Error('VITE_API_BASE_URL is not set.');
        // Fetch assignments for user/exam
        const assignRes = await fetch(`${API_BASE_URL}/assignments?user_id=${userId}&exam_id=${examId}`);
        if (assignRes.ok) {
          const assignData = await assignRes.json();
          const assignment = assignData.assignments?.[0];
          if (assignment && assignment.assignment_id) {
            // Patch the assignment with the new score
            await fetch(`${API_BASE_URL}/assignments/${assignment.assignment_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ score }),
            });
          }
        }

        setFinished(true);
      } catch (err: any) {
        setError('Auto-submit failed: ' + err.message);
      }
    };

    const isTimedExam = timer !== null && timer > 0;

    if (isTimedExam && timer === 0 && !finished) {
      setTimeUp(true);
      setFinished(true);
      autoSubmit();
    }
  }, [timer, finished, userId, examId, questions, answers]);

  useEffect(() => {
    // Fetch exam details for timer (and optionally title/instructions)
    if (examId && userId && timer === null) {
      fetch(`${import.meta.env.VITE_API_BASE_URL}/exams/${examId}`)
        .then(res => res.json())
        .then(result => {
          const examObj = result.exam;
          if (examObj && examObj.duration_minutes && examObj.duration_minutes > 0) {
            setTimer(examObj.duration_minutes * 60);
            console.log('setTimer:', examObj.duration_minutes * 60);
          }
          // Optionally: setExamTitle(examObj.title) if you want to display the title
        })
        .catch(err => {
          console.error('Failed to fetch exam for timer:', err);
        });
    }
  }, [examId, userId, timer]);

  // Handlers for answers, navigation, and submit
  const handleAnswerChange = (qid: string, value: string) => {
    setAnswers(a => ({ ...a, [qid]: value }));
    // Immediately save the answer to the backend (send only required fields)
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

  const handleNext = () => {
    setCurrentIndex(i => Math.min(i + 1, questions.length - 1));
  };

  const handlePrev = () => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  };

  const handleSubmitAll = async () => {
    setShowSubmitConfirm(true);
  };

  const confirmSubmitAll = async () => {
    if (!userId || !examId) return;
    setShowSubmitConfirm(false); // Hide confirmation immediately
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
      const score = responses.reduce((sum, r) => sum + (r.is_correct ? 1 : 0), 0);
      const duration = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
      await logEvent({
        user_id: userId,
        exam_id: examId,
        event_type: 'exam_completed',
        event_data: { score, duration_seconds: duration }
      });

      // Update assignment score in backend
      // First, fetch the assignment for this user/exam
      const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
        ? import.meta.env.VITE_API_BASE_URL
        : undefined;
      if (!API_BASE_URL) throw new Error('VITE_API_BASE_URL is not set.');
      // Fetch assignments for user/exam
      const assignRes = await fetch(`${API_BASE_URL}/assignments?user_id=${userId}&exam_id=${examId}`);
      if (assignRes.ok) {
        const assignData = await assignRes.json();
        const assignment = assignData.assignments?.[0];
        if (assignment && assignment.assignment_id) {
          // Patch the assignment with the new score
          await fetch(`${API_BASE_URL}/assignments/${assignment.assignment_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score }),
          });
        }
      }

      setFinished(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelSubmitAll = () => setShowSubmitConfirm(false);

  // UI
  if (examLoading) return <Typography>Loading exam...</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!userId || !examId) {
    return (
      <Box sx={{ maxWidth: 500, margin: '0 auto', p: 4, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Passport ExamLock Installed</Typography>
        <Typography>The application was installed successfully.</Typography>
        <Typography>You may now close this window.</Typography>
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
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Paper sx={{ p: 4, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Submitting your exam...</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2 }}>
            <CircularProgress size={48} sx={{ color: '#1976d2', mr: 2 }} />
            <Typography variant="body1">Please wait while we securely submit your responses.</Typography>
          </Box>
        </Paper>
      </Box>
    );
  }
  if (finished) return <Alert severity="success">Exam complete! Thank you for your responses.</Alert>;

  const question = questions[currentIndex];

  // Timer display helper
  const showTimer = Number.isFinite(timer) && timer !== null && timer > 0;
  // Track if this exam is timed (duration_minutes > 0 at start)
  const isTimedExam = timer !== null && timer > 0;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', bgcolor: 'grey.50' }}>
      {/* Sidebar for question navigation */}
      <Box component="aside" sx={{ mr: 4, mt: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, width: 176 }}>
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
      <Paper sx={{ width: '100%', maxWidth: 600, bgcolor: 'white', borderRadius: 2, boxShadow: 2, p: 4, mt: 4 }}>
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        {/* Removed exam title per user request */}
        {/* <Typography variant="h4" fontWeight="bold" sx={{ mb: 2 }}>Exam</Typography> */}
        <Typography sx={{ mb: 2, fontWeight: 500 }} variant="h6">Question {currentIndex + 1} of {questions.length}</Typography>
        {question && (
          <Box sx={{ mb: 4 }}>
            <Typography sx={{ mb: 1, fontWeight: 500 }}>{question.prompt}</Typography>
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
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
        {showTimer && (
          <Typography sx={{ mt: 2, color: 'grey.600' }}>
            Time Remaining: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
          </Typography>
        )}
        {timeUp && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Time is up! Your answers have been submitted automatically.
          </Alert>
        )}
      </Paper>
      <PresenceTile key={cameraTileKey} onBlocked={() => setCameraBlocked(true)} onGranted={() => setCameraGranted(true)} />
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
