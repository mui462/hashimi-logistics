import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminListView from '../../../components/admin/AdminListView';
import AdminPage from '../../../components/admin/AdminPage';
import AdminStatusBadge from '../../../components/admin/AdminStatusBadge';
import { EntityLink } from '../../../components/admin/adminLinks';
import AdminModal from '../../../components/admin/cms/AdminModal';
import CmsForm from '../../../components/admin/cms/CmsForm';
import { CmsMedia, CmsSeo, CmsText, CmsTextArea, CmsToggle } from '../../../components/admin/cms/CmsFields';
import { mediaBody, mediaValue, seoBody, seoValue, str, trimmed, useCmsForm } from '../../../components/admin/cms/useCmsForm';
import Alert from '../../../components/common/Alert';
import Button from '../../../components/common/Button';
import PlainText from '../../../components/common/PlainText';
import TextInput from '../../../components/forms/TextInput';
import Panel from '../../../components/customer/Panel';
import { humanize } from '../../../config/adminStatuses';
import { useAdminAction } from '../../../hooks/useAdminAction';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { createCmsBlogPost, getCmsBlogPost, listCmsBlog, runCmsBlogAction, saveCmsBlogPost } from '../../../services/adminService';
import { formatDate, formatDateTime } from '../../../utils/format';

const BASE = '/admin/cms/blog';
const yesNo = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
const FIELDS = [
  { name: 'q', label: 'Search posts', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: ['draft', 'scheduled', 'published', 'archived'].map((value) => ({ value, label: humanize(value) })) },
  { name: 'featured', label: 'Featured', type: 'select', options: yesNo },
];
const when = (post) => (post.status === 'scheduled' ? `Goes live ${formatDateTime(post.scheduledAt)}` : post.publishedAt ? formatDate(post.publishedAt) : '—');
const COLUMNS = [
  { key: 'title', header: 'Title', primary: true, render: (post) => <EntityLink to={`${BASE}/${post.id}`}>{post.title}</EntityLink> },
  { key: 'status', header: 'Status', render: (post) => <AdminStatusBadge status={post.status === 'scheduled' && post.isLive ? 'published' : post.status} /> },
  { key: 'when', header: 'Publication', render: when },
  { key: 'category', header: 'Category', render: (post) => post.category ?? '—' },
  { key: 'author', header: 'Author', render: (post) => post.authorName ?? '—' },
  { key: 'updated', header: 'Updated', render: (post) => formatDate(post.updatedAt) },
  { key: 'actions', header: 'Actions', render: (post) => <Button to={`${BASE}/${post.id}`} variant="secondary" size="sm" aria-label={`Edit ${post.title}`}>Edit</Button> },
];

export function BlogListPage() {
  return (
    <AdminPage title="Blog and resources" description="Write articles for the Resources section. Drafts and scheduled posts are never visible to visitors before they go live." actions={<Button to={`${BASE}/new`}><Plus aria-hidden="true" className="h-4 w-4" />New post</Button>}>
      <AdminListView fetcher={listCmsBlog} fields={FIELDS} columns={COLUMNS} getKey={(post) => post.id} caption="Blog posts" emptyTitle="No posts yet" emptyDescription="Write your first article. Until a post is published, the Resources page says there are no articles yet." />
    </AdminPage>
  );
}

const initialValues = (post) => ({
  title: str(post?.title), slug: str(post?.slug), excerpt: str(post?.excerpt), content: str(post?.content), featuredImage: mediaValue(post?.featuredImage), category: str(post?.category),
  tags: (post?.tags ?? []).join(', '), authorName: str(post?.authorName), isFeatured: Boolean(post?.isFeatured), SEO: seoValue(post?.SEO),
});

function PostForm({ post, onSaved }) {
  const isNew = !post;
  const navigate = useNavigate();
  const form = useCmsForm({
    initial: initialValues(post),
    validate: (v) => (trimmed(v.title) ? {} : { title: 'Enter the post title.' }),
    submit: (v, extra) => {
      const body = {
        title: trimmed(v.title), excerpt: trimmed(v.excerpt), content: trimmed(v.content), featuredImage: mediaBody(v.featuredImage), category: trimmed(v.category),
        tags: v.tags.split(',').map((tag) => tag.trim()).filter(Boolean), authorName: trimmed(v.authorName), isFeatured: v.isFeatured, SEO: seoBody(v.SEO),
        ...(trimmed(v.slug) && trimmed(v.slug) !== post?.slug ? { slug: trimmed(v.slug) } : {}),
        ...extra,
      };
      return isNew ? createCmsBlogPost(body) : saveCmsBlogPost(post.id, body);
    },
    success: isNew ? 'Draft saved.' : 'Post saved.',
    onSaved: (saved) => (isNew ? navigate(`${BASE}/${saved.id}`, { replace: true }) : onSaved()),
  });
  const [preview, setPreview] = useState(false);
  return (
    <CmsForm form={form} label="Post editor" saveLabel={isNew ? 'Save draft' : 'Save changes'} extra={<Button variant="secondary" aria-pressed={preview} onClick={() => setPreview((current) => !current)}>{preview ? 'Hide preview' : 'Preview text'}</Button>}>
      <Panel title="Article">
        <div className="space-y-5">
          <CmsText form={form} name="title" label="Title" maxLength={200} />
          <CmsText form={form} name="slug" label="Web address" hint={isNew ? 'Optional. Created from the title when left empty.' : post.status === 'draft' ? 'The address can change freely while this is a draft.' : 'Changing the address of a live post breaks existing links, so you will be asked to confirm.'} maxLength={160} />
          <CmsTextArea form={form} name="excerpt" label="Summary" hint="Shown on the Resources list and required before publishing." rows={3} maxLength={500} />
          <CmsTextArea form={form} name="content" label="Article text" hint="Plain text. Blank lines start a new paragraph. HTML is not allowed." rows={14} maxLength={100000} />
          <CmsMedia form={form} name="featuredImage" label="Featured image" />
          <div className="grid gap-4 sm:grid-cols-2">
            <CmsText form={form} name="category" label="Category" maxLength={80} />
            <CmsText form={form} name="authorName" label="Author name" hint="Shown on the article." maxLength={120} />
          </div>
          <CmsText form={form} name="tags" label="Tags" hint="Separated by commas." />
          <CmsToggle form={form} name="isFeatured" label="Featured post" />
        </div>
      </Panel>
      {preview && (
        <Panel title="Text preview" description="Plain text as visitors will read it.">
          <h3 className="text-2xl font-bold">{form.values.title || 'Untitled'}</h3>
          <PlainText text={form.values.content} className="mt-3 text-lg" />
        </Panel>
      )}
      <Panel title="Search engines"><CmsSeo form={form} /></Panel>
    </CmsForm>
  );
}

