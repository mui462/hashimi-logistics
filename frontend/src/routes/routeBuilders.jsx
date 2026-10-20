import PlaceholderPage from '../components/common/PlaceholderPage';

export function placeholderRoute({ path = '', title, description, variant, nav }) {
  return {
    ...(path === '' ? { index: true } : { path }),
    element: <PlaceholderPage title={title} description={description} variant={variant} />,
    handle: nav ? { nav } : undefined,
  };
}

export function buildNavGroups(basePath, routes) {
  const groups = [];

  for (const route of routes) {
    const nav = route.handle?.nav;
    if (!nav) continue;

    const isIndex = route.index === true;
    const item = {
      label: nav.label,
      icon: nav.icon,
      to: isIndex ? basePath : `${basePath}/${route.path}`,
      end: nav.end ?? isIndex,
      exclude: nav.exclude,
      aliases: nav.aliases,
    };

    let group = groups.find((entry) => entry.label === (nav.group ?? null));
    if (!group) {
      group = { label: nav.group ?? null, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

// A code-split portal page: its module is only fetched when the route is opened.
export function lazyRoute({ path = '', load, exportName = 'default', nav }) {
  return {
    ...(path === '' ? { index: true } : { path }),
    lazy: async () => ({ Component: (await load())[exportName] }),
    handle: nav ? { nav } : undefined,
  };
}
