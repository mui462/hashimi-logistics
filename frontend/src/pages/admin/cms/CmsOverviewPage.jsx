import { useCallback } from 'react';
import { BookOpen, Files, HelpCircle, Home, Image, MapPin, Quote, Search, Truck, Factory } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminPage from '../../../components/admin/AdminPage';
import StatCard from '../../../components/customer/StatCard';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getCmsOverview } from '../../../services/adminService';

const BASE = '/admin/cms';

export default function CmsOverviewPage() {
  const state = useAsyncData(useCallback(() => getCmsOverview(), []));
  return (
    <AdminPage title="Website CMS" description="Manage the public website without changing code. Anything you have not set up yet keeps showing the website’s built-in content.">
      <AdminAsyncView state={state} label="Loading website content" errorTitle="We could not load the website content summary">
        {(data) => (
          <div className="space-y-6">
            {!data.storage.uploadsAvailable && <p role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">{data.storage.message}</p>}
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
              <li><StatCard label="Homepage" icon={Home} to={`${BASE}/homepage`} value={data.homepage.configured ? 'Customised' : 'Built-in'} detail="Hero, sections and calls to action" /></li>
              <li><StatCard label="Pages" icon={Files} to={`${BASE}/pages`} value={`${data.pages.published} / ${data.pages.total}`} detail="Published / total" /></li>
              <li><StatCard label="Services" icon={Truck} to={`${BASE}/services`} value={`${data.services.visible} / ${data.services.total}`} detail="Visible / total" /></li>
              <li><StatCard label="Industries" icon={Factory} to={`${BASE}/industries`} value={`${data.industries.visible} / ${data.industries.total}`} detail="Visible / total" /></li>
              <li><StatCard label="Service areas" icon={MapPin} to={`${BASE}/service-areas`} value={`${data.serviceAreas.visible} / ${data.serviceAreas.total}`} detail="Visible / total" /></li>
              <li><StatCard label="Blog posts" icon={BookOpen} to={`${BASE}/blog`} value={`${data.blog.live} / ${data.blog.total}`} detail="Live / total" /></li>
              <li><StatCard label="FAQs" icon={HelpCircle} to={`${BASE}/faqs`} value={`${data.faqs.visible} / ${data.faqs.total}`} detail="Visible / total" /></li>
              <li><StatCard label="Testimonials" icon={Quote} to={`${BASE}/testimonials`} value={`${data.testimonials.visible} / ${data.testimonials.total}`} detail="Shown / total" /></li>
              <li><StatCard label="Media library" icon={Image} to={`${BASE}/media`} value={data.media.total} detail="Files and links" /></li>
              <li><StatCard label="SEO" icon={Search} to={`${BASE}/seo`} value="Review" detail="Titles, descriptions, indexing" /></li>
            </ul>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
