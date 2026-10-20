import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminListView from '../../../components/admin/AdminListView';
import AdminPage from '../../../components/admin/AdminPage';
import AdminStatusBadge from '../../../components/admin/AdminStatusBadge';
import { useAdminToast } from '../../../components/admin/AdminToast';
import CmsForm from '../../../components/admin/cms/CmsForm';
import { CmsSeo } from '../../../components/admin/cms/CmsFields';
import { useCmsForm } from '../../../components/admin/cms/useCmsForm';
import { EntityLink } from '../../../components/admin/adminLinks';
import Button from '../../../components/common/Button';
import Panel from '../../../components/customer/Panel';
import { useAdminAction } from '../../../hooks/useAdminAction';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { formatDate } from '../../../utils/format';
import { COLLECTIONS } from './collections';

const BASE = '/admin/cms';
const yesNo = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

const filterFields = (config) => [
  { name: 'q', label: `Search ${config.title.toLowerCase()}`, type: 'search' },
  { name: 'visible', label: 'Visible on website', type: 'select', options: yesNo },
  { name: 'archived', label: 'Archived', type: 'select', options: yesNo },
  ...(config.filters.includes('featured') ? [{ name: 'featured', label: 'Featured', type: 'select', options: yesNo }] : []),
  ...(config.filters.includes('country') ? [{ name: 'country', label: 'Country', type: 'select', options: [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }] }] : []),
  ...(config.filters.includes('category') ? [{ name: 'category', label: 'Category', type: 'select', options: ['Shippers', 'Carriers', 'Quotes', 'Tracking', 'Cross-Border', 'General'].map((value) => ({ value, label: value })) }] : []),
];

