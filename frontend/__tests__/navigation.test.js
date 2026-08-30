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

/** Source with comments removed, so prose can neither hide nor fake a match. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const screenFileFor = (component) => {
  const roots = [path.join(FRONTEND, 'src')];
  const stack = [...roots];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name === `${component}.js`) return p;
    }
  }
  return null;
};

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

/**
 * Routes that have been consolidated away as DESTINATIONS. The screen may still
 * be registered — LiveMatchScreen still holds the YouTube telecast nothing else
 * draws — but nothing may navigate to it.
 *
 * This exists because LiveMatch was replaced by Scorecard across thirteen call
 * sites and a fourteenth was missed, so a live match tapped from the feed kept
 * opening the retired duplicate. Nothing failed; you had to tap your way to it.
 *
 * The live-telecast screens are listed for a different reason: they were pulled
 * out to be built again later, and "Go Live" had four separate entry points.
 * A rebuild that reinstates one of them without its screen fails here.
 */
const RETIRED_ROUTES = ['LiveMatch', 'PlayerInsights', 'StreamingLanding', 'CreateStream'];

/**
 * Every route named as a destination in one file.
 *
 * Deliberately not one regex anchored on a quote right after the paren. That
 * shape saw only `navigate('X', ...)` — it was blind to `navigate(cond ? 'A' :
 * 'B')` and, because it matched a literal dot, to every `navigation?.navigate(`
 * in the app. Both blind spots hid the missed LiveMatch call site, which was a
 * ternary behind an optional chain. Instead: find the call, take its FIRST
 * argument, and read every string literal in it.
 */
const navigationTargets = (src) => {
  const out = [];
  const call = /(?:navigation|nav|navigationRef)\??\.(?:navigate|replace|push)\(/g;
  let m;
  while ((m = call.exec(src))) {
    const from = m.index + m[0].length;
    const firstArg = src.slice(from, from + 300).split(/[,)]/)[0];
    for (const lit of firstArg.match(/["'][A-Za-z0-9_]+["']/g) || []) out.push(lit.slice(1, -1));
  }
  const reset = /routes:\s*\[\s*\{\s*name:\s*["']([A-Za-z0-9_]+)["']/g;
  while ((m = reset.exec(src))) out.push(m[1]);
  return out;
};

/**
 * Two headers.
 *
 * A screen that draws its own header bar — a back control and a title — must
 * also turn the navigator's off, or the app shows two stacked bars, the upper
 * one in the light system styling every screen in this stack opts out of.
 *
 * This was not one screen. An audit found fourteen: six that explicitly asked
 * for `headerShown: true` while drawing their own, and eight routes sharing
 * PlaceholderScreen, which never turned it off at all. They are invisible from
 * the navigator alone — the mistake is only legible when you read the route and
 * the screen together, which is what this does.
 */
describe('headers', () => {
  const navigatorSources = [
    { file: path.join(FRONTEND, 'App.js'), label: 'root' },
    { file: APP_NAV, label: 'app' },
  ];

  it('no screen draws its own header while the navigator shows one', () => {
    const offenders = [];
    for (const { file, label } of navigatorSources) {
      const src = read(file);
      const navHidesByDefault =
        /<Stack\.Navigator[\s\S]{0,400}?screenOptions=\{\{[^}]*headerShown:\s*false/.test(src);
      const screenRe = /<Stack\.Screen([\s\S]*?)(?:\/>|<\/Stack\.Screen>)/g;
      let m;
      while ((m = screenRe.exec(src))) {
        const block = m[1];
        const name = /name=["']([A-Za-z0-9_]+)["']/.exec(block)?.[1];
        const comp = /component=\{([A-Za-z0-9_]+)\}/.exec(block)?.[1];
        if (!name || !comp) continue;
        const file2 = screenFileFor(comp);
        if (!file2) continue;
        const s2 = read(file2);

        // Comments are stripped BEFORE matching. Without that, the note
        // explaining why a screen hides the header sat between `setOptions({`
        // and the flag and pushed it outside the window — the guard then passed
        // on a screen with the bug deliberately put back, which is the one
        // result a guard must never give.
        const code = stripComments(s2);
        const forcesOn = /setOptions\(\{[\s\S]{0,240}?headerShown:\s*true/.test(code);
        const hidesItself = /setOptions\(\{[\s\S]{0,240}?headerShown:\s*false/.test(code);
        const hiddenByRoute = /headerShown:\s*false/.test(stripComments(block));
        const navHeaderOn = forcesOn ? true
          : hidesItself ? false
          : hiddenByRoute ? false
          : !navHidesByDefault;

        // "Draws its own" = a back control AND a header-ish container. Both,
        // because a lone goBack() is often a button in an empty state and a
        // lone `styles.header` is often a section heading.
        const drawsOwn = /goBack\(\)/.test(s2)
          && /(chevron-left|arrow-left|keyboard-backspace)/.test(s2)
          && /(styles?\.header|s\.header|p\.header|styles?\.brandBar|styles?\.hero|s\.hero)/.test(s2);

        if (navHeaderOn && drawsOwn) offenders.push(`${label}: ${name} (${comp})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('navigation targets', () => {
  it('every navigate/replace/push/reset target is a registered route', () => {
    const routes = registeredRoutes();
    const dangling = [];
    for (const f of allSourceFiles()) {
      for (const name of navigationTargets(read(f))) {
        if (!routes.has(name)) dangling.push(`${path.relative(FRONTEND, f)} -> ${name}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('nothing navigates to a retired route', () => {
    const offenders = [];
    for (const f of allSourceFiles()) {
      if (path.basename(f) === 'navigation.test.js') continue;
      for (const name of navigationTargets(read(f))) {
        if (RETIRED_ROUTES.includes(name)) offenders.push(`${path.relative(FRONTEND, f)} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
