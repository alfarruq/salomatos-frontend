import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Treatment } from '@/entities/treatment'
import { ApiError } from '@/shared/api/errors'
import { formatSom } from '@/shared/lib/money'
import { Alert, Button, Dialog, Field, MoneyInput, toast } from '@/shared/ui'
import { useTakeTreatmentPayment } from '../model/useTakeTreatmentPayment'

export interface TakeTreatmentPaymentDialogProps {
  clinicId: number
  treatment: Pick<Treatment, 'id' | 'totalPaid' | 'remaining' | 'treatmentTypeName'>
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FORM_ID = 'take-treatment-payment-form'

/** Prefilled with the whole debt; a part payment is typed over it. */
export function TakeTreatmentPaymentDialog({
  clinicId,
  treatment,
  open,
  onOpenChange,
}: TakeTreatmentPaymentDialogProps) {
  const { t, i18n } = useTranslation(['treatments', 'common'])
  const debt = Math.max(treatment.remaining ?? 0, 0)
  const [amount, setAmount] = useState(debt > 0 ? String(debt) : '')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const { mutate, isPending, error, reset } = useTakeTreatmentPayment(clinicId)
  const som = (value: number) => formatSom(value, i18n.language, t('common:currency.som'))

  const errorMessage =
    error === null
      ? null
      : error instanceof ApiError && error.kind === 'network'
        ? t('common:error.network')
        : t('treatments:payment.failed')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (amount === '' || value <= 0) {
      setFieldError(t('treatments:payment.amountRequired'))
      return
    }
    if (value > debt) {
      setFieldError(t('treatments:payment.amountTooLarge', { debt: som(debt) }))
      return
    }
    setFieldError(null)
    mutate(
      { treatmentId: treatment.id, previousPaid: treatment.totalPaid ?? 0, amount: value },
      {
        onSuccess: () => {
          toast.success(t('treatments:payment.success'))
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      description={t('treatments:payment.description', {
        type: treatment.treatmentTypeName ?? '—',
        debt: som(debt),
      })}
      footer={
        <>
          <Button
            disabled={isPending}
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            variant="secondary"
          >
            {t('common:action.cancel')}
          </Button>
          <Button
            disabled={debt === 0}
            form={FORM_ID}
            isLoading={isPending}
            type="submit"
            variant="primary"
          >
            {t('treatments:payment.submit')}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t('treatments:payment.title')}
    >
      <form className="flex flex-col gap-4" id={FORM_ID} noValidate onSubmit={submit}>
        {errorMessage === null ? null : <Alert title={errorMessage} tone="danger" />}
        {debt === 0 ? <Alert title={t('treatments:payment.noDebt')} tone="info" /> : null}
        <Field
          error={fieldError ?? undefined}
          isRequired
          label={t('treatments:payment.amountLabel')}
        >
          <MoneyInput disabled={isPending || debt === 0} onChange={setAmount} value={amount} />
        </Field>
      </form>
    </Dialog>
  )
}
