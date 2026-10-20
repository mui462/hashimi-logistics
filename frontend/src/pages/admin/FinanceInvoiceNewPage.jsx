import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import { useAdminToast } from '../../components/admin/AdminToast';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Panel from '../../components/customer/Panel';
import SelectInput from '../../components/forms/SelectInput';
import TextArea from '../../components/forms/TextArea';
import TextInput from '../../components/forms/TextInput';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listLoads } from '../../services/adminService';
import { createInvoice } from '../../services/financeService';
import { ApiRequestError, toFieldErrors } from '../../utils/apiRequestError';
import { centsToDollars, dollarsToCents } from '../../utils/money';

const blankLine = () => ({ description: '', quantity: '1', unit: '' });

export default function FinanceInvoiceNewPage() {
  const navigate = useNavigate();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => listLoads({ limit: 100 }), []));
  const [loadId, setLoadId] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const setLine = (index, patch) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const parsed = lines.map((line) => ({ description: line.description.trim(), quantity: Number(line.quantity), unitAmount: dollarsToCents(line.unit) }));
  const lineValid = (line) => line.description && Number.isInteger(line.quantity) && line.quantity >= 1 && line.unitAmount != null;
  const total = parsed.every(lineValid) ? parsed.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0) : null;
  const selectedLoad = state.data?.items.find((load) => load.id === loadId);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const next = {};
    if (!loadId) next.loadId = 'Choose the load to invoice.';
    parsed.forEach((line, index) => {
      if (!lineValid(line)) next[`line${index}`] = 'Enter a description, a whole quantity and a unit amount such as 1250.00.';
    });
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const invoice = await createInvoice({
        loadId,
        lineItems: parsed,
        ...(note.trim() ? { customerNote: note.trim() } : {}),
        ...(internal.trim() ? { internalNotes: internal.trim() } : {}),
      });
      toast.success(`Draft invoice ${invoice.invoiceNumber} created.`);
      navigate(`/admin/finance/invoices/${invoice.id}`);
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : 'Could not create the invoice.');
      if (error instanceof ApiRequestError) setErrors(toFieldErrors(error.errors));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage title="New invoice" trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Customer invoices', to: '/admin/finance/invoices' }, { label: 'New invoice' }]} description="Creates a draft. The customer and currency come from the load. Nothing is visible to the customer until you issue it.">
      <AdminAsyncView state={state} label="Loading loads" errorTitle="We could not load the loads" isEmpty={() => false}>
        {(data) => (
          <form onSubmit={submit} noValidate className="max-w-4xl space-y-6" aria-busy={busy || undefined}>
            <Panel title="Load">
              <SelectInput
                label="Load to invoice"
                value={loadId}
                onChange={(event) => setLoadId(event.target.value)}
                error={errors.loadId}
                placeholder="Choose a load"
                options={data.items.filter((load) => load.status !== 'cancelled').map((load) => ({ value: load.id, label: `${load.loadNumber} · ${load.customer?.companyName ?? 'Customer'}` }))}
              />
              {selectedLoad && <p className="mt-3 text-base text-steel-600">Customer: {selectedLoad.customer?.companyName ?? 'Not available'}. The invoice uses the load&apos;s currency.</p>}
            </Panel>
            <Panel title="Line items" description="Amounts are in the load's currency. Totals are calculated by the server.">
              <div className="space-y-5">
                {lines.map((line, index) => (
                  <fieldset key={index} className="space-y-3 rounded-md border border-steel-200 p-4">
                    <legend className="px-1 text-base font-semibold">Line {index + 1}</legend>
                    <TextInput label="Description" value={line.description} maxLength={200} onChange={(event) => setLine(index, { description: event.target.value })} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextInput label="Quantity" inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
                      <TextInput label="Unit amount" inputMode="decimal" value={line.unit} hint="For example 1250.00" onChange={(event) => setLine(index, { unit: event.target.value })} />
                    </div>
                    {errors[`line${index}`] && <p className="text-base font-medium text-danger-700">{errors[`line${index}`]}</p>}
                    {lines.length > 1 && (
                      <Button variant="secondary" size="sm" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} aria-label={`Remove line ${index + 1}`}><Trash2 className="size-4" aria-hidden="true" /> Remove</Button>
                    )}
                  </fieldset>
                ))}
                {lines.length < 20 && <Button variant="secondary" onClick={() => setLines((current) => [...current, blankLine()])}><Plus className="size-4" aria-hidden="true" /> Add a line</Button>}
                <p className="text-lg font-semibold" aria-live="polite">Total: {total == null ? '—' : `${centsToDollars(total)} (in the load's currency)`}</p>
                <p className="text-base text-steel-600">No taxes or fees are added. Add them as a line item only if your business rules require it.</p>
              </div>
            </Panel>
            <Panel title="Notes">
              <div className="space-y-4">
                <TextArea label="Note for the customer (optional)" hint="Shown on the invoice and its PDF." value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
                <TextArea label="Internal note (optional)" hint="Super Admin only." value={internal} maxLength={2000} onChange={(event) => setInternal(event.target.value)} />
              </div>
            </Panel>
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={busy}>Create draft invoice</Button>
              <Button to="/admin/finance/invoices" variant="secondary">Cancel</Button>
            </div>
          </form>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
