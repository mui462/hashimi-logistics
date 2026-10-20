import { useCallback, useState } from 'react';
import { ABOUT_SLOTS } from '../../../content/aboutSections';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminListView from '../../../components/admin/AdminListView';
import AdminPage from '../../../components/admin/AdminPage';
import AdminStatusBadge from '../../../components/admin/AdminStatusBadge';
import { EntityLink } from '../../../components/admin/adminLinks';
import CmsForm from '../../../components/admin/cms/CmsForm';
import { CmsButton, CmsMedia, CmsRepeater, CmsSelect, CmsSeo, CmsText, CmsTextArea, CmsToggle } from '../../../components/admin/cms/CmsFields';
import { buttonBody, buttonValue, mediaBody, mediaValue, seoBody, seoValue, str, trimmed, useCmsForm } from '../../../components/admin/cms/useCmsForm';
import Button from '../../../components/common/Button';
import Panel from '../../../components/customer/Panel';
import { humanize } from '../../../config/adminStatuses';
import { useAdminAction } from '../../../hooks/useAdminAction';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { createCmsPage, getCmsPage, listCmsPages, runCmsPageAction, saveCmsPage } from '../../../services/adminService';
import { formatDate } from '../../../utils/format';

const BASE = '/admin/cms/pages';
const FIELDS = [
  { name: 'q', label: 'Search pages', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: ['draft', 'published', 'archived'].map((value) => ({ value, label: humanize(value) })) },
  { name: 'system', label: 'Type', type: 'select', options: [{ value: 'true', label: 'Built-in website pages' }, { value: 'false', label: 'Custom pages' }] },
];
const COLUMNS = [
  { key: 'title', header: 'Title', primary: true, render: (page) => <EntityLink to={`${BASE}/${page.id}`}>{page.title}</EntityLink> },
  { key: 'address', header: 'Address', render: (page) => (page.isSystem ? `/${page.slug}` : `/pages/${page.slug}`) },
  { key: 'type', header: 'Type', render: (page) => (page.isSystem ? 'Built-in page' : 'Custom page') },
  { key: 'status', header: 'Status', render: (page) => <AdminStatusBadge status={page.status} /> },
  { key: 'updated', header: 'Updated', render: (page) => formatDate(page.updatedAt) },
  { key: 'actions', header: 'Actions', render: (page) => <Button to={`${BASE}/${page.id}`} variant="secondary" size="sm" aria-label={`Edit ${page.title}`}>Edit</Button> },
];

function SystemPagesPrompt() {
  const state = useAsyncData(useCallback(() => listCmsPages({ limit: 1 }), []));
  const missing = state.data?.availableSystemPages ?? [];
  if (missing.length === 0) return null;
  return (
    <Panel title="Built-in pages you have not customised" description="Until you create and publish one of these, the website keeps showing its built-in version. The page address cannot change.">
      <ul className="flex flex-wrap gap-3">
        {missing.map((key) => <li key={key}><Button to={`${BASE}/new?key=${encodeURIComponent(key)}`} variant="secondary" size="sm">{humanize(key)}</Button></li>)}
      </ul>
    </Panel>
  );
}

export function PagesListPage() {
  return (
    <AdminPage title="Pages" description="Edit the text, banner and search appearance of website pages, or add custom pages." actions={<Button to={`${BASE}/new`}><Plus aria-hidden="true" className="h-4 w-4" />Add page</Button>}>
      <SystemPagesPrompt />
      <AdminListView fetcher={listCmsPages} fields={FIELDS} columns={COLUMNS} getKey={(page) => page.id} caption="Pages" emptyTitle="No pages yet" emptyDescription="The website shows its built-in pages until you create one here." />
    </AdminPage>
  );
}

const blankSection = () => ({ heading: '', body: '', image: null, isActive: true });
const toFormSection = (s) => ({ heading: str(s.heading), body: str(s.body), image: mediaValue(s.image), isActive: s.isActive !== false });
/**
 * The About page's built-in sections, so they can be edited here before anything is saved. A page that already holds them keeps its
 * own list; an older page with only other sections gets the built-in ones first and keeps its sections after them.
 */
