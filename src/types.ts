export type Exam = {
  exam_id: string;
  title: string;
  instructions?: string;
  duration_minutes: number;
  creator_id?: string;
  created_at?: string;
  max_attempts?: number;
};

export type Question = {
  question_id: string;
  exam_id: string;
  type: 'multiple-choice' | 'short-answer';
  prompt: string;
  choices?: string[];
  correct_answer?: string;
  points?: number;
  created_at?: string;
  image_url?: string;
};
