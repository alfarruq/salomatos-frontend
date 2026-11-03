import { describe, expect, it } from 'vitest'
import { emptyAppointmentForm, toAppointmentPayload } from './formSchema'

const BASE = {
  ...emptyAppointmentForm,
  fullName: 'Vali Aliyev',
  phoneNumber: '+998901234567',
  doctorId: '2',
  date: '2026-10-08',
  time: '09:30',
}

describe('toAppointmentPayload', () => {
  it('sends the treatment type by name and the tooth as an integer', () => {
    const payload = toAppointmentPayload({
      ...BASE,
      treatmentTypeName: 'Implantatsiya',
      toothNumber: '16',
    })

    expect(payload).toMatchObject({ treatment_type: 'Implantatsiya', tooth_number: 16 })
  })

  it('leaves both out when nothing was picked, so an edit cannot clear them', () => {
    const payload = toAppointmentPayload(BASE)

    expect(payload).not.toHaveProperty('treatment_type')
    expect(payload).not.toHaveProperty('tooth_number')
  })

  it('sends a linked patient by id only, so the backend cannot match by a shared phone', () => {
    const payload = toAppointmentPayload({ ...BASE, patientId: '42' })

    expect(payload).toMatchObject({ patient: 42, full_name: null, phone_number: null })
  })

  it('sends name and phone for a walk-in', () => {
    const payload = toAppointmentPayload(BASE)

    expect(payload).toMatchObject({
      patient: null,
      full_name: 'Vali Aliyev',
      phone_number: '+998901234567',
    })
  })
})