function ReorderPanel({ config, onDone }) {
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => config.api.list({ archived: 'false', limit: 100 }), [config]));
  const [order, setOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const items = order ?? state.data?.items ?? [];
  const move = (index, delta) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await config.api.reorder(items.map((item) => item.id));
      toast.success('Order saved.');
      onDone(true);
    } catch (error) {
      toast.error(error?.message || 'The order could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel title={`Reorder ${config.title.toLowerCase()}`} description="Use the arrows to move an item. The order is the order visitors see. Archived items are not listed.">
      <AdminAsyncView state={state} label="Loading items" errorTitle="We could not load the items">
        {() => (
          <div className="space-y-4">
            {items.length === 0 ? <p className="text-base text-steel-600">Nothing to reorder yet.</p> : (
              <ol className="space-y-2">
                {items.map((item, index) => {
                  const name = config.columns(item).name;
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-steel-200 p-3">
                      <span className="min-w-0 break-words text-base font-semibold">{index + 1}. {name}</span>
                      <span className="flex shrink-0 gap-2">
                        <Button variant="secondary" size="sm" disabled={index === 0 || saving} aria-label={`Move ${name} up`} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" className="h-4 w-4" /></Button>
                        <Button variant="secondary" size="sm" disabled={index === items.length - 1 || saving} aria-label={`Move ${name} down`} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" className="h-4 w-4" /></Button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={save} loading={saving} disabled={!order}>Save order</Button>
              <Button variant="secondary" onClick={() => onDone(false)} disabled={saving}>Close</Button>
            </div>
          </div>
        )}
      </AdminAsyncView>
    </Panel>
  );
}

export function CollectionListPage({ config }) {
  const [version, setVersion] = useState(0);
  const [reordering, setReordering] = useState(false);
  const [target, setTarget] = useState(null);
  const { run } = useAdminAction(() => setVersion((current) => current + 1));
  const columns = [
    { key: 'name', header: config.title === 'FAQs' ? 'Question' : 'Name', primary: true, render: (item) => <EntityLink to={`${BASE}/${config.path}/${item.id}`}>{config.columns(item).name}</EntityLink> },
    { key: 'detail', header: 'Details', render: (item) => <span className="line-clamp-2">{config.columns(item).secondary || '—'}</span> },
    { key: 'visibility', header: 'Status', render: (item) => <AdminStatusBadge status={item.isArchived ? 'archived' : item.isActive ? 'visible' : 'hidden'} /> },
    ...(config.filters.includes('featured') ? [{ key: 'featured', header: 'Featured', render: (item) => (item.isFeatured ? 'Yes' : 'No') }] : []),
    { key: 'updated', header: 'Updated', render: (item) => formatDate(item.updatedAt) },
    {
      key: 'actions', header: 'Actions',
      render: (item) => (
        <span className="flex flex-wrap gap-2">
          <Button to={`${BASE}/${config.path}/${item.id}`} variant="secondary" size="sm" aria-label={`Edit ${config.columns(item).name}`}>Edit</Button>
          <Button variant="secondary" size="sm" aria-label={`${item.isArchived ? 'Restore' : 'Archive'} ${config.columns(item).name}`} onClick={() => setTarget(item)}>{item.isArchived ? 'Restore' : 'Archive'}</Button>
        </span>
      ),
    },
  ];
  const confirm = async () => {
    const item = target;
    const done = await run(() => (item.isArchived ? config.api.restore(item.id) : config.api.archive(item.id)), item.isArchived ? 'Restored.' : 'Archived. It is no longer shown on the website.');
    if (done) setTarget(null);
    else throw new Error('That did not work. Please try again.');
  };
  return (
    <AdminPage
      title={config.title}
      description={config.emptyHint}
      actions={
        <>
          <Button variant="secondary" onClick={() => setReordering((current) => !current)} aria-expanded={reordering}>Reorder</Button>
          <Button to={`${BASE}/${config.path}/new`}><Plus aria-hidden="true" className="h-4 w-4" />Add {config.singular}</Button>
        </>
      }
    >
      {reordering && <ReorderPanel config={config} onDone={(changed) => { setReordering(false); if (changed) setVersion((current) => current + 1); }} />}
      <AdminListView key={version} fetcher={config.api.list} fields={filterFields(config)} columns={columns} getKey={(item) => item.id} caption={config.title} emptyTitle={`No ${config.title.toLowerCase()} yet`} emptyDescription={config.emptyHint} />
      <AdminConfirmDialog
        open={Boolean(target)}
        title={target?.isArchived ? `Restore this ${config.singular}?` : `Archive this ${config.singular}?`}
        description={<p>{target?.isArchived ? 'It will be available to show on the website again if it is set to visible.' : 'It will stop appearing on the website. You can restore it later.'}</p>}
        confirmLabel={target?.isArchived ? 'Restore' : 'Archive'}
        tone={target?.isArchived ? 'primary' : 'danger'}
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </AdminPage>
  );
}

function EditorForm({ config, item, onSaved }) {
  const isNew = !item;
  const navigate = useNavigate();
  const form = useCmsForm({
    initial: item ? config.initial(item) : config.blank(),
    validate: config.validate,
    submit: (values, extra) => {
      const body = { ...config.build(values, { isNew, original: item }), ...extra };
      return isNew ? config.api.create(body) : config.api.save(item.id, body);
    },
    success: isNew ? `${config.singular[0].toUpperCase()}${config.singular.slice(1)} created.` : 'Saved.',
    onSaved: (saved) => (isNew ? navigate(`${BASE}/${config.path}/${saved.id}`, { replace: true }) : onSaved(saved)),
  });
  const { Fields } = config;
  return (
    <CmsForm form={form} label={`${config.singular} editor`} saveLabel={isNew ? `Create ${config.singular}` : 'Save changes'}>
      <Panel title="Content"><div className="space-y-5"><Fields form={form} isNew={isNew} /></div></Panel>
      {config.hasSlug && <Panel title="Search engines" description="How this page appears in search results. Leave empty to use sensible defaults."><CmsSeo form={form} /></Panel>}
    </CmsForm>
  );
}

export function CollectionEditPage({ config, isNew = false }) {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const state = useAsyncData(useCallback(() => (isNew ? Promise.resolve(null) : config.api.get(id)), [config, id, isNew, version]));
  const { run } = useAdminAction(() => setVersion((current) => current + 1));
  const item = state.data;
  const name = item ? config.columns(item).name : '';
  const title = isNew ? `Add ${config.singular}` : name || `Edit ${config.singular}`;
  const archived = item?.isArchived;
  const toggle = async () => {
    const done = await run(() => (archived ? config.api.restore(id) : config.api.archive(id)), archived ? 'Restored.' : 'Archived. It is no longer shown on the website.');
    if (done) setConfirming(false);
    else throw new Error('That did not work. Please try again.');
  };
  return (
    <AdminPage
      title={title}
      trail={[{ label: config.title, to: `${BASE}/${config.path}` }, { label: isNew ? 'New' : name || 'Edit' }]}
      actions={item && <Button variant="secondary" onClick={() => setConfirming(true)}>{archived ? 'Restore' : 'Archive'}</Button>}
      description={archived ? 'This item is archived and is not shown on the website.' : undefined}
    >
      <AdminAsyncView state={isNew ? { data: {}, error: null, isLoading: false, reload: state.reload } : state} label={`Loading ${config.singular}`} errorTitle={`We could not load this ${config.singular}`} notFound={config.singular}>
        {() => <EditorForm key={`${id}-${item?.updatedAt ?? 'new'}`} config={config} item={item} onSaved={() => setVersion((current) => current + 1)} />}
      </AdminAsyncView>
      <AdminConfirmDialog
        open={confirming}
        title={archived ? `Restore this ${config.singular}?` : `Archive this ${config.singular}?`}
        description={<p>{archived ? 'You can then make it visible again.' : 'It will stop appearing on the website. You can restore it later.'}</p>}
        confirmLabel={archived ? 'Restore' : 'Archive'}
        tone={archived ? 'primary' : 'danger'}
        onConfirm={toggle}
        onCancel={() => setConfirming(false)}
      />
    </AdminPage>
  );
}

const make = (key) => ({ List: () => <CollectionListPage config={COLLECTIONS[key]} />, New: () => <CollectionEditPage config={COLLECTIONS[key]} isNew />, Edit: () => <CollectionEditPage config={COLLECTIONS[key]} /> });
const services = make('services');
const industries = make('industries');
const areas = make('service-areas');
const faqs = make('faqs');
const testimonials = make('testimonials');
export const ServicesListPage = services.List;
export const ServiceNewPage = services.New;
export const ServiceEditPage = services.Edit;
export const IndustriesListPage = industries.List;
export const IndustryNewPage = industries.New;
export const IndustryEditPage = industries.Edit;
export const ServiceAreasListPage = areas.List;
export const ServiceAreaNewPage = areas.New;
export const ServiceAreaEditPage = areas.Edit;
export const FaqsListPage = faqs.List;
export const FaqNewPage = faqs.New;
export const FaqEditPage = faqs.Edit;
export const TestimonialsListPage = testimonials.List;
export const TestimonialNewPage = testimonials.New;
export const TestimonialEditPage = testimonials.Edit;