function aboutSections(saved = []) {
  if (saved.length >= ABOUT_SLOTS.length) return saved.map(toFormSection);
  return [...ABOUT_SLOTS.map((slot) => ({ heading: slot.heading, body: slot.body, image: null, isActive: true })), ...saved.map(toFormSection)];
}
const initialValues = (page, key) => ({
  title: str(page?.title) || (key ? key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''), slug: str(page?.slug), pageKey: page?.pageKey ?? key ?? '', excerpt: str(page?.excerpt), content: str(page?.content),
  heroHeading: str(page?.heroHeading), heroSubtitle: str(page?.heroSubtitle), heroImage: mediaValue(page?.heroImage),
  sections: (page?.pageKey ?? key) === 'about' ? aboutSections(page?.sections) : (page?.sections ?? []).map(toFormSection),
  cta: buttonValue(page?.cta), SEO: seoValue(page?.SEO),
});

function PageForm({ page, startKey, onSaved }) {
  const isNew = !page;
  const navigate = useNavigate();
  const isSystem = page ? page.isSystem : Boolean(startKey);
  const isAbout = (page?.pageKey ?? startKey) === 'about';
  const form = useCmsForm({
    initial: initialValues(page, startKey),
    validate: (v) => (trimmed(v.title) ? {} : { title: 'Enter the page title.' }),
    submit: (v, extra) => {
      const body = {
        title: trimmed(v.title), excerpt: trimmed(v.excerpt), content: trimmed(v.content), heroHeading: trimmed(v.heroHeading), heroSubtitle: trimmed(v.heroSubtitle),
        heroImage: mediaBody(v.heroImage), cta: buttonBody(v.cta), SEO: seoBody(v.SEO),
        sections: v.sections.map((s, index) => ({ heading: trimmed(s.heading), body: trimmed(s.body), image: mediaBody(s.image), displayOrder: index * 10, isActive: s.isActive })),
        ...(!isSystem && trimmed(v.slug) && trimmed(v.slug) !== page?.slug ? { slug: trimmed(v.slug) } : {}),
        ...(isNew && v.pageKey ? { pageKey: v.pageKey } : {}),
        ...extra,
      };
      return isNew ? createCmsPage(body) : saveCmsPage(page.id, body);
    },
    success: isNew ? 'Page created as a draft.' : 'Page saved.',
    onSaved: (saved) => (isNew ? navigate(`${BASE}/${saved.id}`, { replace: true }) : onSaved()),
  });
  return (
    <CmsForm form={form} label="Page editor" saveLabel={isNew ? 'Create page' : 'Save changes'}>
      <Panel title="Page" description={isSystem ? `This is the website’s built-in “${humanize(page?.pageKey ?? startKey)}” page. Its address is fixed.` : undefined}>
        <div className="space-y-5">
          <CmsText form={form} name="title" label="Page title" maxLength={200} />
          {isSystem ? (
            <p className="text-base"><span className="font-semibold">Address:</span> /{page?.slug ?? startKey}</p>
          ) : (
            <CmsText form={form} name="slug" label="Web address" hint={isNew ? 'Optional. Created from the title when left empty. The page appears at /pages/your-address.' : 'Changing the address of a published page breaks existing links, so you will be asked to confirm.'} maxLength={160} />
          )}
          <CmsTextArea form={form} name="excerpt" label="Summary" hint="A short introduction." rows={3} maxLength={500} />
          <CmsText form={form} name="heroHeading" label="Banner heading" hint="Leave empty to use the built-in heading." maxLength={200} />
          <CmsText form={form} name="heroSubtitle" label="Banner subtitle" maxLength={300} />
          <CmsMedia form={form} name="heroImage" label="Banner image" />
          <CmsTextArea form={form} name="content" label="Main text" hint="Plain text. Blank lines start a new paragraph. HTML is not allowed." rows={10} maxLength={100000} />
        </div>
      </Panel>
      <Panel title="Sections" description={isAbout ? 'The first ten blocks are the About page’s built-in sections, in their fixed order under the banner: edit a heading, text or picture, or switch a block off to hide it. A field left empty keeps the built-in text. For “Our Approach” and “Our Commitment to Customers”, write each step on its own paragraph as “Title: text”; a paragraph without a title is the introduction. Sections you add are shown after them.' : 'Optional blocks shown below the main text, in this order.'}>
        <CmsRepeater
          form={form} name="sections" label="Section" addLabel="Add a section" max={30} blank={blankSection}
          locked={isAbout ? ABOUT_SLOTS.length : 0} itemTitle={isAbout ? (index) => ABOUT_SLOTS[index]?.label : undefined}
          render={(prefix) => (
            <div className="space-y-4">
              <CmsText form={form} name={`${prefix}.heading`} label="Heading" maxLength={150} />
              <CmsTextArea form={form} name={`${prefix}.body`} label="Text" rows={5} maxLength={20000} />
              <CmsMedia form={form} name={`${prefix}.image`} label="Image" />
              <CmsToggle form={form} name={`${prefix}.isActive`} label="Show this section" />
            </div>
          )}
        />
      </Panel>
      <Panel title="Button"><CmsButton form={form} name="cta" label="Page button (optional)" /></Panel>
      <Panel title="Search engines"><CmsSeo form={form} /></Panel>
    </CmsForm>
  );
}

