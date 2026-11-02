import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Suspense } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessTokenFor, MOCK_DOCTORS, MOCK_USERS } from '@/shared/api/mocks/fixtures'
import { server } from '@/shared/api/mocks/server'
import { clearAccessToken, setAccessToken } from '@/shared/api/tokenStore'
import { createI18n } from '@/shared/i18n'
import { TreatmentComposer } from './TreatmentComposer'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  clearAccessToken()
})
afterAll(() => server.close())

/*
 * Fixtures: Sardor is a "Stomatolog", Malika has no type at all. An
 * orthodontist is added here so there is a non-dental doctor whose type
 * matches a treatment type ("Tozalash" is filed under "Ortodont").
 */
const ORTHODONTIST = {
  id: 6,
  full_name: 'Aziz Karimov',
  phone_number: null,
  email: null,
  doctor_type: 'Ortodont',
}

function renderComposer(props: { patientId?: number } = { patientId: 101 }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createI18n('uz-Latn')}>
        <Suspense fallback={null}>
          {props.patientId === undefined ? (
            <TreatmentComposer clinicId={MOCK_USERS.clinic.id} onOpenChange={vi.fn()} open />
          ) : (
            <TreatmentComposer
              clinicId={MOCK_USERS.clinic.id}
              nextVisitNumber={4}
              onOpenChange={vi.fn()}
              open
              patientId={props.patientId}
            />
          )}
        </Suspense>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

async function chooseDoctor(name: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: 'Shifokor' }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

const CHOOSE_DOCTOR_FIRST =
  'Avval shifokorni tanlang — davolash turlari uning mutaxassisligiga qarab chiqadi.'

describe('TreatmentComposer', () => {
  beforeEach(() => {
    setAccessToken(accessTokenFor('clinic'))
    server.use(
      http.get('/api/v1/clinic/doctors/', () => HttpResponse.json([...MOCK_DOCTORS, ORTHODONTIST])),
    )
  })

  it('waits for a doctor before offering any treatment', async () => {
    renderComposer()

    // The file's first render pays the cold-start cost (i18n, both reference
    // queries); under a full parallel run that alone can exceed the 1s default.
    expect(await screen.findByText(CHOOSE_DOCTOR_FIRST, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tish 16/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: "Davolash turini qo'shish" }),
    ).not.toBeInTheDocument()
  })

  it('shows the tooth chart for a dental doctor, with only dental treatments', async () => {
    renderComposer()
    await chooseDoctor('Sardor Usmonov')

    expect(screen.queryByText(CHOOSE_DOCTOR_FIRST)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Tish 16/ }))
    // The tooth's popover holds a closed select; its options render once opened.
    await userEvent.click(await screen.findByRole('combobox', { name: 'Davolash turi' }))

    expect(await screen.findByRole('option', { name: 'Implantatsiya' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Tozalash' })).not.toBeInTheDocument()
  })

  it('drops the chart for any other specialty and offers only its treatments', async () => {
    renderComposer()
    await chooseDoctor('Aziz Karimov')

    expect(screen.queryByRole('button', { name: /^Tish 16/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: "Davolash turini qo'shish" }))

    expect(await screen.findByRole('option', { name: 'Tozalash' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Implantatsiya' })).not.toBeInTheDocument()
  })

  it('adds a tooth-less row for a non-dental treatment', async () => {
    renderComposer()
    await chooseDoctor('Aziz Karimov')

    await userEvent.click(screen.getByRole('combobox', { name: "Davolash turini qo'shish" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tozalash' }))

    expect(screen.getByRole('button', { name: "O'chirish — Tozalash" })).toBeInTheDocument()
    // No tooth column for a specialty that does not work on teeth.
    expect(screen.queryByRole('columnheader', { name: 'Tish' })).not.toBeInTheDocument()
  })

  it('gives every row its own status instead of one for the whole save', async () => {
    renderComposer()
    await chooseDoctor('Aziz Karimov')
    await userEvent.click(screen.getByRole('combobox', { name: "Davolash turini qo'shish" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tozalash' }))

    expect(screen.getByRole('combobox', { name: 'Holat — Tozalash' })).toHaveTextContent(
      'Davolanmoqda',
    )
    // The dialog-wide status select is gone — only the per-row one remains.
    expect(screen.getAllByRole('combobox', { name: /^Holat/ })).toHaveLength(1)
  })

  it('clears unsaved rows when the doctor switches to another specialty', async () => {
    renderComposer()
    await chooseDoctor('Aziz Karimov')
    await userEvent.click(screen.getByRole('combobox', { name: "Davolash turini qo'shish" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tozalash' }))

    await chooseDoctor('Sardor Usmonov')

    expect(screen.queryByRole('button', { name: "O'chirish — Tozalash" })).not.toBeInTheDocument()
  })

  it('explains a doctor with no specialty instead of showing nothing', async () => {
    renderComposer()
    await chooseDoctor('Malika Yusupova')

    expect(
      screen.getByText(
        "Bu shifokorga mutaxassislik (shifokor turi) biriktirilmagan. Davolash turlarini ko'rish uchun avval unga tur belgilang.",
      ),
    ).toBeInTheDocument()
  })

  it('finds the patient by name when opened without one, and saves for them', async () => {
    let posted: unknown = null
    server.use(
      http.post('/api/v1/clinic/treatments/', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json([])
      }),
    )
    renderComposer({})

    const save = await screen.findByRole('button', { name: 'Saqlash' }, { timeout: 5000 })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Bemor' }), 'vali')
    await userEvent.click(
      await screen.findByRole('button', { name: /Vali Aliyev/ }, { timeout: 5000 }),
    )

    await chooseDoctor('Aziz Karimov')
    await userEvent.click(screen.getByRole('combobox', { name: "Davolash turini qo'shish" }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tozalash' }))

    await waitFor(() => expect(save).toBeEnabled(), { timeout: 5000 })
    await userEvent.click(save)

    // Visit number comes from the picked patient's card (3 visits so far).
    await waitFor(
      () => expect(posted).toEqual([expect.objectContaining({ patient: 101, visit_number: 4 })]),
      { timeout: 5000 },
    )
  })
})
