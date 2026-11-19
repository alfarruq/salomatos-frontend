import { Clock, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  Button,
  DatePicker,
  Field,
  Input,
  PhoneInput,
  Popover,
  Select,
  type SelectOption,
  TEETH,
  Textarea,
} from '@/shared/ui'
import type { AppointmentFormInput } from '../model/formSchema'

/** Bookable slots, 30 minutes apart, 07:00 through 20:00. */
const APPOINTMENT_TIME_OPTIONS: SelectOption[] = (() => {
  const options: SelectOption[] = []
  for (let hour = 7; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 20 && minute > 0) break
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      options.push({ value: time, label: time })
    }
  }
  return options
})()

/**
 * Keeps digits only and puts the colon in by itself, so "1620" and "16:20"
 * both read as 16:20. The schema still validates the result as HH:MM.
 */
function formatTypedTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

/** FDI numbers in chart order — upper arch right to left, then lower. */
const TOOTH_OPTIONS: SelectOption[] = TEETH.map((tooth) => ({ value: tooth.fdi, label: tooth.fdi }))

export interface AppointmentTreatmentTypeProps {
  /**
   * Already narrowed to the selected doctor's specialty by the feature — the
   * entity cannot see doctors or treatment types itself (§4).
   */
  options: SelectOption[]
  /** Shown instead of the select when there is nothing to pick from yet. */
  emptyHint: string | null
  /** Only a dental doctor works on a single tooth. */
  showToothNumber: boolean
}

export interface AppointmentPatientResult {
  id: number
  fullName: string
  phoneNumber: string | null
}

export interface AppointmentPatientPickerProps {
  searchTerm: string
  onSearchTermChange: (term: string) => void
  results: AppointmentPatientResult[]
  /** Null when nothing is linked yet — a walk-in, or not chosen this session. */
  linkedPatientName: string | null
  onSelect: (patient: AppointmentPatientResult) => void
  onUnlink: () => void
}

export interface AppointmentFormFieldsProps {
  form: UseFormReturn<AppointmentFormInput>
  isDisabled?: boolean
  /**
   * Doctor choices, as plain `{value, label}` pairs — an entity may not import
   * another entity (§4), so the feature fetching the list converts it first,
   * same as `DoctorFormFields.doctorTypeOptions`.
   */
  doctorOptions: SelectOption[]
  /** A fresh appointment always starts `in_progress` — only edit shows this. */
  showStatus?: boolean
  patientPicker: AppointmentPatientPickerProps
  /** Absent hides treatment type and tooth number altogether (edit, for now). */
  treatmentType?: AppointmentTreatmentTypeProps
}

/**
 * An appointment's writable fields. Passive — the feature owns the mutation
 * and the patient search it drives (§3.2).
 */
