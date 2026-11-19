import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as v from 'valibot'
import { patientKeys } from '@/entities/patient'
import { treatmentKeys, treatmentSchema } from '@/entities/treatment'
import { httpClient } from '@/shared/api/httpClient'

export interface TakeTreatmentPaymentInput {
  treatmentId: number
  /** What the row showed as paid when the dialog opened. */
  previousPaid: number
  amount: number
}

/**
 * Frontend-only by product decision (2026-11-19): the payment is added to the
 * treatment's `total_paid` through the same `PATCH` the composer's edit uses,
 * rather than a separate payments endpoint.
 */
async function takeTreatmentPayment(input: TakeTreatmentPaymentInput): Promise<void> {
  const raw = await httpClient<unknown>(`v1/clinic/treatments/${input.treatmentId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ total_paid: input.previousPaid + input.amount }),
  })
  v.parse(treatmentSchema, raw)
}

/** ⛔ No optimistic update and no retry: money (§10). */
export function useTakeTreatmentPayment(clinicId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: takeTreatmentPayment,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: treatmentKeys.scope(clinicId) })
      // The patient card's paid/debt totals are summed from treatment rows server-side.
      void queryClient.invalidateQueries({ queryKey: patientKeys.scope(clinicId) })
    },
  })
}
