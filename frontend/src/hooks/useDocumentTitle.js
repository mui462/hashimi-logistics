import { useEffect } from 'react';
import { brand } from '../config/brand';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${brand.name}` : brand.name;
  }, [title]);
}