export function AppointmentFormFields({
  form,
  isDisabled = false,
  doctorOptions,
  showStatus = false,
  patientPicker,
  treatmentType,
}: AppointmentFormFieldsProps) {
  const { t } = useTranslation(['appointments', 'validation'])

  const message = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined
    return value.startsWith('validation.') ? t(value.replace('validation.', 'validation:')) : value
  }

  const errors = form.formState.errors
  const [isTimeListOpen, setTimeListOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/*
       * One input does both jobs: what is typed is the walk-in's name and,
       * at the same time, the search term for an existing patient. Picking a
       * result links that patient; typing again after that unlinks them, so
       * the name sent never disagrees with the record it is linked to.
       */}
      <Field
        description={
          patientPicker.linkedPatientName === null
            ? undefined
            : t('appointments:form.fullNameLinkedHint')
        }
        error={message(errors.fullName?.message)}
        isRequired
        label={t('appointments:form.patient')}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <Input
                  autoComplete="off"
                  className="flex-1"
                  disabled={isDisabled}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    const value = event.target.value
                    field.onChange(value)
                    if (patientPicker.linkedPatientName !== null) patientPicker.onUnlink()
                    patientPicker.onSearchTermChange(value.trim())
                  }}
                  placeholder={t('appointments:form.patientSearchPlaceholder')}
                  ref={field.ref}
                  value={field.value}
                />
              )}
            />
            {patientPicker.linkedPatientName === null ? null : (
              <Button
                aria-label={t('appointments:form.unlinkPatient')}
                disabled={isDisabled}
                onClick={patientPicker.onUnlink}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
          {patientPicker.searchTerm === '' || patientPicker.results.length === 0 ? null : (
            <ul className="flex flex-col gap-1 rounded-control border border-border bg-elevated p-1">
              {patientPicker.results.map((result) => (
                <li key={result.id}>
                  <button
                    className="flex w-full flex-col rounded-[8px] px-3 py-2 text-left hover:bg-sunken"
                    onClick={() => patientPicker.onSelect(result)}
                    type="button"
                  >
                    <span className="text-body text-text">{result.fullName}</span>
                    {result.phoneNumber === null ? null : (
                      <span className="text-caption text-text-secondary">{result.phoneNumber}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      <Field
        error={message(errors.phoneNumber?.message)}
        isRequired
        label={t('appointments:form.phoneNumber')}
      >
        <Controller
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <PhoneInput
              disabled={isDisabled}
              name={field.name}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
      </Field>

      <Field
        error={message(errors.doctorId?.message)}
        isRequired
        label={t('appointments:form.doctor')}
      >
        <Controller
          control={form.control}
          name="doctorId"
          render={({ field }) => (
            <Select
              disabled={isDisabled}
              name={field.name}
              onValueChange={(value) => {
                field.onChange(value)
                // A type picked for the previous doctor is not one the new
                // doctor performs, and a tooth means nothing to a non-dentist.
                if (treatmentType !== undefined && value !== field.value) {
                  form.setValue('treatmentTypeName', '')
                  form.setValue('toothNumber', '')
                }
              }}
              options={doctorOptions}
              placeholder={t('appointments:form.doctorPlaceholder')}
              value={field.value}
            />
          )}
        />
      </Field>

      {treatmentType === undefined ? null : (
        <div className={treatmentType.showToothNumber ? 'grid grid-cols-2 gap-4' : undefined}>
          <Field
            description={treatmentType.emptyHint ?? undefined}
            error={message(errors.treatmentTypeName?.message)}
            label={t('appointments:form.treatmentType')}
          >
            <Controller
              control={form.control}
              name="treatmentTypeName"
              render={({ field }) => (
                <Select
                  disabled={isDisabled || treatmentType.options.length === 0}
                  name={field.name}
                  onValueChange={field.onChange}
                  options={treatmentType.options}
                  placeholder={t('appointments:form.treatmentTypePlaceholder')}
                  value={field.value}
                />
              )}
            />
          </Field>

          {treatmentType.showToothNumber ? (
            <Field
              error={message(errors.toothNumber?.message)}
              label={t('appointments:form.toothNumber')}
            >
              <Controller
                control={form.control}
                name="toothNumber"
                render={({ field }) => (
                  <Select
                    disabled={isDisabled}
                    name={field.name}
                    onValueChange={field.onChange}
                    options={TOOTH_OPTIONS}
                    placeholder={t('appointments:form.toothNumberPlaceholder')}
                    value={field.value}
                  />
                )}
              />
            </Field>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field error={message(errors.date?.message)} isRequired label={t('appointments:form.date')}>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => (
              <DatePicker
                disabled={isDisabled}
                nextMonthLabel={t('appointments:form.nextMonth')}
                onChange={field.onChange}
                placeholder={t('appointments:form.datePlaceholder')}
                previousMonthLabel={t('appointments:form.previousMonth')}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field error={message(errors.time?.message)} isRequired label={t('appointments:form.time')}>
          <Controller
            control={form.control}
            name="time"
            render={({ field }) => (
              // One field: the time is typed (e.g. 16:20), and the clock button
              // offers the 30-minute slots as a shortcut into the same value.
              <div className="relative">
                <Input
                  autoComplete="off"
                  className="pr-12"
                  disabled={isDisabled}
                  inputMode="numeric"
                  maxLength={5}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(formatTypedTime(event.target.value))}
                  placeholder={t('appointments:form.timePlaceholder')}
                  ref={field.ref}
                  value={field.value}
                />
                <Popover
                  align="end"
                  onOpenChange={setTimeListOpen}
                  open={isTimeListOpen}
                  trigger={
                    <button
                      aria-label={t('appointments:form.timeSlots')}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control text-text-secondary hover:text-text disabled:pointer-events-none disabled:opacity-40"
                      disabled={isDisabled}
                      type="button"
                    >
                      <Clock aria-hidden="true" className="size-4" />
                    </button>
                  }
                >
                  <ul className="grid max-h-64 w-56 grid-cols-3 gap-1 overflow-y-auto">
                    {APPOINTMENT_TIME_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <button
                          aria-pressed={option.value === field.value}
                          className="h-11 w-full rounded-[8px] text-callout text-text hover:bg-sunken aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
                          onClick={() => {
                            field.onChange(option.value)
                            setTimeListOpen(false)
                          }}
                          type="button"
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover>
              </div>
            )}
          />
        </Field>
      </div>

      {showStatus ? (
        <Field label={t('appointments:form.status')}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select
                disabled={isDisabled}
                name={field.name}
                onValueChange={field.onChange}
                options={[
                  { value: 'in_progress', label: t('appointments:status.in_progress') },
                  { value: 'completed', label: t('appointments:status.completed') },
                ]}
                value={field.value}
              />
            )}
          />
        </Field>
      ) : null}

      <Field error={message(errors.notes?.message)} label={t('appointments:form.notes')}>
        <Textarea disabled={isDisabled} {...form.register('notes')} />
      </Field>
    </div>
  )
}
