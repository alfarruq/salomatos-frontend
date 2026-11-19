import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as v from 'valibot'
import { patientKeys } from '@/entities/patient'
import { type Treatment, treatmentKeys, treatmentSchema } from '@/entities/treatment'
import { httpClient } from '@/shared/api/httpClient'
import { clinicNow } from '@/shared/lib/datetime'

/**
 * `PATCH /clinic/treatments/{id}/` — the same partial update the composer's
 * edit sends, narrowed to the status. `completed_date` is the clinic's day
 * (§14), never before the start date, matching the composer's rule.
 */
async function completeTreatment(treatment: Pick<Treatment, 'id' | 'startDate'>): Promise<void> {
  const today = clinicNow().date
  const startDate = treatment.startDate
  const completedDate = startDate !== null && today < startDate ? startDate : today
  const raw = await httpClient<unknown>(`v1/clinic/treatments/${treatment.id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed', completed_date: completedDate }),
  })
  v.parse(treatmentSchema, raw)
}

/** ⛔ No optimistic update (§6.5): a clinical record's status. */
export function useCompleteTreatment(clinicId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTreatment,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: treatmentKeys.scope(clinicId) })
      // The patient's status and tooth chart are derived from treatment rows server-side.
      void queryClient.invalidateQueries({ queryKey: patientKeys.scope(clinicId) })
    },
  })
}
