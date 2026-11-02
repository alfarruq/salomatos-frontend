import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Doctor } from '@/entities/doctor'
import { doctorQueries } from '@/entities/doctor'
import { isDentalDoctorType } from '@/entities/doctor-type'
import { patientQueries } from '@/entities/patient'
import type { Treatment } from '@/entities/treatment'
import type { TreatmentType } from '@/entities/treatment-type'
import { treatmentTypeQueries } from '@/entities/treatment-type'
import { ApiError } from '@/shared/api/errors'
import { todayCalendarDate } from '@/shared/lib/calendarDate'
import { Alert, Button, Dialog, ErrorState, Field, Select, Skeleton, Textarea } from '@/shared/ui'
import type { ComposerFields, TreatmentRow } from '../model/types'
import { useSaveTreatments } from '../model/useSaveTreatments'
import { PatientPicker, type PickedPatient } from './PatientPicker'
import { ToothPicker } from './ToothPicker'
import { TreatmentRowsTable } from './TreatmentRowsTable'
import { TreatmentTypeAdder } from './TreatmentTypeAdder'

export interface TreatmentComposerProps {
  clinicId: number
  /**
   * Absent shows a patient picker instead — the Treatments page's "add"
   * button, where no patient is open yet. Then the visit number comes from
   * the picked patient's card.
   */
  patientId?: number
  /** Sent as `visit_number` on every new row — the patient's visit count plus one. */
  nextVisitNumber?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present only when editing an existing treatment. Absent means "create". */
  initialTreatment?: Treatment
  /** Preselected on create, e.g. the doctor just assigned in the new-patient form. Ignored on edit. */
  initialDoctorId?: number
}

let rowIdCounter = 0
function nextRowId(): string {
  rowIdCounter += 1
  return `row-${rowIdCounter}`
}

/**
 * The create/edit dialog for a patient's treatments — one definition shared
 * by both, per §6: a tooth map and a rows table are not worth building twice.
 *
 * Reads its own reference data (doctors, treatment types) rather than taking
 * them as props, so every call site — the history table's "new" button, its
 * row menu's "edit" — only has to pass the ids.
 */
export function TreatmentComposer({
  clinicId,
  patientId,
  nextVisitNumber,
  open,
  onOpenChange,
  initialTreatment,
  initialDoctorId,
}: TreatmentComposerProps) {
  const { t } = useTranslation(['treatments', 'common'])

  const doctorsQuery = useQuery(doctorQueries.list(clinicId))
  const treatmentTypesQuery = useQuery(treatmentTypeQueries.list(clinicId))

  if (doctorsQuery.isPending || treatmentTypesQuery.isPending) {
    return (
      <Dialog
        onOpenChange={onOpenChange}
        open={open}
        title={
          initialTreatment === undefined
            ? t('treatments:composer.title')
            : t('treatments:composer.editTitle')
        }
      >
        <div className="flex flex-col gap-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Dialog>
    )
  }

  if (doctorsQuery.isError || treatmentTypesQuery.isError) {
    return (
      <Dialog onOpenChange={onOpenChange} open={open} title={t('treatments:composer.title')}>
        <ErrorState description={t('common:error.pageBody')} title={t('common:error.pageTitle')} />
      </Dialog>
    )
  }

  return (
    <TreatmentComposerForm
      clinicId={clinicId}
      doctors={doctorsQuery.data}
      initialDoctorId={initialDoctorId}
      initialTreatment={initialTreatment}
      nextVisitNumber={nextVisitNumber}
      onOpenChange={onOpenChange}
      open={open}
      patientId={patientId}
      treatmentTypes={treatmentTypesQuery.data}
    />
  )
}

/** Stands in for the chart / type list until there is a doctor to decide which. */
function ComposerHint({ children }: { children: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-card border border-dashed border-border p-6 text-center text-callout text-text-secondary">
      {children}
    </div>
  )
}

