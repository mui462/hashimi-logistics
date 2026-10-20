import { AlertTriangle, Check, XCircle } from 'lucide-react';
import { cx } from '../../utils/cx';
import { EXCEPTION_STATUSES, labelFor, normalizeStatus, statusesFor } from './trackingStatuses';

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

// Renders real shipment data supplied by the tracking API; it never invents statuses or events.
// `shipment`: { trackingNumber, status, isCrossBorder, events: [{ status, timestamp, location, note }] }
export default function TrackingTimeline({ shipment }) {
  const steps = statusesFor(Boolean(shipment.isCrossBorder));
  const current = normalizeStatus(shipment.status);
  const exception = EXCEPTION_STATUSES.find((s) => s.key === current);
  // A completed shipment has finished the Delivered step; the progress list has no step after it.
  const currentIndex = steps.findIndex((s) => s.key === (current === 'completed' ? 'delivered' : current));
  const events = (shipment.events || []).filter((event) => shipment.isCrossBorder || !['at_border', 'border_cleared'].includes(normalizeStatus(event.status)));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-base font-semibold uppercase tracking-widest text-steel-600">Tracking number</p>
        <p className="text-2xl font-extrabold">{shipment.trackingNumber}</p>
        <p className="mt-1 text-lg">
          Current status: <strong>{labelFor(shipment.status)}</strong>
        </p>
      </div>

      {exception && (
        <div role="status" className="flex items-start gap-3 border-l-4 border-danger-700 bg-danger-50 p-4 text-danger-700">
          {exception.key === 'cancelled' ? <XCircle className="size-6 shrink-0" aria-hidden="true" /> : <AlertTriangle className="size-6 shrink-0" aria-hidden="true" />}
          <p className="text-base font-medium">
            This shipment is marked {exception.label.toLowerCase()}. Please contact our team for details.
          </p>
        </div>
      )}

      <ol aria-label="Shipment progress" className="space-y-0">
        {steps.map((step, index) => {
          const done = currentIndex >= 0 && index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.key} aria-current={active ? 'step' : undefined} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={cx('flex size-8 items-center justify-center border-2 text-base font-bold', done && 'border-ink-900 bg-ink-900 text-white', active && 'border-signal-500 bg-signal-400 text-ink-950', !done && !active && 'border-steel-300 bg-white text-steel-500')}>
                  {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </span>
                {index < steps.length - 1 && <span className={cx('h-8 w-0.5', done ? 'bg-ink-900' : 'bg-steel-200')} aria-hidden="true" />}
              </div>
              <p className={cx('pt-1 text-lg', active ? 'font-extrabold' : done ? 'font-semibold' : 'text-steel-500')}>
                {step.label}
                {active && <span className="sr-only"> (current)</span>}
              </p>
            </li>
          );
        })}
      </ol>

      {events.length > 0 ? (
        <div>
          <h3 className="text-xl font-extrabold">History</h3>
          <ul className="mt-3 divide-y divide-steel-200 border-y border-steel-200">
            {events.map((event, index) => (
              <li key={`${event.status}-${event.timestamp || index}`} className="py-3 text-base">
                <p className="font-bold">{labelFor(event.status)}</p>
                <p className="text-steel-600">{[formatTimestamp(event.timestamp), event.location].filter(Boolean).join(' · ')}</p>
                {event.note && <p className="text-steel-600">{event.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-base text-steel-600">No tracking events have been recorded for this shipment yet.</p>
      )}
    </div>
  );
}
