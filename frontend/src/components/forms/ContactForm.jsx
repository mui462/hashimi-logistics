import { useState } from 'react';
import { useSubmitState } from '../../hooks/useSubmitState';
import { sendContactMessage } from '../../services/contactService';
import { focusFirstInvalid } from '../../utils/focus';
import { hasErrors, maxLength, required, validEmail, validPhone } from '../../utils/validators';
import Button from '../common/Button';
import ChoiceGroup from './ChoiceGroup';
import { FormErrorSummary, SuccessPanel } from './FormStatus';
import TextArea from './TextArea';
import TextInput from './TextInput';

export const INTEREST_OPTIONS = [
  { value: 'shipping', label: 'Shipping' },
  { value: 'carrier', label: 'Carrier' },
  { value: 'general', label: 'General Inquiry' },
];

const INITIAL = { name: '', company: '', email: '', phone: '', subject: '', message: '', interest: '' };

function validate(v) {
  return {
    name: required(v.name, 'Name'),
    email: validEmail(v.email),
    phone: validPhone(v.phone, 'Phone', { optional: true }),
    interest: required(v.interest, 'Interest'),
    subject: required(v.subject, 'Subject') || maxLength(v.subject, 150, 'Subject'),
    message: required(v.message, 'Message') || maxLength(v.message, 3000, 'Message'),
  };
}

export default function ContactForm({ submitMessage = sendContactMessage }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const set = (name) => (event) => setValues((v) => ({ ...v, [name]: event.target.value }));
  const merged = { ...errors, ...submission.fieldErrors };

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstInvalid();
      return;
    }
    const ok = await submission.run(() => submitMessage(values));
    if (ok) setValues(INITIAL);
  };

  if (submission.status === 'success') {
    return (
      <SuccessPanel
        title="Message received"
        action={<Button variant="secondary" onClick={submission.reset}>Send another message</Button>}
      >
        <p>Your message was received. Our team will review it and follow up. No email confirmation is sent.</p>
      </SuccessPanel>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Contact form">
      <FormErrorSummary error={submission.status === 'error' ? submission.error : ''} />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextInput label="Name" name="name" autoComplete="name" required value={values.name} onChange={set('name')} error={merged.name} />
        <TextInput label="Company" name="company" autoComplete="organization" value={values.company} onChange={set('company')} error={merged.company} />
        <TextInput label="Email" name="email" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={merged.email} />
        <TextInput label="Phone" name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={merged.phone} />
      </div>
      <ChoiceGroup
        legend="I am contacting you about"
        name="interest"
        options={INTEREST_OPTIONS}
        columns={3}
        value={values.interest}
        onChange={(interest) => setValues((v) => ({ ...v, interest }))}
        error={merged.interest}
      />
      <TextInput label="Subject" name="subject" required value={values.subject} onChange={set('subject')} error={merged.subject} />
      <TextArea label="Message" name="message" required rows={6} value={values.message} onChange={set('message')} error={merged.message} />
      <Button type="submit" size="lg" loading={submission.isSubmitting}>
        {submission.isSubmitting ? 'Sending…' : 'Send Message'}
      </Button>
    </form>
  );
}
