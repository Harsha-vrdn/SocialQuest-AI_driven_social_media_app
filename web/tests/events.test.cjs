const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('../../mobile/node_modules/typescript');

// Execute the real browser handlers with controlled DOM nodes and request timing.
const source = ts.createSourceFile('app.js', fs.readFileSync(path.resolve(__dirname, '../static/app.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function loadFunction(name, context) {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `${name} exists`);
  context[name] = vm.runInNewContext('(' + node.getText(source) + ')', context);
  return context[name];
}
function loadListener(event, context) {
  const call = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(source) === 'document.addEventListener'
    && node.expression.arguments[0].text === event).expression;
  return vm.runInNewContext('(' + call.arguments[1].getText(source) + ')', context);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}
function element(dataset = {}) {
  const classes = new Set();
  return {dataset, attributes: {}, hidden: false, innerHTML: '', textContent: '', value: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    classList: {toggle(name, selected) { selected ? classes.add(name) : classes.delete(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); }},
    focus() { this.focused = true; }};
}
function setup() {
  const nodes = {
    '[data-search-results]': element(), '[data-search-summary]': element(), '[data-search-footer]': element(),
    '[data-event-filters]': element(), '[data-action="clear-search"]': element(),
    '[data-action="nearby-events"]': element(), '#explore-search input': element(),
  };
  const categories = ['events', 'people'].map(searchKind => element({searchKind}));
  const filters = ['explore', 'mine'].map(eventFilter => element({eventFilter}));
  const state = {currentView: 'explore', viewVersion: 1, user: {id: 1}, exploreKind: 'events', exploreQuery: '', exploreEventFilter: 'explore', nearby: null, nearbyStatus: ''};
  const calls = [], navigations = [], alerts = [];
  let credential = 'test-session';
  const context = {
    state, exploreSearch: {version: 0, items: [], count: 0, page: 0, more: false, loading: false, error: ''},
    view: {innerHTML: '', querySelector(selector) { return nodes[selector] || filters.find(tab => selector === `[data-event-filter="${tab.dataset.eventFilter}"]`) || categories.find(tab => selector === `[data-search-kind="${tab.dataset.searchKind}"]`) || null; }, querySelectorAll(selector) { return selector === '[data-search-kind]' ? categories : selector === '[data-event-filter]' ? filters : []; }},
    api: async (url, options) => { calls.push({url, options}); return {results: [], count: 0, next: null}; },
    rows: data => data.results || data, AbortController, clearTimeout, setTimeout,
    encodeURIComponent, escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char])),
    eventDate: () => 'Oct 20', header: () => '<header>Events</header>', searchIcon: '⌕',
    setNearbyStatus(message) { state.nearbyStatus = message; },
    TOKEN_KEY: 'test-token', localStorage: {getItem: () => credential}, eventRsvpPending: new Set(),
    loadView: async name => { navigations.push(name); state.currentView = name; state.viewVersion++; },
    alert: message => alerts.push(message),
  };
  ['cancelExploreSearch', 'searchEventCard', 'searchPersonCard', 'renderSearchResults', 'requestExploreSearch', 'selectEventFilter', 'renderExplore', 'updateEventRsvp', 'requestNearbyEvents'].forEach(name => loadFunction(name, context));
  return {context, state, nodes, filters, categories, calls, navigations, alerts, setCredential: value => { credential = value; }};
}

const event = (status, extra = {}) => ({id: 7, name: 'A walk', description: 'Meet the community', location_name: 'Park', host: {id: 2, username: 'host', karma: 8}, starts_at: '2026-10-20T10:00:00Z', capacity: 10, accepted_count: 2, my_attendance_status: status, ...extra});

test('My Events requests the authenticated scope with search and pagination, ignoring nearby coordinates', async () => {
  const {context, state, calls} = setup();
  state.exploreEventFilter = 'mine'; state.exploreQuery = 'café & park'; state.nearby = {latitude: 1, longitude: 2};
  context.api = async (url, options) => { calls.push({url, options}); return {results: [event('ACCEPTED', {id: calls.length})], count: 2, next: calls.length === 1 ? 'page2' : null}; };
  await context.requestExploreSearch(); await context.requestExploreSearch(true);
  assert.equal(calls[0].url, '/events/?q=caf%C3%A9%20%26%20park&page=1&attending=true');
  assert.equal(calls[1].url, '/events/?q=caf%C3%A9%20%26%20park&page=2&attending=true');
  assert.equal(calls[0].options.singlePage, true);
  assert.deepEqual(Array.from(context.exploreSearch.items, item => item.id), [1, 2]);
});

