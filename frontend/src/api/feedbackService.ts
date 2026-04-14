import httpClient from './httpClient'

export type FeedbackType = 'bug' | 'feature'
export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'done' | 'rejected'

export interface FeedbackTicket {
  id: string
  business_id: string
  user_id?: string | null
  user_email?: string | null
  feedback_type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  source: string
  admin_note?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedFeedbackResponse {
  items: FeedbackTicket[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface CreateFeedbackPayload {
  feedback_type: FeedbackType
  title: string
  description: string
}

const feedbackService = {
  list: async (): Promise<PaginatedFeedbackResponse> => {
    const response = await httpClient.get('/feedback', {
      params: { page: 1, per_page: 50 },
    })
    return response.data
  },

  create: async (payload: CreateFeedbackPayload): Promise<FeedbackTicket> => {
    const response = await httpClient.post('/feedback', payload)
    return response.data
  },
}

export default feedbackService
