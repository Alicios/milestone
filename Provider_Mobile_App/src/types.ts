export type Provider = {
  id: string; name: string; professionalTitle: string | null; email: string;
  avatarUrl: string | null; practice: string | null; phone: string | null;
};
export type Patient = {
  id: string; profileId: string; name: string; email: string | null; phone: string | null;
  primaryConcern: string | null; treatmentFocus: string | null; startOfCare: string | null;
  careStatus: string | null; dischargedAt: string | null;
};
export type Feedback = { painScore: number; feeling: 'good' | 'neutral' | 'difficult'; explanation: string | null; reportedAt: string };
export type Exercise = {
  id: string; name: string; position: number; sets: number | null; reps: number | null;
  durationSeconds: number | null; notes: string | null; patientFeedback?: Feedback;
};
export type Assignment = {
  id: string; routineId?: string; updatedAt?: string; patientProfileId: string; routineName: string; scheduledDate: string;
  status: 'scheduled' | 'completed' | 'missed' | 'modified' | 'cancelled';
  patientResult?: { inProgress: boolean; issue?: 'noncritical' | 'critical'; comment: string | null; source: 'patient' | 'demo' | null };
  exercises: Exercise[]; exerciseFeedbackError?: string;
};
export type Conversation = { id: string; name: string; preview: string; lastMessageAt: string | null; unread: number; starred: boolean; archived: boolean; archivedThroughAt: string | null };
export type Message = { id: string; text: string; from: 'patient' | 'provider'; createdAt: string; imagePath?: string | null; imageUrl?: string | null };
