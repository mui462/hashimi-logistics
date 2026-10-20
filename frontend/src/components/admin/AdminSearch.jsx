import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchAll } from '../../services/adminService';
import Button from '../common/Button';
import { FIELD_CLASSES } from '../forms/fieldStyles';
import { adminPath } from './adminLinks';
import { humanize } from '../../config/adminStatuses';

const KIND_PATH = { quote: 'quotes', load: 'loads', shipment: 'shipments', customer: 'customers', carrier: 'carriers' };

// Global search. The server does the matching (validated, anchored, capped at 5 per kind); nothing is scanned in the browser.
export default function AdminSearch() {
  const id = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState({ status: 'idle', results: [], query: '', error: '' });

  const submit = async (event) => {
    event.preventDefault();
    const query = text.trim();
    if (query.length < 2) {
      setState({ status: 'error', results: [], query, error: 'Enter at least 2 characters to search.' });
      document.getElementById(id)?.focus();
      return;
    }
    setState({ status: 'loading', results: [], query, error: '' });
    try {
      const data = await searchAll(query);
      setState({ status: 'done', results: data.results, query, error: '' });
    } catch (error) {
      setState({ status: 'error', results: [], query, error: error?.message || 'Search failed. Please try again.' });
    }
  };

  return (
    <section aria-label="Search the admin panel" className="rounded-lg border border-steel-200 bg-white p-4 sm:p-5">
      <form role="search" onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={id} className="block text-base font-semibold">Search quotes, loads, shipments, customers and carriers</label>
          <input id={id} type="search" value={text} onChange={(event) => setText(event.target.value)} maxLength={60} autoComplete="off" placeholder="Quote, load or tracking number, or a company name" aria-invalid={state.error ? 'true' : undefined} aria-describedby={state.error ? `${id}-error` : undefined} className={`${FIELD_CLASSES} mt-1`} />
        </div>
        <Button type="submit" loading={state.status === 'loading'}><Search className="size-5" aria-hidden="true" />Search</Button>
      </form>
      {state.error && <p id={`${id}-error`} role="alert" className="mt-2 text-base font-medium text-danger-700">{state.error}</p>}
      {state.status === 'done' && (
        <div className="mt-4" aria-live="polite">
          {state.results.length === 0 ? (
            <p className="text-base text-steel-600">No matches for “{state.query}”.</p>
          ) : (
            <ul aria-label="Search results" className="divide-y divide-steel-200">
              {state.results.map((result) => (
                <li key={`${result.type}-${result.id}`} className="flex flex-wrap items-baseline gap-x-3 py-2">
                  <span className="w-24 text-base text-steel-600">{humanize(result.type)}</span>
                  <Link to={adminPath(KIND_PATH[result.type], result.id)} className="break-words text-base font-semibold underline underline-offset-4">{result.label}</Link>
                  {result.detail && <span className="break-words text-base text-steel-600">{humanize(result.detail) === result.detail ? result.detail : result.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
