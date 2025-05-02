import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { supabase } from '../shared/supabaseClient';
import type { Exam, Question } from '../shared/types';
import PresenceTile from './PresenceTile';
import { logEvent } from './utils/logEvent';
import { fetchQuestions, fetchResponses, submitAnswer } from './utils/api';
import { logToFile } from './utils/logToFile';
import { seededShuffle, hashStringToSeed } from './utils/shuffle';

function App() {
  // DEV BYPASS: Hardcode user and examId for local testing
  const [user] = useState<any>({ id: "60238324-6c1f-41d5-aa5d-b54db69d9981", email: "dev@example.com" });
  const [examId] = useState<string | null>("3de57b8f-5d84-43a3-8fff-a9fdaa27d582");

  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<{ [qid: string]: string }>({});
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timer, setTimer] = useState<number>(0); // seconds remaining
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [cameraTileKey, setCameraTileKey] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);

  // Fetch exam and questions if both user and examId are present
  useEffect(() => {
    const fetchAndRandomize = async () => {
      if (user && examId) {
        setExamLoading(true);
        try {
          // Fetch exam
          const { data: examData, error: examError } = await supabase
            .from('exams')
            .select('*')
            .eq('exam_id', examId)
            .single();
          if (examError) throw examError;
          setExam(examData);
          // Fetch questions
          let q = await fetchQuestions({ exam_id: examId });
          // Seed for question order: user_id + exam_id
          const qSeed = hashStringToSeed(user.id + examId);
          q = seededShuffle(q, qSeed);
          // For each question, shuffle choices if present
          q = q.map((question: any) => {
            if (question.choices && Array.isArray(question.choices)) {
              // Seed for choices: user_id + question_id
              const cSeed = hashStringToSeed(user.id + question.question_id);
              return { ...question, choices: seededShuffle(question.choices, cSeed) };
            }
            return question;
          });
          setQuestions(q);
          setTimer(examData.duration_minutes * 60);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setExamLoading(false);
        }
      }
    };
    fetchAndRandomize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, examId]);

  useEffect(() => {
    const checkCompleted = async () => {
      if (user && examId) {
        setExamLoading(true);
        try {
          // Check for exam_completed event
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/events?user_id=${user.id}&exam_id=${examId}&event_type=exam_completed`);
          if (!res.ok) throw new Error('Failed to check completion');
          const events = (await res.json()).events;
          if (events && events.length > 0) {
            setFinished(true);
            setExamLoading(false);
            return;
          }
          // No completion event, continue loading exam
          setExamLoading(false);
        } catch (err: any) {
          setError(err.message);
          setExamLoading(false);
        }
      }
    };
    checkCompleted();
  }, [user, examId]);

  useEffect(() => {
    // Record exam start time for duration
    if (user && examId && examStartedAt === null) {
      setExamStartedAt(Date.now());
    }
  }, [user, examId, examStartedAt]);

  // Timer logic
  useEffect(() => {
    if (!exam || finished || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer(t => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [exam, finished, timer]);

  // Log events
  useEffect(() => {
    if (exam && user) {
      logEvent({ user_id: user.id, exam_id: exam.exam_id, event_type: 'start' });
    }
  }, [exam, user]);

  useEffect(() => {
    if (finished && user && exam) {
      logEvent({ user_id: user.id, exam_id: exam.exam_id, event_type: 'finish' });
    }
  }, [finished, user, exam]);

  useEffect(() => {
    if (error && user && exam) {
      logEvent({ user_id: user.id, exam_id: exam.exam_id, event_type: 'error', event_data: { message: error } });
    }
  }, [error, user, exam]);

  // Handlers for answers, navigation, and submit
  const handleAnswerChange = (qid: string, value: string) => {
    setAnswers(a => ({ ...a, [qid]: value }));
    // Immediately save the answer to the backend (send only required fields)
    if (user && exam) {
      submitAnswer({
        user_id: user.id,
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
    if (!user || !exam) return;
    setSaving(true);
    try {
      for (const q of questions) {
        await submitAnswer({
          user_id: user.id,
          question_id: q.question_id,
          answer: answers[q.question_id] || '',
        });
      }
      // Fetch responses to calculate score
      const responses = await fetchResponses({ user_id: user.id, exam_id: exam.exam_id });
      const score = responses.reduce((sum, r) => sum + (r.is_correct ? 1 : 0), 0);
      const duration = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
      await logEvent({
        user_id: user.id,
        exam_id: exam.exam_id,
        event_type: 'exam_completed',
        event_data: { score, duration_seconds: duration }
      });
      setFinished(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
      setShowSubmitConfirm(false);
    }
  };

  const cancelSubmitAll = () => setShowSubmitConfirm(false);

  // UI
  if (examLoading) return <div>Loading exam...</div>;
  if (error) return <div className="text-red-700">{error}</div>;
  if (!user || !examId) return <div>No exam found or not authenticated.</div>;
  if (!exam) return <div>Exam not found.</div>;
  if (showSubmitConfirm) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-xl font-bold mb-4 text-red-600">Submit Exam?</div>
          <div className="mb-6">This will complete your exam attempt. <b>The action is final.</b> Are you sure you want to submit?</div>
          <div className="flex justify-center gap-6">
            <button onClick={confirmSubmitAll} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-semibold">Yes, Submit</button>
            <button onClick={cancelSubmitAll} className="bg-gray-300 px-6 py-2 rounded hover:bg-gray-400 font-semibold">Cancel</button>
          </div>
        </div>
      </div>
    );
  }
  if (finished) return <div>Exam complete! Thank you for your responses.</div>;

  const question = questions[currentIndex];

  return (
    <div className="min-h-screen flex flex-row items-start justify-center bg-gray-50">
      {/* Sidebar for question navigation */}
      <aside className="mr-8 mt-8">
        <div className="grid grid-cols-4 gap-3 w-44">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const isAnswered = answers[q.question_id] && answers[q.question_id].trim() !== '';
            let btnClass = '';
            if (isCurrent) {
              btnClass = 'bg-blue-600 text-white ring-2 ring-blue-800';
            } else if (isAnswered) {
              btnClass = 'bg-green-500 text-white';
            } else {
              btnClass = 'bg-gray-200 text-gray-700';
            }
            return (
              <button
                key={q.question_id}
                className={`w-10 h-10 flex items-center justify-center rounded-full font-bold shadow transition-all border border-gray-300 focus:outline-none ${btnClass}`}
                onClick={() => setCurrentIndex(idx)}
                disabled={finished}
                title={`Question ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main exam content */}
      <main className="w-full max-w-2xl bg-white rounded shadow p-8 mt-8">
        <header className="text-3xl font-bold mb-4">{exam.title}</header>
        <div className="mb-4 text-xl font-semibold">Question {currentIndex + 1} of {questions.length}</div>
        {question && (
          <div className="mb-6">
            <div className="mb-2 font-medium">{question.prompt}</div>
            {/* Render image if present */}
            {question.image_url && (
              <div className="mb-4">
                <img
                  src={question.image_url}
                  alt="Question image"
                  className="max-h-48 max-w-full border rounded shadow"
                  style={{ marginBottom: '0.5rem' }}
                />
              </div>
            )}
            {question.type === 'multiple-choice' ? (
              <div className="flex flex-col gap-2">
                {question.choices && question.choices.map((choice, idx) => (
                  <label key={idx} className="flex items-center">
                    <input
                      type="radio"
                      name={`q-${question.question_id}`}
                      value={choice}
                      checked={answers[question.question_id] === choice}
                      onChange={() => handleAnswerChange(question.question_id, choice)}
                      disabled={finished}
                    />
                    <span className="ml-2">{choice}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                className="w-full p-2 border rounded"
                rows={3}
                value={answers[question.question_id] || ''}
                onChange={e => handleAnswerChange(question.question_id, e.target.value)}
                disabled={finished}
              />
            )}
          </div>
        )}
        <div className="flex gap-4">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === questions.length - 1}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400 disabled:opacity-50"
          >
            Next
          </button>
          <button
            onClick={handleSubmitAll}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Submitting...' : 'Submit All'}
          </button>
        </div>
        <div className="mt-4 text-gray-600">Time Remaining: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</div>
      </main>
      <PresenceTile key={cameraTileKey} onBlocked={() => setCameraBlocked(true)} onGranted={() => setCameraGranted(true)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
