import QuoteForm from '../forms/QuoteForm';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// The same QuoteForm (and so the same validation and POST /quotes submission) as the Request a Quote page, shown inline on the homepage.
// The heading text comes from the CMS (Homepage -> Quote form block); empty values keep the built-in text.
export default function HomeQuoteSection({ eyebrow, title, description }) {
  return (
    <SectionShell tone="muted" id="get-a-quote" labelledBy="home-quote-heading">
      <SectionHeading id="home-quote-heading" eyebrow={eyebrow || 'Request a Quote'} title={title || 'Get a Freight Quote'} description={description || 'Tell us about your shipment, and our team will review your request.'} />
      <div className="mx-auto mt-8 max-w-3xl border border-steel-200 border-t-4 border-t-[#D8AD54] bg-white p-5 shadow-sm sm:p-8">
        <QuoteForm />
      </div>
    </SectionShell>
  );
}
