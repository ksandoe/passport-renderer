export async function logEvent({ user_id, exam_id, event_type, event_data }: {
  user_id: string,
  exam_id: string,
  event_type: string,
  event_data?: any
}) {
  // API_BASE_URL must be set in the environment for production builds
  const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : undefined;

  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set. Please configure your production endpoint in .env.production');
  }

  try {
    await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, exam_id, event_type, event_data }),
    });
  } catch (err) {
    // Optionally handle/report error
    console.error('[logEvent] Failed:', err);
  }
}
