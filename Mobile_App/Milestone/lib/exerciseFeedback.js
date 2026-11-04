import { supabase } from './supabase';

export function validateExerciseFeedback(value) {
  if (!Number.isInteger(value.painScore) || value.painScore < 1 || value.painScore > 10) {
    throw new Error('Choose a pain score from 1 to 10.');
  }
  if (!['good', 'neutral', 'difficult'].includes(value.feeling)) {
    throw new Error('Choose Good, Neutral, or Difficult.');
  }
  const explanation = value.feeling === 'good' ? null : (value.explanation || '').trim();
  if (value.feeling !== 'good' && !explanation) throw new Error('Tell your provider why the exercise felt that way.');
  if (explanation && [...explanation].length > 4000) throw new Error('Use no more than 4,000 characters.');
  return { painScore: value.painScore, feeling: value.feeling, explanation };
}

export function fromFeedbackRow(row) {
  return { painScore: row.pain_score, feeling: row.feeling, explanation: row.explanation, reportedAt: row.reported_at };
}

export async function loadExerciseFeedback(assignmentId) {
  const { data, error } = await supabase.rpc('get_my_routine_exercise_feedback', { p_routine_assignment_id: assignmentId });
  if (error) throw error;
  return new Map((data || []).map(row => [row.routine_assignment_exercise_id, fromFeedbackRow(row)]));
}

export async function saveExerciseFeedback(exerciseId, value) {
  if (!exerciseId) throw new Error('This exercise is missing its assignment details. Reload your routine.');
  const input = validateExerciseFeedback(value);
  const { data, error } = await supabase.rpc('save_my_routine_exercise_feedback', {
    p_routine_assignment_exercise_id: exerciseId, p_pain_score: input.painScore,
    p_feeling: input.feeling, p_explanation: input.explanation,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || row.routine_assignment_exercise_id !== exerciseId || row.pain_score !== input.painScore
    || row.feeling !== input.feeling || row.explanation !== input.explanation || !Number.isFinite(Date.parse(row.reported_at))) {
    throw new Error('The saved response could not be verified. Your answers are still here; try again.');
  }
  return fromFeedbackRow(row);
}
