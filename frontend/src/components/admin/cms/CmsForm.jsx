import AdminConfirmDialog from '../AdminConfirmDialog';
import Alert from '../../common/Alert';
import Button from '../../common/Button';
import UnsavedGuard from './UnsavedGuard';

/** The <form> shell for a CMS editor: submit button with a busy state, the form-level error, unsaved-change protection and the slug-change confirmation. */
export default function CmsForm({ form, label, saveLabel = 'Save changes', children, extra }) {
  return (
    <>
    <form onSubmit={form.save} noValidate aria-label={label} className="space-y-6" aria-busy={form.submitting || undefined}>
      {children}
      {form.error && <Alert>{form.error}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={form.submitting}>{saveLabel}</Button>
        {form.dirty && !form.submitting && <p role="status" className="text-base font-semibold text-steel-600">You have unsaved changes.</p>}
        {extra}
      </div>
    </form>
    <UnsavedGuard dirty={form.dirty} dirtyRef={form.dirtyRef} />
    <AdminConfirmDialog
        open={form.confirmSlug}
        title="Change this page address?"
        description={<p>This content is already on the website. Changing its address breaks links and bookmarks that use the old one, and search engines will need time to catch up.</p>}
        confirmLabel="Change the address"
        tone="danger"
        onConfirm={async () => form.confirmSlugChange()}
        onCancel={form.dismissSlugConfirm}
      />
    </>
  );
}
