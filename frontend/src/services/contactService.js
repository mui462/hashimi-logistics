import { apiClient } from './apiClient';
import { asUnavailable } from './serviceHelpers';

const UNAVAILABLE = 'The contact form is not available right now. Please try again later.';

// POST /contact (JSON). The message is stored for the team; no e-mail confirmation is sent to the visitor.
export async function sendContactMessage(payload) {
  try {
    const { data } = await apiClient.post('/contact', payload);
    return data.data;
  } catch (error) {
    throw asUnavailable(error, UNAVAILABLE);
  }
}
