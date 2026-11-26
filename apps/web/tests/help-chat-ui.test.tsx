// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { HelpChat } from '../app/components/ui/help-chat'
import { createI18n } from '../app/i18n/instance'
import SupportPage from '../app/routes/support'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe.each(['en', 'ja'] as const)('help chat (%s)', (locale) => {
  it('opens accessibly and returns localized published article links', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ok: true, answer: 'Open the inventory dashboard.', sources: [{title: 'Inventory guide', slug: 'inventory-guide', summary: 'Setup instructions'}]}), {status: 200}))
    const t = createI18n(locale).getFixedT(locale, 'feedback')
    const user = userEvent.setup()
    render(<I18nextProvider i18n={createI18n(locale)}><MemoryRouter><HelpChat locale={locale} /></MemoryRouter></I18nextProvider>)
    const trigger = screen.getByRole('button', {name: t('chatOpen')})
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', {name: t('chatTitle')})
    const input = within(dialog).getByRole('textbox', {name: t('chatInput')})
    expect(document.activeElement).toBe(input)
    await user.type(input, 'inventory')
    await user.click(within(dialog).getByRole('button', {name: t('chatSend')}))
    const link = await within(dialog).findByRole('link', {name: 'Inventory guide'})
    expect(link.getAttribute('href')).toBe(`/${locale}/articles/inventory-guide`)
    expect(await within(dialog).findByText('Open the inventory dashboard.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(`/${locale}/chat`)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages).toEqual([{role: 'user', content: 'inventory'}])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('offers support when no sources are returned and displays provider errors', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ok: true, answer: 'I could not find a matching guide.', sources: []}), {status: 200}))
      .mockRejectedValueOnce(new Error('offline'))
    const t = createI18n(locale).getFixedT(locale, 'feedback')
    const user = userEvent.setup()
    render(<I18nextProvider i18n={createI18n(locale)}><MemoryRouter><HelpChat locale={locale} /></MemoryRouter></I18nextProvider>)
    await user.click(screen.getByRole('button', {name: t('chatOpen')}))
    const dialog = screen.getByRole('dialog', {name: t('chatTitle')})
    const input = within(dialog).getByRole('textbox', {name: t('chatInput')})
    await user.type(input, 'missing')
    await user.click(within(dialog).getByRole('button', {name: t('chatSend')}))
    expect(await within(dialog).findByText('I could not find a matching guide.')).toBeTruthy()
    expect((await within(dialog).findByRole('link', {name: t('chatSupport')})).getAttribute('href')).toBe(`/${locale}/support`)
    await user.type(input, 'offline')
    await user.click(within(dialog).getByRole('button', {name: t('chatSend')}))
    expect((await within(dialog).findByRole('alert')).textContent).toBe(t('chatError'))
  })

  it('lets the user review and edit a support email before opening it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ok: true, answer: 'Which product are you using?', sources: []}), {status: 200}))
    const t = createI18n(locale).getFixedT(locale, 'feedback')
    const common = createI18n(locale).getFixedT(locale, 'common')
    const router = createMemoryRouter([
      {path: `/${locale}`, element: <HelpChat locale={locale} />},
      {path: `/${locale}/support`, element: <SupportPage />, loader: () => ({locale, supportEmail: 'support@example.com'})},
    ], {initialEntries: [`/${locale}`]})
    const user = userEvent.setup()
    render(<I18nextProvider i18n={createI18n(locale)}><RouterProvider router={router} /></I18nextProvider>)
    await user.click(screen.getByRole('button', {name: t('chatOpen')}))
    await user.type(screen.getByRole('textbox', {name: t('chatInput')}), 'Need inventory help')
    await user.click(screen.getByRole('button', {name: t('chatSend')}))
    await user.click(await screen.findByRole('link', {name: t('chatSupport')}))
    const draft = await screen.findByRole('textbox', {name: t('chatDraftLabel')})
    expect((draft as HTMLTextAreaElement).value).toContain('Need inventory help')
    expect((draft as HTMLTextAreaElement).value).not.toContain('Which product are you using?')
    await user.clear(draft)
    await user.type(draft, 'Reviewed support request')
    const email = screen.getByRole('link', {name: common('supportEmail')})
    expect(email.getAttribute('href')).toContain('body=Reviewed%20support%20request')
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
