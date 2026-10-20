import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Container from '../components/common/Container';
import Logo from '../components/common/Logo';
import NoIndex from '../components/seo/NoIndex';
import SkipLink from '../components/common/SkipLink';
import { PATHS } from '../config/paths';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-steel-50">
      <NoIndex />
      <SkipLink />
      <header className="border-b border-steel-200 bg-white">
        <Container className="flex min-h-[4.5rem] items-center justify-between gap-4">
          <Logo />
          <Link
            to={PATHS.home}
            className="inline-flex min-h-11 items-center gap-2 text-base font-semibold underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Back to website
          </Link>
        </Container>
      </header>
      <main id="main-content" className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <Outlet />
      </main>
    </div>
  );
}
