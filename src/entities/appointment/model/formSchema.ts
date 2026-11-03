import * as v from 'valibot'
import { parseCalendarDate } from '@/shared/lib/calendarDate'
import type { Appointment, AppointmentStatus } from './types'

/**
 * The writable shape of an appointment.
 *
 * In the entity rather than a feature, so create and edit share one
 * definition without importing each other (§4) — same reasoning as
 * `entities/patient/model/formSchema.ts`.
 *
 * `fullName`/`phoneNumber` are sent only for a walk-in. When both are present
 * the backend ignores the `patient` id and looks the patient up by phone with
 * `get_or_create`, which crashes with a 500 when several patients share that
 * phone (allowed by design, e.g. mother and child) and can attach the booking
 * to the wrong record. A linked patient therefore goes by id alone.
 */

/** Matches `entities/patient/model/formSchema.ts` — the same phone shape. */
const UZ_PHONE = /^\+998\d{9}$/

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export const appointmentFormSchema = v.object({
  fullName: v.pipe(v.string(), v.trim(), v.minLength(2, 'validation.tooShort')),
  phoneNumber: v.pipe(v.string(), v.regex(UZ_PHONE, 'validation.phoneUz')),
  /** An `entities/patient` id as a string. `''` means a walk-in, not linked to a record. */
  patientId: v.string(),
  /**
   * An `entities/doctor` id as a string. Required — a real POST confirmed the
   * backend rejects `doctor: null` (`{"doctor": "null"}` validation error),
   * unlike `patient`, which is optional.
   */
  doctorId: v.pipe(v.string(), v.minLength(1, 'validation.required')),
  date: v.pipe(
    v.string(),
    v.minLength(1, 'validation.required'),
    v.check((value) => parseCalendarDate(value) !== null, 'validation.invalid'),
  ),
  time: v.pipe(v.string(), v.regex(TIME, 'validation.invalid')),
  /**
   * An `entities/treatment-type` **name**, not its id — the published write
   * schema declares `treatment_type` a string here, unlike
   * `/clinic/treatments/`. `''` means none picked; optional, since existing
   * appointments come back with `treatment_type: null`.
   */
  treatmentTypeName: v.string(),
  /** An FDI tooth number as a string; `''` unless the doctor is a dentist. */
  toothNumber: v.string(),
  notes: v.string(),
  status: v.picklist(['in_progress', 'completed'] as const satisfies readonly AppointmentStatus[]),
})

export type AppointmentFormInput = v.InferOutput<typeof appointmentFormSchema>

export const emptyAppointmentForm: AppointmentFormInput = {
  fullName: '',
  phoneNumber: '',
  patientId: '',
  doctorId: '',
  date: '',
  time: '',
  treatmentTypeName: '',
  toothNumber: '',
  notes: '',
  status: 'in_progress',
}

/** Fills the form from an existing appointment, for editing. */
export function toAppointmentForm(appointment: Appointment): AppointmentFormInput {
  return {
    fullName: appointment.fullName,
    phoneNumber: appointment.phoneNumber ?? '',
    patientId: appointment.patientId === null ? '' : String(appointment.patientId),
    doctorId: appointment.doctorId === null ? '' : String(appointment.doctorId),
    date: appointment.date,
    time: appointment.time,
    treatmentTypeName: '',
    toothNumber: '',
    notes: appointment.notes ?? '',
    status: appointment.status,
  }
}

export function toAppointmentPayload(
  input: AppointmentFormInput,
): Record<string, string | number | null> {
  const isWalkIn = input.patientId === ''
  return {
    full_name: isWalkIn ? input.fullName : null,
    phone_number: isWalkIn ? input.phoneNumber : null,
    patient: isWalkIn ? null : Number(input.patientId),
    doctor: input.doctorId === '' ? null : Number(input.doctorId),
    date: input.date,
    time: input.time,
    notes: input.notes === '' ? null : input.notes,
    status: input.status,
    // Omitted rather than `null` when empty, so an edit that never showed
    // these fields cannot clear what is already stored.
    ...(input.treatmentTypeName === '' ? {} : { treatment_type: input.treatmentTypeName }),
    ...(input.toothNumber === '' ? {} : { tooth_number: Number(input.toothNumber) }),
  }
}

const SERVER_FIELD_NAMES: Record<string, keyof AppointmentFormInput> = {
  full_name: 'fullName',
  phone_number: 'phoneNumber',
  patient: 'patientId',
  doctor: 'doctorId',
  date: 'date',
  time: 'time',
  treatment_type: 'treatmentTypeName',
  tooth_number: 'toothNumber',
  notes: 'notes',
  status: 'status',
}

/** The inverse, for putting a server error back on the input that caused it (§10). */
export function appointmentFormFieldOf(serverField: string): keyof AppointmentFormInput | 'root' {
  return SERVER_FIELD_NAMES[serverField] ?? 'root'
}
