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
import { createPayable } from '../../services/financeService';
import { ApiRequestError, toFieldErrors } from '../../utils/apiRequestError';
import { dollarsToCents } from '../../utils/money';

export default function FinancePayableNewPage() {
  const navigate = useNavigate();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => listLoads({ limit: 100 }), []));
  const [loadId, setLoadId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const next = {};
    if (!loadId) next.loadId = 'Choose a load with an assigned carrier.';
    const cents = amount.trim() ? dollarsToCents(amount) : undefined;
    if (amount.trim() && cents == null) next.amount = 'Enter an amount such as 1250.00, or leave it empty to use the load carrier rate.';
    if (dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) next.dueDate = 'Use YYYY-MM-DD.';
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const payable = await createPayable({ loadId, ...(cents ? { amount: cents } : {}), ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}), ...(notes.trim() ? { internalNotes: notes.trim() } : {}) });
      toast.success(`Draft payable ${payable.payableNumber} created.`);
      navigate(`/admin/finance/payables/${payable.id}`);
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : 'Could not create the payable.');
      if (error instanceof ApiRequestError) setErrors(toFieldErrors(error.errors));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage title="New carrier payable" trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Carrier payables', to: '/admin/finance/payables' }, { label: 'New payable' }]} description="Creates a draft for the carrier assigned to the load. The amount defaults to the load's carrier rate; it is never taken from the customer charge.">
      <AdminAsyncView state={state} label="Loading loads" errorTitle="We could not load the loads" isEmpty={() => false}>
        {(data) => (
          <form onSubmit={submit} noValidate className="max-w-3xl space-y-6" aria-busy={busy || undefined}>
            <Panel title="Payable">
              <div className="space-y-4">
                <SelectInput label="Load" value={loadId} onChange={(event) => setLoadId(event.target.value)} error={errors.loadId} placeholder="Choose a load"
                  options={data.items.filter((load) => load.carrier && !['draft', 'cancelled'].includes(load.status)).map((load) => ({ value: load.id, label: `${load.loadNumber} · ${load.carrier.companyName ?? 'Carrier'}` }))} />
                <TextInput label="Amount (optional)" inputMode="decimal" value={amount} error={errors.amount} hint="Leave empty to use the carrier rate saved on the load." onChange={(event) => setAmount(event.target.value)} />
                <TextInput label="Due date (optional, YYYY-MM-DD)" value={dueDate} error={errors.dueDate} maxLength={10} onChange={(event) => setDueDate(event.target.value)} />
                <TextArea label="Internal note (optional)" hint="Super Admin only." value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </Panel>
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={busy}>Create draft payable</Button>
              <Button to="/admin/finance/payables" variant="secondary">Cancel</Button>
            </div>
          </form>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
