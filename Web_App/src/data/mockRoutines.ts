export interface Routine {
  id: string
  name: string
}

// Existing routines created by the demo provider.
export const mockRoutines: Routine[] = [
  { id: 'lower-body', name: 'Lower Body' },
  { id: 'upper-body', name: 'Upper Body' },
  { id: 'cardio', name: 'Cardio' },
  { id: 'underwater-basketweaving', name: 'Underwater Basketweaving Routine' },
  { id: 'mongolian-throat-singing', name: 'Mongolian Throat Singing Routine' },
]