test('changing scopes aborts and discards old discovery results without replacing the search input', async () => {
  const {context, nodes, calls} = setup();
  const old = deferred(), mine = deferred(); const input = nodes['#explore-search input'];
  context.api = (url, options) => { calls.push({url, options}); return url.includes('attending=true') ? mine.promise : old.promise; };
  const discovery = context.requestExploreSearch();
  const attending = context.selectEventFilter('mine');
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(context.exploreSearch.items.length, 0);
  mine.resolve({results: [event('PENDING')], count: 1}); await attending;
  old.resolve({results: [event('ACCEPTED', {id: 99})], count: 1}); await discovery;
  assert.equal(context.exploreSearch.items[0].id, 7);
  assert.strictEqual(nodes['#explore-search input'], input);
});

test('empty My Events has an Explore action that clears query and nearby and restores discovery', async () => {
  const {context, state, nodes, filters, calls} = setup();
  state.exploreEventFilter = 'mine';
  await context.renderExplore();
  assert.match(context.view.innerHTML, /role="tablist" aria-label="Event filters"/);
  assert.match(nodes['[data-search-results]'].innerHTML, /No upcoming events yet/);
  assert.match(nodes['[data-search-results]'].innerHTML, /data-action="explore-events">Explore events/);
  state.exploreQuery = 'old search'; nodes['#explore-search input'].value = state.exploreQuery;
  state.nearby = {latitude: 1, longitude: 2};
  await context.selectEventFilter('explore', true);
  assert.equal(state.exploreQuery, ''); assert.equal(nodes['#explore-search input'].value, '');
  assert.equal(state.nearby, null); assert.equal(state.exploreEventFilter, 'explore');
  assert.equal(filters[0].focused, true);
  assert.equal(calls.at(-1).url, '/events/recommended/');
});

test('filters support keyboard focus and screen readers and stay hidden for People', async () => {
  const {context, state, filters, nodes, categories, calls} = setup();
  const keydown = loadListener('keydown', context); let prevented = false;
  const target = {matches: () => false, closest: selector => selector === '[data-event-filter]' ? filters[0] : null};
  keydown({target, key: 'End', preventDefault() { prevented = true; }});
  assert.equal(prevented, true); assert.equal(state.exploreEventFilter, 'mine'); assert.equal(filters[1].focused, true);
  assert.equal(filters[1].attributes['aria-selected'], 'true'); assert.equal(filters[1].tabIndex, 0); assert.equal(filters[0].tabIndex, -1);
  assert.match(nodes['[data-search-results]'].attributes['aria-labelledby'], /event-filter-mine/);
  state.exploreKind = 'people'; state.exploreQuery = 'maya';
  await context.requestExploreSearch();
  assert.equal(nodes['[data-event-filters]'].hidden, true);
  assert.equal(categories[1].attributes['aria-selected'], 'true');
  assert.equal(calls.at(-1).url, '/people/?q=maya&page=1');
  assert.equal(nodes['[data-search-results]'].attributes['aria-labelledby'], 'search-tab-people');
});

test('RSVP cards distinguish Going, Requested and Invited, escape user content, and allow re-requesting cancelled events', () => {
  const {context} = setup();
  for (const [status, label] of [['ACCEPTED', '✓ Going'], ['PENDING', '⏳ Requested'], ['INVITED', '✉ Invited']]) {
    const html = context.searchEventCard(event(status, {name: '<script>bad</script>'}));
    assert.ok(html.includes(label)); assert.equal(html.includes('event-card event-going'), status === 'ACCEPTED');
    assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /data-action="join-event"/);
    assert.match(html, /data-action="event-detail" data-id="7"/); assert.match(html, /data-action="open-profile" data-id="2"/);
  }
  for (const status of [null, 'CANCELLED', 'DENIED']) {
    const html = context.searchEventCard(event(status));
    assert.doesNotMatch(html, /event-attendance-badge/); assert.match(html, /data-action="join-event"/);
  }
});

