import { Controller, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Field, Input, PasswordInput, PhoneInput, Select, type SelectOption } from '@/shared/ui'
import type { DoctorFormInput } from '../model/formSchema'

export interface DoctorFormFieldsProps {
  form: UseFormReturn<DoctorFormInput>
  isDisabled?: boolean
  /**
   * Doctor-type choices, as plain `{value, label}` pairs rather than the
   * `entities/doctor-type` shape — an entity may not import another entity
   * (§4), so the feature that fetches the list converts it before it gets here.
   */
  doctorTypeOptions: SelectOption[]
  /**
   * `create` requires a password; `edit` treats an empty one as "keep the
   * current password", since the server never sends it back.
   */
  mode: 'create' | 'edit'
}

/**
 * A doctor's writable fields, and nothing else — no submit, no mutation.
 *
 * Passive, so it stays an entity (§3.2), and shared so that creating and
 * editing cannot drift apart without either feature importing the other.
 */
export function DoctorFormFields({
  form,
  isDisabled = false,
  doctorTypeOptions,
  mode,
}: DoctorFormFieldsProps) {
  const { t } = useTranslation(['admin', 'validation'])

  /** Valibot and the server both speak `validation.<code>` — see §10. */
  const message = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined
    return value.startsWith('validation.') ? t(value.replace('validation.', 'validation:')) : value
  }

  const errors = form.formState.errors

  return (
    <div className="flex flex-col gap-4">
      <Field
        error={message(errors.fullName?.message)}
        isRequired
        label={t('admin:doctor.fullName')}
      >
        <Input autoComplete="off" disabled={isDisabled} {...form.register('fullName')} />
      </Field>

      <Field
        error={message(errors.phoneNumber?.message)}
        isRequired
        label={t('admin:doctor.phoneNumber')}
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

      <Field error={message(errors.email?.message)} label={t('admin:doctor.email')}>
        <Input autoComplete="off" disabled={isDisabled} type="email" {...form.register('email')} />
      </Field>

      <Field label={t('admin:doctor.type')}>
        <Controller
          control={form.control}
          name="doctorTypeId"
          render={({ field }) => (
            <Select
              disabled={isDisabled}
              name={field.name}
              onValueChange={field.onChange}
              options={doctorTypeOptions}
              placeholder={t('admin:doctor.typePlaceholder')}
              value={field.value}
            />
          )}
        />
      </Field>

      <Field
        error={message(errors.username?.message)}
        isRequired
        label={t('admin:doctor.username')}
      >
        <Input
          autoCapitalize="none"
          autoComplete="off"
          disabled={isDisabled}
          spellCheck={false}
          {...form.register('username')}
        />
      </Field>

      <Field
        description={mode === 'edit' ? t('admin:doctor.passwordKeep') : undefined}
        error={message(errors.password?.message)}
        isRequired={mode === 'create'}
        label={mode === 'create' ? t('admin:doctor.password') : t('admin:doctor.newPassword')}
      >
        {/* `new-password` stops the browser from filling in the superadmin's own login. */}
        <PasswordInput
          autoComplete="new-password"
          disabled={isDisabled}
          hideLabel={t('common:action.hidePassword')}
          showLabel={t('common:action.showPassword')}
          {...form.register('password')}
        />
      </Field>
    </div>
  )
}
