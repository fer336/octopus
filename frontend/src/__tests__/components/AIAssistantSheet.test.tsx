import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }))

vi.mock('../../api/aiService', () => ({
  default: { chat: chatMock },
}))

import AIAssistantSheet from '../../components/layout/AIAssistantSheet'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AIAssistantSheet — open/close', () => {
  it('renders nothing when closed', () => {
    render(<AIAssistantSheet open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog', { name: /asistente ia/i })).not.toBeInTheDocument()
  })

  it('closes via the X button', async () => {
    const onClose = vi.fn()
    render(<AIAssistantSheet open onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar asistente/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AIAssistantSheet — real send/receive flow', () => {
  it('appends a user bubble immediately and an assistant bubble once aiService.chat resolves', async () => {
    chatMock.mockResolvedValue({ response_type: 'text', text: 'Tenés 12 productos con stock bajo.' })

    render(<AIAssistantSheet open onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText(/escribí tu consulta/i)
    await userEvent.type(input, 'Precio del producto P1')
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(screen.getByText('Precio del producto P1')).toBeInTheDocument()
    expect(chatMock).toHaveBeenCalledWith('Precio del producto P1', [], undefined)

    expect(await screen.findByText('Tenés 12 productos con stock bajo.')).toBeInTheDocument()
  })

  it('sends via a suggested chip and calls the real aiService with the chip text', async () => {
    chatMock.mockResolvedValue({ response_type: 'text', text: 'Vendiste $45.000 hoy.' })

    render(<AIAssistantSheet open onClose={vi.fn()} />)

    const chip = screen.getAllByRole('button', { name: /vendí hoy/i })[0]
    await userEvent.click(chip)

    await waitFor(() => expect(chatMock).toHaveBeenCalled())
    expect(chatMock.mock.calls[0][0]).toMatch(/vendí hoy/i)
    expect(await screen.findByText('Vendiste $45.000 hoy.')).toBeInTheDocument()
  })
})

describe('AIAssistantSheet — service failure', () => {
  it('shows a visible error message in the thread when aiService.chat rejects', async () => {
    chatMock.mockRejectedValue(new Error('El servidor no respondió.'))

    render(<AIAssistantSheet open onClose={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText(/escribí tu consulta/i), 'Buscar tornillos')
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no respondió.')
  })
})
