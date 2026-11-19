import { type UseQueryResult, useQueries } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { MoreVertical, Stethoscope } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/entities/session'
import {
  defaultTreatmentListFilters,
  type Treatment,
  type TreatmentListFilters,
  TreatmentStatusBadge,
  treatmentQueries,
} from '@/entities/treatment'
import { CompleteTreatmentDialog } from '@/features/treatment-complete'
import { TreatmentComposer } from '@/features/treatment-composer'
import { DeleteTreatmentDialog } from '@/features/treatment-delete'
import { TakeTreatmentPaymentDialog } from '@/features/treatment-payment'
import { PAGE_SIZE, type Page } from '@/shared/api/pagination'
import { formatFixedDate } from '@/shared/lib/calendarDate'
import { cn } from '@/shared/lib/cn'
import { formatSom } from '@/shared/lib/money'
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  ErrorState,
  Pagination,
  QueryBoundary,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/shared/ui'
import { PAGES_PER_SCREEN, serverPagesFor } from '../model/screenPages'
import { TreatmentFilters } from './TreatmentFilters'

export interface TreatmentTableProps {
  clinicId: number
  /** From the URL — ids and a screen number only, never a name (§3). `page` counts screens of up to 30 rows. */
  filters: TreatmentListFilters
  onFiltersChange: (filters: TreatmentListFilters) => void
}

/** Shown when the server had nothing to send for a cell. */
const EMPTY = '—'

type RowAction = 'edit' | 'payment' | 'complete' | 'delete'

interface ScreenData {
  count: number
  results: Treatment[]
  hasNext: boolean
}

/**
 * The screen's server pages as one query for `QueryBoundary`: pending until
 * the first page arrives, rows in page order, and stopping at the first page
 * still on its way so a later one can never show above it.
 */
function combinePages(results: UseQueryResult<Page<Treatment>>[]) {
  const loaded: Page<Treatment>[] = []
  for (const result of results) {
    if (result.data === undefined) break
    loaded.push(result.data)
  }
  const failed = results.filter((result) => result.isError)
  const last = loaded.at(-1)

  return {
    data:
      last === undefined
        ? undefined
        : ({
            count: last.count,
            results: loaded.flatMap((page) => page.results),
            hasNext: last.next !== null,
          } satisfies ScreenData),
    isPending: last === undefined && failed.length === 0,
    isError: failed.length > 0,
    error: failed[0]?.error ?? null,
    isFetching: results.some((result) => result.isFetching),
    refetch: () => {
      for (const result of failed) void result.refetch()
    },
  }
}

/**
 * Every treatment in the clinic, filtered on the server — by patient, doctor,
 * treatment type, debt and status — 10, 20, then 30 rows on the first
 * screen, and 30 at a time after that.
 */
