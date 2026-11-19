import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { Suspense } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { permissionsForRole, type Role, useSessionStore } from '@/entities/session'
import { defaultTreatmentListFilters, type TreatmentListFilters } from '@/entities/treatment'
import { accessTokenFor, MOCK_USERS } from '@/shared/api/mocks/fixtures'
import { server } from '@/shared/api/mocks/server'
import { clearAccessToken, setAccessToken } from '@/shared/api/tokenStore'
import { createI18n } from '@/shared/i18n'
import { TreatmentTable } from './TreatmentTable'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  clearAccessToken()
  useSessionStore.getState().clear()
})
afterAll(() => server.close())

const ROW = {
  id: 1,
  patient_id: 101,
  patient: 'Vali Aliyev',
  doctor: 'Sardor Usmonov',
  treatment_type: 'Implantatsiya',
  total_treatment_cost: 4_000_000,
  total_paid: 2_800_000,
  remaining: '1200000',
  visit_number: 3,
  tooth_number: 36,
  start_date: '2026-08-20',
  notes: null,
  status: 'in_progress',
}

function signIn(role: Role) {
  setAccessToken(accessTokenFor('clinic'))
  useSessionStore.getState().setSession({
    userId: MOCK_USERS.clinic.id,
    clinicId: MOCK_USERS.clinic.id,
    fullName: 'Test',
    phoneNumber: null,
    email: null,
    role,
    permissions: permissionsForRole(role),
  })
}

function renderTable(overrides: Partial<TreatmentListFilters> = {}) {
  const onFiltersChange = vi.fn()
  const filters = { ...defaultTreatmentListFilters, ...overrides }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <TreatmentTable
        clinicId={MOCK_USERS.clinic.id}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    ),
  })
  const patientRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/patients/$patientId',
    component: () => <p>patient page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, patientRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createI18n('uz-Latn')}>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </I18nextProvider>
    </QueryClientProvider>,
  )

  return { onFiltersChange, router }
}