function ScheduleDialog({ open, onClose, onSchedule }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const when = value ? new Date(value) : null;
    if (!when || Number.isNaN(when.getTime())) return setError('Choose the date and time the post should go live.');
    if (when.getTime() <= Date.now()) return setError('Choose a time in the future.');
    setBusy(true);
    setError('');
    try {
      await onSchedule(when.toISOString());
    } catch (caught) {
      setError(caught?.message || 'The post could not be scheduled.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminModal open={open} title="Schedule this post" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-base text-steel-600">The post stays hidden from visitors until this time. The time uses your browser’s time zone ({zone}).</p>
        <TextInput label="Go live on" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} error={error} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>Schedule post</Button>
        </div>
      </form>
    </AdminModal>
  );
}

const ACTIONS = {
  publish: { label: 'Publish now', title: 'Publish this post?', text: 'The last saved version goes live immediately. Unsaved edits are not included.', done: 'Post published.' },
  unpublish: { label: 'Back to draft', title: 'Move this post back to draft?', text: 'It stops being shown on the website.', done: 'Post moved back to draft.', tone: 'danger' },
  archive: { label: 'Archive', title: 'Archive this post?', text: 'It stops being shown on the website. You can restore it later.', done: 'Post archived.', tone: 'danger' },
  restore: { label: 'Restore', title: 'Restore this post as a draft?', text: 'It stays hidden until you publish or schedule it again.', done: 'Post restored as a draft.' },
};

export function BlogEditPage({ isNew = false }) {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const [action, setAction] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const state = useAsyncData(useCallback(() => (isNew ? Promise.resolve(null) : getCmsBlogPost(id)), [id, isNew, version]));
  const { run } = useAdminAction(() => setVersion((current) => current + 1));
  const post = state.data;
  const keys = !post ? [] : post.status === 'draft' ? ['publish', 'schedule', 'archive'] : post.status === 'archived' ? ['restore'] : ['unpublish', 'archive'];
  const confirm = async () => {
    const done = await run(() => runCmsBlogAction(id, action), ACTIONS[action].done);
    if (done) setAction(null);
    else throw new Error('That did not work. Please try again.');
  };
  const schedule = async (iso) => {
    await runCmsBlogAction(id, 'schedule', { scheduledAt: iso });
    setScheduling(false);
    setVersion((current) => current + 1);
  };
  const statusLine = post
    ? post.status === 'scheduled' ? (post.isLive ? 'Published (scheduled time has passed).' : `Scheduled to go live ${formatDateTime(post.scheduledAt)}. Visitors cannot see it before then.`)
      : post.status === 'published' ? 'Published and live.' : post.status === 'archived' ? 'Archived. Visitors cannot see it.' : 'Draft. Visitors cannot see it.'
    : undefined;
  return (
    <AdminPage
      title={isNew ? 'New post' : post?.title || 'Edit post'}
      trail={[{ label: 'Blog', to: BASE }, { label: isNew ? 'New' : post?.title || 'Edit' }]}
      description={statusLine}
      actions={post && keys.map((key) => (key === 'schedule' ? <Button key={key} variant="secondary" onClick={() => setScheduling(true)}>Schedule</Button> : <Button key={key} variant="secondary" onClick={() => setAction(key)}>{ACTIONS[key].label}</Button>))}
    >
      {post && post.status === 'draft' && !post.content && <Alert tone="error">Add the article text and a summary before publishing or scheduling.</Alert>}
      <AdminAsyncView state={isNew ? { data: {}, error: null, isLoading: false, reload: state.reload } : state} label="Loading post" errorTitle="We could not load this post" notFound="post">
        {() => <PostForm key={`${id}-${post?.updatedAt ?? 'new'}`} post={post} onSaved={() => setVersion((current) => current + 1)} />}
      </AdminAsyncView>
      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} onSchedule={schedule} />
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
export const BlogNewPage = () => <BlogEditPage isNew />;
