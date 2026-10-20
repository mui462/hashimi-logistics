import { Link } from 'react-router-dom';

// A text link that is still a comfortable tap target (44px high).
export default function PanelLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center text-base font-semibold underline underline-offset-4">
      {children}
    </Link>
  );
}