function buildInitialRows(
  initialTreatment: Treatment | undefined,
  treatmentTypes: TreatmentType[],
): TreatmentRow[] {
  if (initialTreatment === undefined) return []

  // Best effort only: the read response gives a name, not the id this needs
  // to prefill the select. If nothing matches, the select opens unset and
  // the row's save omits `treatment_type` unless the user picks one anyway
  // (`TreatmentRowsTable`'s `onExistingRowTypeChanged`).
  const matchedType = treatmentTypes.find(
    (type) => type.name === initialTreatment.treatmentTypeName,
  )

  return [
    {
      rowId: nextRowId(),
      toothNumber: initialTreatment.toothNumber,
      treatmentTypeId: matchedType?.id ?? null,
      treatmentTypeName: initialTreatment.treatmentTypeName ?? '',
      totalCost:
        initialTreatment.totalTreatmentCost === null
          ? ''
          : String(initialTreatment.totalTreatmentCost),
      totalPaid: initialTreatment.totalPaid === null ? '' : String(initialTreatment.totalPaid),
      status: initialTreatment.status ?? 'in_progress',
      initialStatus: initialTreatment.status,
      existingTreatmentId: initialTreatment.id,
    },
  ]
}

function TreatmentComposerForm({
  clinicId,
  patientId,
  nextVisitNumber,
  open,
  onOpenChange,
  initialTreatment,
  initialDoctorId,
  doctors,
  treatmentTypes,
}: {
  clinicId: number
  patientId: number | undefined
  nextVisitNumber: number | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTreatment: Treatment | undefined
  initialDoctorId: number | undefined
  doctors: Doctor[]
  treatmentTypes: TreatmentType[]
}) {
  const { t } = useTranslation(['treatments', 'patients', 'common'])
  const { mutate, isPending, error } = useSaveTreatments(clinicId)

  const [pickedPatient, setPickedPatient] = useState<PickedPatient | null>(null)
  const effectivePatientId = patientId ?? pickedPatient?.id ?? null
  // The list row has no visit count; the card does.
  const pickedPatientQuery = useQuery({
    ...patientQueries.detail(clinicId, pickedPatient?.id ?? 0),
    enabled: patientId === undefined && pickedPatient !== null,
  })
  const effectiveVisitNumber =
    nextVisitNumber ??
    (pickedPatientQuery.data === undefined ? null : pickedPatientQuery.data.visitNumber + 1)

  const [rows, setRows] = useState<TreatmentRow[]>(() =>
    buildInitialRows(initialTreatment, treatmentTypes),
  )
  const [doctorId, setDoctorId] = useState(() => {
    if (initialTreatment === undefined) {
      // Only a doctor still on the list: a stale id would leave the select blank but "set".
      return doctors.some((doctor) => doctor.id === initialDoctorId) ? String(initialDoctorId) : ''
    }
    return String(
      doctors.find((doctor) => doctor.fullName === initialTreatment.doctorName)?.id ?? '',
    )
  })
  const [notes, setNotes] = useState(initialTreatment?.notes ?? '')
  const [doctorTouched, setDoctorTouched] = useState(false)
  const [existingRowTypeTouched, setExistingRowTypeTouched] = useState(false)

  /*
   * The doctor decides everything below them: a dental doctor gets the tooth
   * chart, any other specialty a plain list, and either way only the
   * treatment types filed under that doctor's own type. Matched by name —
   * both list serializers send the doctor type's `__str__`, never its id.
   */
  const selectedDoctor = doctors.find((doctor) => String(doctor.id) === doctorId) ?? null
  const specialty = selectedDoctor?.doctorTypeName ?? null
  const isDental = isDentalDoctorType(specialty)
  const specialtyTypes =
    specialty === null ? [] : treatmentTypes.filter((type) => type.doctorTypeName === specialty)

  const isEditing = initialTreatment !== undefined
  const hasNewRows = rows.some((row) => row.existingTreatmentId === null)
  // A new record always needs a real doctor; an edit that only changes an
  // existing row's own fields can leave it alone (see `formSchema.ts`).
  const doctorRequired = !isEditing || hasNewRows
  const canSave =
    rows.length > 0 &&
    (!doctorRequired || doctorId !== '') &&
    effectivePatientId !== null &&
    effectiveVisitNumber !== null

  const doctorOptions = doctors.map((doctor) => ({
    value: String(doctor.id),
    label: doctor.fullName,
  }))

  function handleDoctorChange(value: string) {
    const nextSpecialty =
      doctors.find((doctor) => String(doctor.id) === value)?.doctorTypeName ?? null
    // Unsaved rows were picked from the old specialty's types, which the new
    // doctor cannot perform. The row being edited is a saved record — kept.
    if (nextSpecialty !== specialty) {
      setRows((current) => current.filter((row) => row.existingTreatmentId !== null))
    }
    setDoctorId(value)
    setDoctorTouched(true)
  }

  function handleAddRow(toothNumber: number | null, type: TreatmentType) {
    setRows((current) => [
      ...current,
      {
        rowId: nextRowId(),
        toothNumber,
        treatmentTypeId: type.id,
        treatmentTypeName: type.name,
        totalCost: type.price === null ? '' : String(type.price),
        totalPaid: '',
        status: 'in_progress',
        initialStatus: null,
        existingTreatmentId: null,
      },
    ])
  }

  function handleRemoveTooth(toothNumber: number) {
    setRows((current) => current.filter((row) => row.toothNumber !== toothNumber))
  }

  function handleRowChange(rowId: string, changes: Partial<TreatmentRow>) {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...changes } : row)))
  }

  function handleRemoveRow(rowId: string) {
    setRows((current) => current.filter((row) => row.rowId !== rowId))
  }

  const errorMessage = pickedPatientQuery.isError
    ? t('common:error.pageBody')
    : error === null || error === undefined
      ? null
      : error instanceof ApiError && error.kind === 'network'
        ? t('common:error.network')
        : t('treatments:composer.saveFailed')

  function handleSave() {
    if (effectivePatientId === null || effectiveVisitNumber === null) return
    mutate(
      {
        patientId: effectivePatientId,
        rows,
        fields: { doctorId, notes } satisfies ComposerFields,
        startDate: initialTreatment?.startDate ?? todayCalendarDate(),
        visitNumber: effectiveVisitNumber,
        touched: { doctor: doctorTouched, treatmentType: existingRowTypeTouched },
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      className="sm:max-w-6xl"
      footer={
        <>
          <Button disabled={isPending} onClick={() => onOpenChange(false)} variant="secondary">
            {t('common:action.cancel')}
          </Button>
          <Button disabled={!canSave} isLoading={isPending} onClick={handleSave} variant="primary">
            {t('treatments:composer.save')}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={isEditing ? t('treatments:composer.editTitle') : t('treatments:composer.title')}
    >
      <div className="flex flex-col gap-6">
        {errorMessage === null ? null : <Alert title={errorMessage} tone="danger" />}

        {/* Fields first: the doctor has to be chosen before the right half means anything.
            Two columns only from `lg`: below that the chart needs the full width. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-4">
            {patientId === undefined ? (
              <PatientPicker
                clinicId={clinicId}
                isDisabled={isPending}
                onChange={setPickedPatient}
                value={pickedPatient}
              />
            ) : null}

            <Field isRequired={doctorRequired} label={t('treatments:composer.doctorLabel')}>
              <Select
                onValueChange={handleDoctorChange}
                options={doctorOptions}
                placeholder={t('treatments:composer.doctorPlaceholder')}
                {...(doctorId === '' ? {} : { value: doctorId })}
              />
            </Field>

            <Field label={t('treatments:composer.notesLabel')}>
              <Textarea onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
            </Field>
          </div>

          {selectedDoctor === null ? (
            <ComposerHint>{t('treatments:composer.chooseDoctorFirst')}</ComposerHint>
          ) : specialty === null ? (
            <ComposerHint>{t('treatments:composer.doctorHasNoType')}</ComposerHint>
          ) : specialtyTypes.length === 0 ? (
            <ComposerHint>
              {t('treatments:composer.noTypesForSpecialty', { specialty })}
            </ComposerHint>
          ) : isDental ? (
            <ToothPicker
              onAddTooth={handleAddRow}
              onRemoveTooth={handleRemoveTooth}
              rows={rows}
              treatmentTypes={specialtyTypes}
            />
          ) : (
            <TreatmentTypeAdder
              onAdd={(type) => handleAddRow(null, type)}
              treatmentTypes={specialtyTypes}
            />
          )}
        </div>

        <TreatmentRowsTable
          onExistingRowTypeChanged={() => setExistingRowTypeTouched(true)}
          onRemoveRow={handleRemoveRow}
          onRowChange={handleRowChange}
          rows={rows}
          showToothColumn={isDental || rows.some((row) => row.toothNumber !== null)}
          treatmentTypes={specialtyTypes}
        />
      </div>
    </Dialog>
  )
}
