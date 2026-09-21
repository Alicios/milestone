export interface Patient {
  id: string
  name: string
  statuses: Array<'missed' | 'complete' | 'modified' | 'none' | 'routine'>
}

export const mockPatients: Patient[] = [
  { id: 'john', name: 'John Patientman', statuses: ['missed', 'complete', 'modified', 'none', 'routine', 'none', 'routine'] },
  { id: 'katherine', name: 'Katherine Varela', statuses: ['complete', 'complete', 'routine', 'complete', 'none', 'none', 'routine'] },
  { id: 'neal', name: 'Neal Terrell', statuses: ['routine', 'complete', 'complete', 'none', 'routine', 'none', 'none'] },
  { id: 'frank', name: 'Frank Murgolo', statuses: ['none', 'routine', 'complete', 'complete', 'none', 'none', 'routine'] },
]
