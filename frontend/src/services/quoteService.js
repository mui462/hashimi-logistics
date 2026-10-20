import { apiClient } from './apiClient';
import { asUnavailable } from './serviceHelpers';

const UNAVAILABLE = 'Online quote requests are not available right now. Please contact our team directly.';

// POST /quotes (JSON): the guest quote request from the public website. Answers { quoteNumber } once it is stored.
// No files are sent from the public site. If the API is missing or down this rejects honestly; success is never faked.
export async function submitQuoteRequest(payload) {
  try {
    const { data } = await apiClient.post('/quotes', payload);
    return data.data;
  } catch (error) {
    throw asUnavailable(error, UNAVAILABLE);
  }
}