const ACTIONS = {
  publish: { label: 'Publish', title: 'Publish this page?', text: 'The last saved version becomes visible on the website. Unsaved edits are not included.', done: 'Page published.' },
  unpublish: { label: 'Unpublish', title: 'Move this page back to draft?', text: 'It stops being shown on the website, which falls back to its built-in version.', done: 'Page moved back to draft.', tone: 'danger' },
  archive: { label: 'Archive', title: 'Archive this page?', text: 'It stops being shown on the website. You can restore it later.', done: 'Page archived.', tone: 'danger' },
  restore: { label: 'Restore', title: 'Restore this page as a draft?', text: 'It stays hidden until you publish it again.', done: 'Page restored as a draft.' },
};

export function PageEditPage({ isNew = false }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const startKey = isNew ? params.get('key') ?? '' : '';
  const [version, setVersion] = useState(0);
  const [action, setAction] = useState(null);
  const state = useAsyncData(useCallback(() => (isNew ? Promise.resolve(null) : getCmsPage(id)), [id, isNew, version]));
  const { run } = useAdminAction(() => setVersion((current) => current + 1));
  const page = state.data;
  const available = (() => {
    if (!page) return [];
    if (page.status === 'draft') return ['publish', ...(page.isSystem ? [] : ['archive'])];
    if (page.status === 'published') return ['unpublish', ...(page.isSystem ? [] : ['archive'])];
    return ['restore'];
  })();
  const confirm = async () => {
    const meta = ACTIONS[action];
    const done = await run(() => runCmsPageAction(id, action), meta.done);
    if (done) setAction(null);
    else throw new Error('That did not work. Please try again.');
  };
  return (
    <AdminPage
      title={isNew ? 'Add page' : page?.title || 'Edit page'}
      trail={[{ label: 'Pages', to: BASE }, { label: isNew ? 'New' : page?.title || 'Edit' }]}
      description={page ? `Status: ${humanize(page.status)}. ${page.status === 'published' ? 'This page is live.' : 'The website does not show this page yet.'}` : undefined}
      actions={page && available.map((key) => <Button key={key} variant="secondary" onClick={() => setAction(key)}>{ACTIONS[key].label}</Button>)}
    >
      <AdminAsyncView state={isNew ? { data: {}, error: null, isLoading: false, reload: state.reload } : state} label="Loading page" errorTitle="We could not load this page" notFound="page">
        {() => <PageForm key={`${id}-${page?.updatedAt ?? 'new'}`} page={page} startKey={startKey} onSaved={() => setVersion((current) => current + 1)} />}
      </AdminAsyncView>
      <AdminConfirmDialog
        open={Boolean(action)}
        title={action ? ACTIONS[action].title : ''}
        description={<p>{action ? ACTIONS[action].text : ''}</p>}
        confirmLabel={action ? ACTIONS[action].label : 'Confirm'}
        tone={action && ACTIONS[action].tone === 'danger' ? 'danger' : 'primary'}
        onConfirm={confirm}
        onCancel={() => setAction(null)}
      />
    </AdminPage>
  );
}
export const PageNewPage = () => <PageEditPage isNew />;
