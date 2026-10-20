import { useCallback, useState } from 'react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminPage from '../../../components/admin/AdminPage';
import AdminStatusBadge from '../../../components/admin/AdminStatusBadge';
import AdminModal from '../../../components/admin/cms/AdminModal';
import CmsForm from '../../../components/admin/cms/CmsForm';
import { CmsSeo, CmsText, CmsTextArea } from '../../../components/admin/cms/CmsFields';
import { seoBody, seoValue, str, trimmed, useCmsForm } from '../../../components/admin/cms/useCmsForm';
import Button from '../../../components/common/Button';
import Panel from '../../../components/customer/Panel';
import { humanize } from '../../../config/adminStatuses';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getCmsSeo, saveCmsEntrySeo, saveCmsGlobalSeo, saveCmsHomepageSeo } from '../../../services/adminService';

function GlobalForm({ global, onSaved }) {
  const form = useCmsForm({
    initial: { websiteTitle: str(global.websiteTitle), description: str(global.description), canonicalBaseUrl: str(global.canonicalBaseUrl), defaultSEO: seoValue(global.defaultSEO) },
    submit: (v) => saveCmsGlobalSeo({ websiteTitle: trimmed(v.websiteTitle), description: trimmed(v.description), canonicalBaseUrl: trimmed(v.canonicalBaseUrl), defaultSEO: seoBody(v.defaultSEO) }),
    success: 'Global SEO saved.', onSaved,
  });
  return (
    <CmsForm form={form} label="Global SEO" saveLabel="Save global SEO">
      <CmsText form={form} name="websiteTitle" label="Website title" hint="Used when a page has no title of its own." maxLength={120} />
      <CmsTextArea form={form} name="description" label="Default description" rows={3} maxLength={500} />
      <CmsText form={form} name="canonicalBaseUrl" label="Website address" hint="The public address of the site, such as https://example.com. Leave empty if unknown; nothing is guessed." maxLength={2048} />
      <fieldset className="space-y-4"><legend className="text-lg font-bold">Defaults for every page</legend><CmsSeo form={form} name="defaultSEO" /></fieldset>
    </CmsForm>
  );
}

function EntryDialog({ entry, onClose, onSaved }) {
  const form = useCmsForm({
    initial: { SEO: seoValue(entry.seo) },
    submit: (v) => (entry.kind === 'homepage' ? saveCmsHomepageSeo({ SEO: seoBody(v.SEO) }) : saveCmsEntrySeo(entry.kind, entry.id, { SEO: seoBody(v.SEO) })),
    success: 'SEO saved.', onSaved,
  });
  return (
    <AdminModal open title={`SEO for ${entry.title}`} onClose={onClose} wide>
      <CmsForm form={form} label={`SEO for ${entry.title}`} saveLabel="Save SEO"><CmsSeo form={form} /></CmsForm>
    </AdminModal>
  );
}

export default function CmsSeoPage() {
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const state = useAsyncData(useCallback(() => getCmsSeo(), [version]));
  const refresh = () => { setEditing(null); setVersion((current) => current + 1); };
  return (
    <AdminPage title="SEO" description="How the website appears in search results and when shared. Search needs real titles and descriptions; nothing here is filled in automatically.">
      <AdminAsyncView state={state} label="Loading SEO" errorTitle="We could not load SEO settings">
        {(data) => (
          <div className="space-y-6">
            <Panel title="Global defaults"><GlobalForm key={data.global.updatedAt ?? 'new'} global={data.global} onSaved={refresh} /></Panel>
            <Panel title="Pages and content" description="Pick an entry to edit its search appearance. Issues are things worth fixing, not errors.">
              <ul className="divide-y divide-steel-200" aria-label="SEO entries">
                {data.entries.map((entry) => (
                  <li key={`${entry.kind}-${entry.id ?? 'home'}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-bold">{entry.title} <span className="text-base font-normal text-steel-600">({humanize(entry.kind)})</span></p>
                      <p className="break-all text-base text-steel-600">{entry.path}</p>
                      <p className="text-base">{entry.issues.length === 0 ? 'No issues found.' : entry.issues.join('. ') + '.'}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <AdminStatusBadge status={entry.status} />
                      <Button variant="secondary" size="sm" aria-label={`Edit SEO for ${entry.title}`} onClick={() => setEditing(entry)}>Edit SEO</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            {editing && <EntryDialog key={`${editing.kind}-${editing.id}`} entry={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
            <p role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">Search engines decide what they show. A good title and description help, but nothing here guarantees a ranking.</p>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
