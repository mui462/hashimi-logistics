import { apiClient } from './apiClient';
import { asUnavailable } from './serviceHelpers';

const UNAVAILABLE = 'Online carrier applications are not available right now. Please contact our team directly.';

// POST /carrier-applications (JSON). Documents (W-9, insurance, authority) are collected after review, not uploaded here.
export async function submitCarrierApplication(payload) {
  try {
    const { data } = await apiClient.post('/carrier-applications', payload);
    return data.data;
  } catch (error) {
    throw asUnavailable(error, UNAVAILABLE);
  }
}
