import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, titleAs: Heading = 'h2', description, action }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-steel-300 bg-white p-8 text-center sm:p-12">
      <Icon className="size-10 text-steel-500" aria-hidden="true" />
      <div>
        <Heading className="text-xl font-semibold">{title}</Heading>
        {description && <p className="mt-2 max-w-lg text-base text-steel-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
