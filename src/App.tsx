import { useState, useEffect } from 'react';
import type { Exam, Question } from './types';
import PresenceTile from '../PresenceTile';
import { seededShuffle, hashStringToSeed } from '../utils/shuffle';

function getLaunchParams() {
  if (typeof window !== 'undefined' && (window as any).INITIAL_DATA) {
    return (window as any).INITIAL_DATA;
  }
  return null; // Return null if no token or protocol data
}

function App() {
  const [examToken, setExamToken] = useState<string | null>(null);
  useEffect(() => {
    if ((window as any).INITIAL_DATA && (window as any).INITIAL_DATA.token) {
      setExamToken((window as any).INITIAL_DATA.token);
    }
    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    if (ipcRenderer) {
      const handler = (_event: any, token: string) => {
        setExamToken(token);
      };
      ipcRenderer.on('exam-token', handler);
      return () => ipcRenderer.removeListener('exam-token', handler);
    }
  }, []);

  const params = getLaunchParams();
  const [user, setUser] = useState<any>(params?.user ?? null);
  const [examId, setExamId] = useState<string | null>(params?.examId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<{ [qid: string]: string }>({});
  const [finished, setFinished] = useState(false);

  // Fetch exam and questions when user and examId are available
  useEffect(() => {
    const fetchAndRandomize = async () => {
      if (user && examId) {
        setExamLoading(true);
        try {
          const examRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/exams/${examId}`);
          if (!examRes.ok) throw new Error('Failed to fetch exam');
          const examData = await examRes.json();
          const examObj = examData.exam || examData;
          setExam(examObj);

          const questionsRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/questions?exam_id=${examId}`);
          if (!questionsRes.ok) throw new Error('Failed to fetch questions');
          const questionsData = await questionsRes.json();
          let randomized = questionsData.questions || [];
          randomized = seededShuffle(randomized, hashStringToSeed(user.id + examId));
          setQuestions(randomized);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setExamLoading(false);
        }
      }
    };
    fetchAndRandomize();
  }, [user, examId]);

  // Handle token -> fetch user/examId from backend
  useEffect(() => {
    if (examToken) {
      (async () => {
        try {
          const resp = await fetch(`${import.meta.env.VITE_API_BASE_URL}/resolve-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: examToken })
          });
          if (!resp.ok) throw new Error('Failed to resolve token');
          const data = await resp.json();
          if (data.user) setUser(data.user);
          if (data.examId) setExamId(data.examId);
        } catch (err) {
          setError('Error resolving token');
        }
      })();
    }
  }, [examToken]);

  // If no token/user/examId, show install success message
  if (!examToken && !user && !examId) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <h2>Passport ExamLock Installed</h2>
        <p>The application was installed successfully.</p>
        <p>You may now close this window.</p>
      </div>
    );
  }

  if (examLoading) return <div>Loading exam...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!exam || questions.length === 0) return <div>No exam loaded.</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h1>{exam.title}</h1>
      <div style={{ marginBottom: 12 }}>{exam.instructions}</div>
      <PresenceTile key={0} />
      <div style={{ margin: '24px 0' }}>
        <div><b>Question {currentIndex + 1} of {questions.length}</b></div>
        <div style={{ margin: '12px 0', fontWeight: 500 }}>{questions[currentIndex].prompt}</div>
        {questions[currentIndex].type === 'multiple-choice' && questions[currentIndex].choices && (
          <div>
            {questions[currentIndex].choices.map((choice: string, idx: number) => (
              <div key={idx}>
                <label>
                  <input
                    type="radio"
                    name={`q_${questions[currentIndex].question_id}`}
                    value={choice}
                    checked={answers[questions[currentIndex].question_id] === choice}
                    onChange={() => setAnswers(a => ({ ...a, [questions[currentIndex].question_id]: choice }))}
                    disabled={finished}
                  />
                  {choice}
                </label>
              </div>
            ))}
          </div>
        )}
        {questions[currentIndex].type === 'short-answer' && (
          <textarea
            value={answers[questions[currentIndex].question_id] || ''}
            onChange={e => setAnswers(a => ({ ...a, [questions[currentIndex].question_id]: e.target.value }))}
            disabled={finished}
            style={{ width: '100%', minHeight: 60 }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0 || finished}
        >Previous</button>
        <button
          onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
          disabled={currentIndex === questions.length - 1 || finished}
        >Next</button>
        <button
          onClick={() => setFinished(true)}
          disabled={finished}
          style={{ marginLeft: 'auto', background: '#1976d2', color: 'white' }}
        >Submit Exam</button>
      </div>
      {finished && <div style={{ color: 'green', marginTop: 20 }}>Exam submitted! (UI only)</div>}
    </div>
  );
}

export default App;
