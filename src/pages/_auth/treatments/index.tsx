import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as v from 'valibot'
import { Can } from '@/entities/session'
import type { TreatmentListFilters } from '@/entities/treatment'
import { TreatmentComposer } from '@/features/treatment-composer'
import { Button } from '@/shared/ui'
import { TreatmentTable } from '@/widgets/treatment-table'

const positiveId = v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)))

/**
 * Shareable view state (§3): ids, a page, a debt flag and a status — never a name.
 * `?patient=10` identifies a record; `?patient=Aliyev` would disclose one.
 */
const treatmentsSearchSchema = v.object({
  page: positiveId,
  patient: positiveId,
  doctor: positiveId,
  type: positiveId,
  debt: v.optional(v.picklist(['with', 'without'])),
  status: v.optional(v.picklist(['in_progress', 'completed'])),
})

type TreatmentsSearch = v.InferOutput<typeof treatmentsSearchSchema>

export const Route = createFileRoute('/_auth/treatments/')({
  // A hand-edited URL falls back to the unfiltered first page rather than an error.
  validateSearch: (search): TreatmentsSearch => {
    const result = v.safeParse(treatmentsSearchSchema, search)
    return result.success ? result.output : {}
  },
  component: TreatmentsPage,
})

function TreatmentsPage() {
  const { t } = useTranslation('treatments')
  const { clinicId } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [isComposerOpen, setComposerOpen] = useState(false)
  // A fresh key per opening, so the dialog never reopens on the last patient's rows.
  const [composerSession, setComposerSession] = useState(0)

  const filters: TreatmentListFilters = {
    page: search.page ?? 1,
    patientId: search.patient ?? null,
    doctorId: search.doctor ?? null,
    treatmentTypeId: search.type ?? null,
    debt: search.debt ?? null,
    status: search.status ?? null,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title1 text-text">{t('list.title')}</h1>
        {/* UX only — Django decides who may actually write a treatment (§9.1). */}
        <Can permission="medical-record:write">
          <Button
            iconLeft={<Plus aria-hidden="true" className="size-4" />}
            onClick={() => {
              setComposerSession((session) => session + 1)
              setComposerOpen(true)
            }}
            size="sm"
            variant="primary"
          >
            {t('list.add')}
          </Button>
        </Can>
      </div>

      <TreatmentComposer
        clinicId={clinicId}
        key={composerSession}
        onOpenChange={setComposerOpen}
        open={isComposerOpen}
      />

      <TreatmentTable
        clinicId={clinicId}
        filters={filters}
        onFiltersChange={(next) =>
          void navigate({
            // Defaults stay out of the URL, so `/treatments` is the canonical unfiltered first page.
            search: (): TreatmentsSearch => ({
              ...(next.page === 1 ? {} : { page: next.page }),
              ...(next.patientId === null ? {} : { patient: next.patientId }),
              ...(next.doctorId === null ? {} : { doctor: next.doctorId }),
              ...(next.treatmentTypeId === null ? {} : { type: next.treatmentTypeId }),
              ...(next.debt === null ? {} : { debt: next.debt }),
              ...(next.status === null ? {} : { status: next.status }),
            }),
            to: '/treatments',
          })
        }
      />
    </div>
  )
}
