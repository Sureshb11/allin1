/**
 * Navigation wiring guard.
 *
 * Every navigation bug this app has hit was silent: nothing throws at build
 * time, eslint cannot see it, and the only symptom is a tab opening the wrong
 * screen — or two tabs opening the SAME screen — which you find by tapping
 * around. Three real ones:
 *
 *   - the My-Sport tab and the Home tab both rooted on "Home", so the dock had
 *     two buttons for one screen;
 *   - ScoringScreen reset the stack to "CricketFeed" after a match, a route
 *     that had been deleted;
 *   - the dock re-navigated a tab to a different screen than the navigator's
 *     initialRouteName, so fixing the navigator alone changed nothing.
 *
 * These are parsed from the source rather than rendered: the navigator pulls in
 * ~70 screens and the whole native module surface, so rendering it in jest
 * tests the mocks, not the wiring. Text parsing is exact for what is asserted
 * here — these are all literals in the source by design.
 */

const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..');
const APP_NAV = path.join(FRONTEND, 'src/navigation/AppNavigator.js');
const DOCK = path.join(FRONTEND, 'src/components/GlassDock.js');

/**
 * THE CONTRACT. This table is the single place the tab wiring is written down.
 * Change a tab's destination here ON PURPOSE, and the test tells you every
 * other place that has to agree. Do not edit it to make a red test pass —
 * a failure means the app changed under you.
 */
const TAB_ROOTS = {
  HomeTab: 'Feed', //      cover-flow "From Your Circle" rail + social posts
  MyCricketTab: 'Home', // dashboard: Matches / Teams / Tournaments
  PavilionTab: 'Pavilion',
  ProfileTab: 'Profile',
};

const read = (f) => fs.readFileSync(f, 'utf8');

/** Every file in src/, plus App.js. */
function allSourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!/node_modules/.test(p)) walk(p);
      } else if (/\.jsx?$/.test(e.name)) out.push(p);
    }
  })(path.join(FRONTEND, 'src'));
  out.push(path.join(FRONTEND, 'App.js'));
  return out;
}

/** Route names registered on any Stack/Tab navigator. */
function registeredRoutes() {
  const routes = new Set();
  const re = /<(?:Stack|Tab)\.Screen\s+[^>]*?name=["']([A-Za-z0-9_]+)["']/gs;
  for (const f of allSourceFiles()) {
    let m;
    const src = read(f);
    while ((m = re.exec(src))) routes.add(m[1]);
  }
  return routes;
}

/** Tab route name -> the component rendering it (e.g. MyCricketTab -> MyCricketStack). */
function tabComponents() {
  const src = read(APP_NAV);
  const map = {};
  const re = /<Tab\.Screen\s+name=["']([A-Za-z0-9_]+)["']\s+component=\{([A-Za-z0-9_]+)\}/gs;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  return map;
}

/**
 * The initialRouteName each tab's stack opens on.
 * A per-tab wrapper pins it explicitly; HomeStack used bare falls back to the
 * `feedForSport` default inside HomeStack.
 */
function navigatorRoots() {
  const src = read(APP_NAV);
  const roots = {};

  const wrapper = {};
  const wre = /const\s+([A-Za-z0-9_]+)\s*=\s*\(props\)\s*=>\s*<HomeStack\s+\{\.\.\.props\}\s+initialRouteName=["']([A-Za-z0-9_]+)["']/g;
  let m;
  while ((m = wre.exec(src))) wrapper[m[1]] = m[2];

  const fallback = src.match(/const\s+feedForSport\s*=\s*["']([A-Za-z0-9_]+)["']/);

  for (const [tab, component] of Object.entries(tabComponents())) {
    roots[tab] = wrapper[component] || (component === 'HomeStack' && fallback ? fallback[1] : undefined);
  }
  return roots;
}

/**
 * The screen each dock button navigates to.
 * Most are literals; the Home button passes a `homeRoute` prop, so resolve that
 * from the value AppNavigator hands the dock (falling back to the default
 * parameter in GlassDock itself).
 */
function dockTargets() {
  const dock = read(DOCK);
  const nav = read(APP_NAV);
  const targets = {};

  const re = /goTab\(\s*["']([A-Za-z0-9_]+)["']\s*,\s*(["'][A-Za-z0-9_]+["']|homeRoute)\s*\)/g;
  let m;
  while ((m = re.exec(dock))) {
    const [, tab, arg] = m;
    if (arg === 'homeRoute') {
      const passed = nav.match(/homeRoute=["']([A-Za-z0-9_]+)["']/);
      const dflt = dock.match(/homeRoute\s*=\s*["']([A-Za-z0-9_]+)["']/);
      targets[tab] = (passed && passed[1]) || (dflt && dflt[1]);
    } else {
      targets[tab] = arg.slice(1, -1);
    }
  }
  return targets;
}

describe('tab wiring', () => {
  const routes = registeredRoutes();

  it.each(Object.entries(TAB_ROOTS))(
    '%s opens %s according to the navigator',
    (tab, expected) => {
      expect(navigatorRoots()[tab]).toBe(expected);
    },
  );

  it.each(Object.entries(TAB_ROOTS))(
    '%s opens %s according to the dock',
    (tab, expected) => {
      expect(dockTargets()[tab]).toBe(expected);
    },
  );

  it('every tab root is a registered route', () => {
    for (const target of Object.values(TAB_ROOTS)) {
      expect(routes.has(target)).toBe(true);
    }
  });

  it('no two tabs open the same screen', () => {
    // The regression that started all this: Home and My-Sport both on "Home",
    // so the dock showed two buttons for one screen.
    const seen = new Map();
    for (const [tab, target] of Object.entries(TAB_ROOTS)) {
      expect(seen.has(target)).toBe(false);
      seen.set(target, tab);
    }
  });
});

describe('navigation targets', () => {
  it('every navigate/replace/push/reset target is a registered route', () => {
    const routes = registeredRoutes();
    const dangling = [];
    const re = /(?:navigation|nav|navigationRef)\.(?:navigate|replace|push)\(\s*["']([A-Za-z0-9_]+)["']|routes:\s*\[\s*\{\s*name:\s*["']([A-Za-z0-9_]+)["']/g;

    for (const f of allSourceFiles()) {
      const src = read(f);
      let m;
      while ((m = re.exec(src))) {
        const name = m[1] || m[2];
        if (!routes.has(name)) {
          dangling.push(`${path.relative(FRONTEND, f)} -> ${name}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
