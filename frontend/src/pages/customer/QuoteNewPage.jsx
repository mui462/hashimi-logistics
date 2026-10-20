import BackLink from '../../components/customer/BackLink';
import { useCustomerProfile } from '../../components/customer/CustomerProfileContext';
import PageHeader from '../../components/common/PageHeader';
import CustomerQuoteForm from '../../components/forms/CustomerQuoteForm';
import { PATHS } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function QuoteNewPage() {
  useDocumentTitle('Request a quote');
  const { profile } = useCustomerProfile();
  return (
    <div className="space-y-8">
      <BackLink to={`${PATHS.customer}/quotes`}>Back to My quotes</BackLink>
      <PageHeader title="Request a quote" description="Tell us about your shipment. Our team reviews every request and follows up with a rate." />
      <div className="max-w-4xl rounded-lg border border-steel-200 bg-white p-5 shadow-sm sm:p-8">
        <CustomerQuoteForm profile={profile} />
      </div>
    </div>
  );
}
