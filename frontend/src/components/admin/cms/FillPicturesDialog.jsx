import { useCallback, useState } from 'react';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { createCmsPage, getCmsPage, listCmsMedia, listCmsPages, runCmsPageAction, saveCmsPage } from '../../../services/adminService';
import { PICTURE_PAGES, asPicture, planPictureFill } from '../../../utils/pagePictures';
import Alert from '../../common/Alert';
import Button from '../../common/Button';
import AdminModal from './AdminModal';

async function load() {
  const [media, pages] = await Promise.all([listCmsMedia({ type: 'image', archived: 'false', limit: 100 }), listCmsPages({ limit: 100 })]);
  const wanted = new Set(PICTURE_PAGES.map((spec) => spec.key));
  const found = (pages.items ?? []).filter((page) => page.pageKey && wanted.has(page.pageKey));
  const details = await Promise.all(found.map((page) => getCmsPage(page.id)));
  return { images: media.items ?? [], pages: Object.fromEntries(details.map((page) => [page.pageKey, page])) };
}

const Already = () => <span className="text-steel-600">Already set</span>;
const thumb = (picture) => <img src={picture.url} alt="" className="h-12 w-20 rounded object-cover" />;

/** Fill the empty banner and introduction pictures of the menu pages from the media library. Nothing is replaced; the Super Admin reviews the plan first. */
export default function FillPicturesDialog({ open, onClose, onDone }) {
  const state = useAsyncData(useCallback(() => (open ? load() : Promise.resolve(null)), [open]));
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const plan = state.data ? planPictureFill(state.data.images, state.data.pages) : [];

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    const results = [];
    for (const row of plan) {
      const pictures = { ...(row.banner ? { heroImage: asPicture(row.banner, row.title) } : {}), ...(row.intro ? { introImage: asPicture(row.intro, row.title) } : {}) };
      try {
        if (row.page) {
          await saveCmsPage(row.page.id, pictures);
          results.push({ title: row.title, text: row.page.status === 'published' ? 'Pictures added.' : 'Pictures added to the draft. Publish the page to show them.' });
        } else {
          const created = await createCmsPage({ title: row.title, pageKey: row.key, ...pictures });
          if (publish) await runCmsPageAction(created.id, 'publish');
          results.push({ title: row.title, text: publish ? 'Pictures added and the page published.' : 'Created as a draft. Publish the page to show the pictures.' });
        }
      } catch (error) {
        results.push({ title: row.title, text: error?.message || 'This page could not be saved.', failed: true });
      }
    }
    setReport(results);
    setBusy(false);
    onDone?.();
  };

  const close = () => { setReport(null); onClose(); };
  return (
    <AdminModal open={open} title="Fill page pictures from the media library" onClose={close} wide>
      {state.isLoading && <p role="status" className="py-6 text-base text-steel-600">Loading the library and pages…</p>}
      {state.error && <Alert>{state.error.message || 'We could not load the library.'}</Alert>}
      {report ? (
        <div className="space-y-3">
          <ul className="space-y-2">
            {report.map((row) => <li key={row.title} className={row.failed ? 'text-base font-medium text-danger-700' : 'text-base'}><span className="font-semibold">{row.title}:</span> {row.text}</li>)}
          </ul>
          <Button onClick={close}>Close</Button>
        </div>
      ) : state.data && (
        state.data.images.length === 0 ? (
          <p className="text-base">The media library has no pictures yet. Add pictures in the Media Library first, then come back.</p>
        ) : plan.length === 0 ? (
          <p className="text-base">Every menu page already has its pictures. Nothing to fill.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-base text-steel-600">Pictures are handed out from your library in order. Only empty picture spots are filled; pictures you already chose are kept. You can change any of them afterwards in the page editor.</p>
            <table className="w-full text-left text-base">
              <caption className="sr-only">Planned pictures</caption>
              <thead><tr><th scope="col" className="py-2">Page</th><th scope="col">Banner</th><th scope="col">Introduction</th></tr></thead>
              <tbody>
                {plan.map((row) => (
                  <tr key={row.key} className="border-t border-steel-200">
                    <th scope="row" className="py-2 pr-3 font-semibold">{row.title}{!row.page && <span className="block text-base font-normal text-steel-600">Page will be created</span>}</th>
                    <td className="py-2 pr-3">{row.banner ? thumb(row.banner) : <Already />}</td>
                    <td className="py-2">{row.intro ? thumb(row.intro) : row.intro === null && PICTURE_PAGES.find((spec) => spec.key === row.key)?.intro ? <Already /> : <span className="text-steel-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.some((row) => !row.page) && (
              <label className="flex items-start gap-3 text-base">
                <input type="checkbox" className="mt-1 size-5" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                <span>Publish the pages created here so the pictures show on the website (the text stays the built-in text). Existing draft pages are never published automatically.</span>
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={apply} disabled={busy}>{busy ? 'Filling…' : 'Fill pictures'}</Button>
              <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )
      )}
    </AdminModal>
  );
}