export function TreatmentTable({ clinicId, filters, onFiltersChange }: TreatmentTableProps) {
  const { t, i18n } = useTranslation(['treatments', 'common'])
  const { page: screen } = filters
  const filterKey = JSON.stringify({ ...filters, page: null })
  const [growth, setGrowth] = useState({ filterKey, pages: 1 })
  // A different filter starts the first screen over at ten rows.
  const firstScreenPages = growth.filterKey === filterKey ? growth.pages : 1
  const loadedPages = screen === 1 ? firstScreenPages : PAGES_PER_SCREEN
  const query = useQueries({
    queries: serverPagesFor(screen, loadedPages).map((serverPage) =>
      treatmentQueries.page(clinicId, { ...filters, page: serverPage }),
    ),
    combine: combinePages,
  })
  const isFiltered =
    filters.patientId !== null ||
    filters.doctorId !== null ||
    filters.treatmentTypeId !== null ||
    filters.debt !== null ||
    filters.status !== null
  // A doctor has no `billing:read` (ADR-012): the money columns are not theirs.
  const canSeeMoney = useCan('billing:read')
  // UX only — Django decides who may write (§3). Edit and complete are clinical
  // writes, payment is billing, and a delete wipes both, so it needs both.
  const canWriteRecord = useCan('medical-record:write')
  const canTakePayment = useCan('billing:write')
  const canDelete = canWriteRecord && canTakePayment
  const [action, setAction] = useState<{ kind: RowAction; treatment: Treatment } | null>(null)
  // A fresh composer per opening: it seeds its form once, on mount.
  const [composerSession, setComposerSession] = useState(0)
  const closeAction = (open: boolean) => {
    if (!open) setAction(null)
  }
  const startAction = (kind: RowAction, treatment: Treatment) => {
    if (kind === 'edit') setComposerSession((session) => session + 1)
    setAction({ kind, treatment })
  }
  const navigate = useNavigate()

  const money = (value: number | null) =>
    value === null ? EMPTY : formatSom(value, i18n.language, t('common:currency.som'))

  const showNext = () => {
    if (screen === 1 && loadedPages < PAGES_PER_SCREEN) {
      setGrowth({ filterKey, pages: loadedPages + 1 })
    } else {
      onFiltersChange({ ...filters, page: screen + 1 })
    }
  }

  const showPrevious = () => {
    // Back on the first screen, all thirty rows — the user has already seen past them.
    if (screen === 2) setGrowth({ filterKey, pages: PAGES_PER_SCREEN })
    onFiltersChange({ ...filters, page: screen - 1 })
  }

  const openPatient = (treatment: Treatment) => {
    if (treatment.patientId === null) return
    void navigate({
      to: '/patients/$patientId',
      params: { patientId: String(treatment.patientId) },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <TreatmentFilters clinicId={clinicId} filters={filters} onFiltersChange={onFiltersChange} />

      <QueryBoundary
        empty={
          isFiltered ? (
            <EmptyState
              action={
                <Button onClick={() => onFiltersChange(defaultTreatmentListFilters)} size="sm">
                  {t('treatments:filters.clear')}
                </Button>
              }
              description={t('treatments:filters.noMatchDescription')}
              headingLevel={2}
              icon={<Stethoscope aria-hidden="true" className="size-8" />}
              title={t('treatments:filters.noMatch')}
            />
          ) : (
            <EmptyState
              description={t('treatments:list.emptyDescription')}
              headingLevel={2}
              icon={<Stethoscope aria-hidden="true" className="size-8" />}
              title={t('treatments:list.empty')}
            />
          )
        }
        error={({ retry }) => (
          <ErrorState
            description={t('common:error.pageBody')}
            retryLabel={t('common:action.retry')}
            title={t('common:error.pageTitle')}
            {...(retry === undefined ? {} : { onRetry: retry })}
          />
        )}
        isEmpty={(data) => data.results.length === 0}
        loading={
          <Table>
            <TableSkeleton columns={canSeeMoney ? 11 : 8} rows={PAGE_SIZE} />
          </Table>
        }
        query={query}
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('treatments:table.columnDate')}</TableHead>
                  <TableHead>{t('treatments:list.columnPatient')}</TableHead>
                  <TableHead>{t('treatments:list.columnDoctor')}</TableHead>
                  <TableHead>{t('treatments:table.columnType')}</TableHead>
                  <TableHead align="center">{t('treatments:table.columnTooth')}</TableHead>
                  <TableHead align="center">{t('treatments:list.columnVisit')}</TableHead>
                  {canSeeMoney ? (
                    <>
                      <TableHead align="right">{t('treatments:table.columnCost')}</TableHead>
                      <TableHead align="right">{t('treatments:list.columnPaid')}</TableHead>
                      <TableHead align="right">{t('treatments:table.columnDebt')}</TableHead>
                    </>
                  ) : null}
                  <TableHead>{t('treatments:table.columnStatus')}</TableHead>
                  <TableHead align="right">
                    <span className="sr-only">{t('treatments:table.columnActions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((treatment) => (
                  <TableRow
                    isInteractive={treatment.patientId !== null}
                    key={treatment.id}
                    onClick={() => openPatient(treatment)}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {treatment.startDate === null ? EMPTY : formatFixedDate(treatment.startDate)}
                    </TableCell>
                    <TableCell>
                      {/* The keyboard path to the patient; the row click is the mouse's. */}
                      {treatment.patientId === null ? (
                        (treatment.patientName ?? EMPTY)
                      ) : (
                        <Link
                          className="font-medium text-text hover:underline focus-visible:underline"
                          onClick={(event) => event.stopPropagation()}
                          params={{ patientId: String(treatment.patientId) }}
                          to="/patients/$patientId"
                        >
                          {treatment.patientName ?? EMPTY}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{treatment.doctorName ?? EMPTY}</TableCell>
                    <TableCell>{treatment.treatmentTypeName ?? EMPTY}</TableCell>
                    <TableCell align="center" className="tabular-nums">
                      {treatment.toothNumber ?? EMPTY}
                    </TableCell>
                    <TableCell align="center" className="tabular-nums">
                      {treatment.visitNumber ?? EMPTY}
                    </TableCell>
                    {canSeeMoney ? (
                      <>
                        <TableCell align="right" className="whitespace-nowrap tabular-nums">
                          {money(treatment.totalTreatmentCost)}
                        </TableCell>
                        <TableCell align="right" className="whitespace-nowrap tabular-nums">
                          {money(treatment.totalPaid)}
                        </TableCell>
                        <TableCell
                          align="right"
                          className={cn(
                            'whitespace-nowrap tabular-nums',
                            // Same as the patient's own treatments tab: only money still owed is red.
                            (treatment.remaining ?? 0) > 0 && 'font-semibold text-danger',
                          )}
                        >
                          {money(treatment.remaining)}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell>
                      <TreatmentStatusBadge status={treatment.status} />
                    </TableCell>
                    {/* Menu clicks bubble through the portal to the row; they must not open the patient. */}
                    <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu
                        trigger={
                          <Button
                            aria-label={t('treatments:table.actionsMenuLabel', {
                              type: treatment.treatmentTypeName ?? EMPTY,
                              date:
                                treatment.startDate === null
                                  ? EMPTY
                                  : formatFixedDate(treatment.startDate),
                            })}
                            size="sm"
                            variant="ghost"
                          >
                            <MoreVertical aria-hidden="true" className="size-4" />
                          </Button>
                        }
                      >
                        <DropdownMenuItem
                          disabled={!canWriteRecord || treatment.patientId === null}
                          onSelect={() => startAction('edit', treatment)}
                        >
                          {t('treatments:table.actionEdit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!canTakePayment || (treatment.remaining ?? 0) <= 0}
                          onSelect={() => startAction('payment', treatment)}
                        >
                          {t('treatments:table.actionTakePayment')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!canWriteRecord || treatment.status === 'completed'}
                          onSelect={() => startAction('complete', treatment)}
                        >
                          {t('treatments:table.actionComplete')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!canDelete}
                          isDestructive
                          onSelect={() => startAction('delete', treatment)}
                        >
                          {t('common:action.delete')}
                        </DropdownMenuItem>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              hasNext={data.hasNext}
              hasPrevious={screen > 1}
              isLoading={query.isFetching}
              nextLabel={t('common:action.next')}
              onNext={showNext}
              onPrevious={showPrevious}
              previousLabel={t('common:action.previous')}
              summary={t('treatments:list.summary', {
                count: data.count,
                from: (screen - 1) * PAGES_PER_SCREEN * PAGE_SIZE + 1,
                to: (screen - 1) * PAGES_PER_SCREEN * PAGE_SIZE + data.results.length,
              })}
            />
          </div>
        )}
      </QueryBoundary>

      {action?.kind === 'edit' && action.treatment.patientId !== null ? (
        <TreatmentComposer
          clinicId={clinicId}
          initialTreatment={action.treatment}
          key={composerSession}
          onOpenChange={closeAction}
          open
          patientId={action.treatment.patientId}
        />
      ) : null}
      {action?.kind === 'payment' ? (
        <TakeTreatmentPaymentDialog
          clinicId={clinicId}
          onOpenChange={closeAction}
          open
          treatment={action.treatment}
        />
      ) : null}
      {action?.kind === 'complete' ? (
        <CompleteTreatmentDialog
          clinicId={clinicId}
          onOpenChange={closeAction}
          open
          treatment={action.treatment}
        />
      ) : null}
      {action?.kind === 'delete' ? (
        <DeleteTreatmentDialog
          clinicId={clinicId}
          onDeleted={() => setAction(null)}
          onOpenChange={closeAction}
          open
          treatment={action.treatment}
        />
      ) : null}
    </div>
  )
}
