import Reveal from '../common/Reveal';
import Button from '../common/Button';
import Container from '../common/Container';
import { PATHS } from '../../config/paths';
import { brand } from '../../config/brand';

// Closing call to action. Defaults to the Request a Quote / Become a Carrier pair.
export default function CTASection({
  title,
  text,
  id = 'cta',
  actions = [
    { label: brand.primaryCta, to: PATHS.requestQuote },
    { label: brand.secondaryCta, to: PATHS.becomeCarrier, variant: 'secondary' },
  ],
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} data-surface="dark" className="bg-ink-950 text-white">
      <div className="lane-rule" aria-hidden="true" />
      <Container className="flex flex-col gap-8 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <Reveal className="max-w-2xl">
          <h2 id={headingId} className="text-3xl font-extrabold sm:text-4xl">
            {title}
          </h2>
          {text && <p className="mt-3 text-lg text-steel-200">{text}</p>}
        </Reveal>
        <Reveal className="flex flex-col gap-3 sm:flex-row lg:shrink-0" delay={120}>
          {actions.map((action) => (
            <Button key={action.label} to={action.to} href={action.href} tone="dark" size="lg" variant={action.variant || 'primary'}>
              {action.label}
            </Button>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
