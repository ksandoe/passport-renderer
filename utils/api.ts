// Utility functions for Passport ExamLock API

// API_BASE_URL must be set in the environment for production builds
const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL
  : undefined;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set. Please configure your production endpoint in .env.production');
}

export async function fetchQuestions({ exam_id }: { exam_id: string }) {
  const res = await fetch(`${API_BASE_URL}/questions?exam_id=${exam_id}`);
  if (!res.ok) throw new Error('Failed to fetch questions');
  return (await res.json()).questions;
}

export async function fetchResponses({ user_id, exam_id }: { user_id: string, exam_id: string }) {
  const res = await fetch(`${API_BASE_URL}/responses?user_id=${user_id}&exam_id=${exam_id}`);
  if (!res.ok) throw new Error('Failed to fetch responses');
  return (await res.json()).responses;
}

export async function submitAnswer({ user_id, question_id, answer }: { user_id: string, question_id: string, answer: string }) {
  const res = await fetch(`${API_BASE_URL}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, question_id, answer }),
  });
  // Accept 2xx as success, otherwise try to parse error
  if (!res.ok) {
    let msg = 'Failed to submit answer';
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return await res.json();
}
