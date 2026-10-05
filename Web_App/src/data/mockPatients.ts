export interface Patient {
  id: string
  profileId: string
  name: string
  careStatus: 'active' | 'pending'
  email?: string
  phone?: string
  primaryConcern?: string
  treatmentFocus?: string
  startOfCare?: string
  statuses: Array<'missed' | 'complete' | 'modified' | 'none' | 'routine'>
}

export const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Frontend demo summaries only; no real patient information.
export const mockPatients: Patient[] = [
  {
    id: 'john', profileId: 'profile-john', name: 'John Patientman', careStatus: 'active',
    email: 'john.patientman@example.com', phone: '(202) 555-0101',
    primaryConcern: 'Knee discomfort during everyday activity',
    treatmentFocus: 'Lower-body strength and comfortable movement', startOfCare: '2026-09-01',
    statuses: ['missed', 'complete', 'modified', 'none', 'routine', 'none', 'routine'],
  },
  {
    id: 'katherine', profileId: 'profile-katherine', name: 'Katherine Varela', careStatus: 'active',
    email: 'katherine.varela@example.com', phone: '(202) 555-0102',
    primaryConcern: 'Shoulder stiffness when reaching',
    treatmentFocus: 'Shoulder mobility and upper-body strength', startOfCare: '2026-08-24',
    statuses: ['complete', 'complete', 'routine', 'complete', 'none', 'none', 'routine'],
  },
  {
    id: 'neal', profileId: 'profile-neal', name: 'Neal Terrell', careStatus: 'active',
    email: 'neal.terrell@example.com', phone: '(202) 555-0103',
    primaryConcern: 'Lower-back discomfort with prolonged sitting',
    treatmentFocus: 'Trunk strength and everyday mobility', startOfCare: '2026-09-08',
    statuses: ['routine', 'complete', 'complete', 'none', 'routine', 'none', 'none'],
  },
  {
    id: 'frank', profileId: 'profile-frank', name: 'Frank Murgolo', careStatus: 'active',
    phone: '(202) 555-0104',
    primaryConcern: 'Ankle stiffness while walking',
    treatmentFocus: 'Ankle mobility and balance', startOfCare: '2026-09-14',
    statuses: ['none', 'routine', 'complete', 'complete', 'none', 'none', 'routine'],
  },
]
