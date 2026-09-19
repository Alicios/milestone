export interface Patient {
  id: string
  name: string
  statuses: Array<'missed' | 'complete' | 'modified' | 'none' | 'routine'>
}

export const initialPatients: Patient[] = [
  { id: 'john', name: 'John Patientman', statuses: ['missed', 'complete', 'modified', 'none', 'routine', 'none', 'routine'] },
  { id: 'katherine', name: 'Katherine Varela', statuses: ['complete', 'complete', 'routine', 'complete', 'none', 'none', 'routine'] },
]