describe('TreatmentTable', () => {
  beforeEach(() => signIn('superadmin'))

  it('lists every treatment in the clinic, with the patient and the money', async () => {
    renderTable()

    expect(await screen.findAllByRole('link', { name: 'Vali Aliyev' })).toHaveLength(2)
    expect(screen.getByText('20.08.2026')).toBeInTheDocument()
    expect(screen.getByText('Implantatsiya')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Qarz' })).toBeInTheDocument()
  })

  it('shows money still owed in red, and a settled treatment plainly', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', () =>
        HttpResponse.json({
          count: 2,
          next: null,
          previous: null,
          results: [
            { ...ROW, id: 1, treatment_type: 'Qarzli', remaining: '1200000' },
            { ...ROW, id: 2, treatment_type: 'Tolangan', remaining: '0' },
          ],
        }),
      ),
    )
    renderTable()

    const owed = (await screen.findByText('Qarzli')).closest('tr') as HTMLElement
    const settled = screen.getByText('Tolangan').closest('tr') as HTMLElement
    expect(owed.querySelector('.text-danger')).not.toBeNull()
    expect(settled.querySelector('.text-danger')).toBeNull()
  })

  it('asks the server for the three pages of the screen it is on, with no patient filter', async () => {
    const seen: URL[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/clinic/treatments/')) seen.push(new URL(request.url))
    })
    renderTable({ page: 2 })

    await vi.waitFor(() => expect(seen).toHaveLength(3))
    expect(seen.map((url) => url.searchParams.get('page')).sort()).toEqual(['4', '5', '6'])
    expect(seen.some((url) => url.searchParams.has('patient_id'))).toBe(false)
  })

  it('hides the money columns from a doctor', async () => {
    signIn('doctor')
    renderTable()

    await screen.findAllByRole('link', { name: 'Vali Aliyev' })
    expect(screen.queryByRole('columnheader', { name: 'Qarz' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: "To'langan" })).not.toBeInTheDocument()
  })

  it("opens the patient's page from a row", async () => {
    const { router } = renderTable()

    await userEvent.click(await screen.findByText('Implantatsiya'))

    expect(await screen.findByText('patient page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/patients/101')
  })

  it('grows the first screen by ten rows per "next", then moves to the next screen of thirty', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          count: 70,
          next: `https://salomatos.uz/api/v1/clinic/treatments/?page=${page + 1}`,
          previous: null,
          results: Array.from({ length: 10 }, (_, index) => ({
            ...ROW,
            id: page * 100 + index,
            treatment_type: `Tur ${page}-${index}`,
          })),
        })
      }),
    )
    const { onFiltersChange } = renderTable()

    await screen.findByText('70 tadan 1–10')
    await userEvent.click(screen.getByRole('button', { name: 'Keyingi' }))
    await screen.findByText('70 tadan 1–20')
    expect(screen.getByText('Tur 1-0')).toBeInTheDocument()
    expect(screen.getByText('Tur 2-9')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Keyingi' }))
    await screen.findByText('70 tadan 1–30')
    expect(onFiltersChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Keyingi' }))
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('shows a later screen as thirty rows at once', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          count: 70,
          next: `https://salomatos.uz/api/v1/clinic/treatments/?page=${page + 1}`,
          previous: null,
          results: Array.from({ length: 10 }, (_, index) => ({ ...ROW, id: page * 100 + index })),
        })
      }),
    )
    renderTable({ page: 2 })

    expect(await screen.findByText('70 tadan 31–60')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Vali Aliyev' })).toHaveLength(30)
  })

  it('shows a skeleton while loading', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', async () => {
        await delay('infinite')
        return HttpResponse.json([])
      }),
    )
    renderTable()

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('says so when there are no treatments', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderTable()

    expect(
      await screen.findByRole('heading', { name: "Hozircha muolaja yo'q" }),
    ).toBeInTheDocument()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    )
    renderTable()

    expect(
      await screen.findByRole('heading', { name: 'Bu sahifa ochilmadi' }, { timeout: 8000 }),
    ).toBeInTheDocument()
  })

  it('sends every active filter to the server as ids', async () => {
    const seen: { url: URL | null } = { url: null }
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/clinic/treatments/')) seen.url = new URL(request.url)
    })
    renderTable({ patientId: 101, doctorId: 2, treatmentTypeId: 7, debt: 'with' })

    await vi.waitFor(() => expect(seen.url).not.toBeNull())
    const params = seen.url?.searchParams
    expect(params?.get('patient_id')).toBe('101')
    expect(params?.get('doctor_id')).toBe('2')
    expect(params?.get('treatment_type_id')).toBe('7')
    expect(params?.get('remaining')).toBe('true')
  })

  it('maps "no debt" to remaining=false', async () => {
    const seen: { url: URL | null } = { url: null }
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/clinic/treatments/')) seen.url = new URL(request.url)
    })
    renderTable({ debt: 'without' })

    await vi.waitFor(() => expect(seen.url).not.toBeNull())
    expect(seen.url?.searchParams.get('remaining')).toBe('false')
  })

  it('sends the status filter as status=', async () => {
    const seen: { url: URL | null } = { url: null }
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/clinic/treatments/')) seen.url = new URL(request.url)
    })
    renderTable({ status: 'in_progress' })

    await vi.waitFor(() => expect(seen.url).not.toBeNull())
    expect(seen.url?.searchParams.get('status')).toBe('in_progress')
  })

  it('filters by a status picked from the list', async () => {
    const { onFiltersChange } = renderTable({ page: 2 })

    await userEvent.click(await screen.findByRole('combobox', { name: "Holat bo'yicha filtr" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tugallangan' }))

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', page: 1 }),
    )
  })

  it('goes back to page 1 when a filter changes', async () => {
    const { onFiltersChange } = renderTable({ page: 3 })

    await userEvent.click(
      await screen.findByRole('combobox', { name: "Qarzdorlik bo'yicha filtr" }),
    )
    await userEvent.click(await screen.findByRole('option', { name: 'Qarzi bor' }))

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ debt: 'with', page: 1 }))
  })

  it('filters by a doctor picked from the list, by id', async () => {
    const { onFiltersChange } = renderTable()

    await userEvent.click(await screen.findByRole('combobox', { name: "Shifokor bo'yicha filtr" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Sardor Usmonov' }))

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 2 }))
  })

  it('finds a patient by name and filters by their id', async () => {
    const { onFiltersChange } = renderTable()

    await userEvent.type(await screen.findByRole('searchbox'), 'Vali')
    await userEvent.click(await screen.findByRole('button', { name: /Vali Aliyev/ }))

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ patientId: 101 }))
  })

  it('shows the picked patient by name, and clears them', async () => {
    const { onFiltersChange } = renderTable({ patientId: 101 })

    // findByRole, not findByText: text matches even while Suspense still hides the tree.
    const clear = await screen.findByRole('button', { name: 'Bemor filtrini olib tashlash' })
    expect(await screen.findByText('Vali Aliyev', { selector: 'span' })).toBeInTheDocument()
    await userEvent.click(clear)

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ patientId: null }))
  })

  it('offers to clear the filters when nothing matches them', async () => {
    server.use(
      http.get('/api/v1/clinic/treatments/', () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    const { onFiltersChange } = renderTable({ debt: 'with' })

    expect(
      await screen.findByRole('heading', { name: 'Mos muolaja topilmadi' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Filtrlarni tozalash' }))

    expect(onFiltersChange).toHaveBeenCalledWith(defaultTreatmentListFilters)
  })
  describe('row actions menu', () => {
    const singleRow = () =>
      server.use(
        http.get('/api/v1/clinic/treatments/', () =>
          HttpResponse.json({ count: 1, next: null, previous: null, results: [ROW] }),
        ),
      )
    const openMenu = async () =>
      userEvent.click(
        await screen.findByRole('button', { name: 'Amallar — Implantatsiya, 20.08.2026' }),
      )

    it('offers the four actions without opening the patient', async () => {
      singleRow()
      const { router } = renderTable()

      await openMenu()

      for (const name of [
        'Tahrirlash',
        "To'lov qabul qilish",
        'Muolajani yakunlash',
        "O'chirish",
      ]) {
        expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
      }
      expect(router.state.location.pathname).toBe('/')
    })

    it('adds a payment to what was already paid', async () => {
      singleRow()
      let body: unknown = null
      server.use(
        http.patch('/api/v1/clinic/treatments/:id/', async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ ...ROW, total_paid: 3_000_000, remaining: '1000000' })
        }),
      )
      renderTable()

      await openMenu()
      await userEvent.click(screen.getByRole('menuitem', { name: "To'lov qabul qilish" }))
      const amount = await screen.findByLabelText("To'lov summasi")
      await userEvent.clear(amount)
      await userEvent.type(amount, '200000')
      await userEvent.click(screen.getByRole('button', { name: 'Qabul qilish' }))

      await vi.waitFor(() => expect(body).toEqual({ total_paid: 3_000_000 }))
    })

    it('refuses a payment larger than the debt', async () => {
      singleRow()
      renderTable()

      await openMenu()
      await userEvent.click(screen.getByRole('menuitem', { name: "To'lov qabul qilish" }))
      const amount = await screen.findByLabelText("To'lov summasi")
      await userEvent.clear(amount)
      await userEvent.type(amount, '5000000')
      await userEvent.click(screen.getByRole('button', { name: 'Qabul qilish' }))

      expect(await screen.findByText(/Summa qarzdan/)).toBeInTheDocument()
    })

    it('completes a treatment after confirming', async () => {
      singleRow()
      let body: unknown = null
      server.use(
        http.patch('/api/v1/clinic/treatments/:id/', async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ ...ROW, status: 'completed' })
        }),
      )
      renderTable()

      await openMenu()
      await userEvent.click(screen.getByRole('menuitem', { name: 'Muolajani yakunlash' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Yakunlash' }))

      await vi.waitFor(() => expect(body).toEqual(expect.objectContaining({ status: 'completed' })))
    })

    it('lets a doctor edit and complete, but not take payment or delete', async () => {
      signIn('doctor')
      singleRow()
      renderTable()

      await openMenu()

      expect(screen.getByRole('menuitem', { name: 'Tahrirlash' })).not.toHaveAttribute(
        'data-disabled',
      )
      expect(screen.getByRole('menuitem', { name: "To'lov qabul qilish" })).toHaveAttribute(
        'data-disabled',
      )
      expect(screen.getByRole('menuitem', { name: "O'chirish" })).toHaveAttribute('data-disabled')
    })
  })
})
