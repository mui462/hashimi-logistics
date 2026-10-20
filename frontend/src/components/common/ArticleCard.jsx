import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import { cx } from '../../utils/cx';
import MediaImage from '../media/MediaImage';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export default function ArticleCard({ article, featured = false }) {
  return (
    <article className={cx('group flex h-full flex-col overflow-hidden rounded-2xl border border-steel-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-signal-400 hover:shadow-[0_20px_40px_-24px_rgb(0_0_0/0.4)]', featured && 'md:flex-row')}>
      <div className={cx('aspect-[16/9] overflow-hidden bg-ink-900', featured && 'md:aspect-auto md:w-1/2')}>
        <MediaImage src={article.featuredImage} alt={article.featuredImageAlt || ''} scene="highway" />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm font-bold uppercase tracking-widest text-signal-500">{article.category}</p>
        <h3 className={cx('mt-2 font-extrabold', featured ? 'text-2xl' : 'text-xl')}>
          <Link to={`${PATHS.resources}/${article.slug}`} className="hover:underline">{article.title}</Link>
        </h3>
        {article.excerpt && <p className="mt-2 flex-1 text-base text-steel-600">{article.excerpt}</p>}
        <p className="mt-4 text-base text-steel-600">{[article.author, formatDate(article.publishedAt)].filter(Boolean).join(' · ')}</p>
      </div>
    </article>
  );
}
