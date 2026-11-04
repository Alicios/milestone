import { useEffect, useRef, useState } from 'react';
import { loadExerciseFeedback, saveExerciseFeedback } from './exerciseFeedback';

export default function useExerciseReview({ patientId, enabled, assignmentId, exercise, visible, onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const pending = useRef(null);
  const reading = useRef(null);
  const [restored, setRestored] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const mounted = useRef(true);
  const key = `${patientId || ''}/${exercise?.assignmentExerciseId || ''}`;
  const assignmentKey = `${patientId || ''}/${assignmentId || ''}`;
  const context = useRef(null);
  context.current = { patientId, enabled, key, assignmentKey, visible };
  const owner = useRef(patientId);
  // Invalidate callbacks synchronously when the account changes, before effects.
  if (owner.current !== patientId) { owner.current = patientId; pending.current = null; }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = null; reading.current = null; };
  }, []);
  useEffect(() => {
    setDrafts({}); setError(null); setSavingKey(null); pending.current = null; reading.current = null; setRestored(null); setLoadingSaved(false);
  }, [patientId]);
  const saved = restored?.key === assignmentKey ? restored.rows?.get(exercise?.assignmentExerciseId) : exercise?.patientFeedback;
  const readError = restored?.key === assignmentKey ? restored.error : exercise?.patientFeedbackError;
  const value = drafts[key] || { painScore: saved?.painScore ?? null, feeling: saved?.feeling ?? null, explanation: saved?.explanation ?? '' };
  async function reloadSaved() {
    if (!enabled || !patientId || !assignmentId || reading.current || pending.current) return;
    const token = { assignmentKey }; reading.current = token; setLoadingSaved(true);
    const eligible = () => mounted.current && context.current.patientId === patientId && context.current.assignmentKey === assignmentKey && context.current.enabled && reading.current === token;
    try {
      const rows = await loadExerciseFeedback(assignmentId);
      if (eligible()) setRestored({ key: assignmentKey, rows, error: '' });
    } catch {
      if (eligible()) setRestored(current => ({ key: assignmentKey, rows: current?.key === assignmentKey ? current.rows : null, error: 'Your saved exercise responses could not be loaded. Please retry.' }));
    } finally {
      if (reading.current === token) { reading.current = null; if (mounted.current) setLoadingSaved(false); }
    }
  }
  function change(patch) {
    if (pending.current || !enabled) return;
    setDrafts(current => ({ ...current, [key]: { ...value, ...patch } }));
    setError(null);
  }
  async function submit() {
    if (!enabled || !patientId || !visible || pending.current) return false;
    const token = { patientId, key };
    pending.current = token; setSavingKey(key); setError(null);
    const eligible = () => mounted.current && context.current.patientId === patientId && context.current.enabled && pending.current === token;
    try {
      const saved = await saveExerciseFeedback(exercise?.assignmentExerciseId, value);
      if (!eligible()) return false;
      setDrafts(current => ({ ...current, [key]: saved }));
      if (context.current.key === key && context.current.visible) onSaved();
      return true;
    } catch (failure) {
      if (eligible()) setError({ key, message: failure.message || 'Your response could not be saved. Your answers are still here; try again.' });
      return false;
    } finally {
      if (pending.current === token) { pending.current = null; if (mounted.current) setSavingKey(null); }
    }
  }
  return { value, change, submit, readError, loadingSaved, reloadSaved, saving: savingKey === key, error: error?.key === key ? error.message : '' };
}