test('failed My Events requests show retry without suggesting an empty RSVP list, and retry succeeds', async () => {
  const {context, state, nodes} = setup(); state.exploreEventFilter = 'mine';
  context.api = async () => { throw Error('Offline'); };
  await context.requestExploreSearch();
  assert.match(nodes['[data-search-results]'].innerHTML, /Could not load results/);
  assert.doesNotMatch(nodes['[data-search-results]'].innerHTML, /No upcoming events|explore-events/);
  assert.match(nodes['[data-search-footer]'].innerHTML, /retry-search/);
  context.api = async () => ({results: [event('ACCEPTED')], count: 1});
  await context.requestExploreSearch();
  assert.equal(context.exploreSearch.error, ''); assert.match(nodes['[data-search-results]'].innerHTML, /✓ Going/);
  assert.equal(nodes['[data-search-summary]'].textContent, '1 event · Soonest first');
});

test('RSVP changes refresh the selected My Events scope and a cancelled event disappears', async () => {
  const {context, state, nodes, calls} = setup(); state.exploreEventFilter = 'mine';
  context.exploreSearch.items = [event('PENDING')]; context.exploreSearch.count = 1;
  await context.updateEventRsvp(7, true);
  assert.deepEqual(calls.map(call => call.url), ['/events/7/cancel-rsvp/', '/events/?q=&page=1&attending=true']);
  assert.equal(state.exploreEventFilter, 'mine'); assert.equal(context.exploreSearch.items.length, 0);
  assert.match(nodes['[data-search-results]'].innerHTML, /No upcoming events yet/);
});

test('private cancellation returns to discovery without fetching inaccessible details and retains the selected scope', async () => {
  const {context, state, calls, navigations} = setup();
  state.currentView = 'event'; state.eventId = 7; state.eventDetail = event('PENDING', {privacy: 'PRIVATE'}); state.exploreEventFilter = 'mine';
  await context.updateEventRsvp('7', true);
  assert.deepEqual(calls.map(call => call.url), ['/events/7/cancel-rsvp/']);
  assert.deepEqual(navigations, ['explore']); assert.equal(state.eventDetail, null); assert.equal(state.exploreEventFilter, 'mine');
});

test('duplicate RSVP taps are coalesced and a late completion cannot navigate away from another screen or account', async () => {
  for (const changeSession of [false, true]) {
    const {context, state, navigations, setCredential} = setup(); const pending = deferred(); let saves = 0;
    state.currentView = 'event';
    context.api = () => { saves++; return pending.promise; };
    const save = context.updateEventRsvp(7); await context.updateEventRsvp(7);
    assert.equal(saves, 1);
    if (changeSession) setCredential('another-session');
    else { state.currentView = 'chats'; state.viewVersion++; }
    pending.resolve({}); await save;
    assert.deepEqual(navigations, []); assert.equal(context.eventRsvpPending.size, 0);
  }
});

test('a failed RSVP remains retryable without discarding the existing list', async () => {
  const {context, state, alerts} = setup(); state.exploreEventFilter = 'mine';
  context.exploreSearch.items = [event('PENDING')]; context.exploreSearch.count = 1;
  context.api = async () => { throw Error('Offline'); };
  await context.updateEventRsvp(7, true);
  assert.deepEqual(alerts, ['Offline']); assert.equal(context.exploreSearch.items[0].id, 7);
  assert.equal(context.eventRsvpPending.size, 0);
});

test('Nearby returns to Explore while cancelled location permission preserves My Events', () => {
  const {context, state, navigations} = setup(); state.exploreEventFilter = 'mine'; let onLocation;
  context.requestBrowserLocation = callback => { onLocation = callback; };
  context.requestNearbyEvents(); assert.equal(state.exploreEventFilter, 'mine');
  onLocation({coords: {latitude: 17.123456789, longitude: 83.123456789}});
  assert.equal(state.exploreEventFilter, 'explore'); assert.equal(state.exploreKind, 'events');
  assert.equal(state.nearby.latitude, 17.123457); assert.deepEqual(navigations, ['explore']);
});
