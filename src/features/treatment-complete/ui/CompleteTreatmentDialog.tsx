import { useTranslation } from 'react-i18next'
import type { Treatment } from '@/entities/treatment'
import { ApiError } from '@/shared/api/errors'
import { Alert, Button, Dialog, toast } from '@/shared/ui'
import { useCompleteTreatment } from '../model/useCompleteTreatment'

export interface CompleteTreatmentDialogProps {
  clinicId: number
  treatment: Pick<Treatment, 'id' | 'startDate' | 'treatmentTypeName' | 'toothNumber'>
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CompleteTreatmentDialog({
  clinicId,
  treatment,
  open,
  onOpenChange,
}: CompleteTreatmentDialogProps) {
  const { t } = useTranslation(['treatments', 'common'])
  const { mutate, isPending, error, reset } = useCompleteTreatment(clinicId)

  const errorMessage =
    error === null
      ? null
      : error instanceof ApiError && error.kind === 'network'
        ? t('common:error.network')
        : t('treatments:complete.failed')

  return (
    <Dialog
      description={t('treatments:complete.description', {
        type: treatment.treatmentTypeName ?? '—',
        tooth: treatment.toothNumber ?? '—',
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
            isLoading={isPending}
            onClick={() =>
              mutate(treatment, {
                onSuccess: () => {
                  toast.success(t('treatments:complete.success'))
                  onOpenChange(false)
                },
              })
            }
            variant="primary"
          >
            {t('treatments:complete.confirm')}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t('treatments:complete.title')}
    >
      {errorMessage === null ? null : <Alert title={errorMessage} tone="danger" />}
    </Dialog>
  )
}
