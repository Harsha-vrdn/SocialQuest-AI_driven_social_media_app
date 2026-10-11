const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const native = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root, 'mobile/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const web = ts.createSourceFile('app.js', fs.readFileSync(path.join(root, 'web/static/app.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

// Exercise the actual async handlers with controlled request completion order.
// No Expo runtime, network calls, or production data are involved.
function find(tree, predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result, 'Handler exists in source');
  return result;
}
function nativeFunction(name, context) {
  const node = find(native, node => ts.isVariableDeclaration(node) && node.name.getText(native) === name);
  const source = ts.transpileModule('(() => { const handler = ' + node.initializer.getText(native) + '; return handler; })();', {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  return vm.runInNewContext(source, context);
}
function webFunction(name, context) {
  const node = find(web, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return vm.runInNewContext('(' + node.getText(web) + ')', context);
}
function webCommentSubmit(context) {
  const node = find(web, node => ts.isCallExpression(node) && node.expression.getText(web) === 'onFormSubmit'
    && node.arguments[0]?.getText(web).includes("form.matches('.post-detail-comment-form')"));
  return vm.runInNewContext('(' + node.arguments[0].getText(web) + ')', context);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}
const rows = data => Array.isArray(data) ? data : data?.results || [];
const noop = () => {};

function profileContext(overrides = {}) {
  const state = {posts: [], owner: null, loading: false, error: ''};
  const context = {
    rows, currentProfileId: {current: 7}, profileRequestVersion: {current: 0},
    setProfilePosts: value => {state.posts = value;},
    setProfilePostsOwner: value => {state.owner = value;},
    setProfilePostsLoading: value => {state.loading = value;},
    setProfilePostsError: value => {state.error = value;}, ...overrides,
  };
  return {state, context};
}

test('profile loads every author page, including posts absent from the recommended feed', async () => {
  const requested = [];
  const apiContext = {
    token: 'session', sessionToken: {current: 'session'}, API_URL: 'https://example.test/api',
    FormData, URL, rows,
    fetch: async url => {
      requested.push(url);
      assert.ok(url.includes('author=7'));
      const secondPage = url.includes('page=2');
      return {status: 200, ok: true, json: async () => ({
        results: secondPage ? [{id: 21, kind: 'REEL', author: {id: 7}}]
          : Array.from({length: 20}, (_, index) => ({id: index + 1, kind: 'POST', author: {id: 7}})),
        next: secondPage ? null : 'https://example.test/api/posts/?author=7&page=2',
      })};
    },
  };
  apiContext.api = nativeFunction('api', apiContext);
  const {state, context} = profileContext({api: apiContext.api});
  await nativeFunction('loadProfilePosts', context)(7);
  assert.equal(requested.length, 2);
  assert.equal(state.posts.length, 21);
  assert.equal(state.posts[20].kind, 'REEL');
  assert.equal(state.owner, 7);
  assert.equal(state.loading, false);
  assert.equal(state.error, '');
});

test('switching profiles discards a late response from the previous author', async () => {
  const first = deferred(), second = deferred();
  const {state, context} = profileContext({api: path => path.endsWith('=7') ? first.promise : second.promise});
  const load = nativeFunction('loadProfilePosts', context);
  const oldRequest = load(7);
  context.currentProfileId.current = 8;
  const currentRequest = load(8);
  second.resolve([{id: 2, author: {id: 8}}]); await currentRequest;
  first.resolve([{id: 1, author: {id: 7}}]); await oldRequest;
  assert.equal(state.owner, 8);
  assert.equal(state.posts[0].author.id, 8);
});

test('failed profile loads show a retryable error without erasing loaded posts', async () => {
  let fail = true;
  const {state, context} = profileContext({api: async () => {
    if (fail) throw new Error('Offline');
    return [{id: 42, author: {id: 7}}];
  }});
  state.posts = [{id: 1}]; state.owner = 7;
  const load = nativeFunction('loadProfilePosts', context);
  await load(7);
  assert.equal(state.error, 'Offline'); assert.equal(state.loading, false);
  assert.equal(state.posts[0].id, 1);
  fail = false; await load(7);
  assert.equal(state.error, ''); assert.equal(state.posts[0].id, 42);
});

test('an unrelated profile refresh cannot cancel the visible profile request', async () => {
  const response = deferred();
  const {state, context} = profileContext({api: () => response.promise});
  const load = nativeFunction('loadProfilePosts', context);
  const pending = load(7);
  await load(8);
  response.resolve([{id: 9}]); await pending;
  assert.equal(state.posts[0].id, 9); assert.equal(state.loading, false);
});

test('closing a profile ignores its in-flight result', async () => {
  const response = deferred();
  const {state, context} = profileContext({api: () => response.promise});
  const pending = nativeFunction('loadProfilePosts', context)(7);
  context.currentProfileId.current = undefined;
  context.profileRequestVersion.current++;
  response.resolve([{id: 9}]); await pending;
  assert.equal(state.posts.length, 0); assert.equal(state.owner, null);
});

test('host event loading populates requests without the removed proof endpoint', async () => {
  const calls = [], alerts = [];
  let requests;
  const responses = {
    '/events/5/': {id: 5, host: {id: 1}, is_finished: false},
    '/events/5/quests/': [], '/posts/?event=5': [],
    '/events/5/requests/': [{id: 3, status: 'PENDING'}],
  };
  const open = nativeFunction('openEvent', {
    api: async path => {calls.push(path); assert.ok(path in responses, path); return responses[path];},
    rows, me: {id: 1}, Alert: {alert: (...args) => alerts.push(args)},
    setSelectedEvent: noop, setEventQuests: noop, setEventPosts: noop,
    setEventRequests: value => { requests = value; }, setRatingTargets: noop, setEventRatings: noop,
  });
  await open(5);
  assert.equal(alerts.length, 0);
  assert.equal(requests[0].id, 3);
  assert.equal(calls.filter(path => path === '/events/5/requests/').length, 1);
});

test('host attendance review still uses the supported endpoint', async () => {
  const calls = [];
  const review = nativeFunction('reviewEventItem', {
    selectedEvent: {id: 5}, api: async (...args) => { calls.push(args); },
    openEvent: async id => {assert.equal(id, 5);}, Alert: {alert: assert.fail},
  });
  await review(3, 'ACCEPTED');
  assert.equal(calls[0][0], '/events/5/review-request/');
  assert.deepEqual(JSON.parse(calls[0][1].body), {attendance_id: 3, decision: 'ACCEPTED'});
});

function commentContext(overrides = {}) {
  const state = {comments: [], body: 'A reply', submitting: false, countChanges: [], alerts: []};
  const context = {
    rows, activeCommentPostId: {current: 1}, commentPanelVersion: {current: 1}, commentRequestVersion: {current: 0},
    commentInFlight: {current: false}, commentPost: {id: 1}, commentBody: state.body, editingComment: null, replyingTo: null,
    setComments: value => {state.comments = value;},
    setCommentBody: value => {state.body = value;},
    setCommentSubmitting: value => {state.submitting = value;},
    setEditingComment: noop, setReplyingTo: noop, setCommentPost: noop, Keyboard: {dismiss: noop},
    updateCommentCount: (...args) => state.countChanges.push(args), loadNotifications: async () => {},
    Alert: {alert: (...args) => state.alerts.push(args)}, ...overrides,
  };
  context.loadComments = nativeFunction('loadComments', context);
  return {state, context};
}

test('a late response from post A cannot overwrite comments for post B', async () => {
  const a = deferred(), b = deferred();
  const {state, context} = commentContext({api: path => path.endsWith('=1') ? a.promise : b.promise});
  const first = context.loadComments(1);
  context.activeCommentPostId.current = 2;
  const second = context.loadComments(2);
  b.resolve([{id: 20, post: 2}]); await second;
  a.resolve([{id: 10, post: 1}]); await first;
  assert.equal(state.comments[0].post, 2);
});

test('closing and reopening the same post discards the previous request', async () => {
  const a = deferred(), b = deferred(); let calls = 0;
  const {state, context} = commentContext({api: () => ++calls === 1 ? a.promise : b.promise});
  const first = context.loadComments(1);
  nativeFunction('closeComments', context)();
  context.activeCommentPostId.current = 1;
  const second = context.loadComments(1);
  b.resolve([{id: 2}]); await second;
  a.resolve([{id: 1}]); await first;
  assert.equal(state.comments[0].id, 2);
});

test('rapid reply taps produce one write and one count increment', async () => {
  const write = deferred(); let writes = 0;
  const {state, context} = commentContext({api: (_path, options) => {
    if (options?.method === 'POST') {writes++; return write.promise;}
    return Promise.resolve([{id: 1}]);
  }});
  const save = nativeFunction('saveComment', context);
  const first = save(), second = save();
  assert.equal(writes, 1); assert.equal(state.submitting, true);
  write.resolve({id: 1}); await Promise.all([first, second]);
  assert.equal(state.body, ''); assert.equal(state.submitting, false);
  assert.deepEqual(state.countChanges, [[1, 1]]);
});

test('a rejected reply remains retryable and releases the submission guard', async () => {
  let rejectWrite = true;
  const {state, context} = commentContext({api: async () => {
    if (rejectWrite) throw new Error('Offline');
    return [];
  }});
  const save = nativeFunction('saveComment', context);
  await save();
  assert.equal(state.body, 'A reply'); assert.equal(context.commentInFlight.current, false);
  assert.equal(state.alerts[0][0], 'Could not save comment');
  rejectWrite = false; await save();
  assert.equal(state.body, ''); assert.equal(state.countChanges.length, 1);
});

test('a completed reply does not clear a draft in another comment panel', async () => {
  const write = deferred();
  const {state, context} = commentContext({api: () => write.promise});
  const saving = nativeFunction('saveComment', context)();
  context.activeCommentPostId.current = 2; context.commentPanelVersion.current++;
  state.body = 'Draft for post B';
  write.resolve({id: 1}); await saving;
  assert.equal(state.body, 'Draft for post B');
  assert.deepEqual(state.countChanges, [[1, 1]]);
});

test('reply refresh failures do not restore an already saved reply', async () => {
  const {state, context} = commentContext({api: async (_path, options) => {
    if (options?.method === 'POST') return {id: 1};
    throw new Error('Refresh failed');
  }});
  await nativeFunction('saveComment', context)();
  assert.equal(state.body, ''); assert.equal(state.alerts[0][0], 'Reply saved');
  assert.equal(context.commentInFlight.current, false);
});

function messageContext(overrides = {}) {
  const state = {draft: 'Hello', messages: [], alerts: []};
  const context = {
    activeChat: {id: 7}, activeChatId: {current: 7}, message: 'Hello', sendInFlight: {current: false},
    token: 'session', sessionToken: {current: 'session'},
    setMessage: value => {state.draft = typeof value === 'function' ? value(state.draft) : value;},
    setMessages: update => {state.messages = update(state.messages);}, setEmojiPickerOpen: noop,
    loadMessages: async () => {}, loadChats: async () => {},
    Alert: {alert: (...args) => state.alerts.push(args)}, ...overrides,
  };
  return {state, context};
}

test('acknowledged messages stay sent when the follow-up refresh fails', async () => {
  let writes = 0;
  const {state, context} = messageContext({
    api: async () => {writes++; return {id: 99, body: 'Hello'};},
    loadMessages: async () => {throw new Error('Refresh failed');},
  });
  await nativeFunction('send', context)();
  assert.equal(writes, 1); assert.equal(state.draft, ''); assert.equal(state.alerts.length, 0);
  assert.equal(state.messages[0].id, 99); assert.equal(context.sendInFlight.current, false);
});

test('failed message writes restore the original draft for retry', async () => {
  const {state, context} = messageContext({api: async () => {throw new Error('Offline');}});
  await nativeFunction('send', context)();
  assert.equal(state.draft, 'Hello'); assert.equal(state.alerts[0][0], 'Message not sent');
  assert.equal(context.sendInFlight.current, false);
});

test('a failed send does not inject its text into a different chat', async () => {
  const write = deferred();
  const {state, context} = messageContext({api: () => write.promise});
  const sending = nativeFunction('send', context)();
  context.activeChatId.current = 8; state.draft = 'Draft for someone else';
  write.reject(new Error('Offline')); await sending;
  assert.equal(state.draft, 'Draft for someone else');
});

test('a comment POST finishing after navigation does not render or fetch post/null', async () => {
  const write = deferred(), alerts = [], calls = [];
  const state = {currentView: 'home', postId: null, openPostId: 10};
  const modal = {open: true};
  const context = {
    state, modal, document: {querySelector: () => null, querySelectorAll: () => []},
    api: (path) => {calls.push(path); return write.promise;},
    alert: text => alerts.push(text), fetchPostDetail: async () => assert.fail('No visible post to refresh'),
    renderPostModal: async () => assert.fail('Do not reopen the modal'),
    renderPostDetail: async () => assert.fail('Do not replace the current page'),
  };
  context.refreshPostComments = webFunction('refreshPostComments', context);
  const input = {value: 'A comment'};
  const saving = webCommentSubmit(context)({
    target: {matches: () => true, querySelector: () => input, dataset: {post: '10'}}, preventDefault: noop,
  });
  modal.open = false; state.openPostId = null; state.currentView = 'profile';
  write.resolve({id: 1}); await saving;
  assert.equal(state.currentView, 'profile'); assert.deepEqual(calls, ['/comments/']);
  assert.equal(alerts.length, 0);
});

test('web thread refresh removes cascaded replies, corrects counts, and keeps drafts', async () => {
  const detail = {innerHTML: 'parent and child'};
  const counter = {textContent: '3 replies'};
  const feed = {
    remaining: [1, 2, 3], draft: 'Still writing', inserted: '',
    querySelectorAll() {return this.remaining.map(id => ({remove: () => {this.remaining = this.remaining.filter(item => item !== id);}}));},
    insertAdjacentHTML(_position, html) {this.inserted = html;},
  };
  const context = {
    document: {
      querySelector: () => detail,
      querySelectorAll: selector => selector.startsWith('button') ? [counter] : selector.endsWith('.post-detail-replies') ? [detail] : [feed],
    },
    fetchPostDetail: async () => ({post: {id: 10, comment_count: 1, recent_comments: [{id: 3}]}, comments: [{id: 3}]}),
    postDetailCommentsMarkup: comments => comments.map(item => 'comment:' + item.id).join(','),
    commentMarkup: item => 'comment:' + item.id,
  };
  await webFunction('refreshPostComments', context)(10);
  assert.equal(counter.textContent, '◌ 1 replies');
  assert.equal(detail.innerHTML, '<h3>Replies</h3>comment:3');
  assert.equal(feed.inserted, 'comment:3'); assert.deepEqual(feed.remaining, []);
  assert.equal(feed.draft, 'Still writing');
});

test('web reply submission does not clear text typed during the request', async () => {
  const write = deferred(), input = {value: 'First reply'};
  let refreshed;
  const save = webCommentSubmit({
    api: () => write.promise, refreshPostComments: async id => {refreshed = id;}, alert: assert.fail,
  });
  const saving = save({target: {matches: () => true, querySelector: () => input, dataset: {post: '10'}}, preventDefault: noop});
  input.value = 'Next reply'; write.resolve({id: 1}); await saving;
  assert.equal(input.value, 'Next reply'); assert.equal(refreshed, 10);
});

test('web host event details render paginated quests and attendance without proof-review APIs', async () => {
  const person = {id: 1, username: 'host', display_name: 'Host', xp: 0};
  const guest = {id: 2, username: 'guest', xp: 0};
  const calls = [], view = {innerHTML: ''}, state = {eventId: 5, user: person};
  const responses = {
    '/events/5/': {id: 5, host: person, name: 'Test event', description: 'Test', location_name: 'Test location',
      quest_status: 'ACTIVE', my_attendance_status: 'ACCEPTED', has_quests: true, accepted_count: 1, capacity: 12},
    '/events/5/quests/': {results: [{id: 10, kind: 'MAIN', title: 'Test quest', instructions: 'Test instructions', xp_reward: 50}]},
    '/events/5/attendees/': {results: [{user: person}]},
    '/events/5/requests/': {results: [{id: 3, status: 'PENDING', user: guest, note: 'Test request'}]},
    '/posts/?event=5': {results: []},
  };
  const render = webFunction('renderEventDetail', {
    state, view, rows, header: () => '', avatar: () => '', eventDate: () => 'Today', escapeHtml: value => String(value ?? ''),
    api: async path => {calls.push(path); assert.ok(path in responses, path); return responses[path];},
  });
  await render();
  assert.match(view.innerHTML, /Test event/);
  assert.match(view.innerHTML, /Test quest/);
  assert.match(view.innerHTML, /data-action="submit-quest"/);
  assert.match(view.innerHTML, /data-action="review-request"/);
  assert.doesNotMatch(view.innerHTML, /review-proof|Review quest proof/);
  assert.equal(calls.filter(path => path === '/events/5/requests/').length, 1);
  assert.equal(state.eventQuests.length, 1);
});

function hostLocationContext() {
  const state = {editor: {name: 'Coffee', location_name: ''}, locating: false, status: ''};
  const response = deferred();
  const context = {
    eventEditorVersion: {current: 1}, eventLocationRequest: {current: 0},
    Platform: {OS: 'android'}, Keyboard: {dismiss: noop}, setEventEditorClosing: noop,
    locateHostVenue: () => response.promise,
    setEventEditor: value => {state.editor = typeof value === 'function' ? value(state.editor) : value;},
    setEventDateField: noop,
    setEventLocating: value => {state.locating = value;},
    setEventLocationStatus: value => {state.status = value;},
  };
  return {state, context, response};
}

test('host GPS fills coordinates and venue together', async () => {
  const {state, context, response} = hostLocationContext();
  const pending = nativeFunction('detectEventLocation', context)();
  response.resolve({latitude: 12.97, longitude: 77.59, location_name: 'Cubbon Park'});
  await pending;
  assert.equal(state.editor.latitude, 12.97); assert.equal(state.editor.location_name, 'Cubbon Park');
  assert.equal(state.locating, false);
});

test('late GPS cannot overwrite a manually typed venue or a closed host form', async () => {
  for (const manual of [true, false]) {
    const {state, context, response} = hostLocationContext();
    const pending = nativeFunction('detectEventLocation', context)();
    if (manual) nativeFunction('changeEventLocation', context)('My cafe');
    else nativeFunction('closeEventEditor', context)();
    response.resolve({latitude: 12.97, longitude: 77.59, location_name: 'Old position'});
    await pending;
    assert.equal(state.locating, false);
    if (manual) {assert.equal(state.editor.location_name, 'My cafe'); assert.equal(state.editor.latitude, null);}
    else assert.equal(state.editor, null);
  }
});

test('location permission errors release the host form for manual entry', async () => {
  const {state, context, response} = hostLocationContext();
  const pending = nativeFunction('detectEventLocation', context)();
  response.reject(new Error('Location access is off. Enter a venue.'));
  await pending;
  assert.equal(state.locating, false); assert.match(state.status, /Enter a venue/);
});

test('host event persists detected coordinates and prevents double publishing', async () => {
  const response = deferred(), requests = [];
  const context = {
    eventEditor: {name: 'Coffee', description: 'Make friends', location_name: 'Park', latitude: 12.97, longitude: 77.59,
      starts_at: '2026-10-05T10:00', ends_at: '2026-10-05T12:00', capacity: '12', privacy: 'PUBLIC'},
    busy: false, eventLocating: false, eventSaveInFlight: {current: false}, query: '', setBusy: noop,
    Alert: {alert: () => assert.fail('Unexpected save error')}, closeEventEditor: noop,
    loadMe: async () => {throw Error('Refresh failed');}, loadDiscover: async () => {}, openEvent: async () => {},
    api: async (url, options) => {requests.push({url, options}); return url === '/events/' ? response.promise : {};},
  };
  const save = nativeFunction('saveEvent', context);
  const pending = save(); await save();
  response.resolve({id: 12}); await pending;
  assert.equal(requests.filter(item => item.url === '/events/').length, 1);
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.latitude, 12.97); assert.equal(payload.longitude, 77.59); assert.equal(payload.capacity, 12);
  assert.equal(context.eventSaveInFlight.current, false);
});

test('profile saves refresh authors everywhere and ignore a changed login session', async () => {
  for (const changeSession of [false, true]) {
    const response = deferred(), state = {me: null, posts: [{id: 1, author: {id: 7}}, {id: 2, author: {id: 8}}]};
    const context = {
      token: 'old', sessionToken: {current: 'old'}, me: {id: 7}, FormData,
      api: (url, options) => {assert.equal(url, '/people/me/'); assert.equal(options.method, 'PATCH'); assert.equal(options.body.get('display_name'), 'New name'); return response.promise;},
      setMe: person => {state.me = person;}, setSelectedUser: noop,
      setPosts: update => {state.posts = update(state.posts);}, setReels: noop, setEventPosts: noop, setProfilePosts: noop,
    };
    const pending = nativeFunction('saveProfile', context)({display_name: 'New name', bio: 'Hello', city: 'Bengaluru'}, null);
    if (changeSession) context.sessionToken.current = 'new';
    response.resolve({id: 7, display_name: 'New name'}); await pending;
    assert.equal(state.me?.display_name, changeSession ? undefined : 'New name');
    assert.equal(state.posts[0].author.display_name, changeSession ? undefined : 'New name');
    assert.equal(state.posts[1].author.id, 8);
  }
});

test('quest drafts remain separate from regular posts and other quests', () => {
  const drafts = new Map(), state = {};
  const context = {
    composerDrafts: {current: drafts}, proofQuest: {id: 5}, moment: 'Quest caption', momentMedia: {uri: 'proof.jpg'}, momentLocation: '',
    setMoment: value => {state.caption = value;}, setMomentMedia: value => {state.media = value;},
    setMomentLocation: noop, setProofQuest: value => {state.quest = value;}, setComposeOpen: noop,
  };
  nativeFunction('closeComposer', context)(false);
  const open = nativeFunction('openComposer', context);
  open(null); assert.equal(state.caption, ''); assert.equal(state.media, null);
  open({id: 6}); assert.equal(state.caption, '');
  open({id: 5}); assert.equal(state.caption, 'Quest caption'); assert.equal(state.media.uri, 'proof.jpg');
  nativeFunction('closeComposer', context)(true); assert.equal(drafts.has('quest:5'), false);
});

test('quest completion posts image or reel once and survives failed feed refresh', async () => {
  for (const type of ['image', 'video']) {
    const response = deferred(), requests = [], alerts = [], completed = [];
    class MediaFile extends Blob {constructor() {super(['preview']);}}
    const context = {
      uploadInFlight: {current: false}, proofQuest: {id: 5, event: 2, event_name: 'Coffee walk', xp_reward: 75},
      momentMedia: {uri: 'file:///proof', fileSize: 10, type}, moment: ' We did it! ', momentLocation: '',
      composerDrafts: {current: new Map()}, FormData, File: MediaFile, MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
      setBusy: noop, setMoment: noop, setMomentMedia: noop, setMomentLocation: noop, setProofQuest: noop,
      setComposeOpen: value => completed.push(value), Alert: {alert: (...args) => alerts.push(args)},
      api: (url, options) => {requests.push({url, data: options.body}); return response.promise;},
      refreshVisibleProfile: async () => {}, loadFeed: async () => {throw Error('Offline');}, loadMe: async () => {},
      openEvent: async id => {assert.equal(id, 2);},
    };
    const share = nativeFunction('share', context);
    const pending = share(); await share(); response.resolve({id: 42}); await pending;
    assert.equal(requests.length, 1); assert.equal(requests[0].url, '/submissions/');
    assert.equal(requests[0].data.get('quest'), '5'); assert.equal(requests[0].data.get('caption'), 'We did it!');
    assert.equal(requests[0].data.get('media_type'), type === 'video' ? 'REEL' : 'IMAGE');
    assert.deepEqual(completed, [false]); assert.equal(alerts.length, 1); assert.match(alerts[0][1], /75 XP earned/);
    assert.equal(context.uploadInFlight.current, false);
  }
});

function hostingLocator(location, timers = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile/hostingLocation.ts'), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText;
  const context = {exports: {}, require: () => location, setTimeout, clearTimeout, ...timers};
  vm.runInNewContext(code, context);
  return context.exports.locateHostVenue;
}

test('host location falls back to coordinates if reverse geocoding fails', async () => {
  const locate = hostingLocator({Accuracy: {Balanced: 3}, requestForegroundPermissionsAsync: async () => ({granted: true}),
    getCurrentPositionAsync: async () => ({coords: {latitude: 12.9716, longitude: 77.5946}}),
    reverseGeocodeAsync: async () => {throw Error('Unavailable');}});
  const place = await locate();
  assert.equal(place.location_name, '12.9716, 77.5946'); assert.equal(place.latitude, 12.9716);
});

test('host location deadline covers an unresponsive geocoder and clears its timer', async () => {
  const geocoding = deferred(); let expire, cleared = false;
  const locate = hostingLocator({Accuracy: {Balanced: 3}, requestForegroundPermissionsAsync: async () => ({granted: true}),
    getCurrentPositionAsync: async () => ({coords: {latitude: 12.97, longitude: 77.59}}),
    reverseGeocodeAsync: () => {geocoding.resolve(); return new Promise(() => {});}},
    {setTimeout: callback => {expire = callback; return 1;}, clearTimeout: () => {cleared = true;}});
  const pending = locate(); await geocoding.promise; expire();
  await assert.rejects(pending, /Location took too long/); assert.equal(cleared, true);
});

test('host location never requests GPS when permission is denied', async () => {
  const locate = hostingLocator({requestForegroundPermissionsAsync: async () => ({granted: false}),
    getCurrentPositionAsync: () => assert.fail('GPS must wait for permission')});
  await assert.rejects(locate(), /Enter the venue/);
});

test('complete quest opens only for eligible attendees and carries its event context', () => {
  const opened = [];
  const context = {selectedEvent: {id: 2, name: 'Coffee walk', quest_status: 'ACTIVE', my_attendance_status: 'ACCEPTED'},
    openComposer: value => opened.push(value)};
  const begin = nativeFunction('beginQuestProof', context);
  begin({id: 5, title: 'Meet a friend'});
  assert.equal(opened[0].event, 2); assert.equal(opened[0].event_name, 'Coffee walk');
  begin({id: 5, my_submission: {status: 'APPROVED'}});
  context.selectedEvent.quest_status = 'EXPIRED'; begin({id: 6});
  context.selectedEvent.quest_status = 'ACTIVE'; context.selectedEvent.my_attendance_status = 'PENDING'; begin({id: 6});
  assert.equal(opened.length, 1);
});

function pureModule(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile', file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText;
  const context = {exports: {}};
  vm.runInNewContext(code, context);
  return context.exports;
}

test('post times use minute, hour, day, and year/day labels at their boundaries', () => {
  const {relativeTime} = pureModule('relativeTime.ts');
  const now = Date.parse('2026-10-06T12:00:00Z');
  const ago = minutes => relativeTime(new Date(now - minutes * 60000).toISOString(), now);
  for (const [minutes, expected] of [[0,'Just now'],[0.99,'Just now'],[1,'1 min ago'],[10,'10 mins ago'],[59,'59 mins ago'],[60,'1 hr ago'],[600,'10 hrs ago'],[1440,'1 day ago'],[2880,'2 days ago'],[365*1440,'1y ago'],[385*1440,'1y 20 days ago'],[731*1440,'2y 1 day ago']]) {
    assert.equal(ago(minutes), expected);
  }
  assert.equal(ago(-5), 'Just now'); assert.equal(relativeTime('bad date', now), '');
  const posted = new Date(now - 59 * 60000).toISOString();
  assert.equal(relativeTime(posted, now + 60000), '1 hr ago');
});

test('image zoom keeps the focal point under the fingers and clamps its limits', () => {
  const {focalZoom, boundTransform, containSize} = pureModule('imageZoom.ts');
  const image = containSize({width: 1600, height: 800}, {width: 400, height: 600});
  assert.equal(image.width, 400); assert.equal(image.height, 200);
  const zoomed = focalZoom({scale: 1, x: 0, y: 0}, 2, {x: 50, y: 0}, {x: 70, y: 20});
  assert.equal(zoomed.x, -30); assert.equal(zoomed.y, 20);
  // Content point x=50 now renders at the new finger midpoint x=70.
  assert.equal(zoomed.x + 50 * zoomed.scale, 70);
  const bounded = boundTransform({scale: 8, x: 2000, y: -2000}, image, {width: 400, height: 600});
  assert.equal(bounded.scale, 4); assert.equal(bounded.x, 600); assert.equal(bounded.y, -100);
  const reset = boundTransform({scale: 0.2, x: 100, y: 500}, image, {width: 400, height: 600});
  assert.equal(reset.scale, 1); assert.equal(reset.x, 0); assert.equal(reset.y, 0);
  const portrait = containSize({width: 800, height: 1600}, {width: 400, height: 600});
  assert.equal(portrait.width, 300); assert.equal(portrait.height, 600);
});

test('photo single tap opens zoom viewer and double tap still likes without opening', () => {
  for (const doubleTap of [false, true]) {
    const timers = new Map(); let sequence = 0, opened = 0, liked = 0;
    const context = {tapTimer: {current: null}, heartTimer: {current: null}, post: {id: 4, liked_by_me: false},
      setViewerOpen: () => opened++, onLike: () => liked++, setShowHeart: noop,
      setTimeout: fn => {timers.set(++sequence, fn); return sequence;}, clearTimeout: id => timers.delete(id)};
    const tap = nativeFunction('handlePress', context); tap(); if (doubleTap) tap();
    for (const fn of timers.values()) fn();
    assert.equal(opened, doubleTap ? 0 : 1); assert.equal(liked, doubleTap ? 1 : 0);
  }
});

test('opening the event group reuses its returned chat and prevents duplicate taps', async () => {
  const response = deferred(), state = {conversations: [{id: 9}], active: null, event: {id: 7}, tab: 'Explore'};
  let calls = 0;
  const context = {selectedEvent: state.event, openingEventChat: {current: false},
    api: (url, options) => {calls++; assert.equal(url, '/events/7/chat/'); assert.equal(options.method, 'POST'); return response.promise;},
    setConversations: update => {state.conversations = update(state.conversations);},
    setSelectedEvent: value => {state.event = value;}, setTab: value => {state.tab = value;}, setActiveChat: value => {state.active = value;},
    Alert: {alert: () => assert.fail('Unexpected error')},
  };
  const open = nativeFunction('openEventChat', context);
  const pending = open(); await open(); response.resolve({id: 9, is_group: true, event: 7}); await pending;
  assert.equal(calls, 1); assert.equal(state.conversations.length, 1);
  assert.equal(state.active.id, 9); assert.equal(state.event, null); assert.equal(state.tab, 'Chats');
});

test('chat refresh removes an open event chat when the member loses access', async () => {
  let active = {id: 9, event: 7};
  const context = {rows, api: async () => [{id: 2}], setConversations: noop,
    chatRequestVersion: {current: 0}, chatReadVersion: {current: 0}, chatReadCursors: {current: new Map()},
    setActiveChat: update => {active = update(active);}};
  await nativeFunction('loadChats', context)();
  assert.equal(active, null);
});

test('empty cards preserve caller styles and measurement props', () => {
  const node = find(native, node => ts.isFunctionDeclaration(node) && node.name?.text === 'Empty');
  const source = ts.transpileModule('(' + node.getText(native) + ')', {
    compilerOptions: {target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
  }).outputText;
  const baseStyle = {padding: 30}, callerStyle = {marginBottom: 20};
  let measured = false;
  const onLayout = () => {measured = true;};
  const Empty = vm.runInNewContext(source, {
    React: {createElement: (type, props, ...children) => ({type, props, children})},
    View: 'View', Text: 'Text', useTheme: () => ({theme: {colors: {}}}), getAppStyles: () => ({empty: baseStyle}),
  });
  const card = Empty({icon: '✦', title: 'This is a new conversation.', body: 'Say hello', style: callerStyle, onLayout});
  assert.equal(card.props.style[0], baseStyle);
  assert.equal(card.props.style[1], callerStyle);
  card.props.onLayout(); assert.equal(measured, true);
  const ordinary = Empty({icon: '✦', title: 'No posts', body: 'Share a moment'});
  assert.equal(ordinary.props.style[0], baseStyle);
  assert.equal(ordinary.props.style[1], undefined);
});

test('upright chats follow new messages without interrupting someone reading history', () => {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile/MessageList.tsx'), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  let cursor = 0, scrolls = 0;
  const slots = [], effects = [];
  const react = {
    useRef: initial => {const index = cursor++; return slots[index] ||= {current: initial};},
    useLayoutEffect: (effect, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous[i])) effects.push(effect);
      slots[index] = deps;
    },
  };
  const jsx = (type, props) => ({type, props});
  const context = {exports: {}, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react-native') return {FlatList: 'FlatList'};
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  let data = [{id: 10, sender: {id: 1}}, {id: 11, sender: {id: 2}}];
  const read = [];
  const render = () => {
    cursor = 0;
    const list = context.exports.MessageList({data, currentUserId: 1, onReadThrough: id => read.push(id)});
    list.props.ref.current = {scrollToEnd: () => scrolls++};
    effects.splice(0).forEach(effect => effect());
    assert.equal(list.props.inverted, false);
    assert.equal(list.props.data, data);
    return list.props;
  };
  const position = y => ({nativeEvent: {contentSize: {height: 1200}, contentOffset: {y}, layoutMeasurement: {height: 300}}});
  let props = render(); assert.equal(scrolls, 1);
  assert.equal(read.length, 0, 'Loading messages is not a read receipt');
  props.onViewableItemsChanged({viewableItems: [{isViewable:true, item:data[0]}, {isViewable:false, item:data[1]}]});
  assert.deepEqual(read, [10]);
  assert.equal(props.viewabilityConfig.minimumViewTime, 250);
  props.onScroll(position(0)); props.onContentSizeChange(); assert.equal(scrolls, 2);
  props.onScrollBeginDrag(); props.onScroll(position(0)); props.onScrollEndDrag(position(0));
  props.onLayout(); assert.equal(scrolls, 2);
  data = [...data, {id: 12, sender: {id: 2}}]; props = render();
  props.onContentSizeChange(); assert.equal(scrolls, 2);
  data = [...data, {id: 13, sender: {id: 1}}]; props = render(); assert.equal(scrolls, 3);
  props.onScrollBeginDrag(); props.onScrollEndDrag(position(0));
  data = [...data]; props = render(); assert.equal(scrolls, 3);
  props.onScrollBeginDrag(); props.onScrollEndDrag(position(900));
  data = [...data, {id: 14, sender: {id: 2}}]; props = render(); assert.equal(scrolls, 4);
  props.onLayout(); assert.equal(scrolls, 5);
});

test('fullscreen photos request real pixels for Retina zoom without changing their displayed size', () => {
  const {imageRenderLayout} = pureModule('imageZoom.ts');
  const layout = imageRenderLayout({width: 1920, height: 1280}, {width: 390, height: 620}, 3);
  assert.equal(layout.raster.width * 3, 1920);
  assert.equal(layout.raster.height * 3, 1280);
  assert.equal(layout.raster.width * layout.displayScale, 390);
  assert.equal(layout.raster.height * layout.displayScale, 260);
  const portrait = imageRenderLayout({width: 2000, height: 4000}, {width: 390, height: 620}, 3);
  assert.equal(portrait.raster.height * portrait.displayScale, 620);
  const huge = imageRenderLayout({width: 20000, height: 20000}, {width: 390, height: 620}, 3);
  assert.ok(huge.raster.width * 3 <= 4096);
  assert.equal(imageRenderLayout({width: 0, height: 0}, {width: 390, height: 620}, 3), null);
  assert.equal(imageRenderLayout({width: 1920, height: 1280}, {width: 0, height: 0}, 3), null);
});

function imageViewerHarness() {
  const tree = ts.createSourceFile('ImageViewer.tsx', fs.readFileSync(path.join(root, 'mobile/ImageViewer.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = find(tree, node => ts.isFunctionDeclaration(node) && node.name?.text === 'ImageViewer');
  const source = ts.transpileModule('(' + node.getText(tree).replace(/^export\s+/, '') + ')', {
    compilerOptions: {target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
  }).outputText;
  let cursor = 0, pending = [], rendered;
  const slots = [], requests = [];
  const useSlot = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial(); return index; };
  const Image = Object.assign(function Image() {}, {getSize: (uri, success, failure) => requests.push({uri, success, failure})});
  const component = vm.runInNewContext(source, {
    ...pureModule('imageZoom.ts'), initial: {scale: 1, x: 0, y: 0},
    React: {createElement: (type, props, ...children) => ({type, props: props || {}, children})},
    useState: initial => {const index = useSlot(() => typeof initial === 'function' ? initial() : initial); return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];},
    useRef: initial => slots[useSlot(() => ({current: initial}))],
    useEffect: (effect, deps) => {
      const index = useSlot(() => ({})), previous = slots[index];
      if (!previous.deps || deps.some((value, i) => value !== previous.deps[i])) {
        previous.cleanup?.(); slots[index] = {deps}; pending.push(() => {slots[index].cleanup = effect();});
      }
    },
    useSafeAreaInsets: () => ({top: 0, bottom: 0}), PixelRatio: {get: () => 3},
    Animated: {View: 'Animated.View', Value: class {setValue() {}}, multiply: (value, factor) => ({value, factor})},
    PanResponder: {create: () => ({panHandlers: {}})},
    Image, MotionModal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', Ionicons: 'Icon',
    useTheme: () => ({theme: {colors: {}}}), getStyles: () => ({}),
  });
  function all(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
    return [...(predicate(node) ? [node] : []), ...all(node.children, predicate)];
  }
  const render = () => {cursor = 0; rendered = component({uri: 'https://example.test/photo.jpg', onClose: noop}); const effects = pending; pending = []; effects.forEach(effect => effect()); return rendered;};
  return {render, requests, images: () => all(rendered, node => node.type === Image),
    byLabel: label => all(rendered, node => node.props?.accessibilityLabel === label)[0],
    measure: () => all(rendered, node => !!node.props?.onLayout)[0].props.onLayout({nativeEvent: {layout: {width: 390, height: 620, x: 0, y: 0}}})};
}

test('native unread chat refresh ignores snapshots predating a read or a newer refresh', async () => {
  const first = deferred(), latest = deferred(); let calls = 0, chats = [];
  const context = {rows, chatRequestVersion:{current:0}, chatReadVersion:{current:0}, chatReadCursors:{current:new Map()},
    api: () => ++calls === 1 ? first.promise : latest.promise, setConversations:value => {chats=value;}, setActiveChat:noop};
  const refresh = nativeFunction('loadChats', context);
  const old = refresh(), next = refresh();
  latest.resolve([{id:1,unread_count:0,read_through_message_id:8}]); await next;
  first.resolve([{id:1,unread_count:4,read_through_message_id:0}]); await old;
  assert.equal(chats[0].unread_count, 0);
  const pending = deferred(); context.api=()=>pending.promise;
  const beforeRead = refresh(); context.chatReadVersion.current++;
  pending.resolve([{id:1,unread_count:3}]); await beforeRead;
  assert.equal(chats[0].unread_count, 0);
});

test('native read receipts are foreground-only, scoped, and retryable after failure', async () => {
  let chats=[{id:2,unread_count:3}], writes=0, fail=true;
  const context = {activeChatId:{current:2},currentTab:{current:'Chats'},AppState:{currentState:'background'},
    visibleChatMessage:{current:{chatId:0,messageId:0}},chatReadCursors:{current:new Map()},chatReadRequests:{current:new Set()},chatReadVersion:{current:0},
    api:async (url,options)=>{writes++; assert.equal(url,'/conversations/2/mark-read/'); assert.equal(JSON.parse(options.body).message_id,9); if(fail)throw Error('Offline'); return {unread_count:1,read_through_message_id:9};},
    setConversations:update=>{chats=update(chats);},setActiveChat:noop,loadChats:async()=>{}};
  context.markChatRead=nativeFunction('markChatRead',context);
  await context.markChatRead(2,9); assert.equal(writes,0);
  context.AppState.currentState='active'; await context.markChatRead(3,9); assert.equal(writes,0);
  await context.markChatRead(2,9); assert.equal(chats[0].unread_count,3); assert.equal(context.chatReadRequests.current.size,0);
  fail=false; await context.markChatRead(2,9); assert.equal(chats[0].unread_count,1);
  await context.markChatRead(2,9); assert.equal(writes,2,'Acknowledged messages are not written repeatedly');
});

test('native notification mark-all does not clear a notification that arrived during the request', async () => {
  const pending=deferred(); let notifications=[{id:1,is_read:false}];
  const context={notifications,notificationRequestVersion:{current:0},api:()=>pending.promise,
    setNotifications:update=>{notifications=update(notifications);},Alert:{alert:()=>assert.fail('Unexpected failure')}};
  const mark=nativeFunction('markNotificationsRead',context)();
  notifications.push({id:2,is_read:false});pending.resolve({});await mark;
  assert.equal(notifications[0].is_read,true);assert.equal(notifications[1].is_read,false);
});

test('web unread badges count messages, hide zero, and preserve exact accessible counts above 99', () => {
  const nodes=[{setAttribute(key,value){this[key]=value;}}];
  const context={state:{conversations:[{id:1,unread_count:105}],activeConversation:null},unreadMessages:()=>105,
    document:{querySelectorAll:()=>nodes,querySelector:()=>null}};
  webFunction('syncChatBadges',context)();
  assert.equal(nodes[0].textContent,'99+');assert.equal(nodes[0]['aria-label'],'105 unread messages');assert.equal(nodes[0].hidden,false);
  context.unreadMessages=()=>0;webFunction('syncChatBadges',context)();assert.equal(nodes[0].hidden,true);
});

test('web only marks messages visible in the active foreground thread', () => {
  const read=[], messages=[
    {dataset:{messageId:'8'},getBoundingClientRect:()=>({top:10,bottom:90,height:80})},
    {dataset:{messageId:'9'},getBoundingClientRect:()=>({top:300,bottom:380,height:80})},
  ];
  const holder={getBoundingClientRect:()=>({top:0,bottom:200,height:200}),querySelectorAll:()=>messages};
  const context={state:{currentView:'chats',activeConversation:2},document:{hidden:false,querySelector:()=>holder},markConversationRead:(...args)=>read.push(args)};
  const mark=webFunction('markVisibleMessagesRead',context);
  mark(2,holder);assert.deepEqual(read,[[2,8]]);
  context.document.hidden=true;mark(2,holder);context.document.hidden=false;mark(3,holder);
  assert.equal(read.length,1);
});

test('web unread conversation markup highlights rows and escapes names', () => {
  const context={state:{user:{id:1},activeConversation:null},escapeHtml:value=>String(value).replaceAll('<','&lt;'),
    avatar:()=>'',onlineMarkup:()=>'',when:()=>'',unreadBadge:count=>count?`<b>${count}</b>`:''};
  const markup=webFunction('conversationMarkup',context);
  const chat={id:1,participants:[{id:2}],display_name:'<Maya>',unread_count:3};
  const unread=markup(chat);assert.match(unread,/conversation  unread/);assert.match(unread,/3 unread messages/);assert.match(unread,/&lt;Maya>/);
  assert.doesNotMatch(markup({...chat,unread_count:0}),/conversation  unread/);
});

test('opening the web notifications list does not mark anything read', async () => {
  const requests=[],counts=[],holder={innerHTML:'',querySelector:()=>null};
  const context={notificationReadVersion:0,rows,document:{querySelector:()=>holder},
    api:async url=>{requests.push(url);return [{id:1,is_read:false},{id:2,is_read:true}];},
    notificationMarkup:item=>item.is_read?'read':'unread',syncNotificationBadges:count=>counts.push(count)};
  await webFunction('refreshNotificationsList',context)();
  assert.deepEqual(requests,['/notifications/']);assert.deepEqual(counts,[1]);assert.match(holder.innerHTML,/unread/);
});

test('web message refresh never marks or renders a thread left during loading', async () => {
  const pending=deferred(), holder={dataset:{},innerHTML:'Old thread'};let reads=0;
  const context={rows,state:{currentView:'chats',activeConversation:2},document:{hidden:false,querySelector:()=>holder},
    api:()=>pending.promise,markVisibleMessagesRead:()=>reads++,messageMarkup:()=>'<div>New</div>'};
  const refresh=webFunction('refreshMessageList',context)(2);context.state.activeConversation=3;
  pending.resolve([{id:7}]);await refresh;
  assert.equal(holder.innerHTML,'Old thread');assert.equal(reads,0);
});

test('web keeps scroll position and only acknowledges visible messages when new messages arrive', async () => {
  const holder={dataset:{loaded:'true'},innerHTML:'',scrollHeight:1000,clientHeight:200,scrollTop:100};let checked;
  const context={rows,state:{currentView:'chats',activeConversation:2},document:{hidden:false,querySelector:()=>holder},api:async()=>[{id:7}],
    markVisibleMessagesRead:(id,node)=>{checked=node;},messageMarkup:()=>'<div>New</div>'};
  await webFunction('refreshMessageList',context)(2);
  assert.equal(holder.scrollTop,100);assert.equal(checked,holder);
});

test('viewer waits for dimensions and never treats a downsampled load event as the original size', () => {
  const viewer = imageViewerHarness();
  viewer.render(); assert.equal(viewer.images().length, 0);
  viewer.measure(); viewer.render(); assert.equal(viewer.images().length, 0);
  viewer.requests[0].success(1920, 1280); viewer.render();
  assert.equal(viewer.images().length, 1);
  assert.equal(viewer.images()[0].props.source.width, 1920);
  viewer.images()[0].props.onLoad({nativeEvent: {source: {width: 1, height: 1}}});
  viewer.render();
  assert.equal(viewer.images()[0].props.source.width, 1920);
  assert.equal(viewer.images()[0].props.source.height, 1280);
  assert.equal(viewer.byLabel('Zoom in').props.disabled, false);
});

test('photo dimension failures can be retried without mounting a tiny image', () => {
  const viewer = imageViewerHarness(); viewer.render(); viewer.measure();
  viewer.requests[0].failure(Error('Offline')); viewer.render();
  assert.equal(viewer.images().length, 0);
  assert.equal(viewer.byLabel('Zoom in').props.disabled, true);
  viewer.byLabel('Retry loading photo').props.onPress(); viewer.render();
  assert.equal(viewer.requests.length, 2);
  viewer.requests[1].success(1920, 1280); viewer.render();
  assert.equal(viewer.images().length, 1);
});

test('event calendars align weekdays and handle leap days and six-week months', () => {
  const {calendarDays, parseLocalDateTime} = pureModule('eventDateTime.ts');
  const leap = calendarDays(2028, 1);
  assert.equal(leap.filter(Boolean).length, 29); assert.equal(leap[0], null); assert.equal(leap[1], 1);
  assert.equal(calendarDays(2026, 1).filter(Boolean).length, 28);
  assert.equal(calendarDays(2026, 7).length, 42);
  assert.equal(parseLocalDateTime('2026-02-29T10:00'), null);
  assert.equal(parseLocalDateTime('2026-04-31T10:00'), null);
  assert.equal(parseLocalDateTime('2026-10-10T24:00'), null);
  assert.equal(parseLocalDateTime('2026-10-10T12:60'), null);
  assert.equal(parseLocalDateTime('2028-02-29T10:00').day, 29);
});

test('event dates retain local minutes through UTC conversion and handle noon and midnight', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Kolkata';
    const {dateParts, parseLocalDateTime, localDateTimeDate, localDateTimeValue, eventTimeLabel} = pureModule('eventDateTime.ts');
    const date = localDateTimeDate(parseLocalDateTime('2026-12-31T23:47'));
    assert.equal(date.toISOString(), '2026-12-31T18:17:00.000Z');
    assert.equal(localDateTimeValue(dateParts(new Date(date.toISOString()))), '2026-12-31T23:47');
    assert.equal(eventTimeLabel('2026-10-10T00:00'), '12:00 AM');
    assert.equal(eventTimeLabel('2026-10-10T12:00'), '12:00 PM');
    assert.equal(eventTimeLabel('2026-10-10T23:07'), '11:07 PM');
    process.env.TZ = 'America/New_York';
    assert.equal(parseLocalDateTime('2026-03-08T02:30'), null);
    assert.equal(localDateTimeDate(parseLocalDateTime('2026-03-08T03:30')).toISOString(), '2026-03-08T07:30:00.000Z');
  } finally {if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;}
});

test('moving a start beyond the end preserves duration across midnight and the year boundary', () => {
  const {updateEventSchedule} = pureModule('eventDateTime.ts');
  const original = {starts_at: '2026-12-30T18:00', ends_at: '2026-12-30T20:00'};
  const moved = updateEventSchedule(original, 'starts_at', '2026-12-31T23:00');
  assert.equal(moved.ends_at, '2027-01-01T01:00');
  assert.equal(updateEventSchedule(original, 'starts_at', '2026-12-30T19:00').ends_at, original.ends_at);
  assert.equal(updateEventSchedule(original, 'ends_at', '2026-12-31T01:00').starts_at, original.starts_at);
  assert.equal(original.ends_at, '2026-12-30T20:00');
});

function eventPickerHarness(props) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile/EventDateTimePicker.tsx'), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  let cursor = 0, rendered, canceled = false;
  const {themes} = pureModule('theme.ts');
  let theme = themes.light;
  const slots = [], saved = [];
  const jsx = (type, props) => ({type, props});
  const context = {exports: {}, require: name => {
    if (name === 'react') return {useState: initial => {
      const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];
    }};
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react-native') return {View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: {create: value => value}};
    if (name === '@expo/vector-icons') return {Ionicons: 'Icon'};
    if (name === 'react-native-safe-area-context') return {useSafeAreaInsets: () => ({top: 0, bottom: 0})};
    if (name === './Motion') return {SoftPressable: 'Pressable'};
    if (name === './ThemeProvider') return {useTheme: () => ({theme})};
    if (name === './themedStyles') return {createThemedStyles: factory => factory};
    if (name === './theme') return pureModule('theme.ts');
    if (name === './eventDateTime') return pureModule('eventDateTime.ts');
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  function all(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(all);
    return [node, ...all(node.props?.children)];
  }
  const render = () => {cursor = 0; rendered = context.exports.EventDateTimePicker({label: 'Start time', value: '2026-10-10T13:07', onConfirm: value => saved.push(value), onCancel: () => {canceled = true;}, ...props});};
  const byLabel = label => {const node = all(rendered).find(node => node.props?.accessibilityLabel === label || node.props?.accessibilityLabel === label + ', today'); assert.ok(node, label); return node.props;};
  render();
  return {render, saved, canceled: () => canceled, byLabel,
    switchTheme: scheme => {theme = themes[scheme]; render();},
    press: label => {const control = byLabel(label); assert.ok(!control.disabled); control.onPress(); render();},
    errors: () => all(rendered).filter(node => node.props?.accessibilityRole === 'alert').map(node => node.props.children),
  };
}

test('calendar picker selects dates, 12 AM, and exact minutes before confirming', () => {
  const picker = eventPickerHarness();
  picker.press('Next month');
  const day = new Date(2026, 10, 21).toLocaleDateString('en', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  picker.press(day); picker.press('AM'); picker.press('12 AM'); picker.press('45 minutes'); picker.press('Increase minutes');
  assert.equal(picker.saved.length, 0);
  picker.press('Confirm date and time'); assert.equal(picker.saved[0], '2026-11-21T00:46');
});

test('canceling a calendar draft does not change the saved schedule, and edits retain exact minutes', () => {
  const picker = eventPickerHarness();
  picker.press('Confirm date and time'); assert.equal(picker.saved[0], '2026-10-10T13:07');
  const canceled = eventPickerHarness();
  canceled.press('Next month'); canceled.press('AM'); canceled.press('30 minutes'); canceled.press('Cancel date and time changes');
  assert.equal(canceled.canceled(), true); assert.equal(canceled.saved.length, 0);
});

test('switching appearance keeps an open calendar and its unsaved date and time', () => {
  const picker = eventPickerHarness();
  picker.press('Next month'); picker.press('AM'); picker.press('45 minutes');
  const day = new Date(2026, 10, 21).toLocaleDateString('en', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  picker.press(day);
  picker.switchTheme('dark');
  assert.equal(picker.byLabel(day).accessibilityState.selected, true);
  picker.switchTheme('light');
  picker.press('Confirm date and time');
  assert.equal(picker.saved[0], '2026-11-21T01:45');
});

test('end picker disables earlier dates and rejects an equal or earlier time', () => {
  const picker = eventPickerHarness({label: 'End time', value: '2026-10-10T13:00', minimum: '2026-10-10T13:00'});
  const yesterday = new Date(2026, 9, 9).toLocaleDateString('en', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  assert.equal(picker.byLabel(yesterday).disabled, true);
  picker.press('Confirm date and time'); assert.equal(picker.saved.length, 0); assert.match(picker.errors()[0], /after the event starts/);
  picker.press('AM'); picker.press('Confirm date and time'); assert.equal(picker.saved.length, 0);
  picker.press('PM'); picker.press('2 PM'); picker.press('Confirm date and time');
  assert.equal(picker.saved[0], '2026-10-10T14:00');
});

function searchContext(api) {
  const exploreSearch = {version: 0, items: [], count: 0, page: 0, more: false, loading: false, error: ''};
  const state = {currentView: 'explore', viewVersion: 1, exploreKind: 'events', exploreQuery: 'coffee', nearby: null};
  const context = {state, exploreSearch, api, rows, AbortController, encodeURIComponent, clearTimeout,
    renderSearchResults: () => {}, cancelExploreSearch: () => {exploreSearch.version++; exploreSearch.controller?.abort();}};
  return {state, exploreSearch, request: webFunction('requestExploreSearch', context)};
}

test('search switches categories without allowing late events to replace people', async () => {
  const events = deferred(), people = deferred(), calls = [];
  const search = searchContext((path, options) => {calls.push({path, options}); return path.startsWith('/events/') ? events.promise : people.promise;});
  const first = search.request();
  search.state.exploreKind = 'people';
  const second = search.request();
  people.resolve({results: [{id: 2}], count: 1, next: null}); await second;
  events.resolve({results: [{id: 1}], count: 1, next: null}); await first;
  assert.deepEqual(Array.from(search.exploreSearch.items, item => item.id), [2]);
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls[1].options.singlePage, true);
  assert.equal(search.state.exploreQuery, 'coffee');
});

test('a newer search ignores an old failure and preserves its count', async () => {
  const old = deferred(), latest = deferred();
  const search = searchContext(path => path.includes('coffee') ? old.promise : latest.promise);
  const first = search.request(); search.state.exploreQuery = 'maya'; const second = search.request();
  latest.resolve({results: [{id: 9}], count: 1}); await second;
  old.reject(Error('Old request failed')); await first;
  assert.equal(search.exploreSearch.error, ''); assert.equal(search.exploreSearch.count, 1);
  assert.equal(search.exploreSearch.items[0].id, 9);
});

test('leaving search discards its outstanding response', async () => {
  const pending = deferred(); const search = searchContext(() => pending.promise);
  const request = search.request(); search.state.currentView = 'profile'; search.state.viewVersion++;
  pending.resolve({results: [{id: 9}], count: 1}); await request;
  assert.equal(search.exploreSearch.items.length, 0);
});

test('search pagination retains results on failure, retries the same page, and prevents double loads', async () => {
  let calls = 0; const pending = deferred();
  const search = searchContext(async path => {
    calls++;
    if (calls === 1) return {results: [{id: 1}], count: 2, next: '/api/events/?q=coffee&page=2'};
    assert.match(path, /page=2/);
    if (calls === 2) throw Error('Offline');
    return pending.promise;
  });
  await search.request(); await search.request(true);
  assert.equal(search.exploreSearch.items[0].id, 1); assert.equal(search.exploreSearch.error, 'Offline');
  const retry = search.request(true); await search.request(true);
  assert.equal(calls, 3); pending.resolve({results: [{id: 2}], count: 2, next: null}); await retry;
  assert.deepEqual(Array.from(search.exploreSearch.items, item => item.id), [1, 2]);
  assert.equal(search.exploreSearch.more, false); assert.equal(search.exploreSearch.error, '');
});

function nativeSearchContext() {
  const tree = ts.createSourceFile('DiscoverSearch.tsx', fs.readFileSync(path.join(root, 'mobile/DiscoverSearch.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = find(tree, node => ts.isVariableDeclaration(node) && node.name.getText(tree) === 'requestSearch');
  const code = ts.transpileModule('(' + node.initializer.getText(tree) + ')', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const state = {loading: false, error: '', results: {key: '', items: [], page: 0}};
  const context = {apiRef: {current: null}, controller: {current: null}, requestVersion: {current: 1}, inFlight: {current: false},
    kind: 'events', term: 'coffee', key: 'coffee-events', nearby: false, nearbyEvents: null, AbortController,
    setLoading: value => {state.loading = value;}, setError: value => {state.error = value;},
    setResults: update => {state.results = update(state.results);}};
  return {state, context, request: vm.runInNewContext(code, context)};
}

test('native search rejects stale results and failures after a tab/query change', async () => {
  const old = deferred(), current = deferred(); const search = nativeSearchContext();
  search.context.apiRef.current = path => path.startsWith('/events/') ? old.promise : current.promise;
  const first = search.request(1, 1);
  search.context.kind = 'people'; search.context.key = 'coffee-people'; search.context.requestVersion.current = 2;
  const second = search.request(1, 2);
  current.resolve({results: [{id: 7}], count: 1}); await second;
  old.reject(Error('Stale failure')); await first;
  assert.equal(search.state.error, ''); assert.equal(search.state.results.items[0].id, 7);
  assert.equal(search.state.loading, false); assert.equal(search.context.inFlight.current, false);
});

test('native pagination appends in ranked order and keeps failed pages retryable', async () => {
  const search = nativeSearchContext(); const paths = [];
  search.context.apiRef.current = async (path, options) => {paths.push(path); assert.equal(options.singlePage, true); return {results: [{id: 1}], count: 2, next: 'next'};};
  await search.request(1, 1);
  search.context.apiRef.current = async () => {throw Error('Offline');};
  await search.request(2, 1);
  assert.equal(search.state.results.items.length, 1); assert.equal(search.state.results.page, 1);
  search.context.apiRef.current = async path => {paths.push(path); return {results: [{id: 2}], count: 2, next: null};};
  await search.request(2, 1);
  assert.deepEqual(Array.from(search.state.results.items, item => item.id), [1, 2]);
  assert.equal(search.state.results.more, false); assert.equal(search.state.error, '');
  assert.match(paths[1], /page=2/);
});

test('native and web search requests fetch one page while other callers still follow pagination', async () => {
  for (const platform of ['native', 'web']) {
    let calls = 0;
    const context = {token: 'session', sessionToken: {current: 'session'}, API_URL: 'https://example.test/api',
      state: {viewVersion: 1}, localStorage: {getItem: () => 'session'}, TOKEN_KEY: 'token', FormData, URL, rows,
      fetch: async () => {calls++; return {status: 200, ok: true, json: async () => ({results: [{id: 1}], count: 22, next: 'https://example.test/api/events/?page=2'})};}};
    const api = platform === 'native' ? nativeFunction('api', context) : webFunction('api', context);
    const response = await api('/events/?q=coffee', {singlePage: true});
    assert.equal(calls, 1); assert.equal(response.count, 22); assert.ok(response.next);
  }
});


function eventSheetHarness({height = 844, top = 44, bottom = 34, eventId = 5} = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile/EventDetailsSheet.tsx'), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  let closes = 0;
  const jsx = (type, props, key) => ({type, props, key});
  const context = {exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react-native') return {ScrollView: 'ScrollView', View: 'View', Text: 'Text',
      useWindowDimensions: () => ({width: 390, height}), StyleSheet: {create: value => value, absoluteFill: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0}}};
    if (name === 'react-native-safe-area-context') return {useSafeAreaInsets: () => ({top, bottom, left: 0, right: 0})};
    if (name === '@expo/vector-icons') return {Ionicons: 'Icon'};
    if (name === './Motion') return {MotionModal: 'Modal', SoftPressable: 'Pressable'};
    if (name === './ThemeProvider') return {useTheme: () => ({theme: pureModule('theme.ts').themes.light})};
    if (name === './themedStyles') return {createThemedStyles: factory => factory};
    if (name === './theme') return pureModule('theme.ts');
    throw Error('Unexpected import: ' + name);
  }};
  vm.runInNewContext(code, context);
  const content = {type: 'LongEvent', props: {description: 'A long event description. '.repeat(80)}};
  const tree = context.exports.EventDetailsSheet({visible: true, eventId, onClose: () => closes++, children: content});
  const nodes = [];
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(child => visit(child, ancestors));
    nodes.push({node, ancestors}); visit(node.props?.children, [...ancestors, node]);
  }
  visit(tree);
  return {tree, content, nodes, closes: () => closes};
}

test('long event details have a bounded scroll view without pressable gesture ancestors', () => {
  for (const height of [390, 740, 844]) {
    const sheet = eventSheetHarness({height});
    const {node: scroll, ancestors} = sheet.nodes.find(item => item.node.type === 'ScrollView');
    assert.equal(scroll.props.children, sheet.content);
    assert.equal(scroll.props.style.flex, 1);
    assert.equal(scroll.props.style.minHeight, 0);
    assert.equal(scroll.props.nestedScrollEnabled, true);
    assert.equal(ancestors.some(node => node.type === 'Pressable' || node.props?.onPress), false);
    const surface = ancestors.at(-1);
    const styles = Object.assign({}, ...surface.props.style);
    assert.ok(styles.height > 0 && styles.height <= height - 44 - 8);
    const contentStyle = Object.assign({}, ...scroll.props.contentContainerStyle);
    assert.ok(contentStyle.paddingBottom >= 34);
    assert.equal(contentStyle.flex, undefined, 'Long content must be allowed to exceed the viewport');
  }
});

test('event close controls remain outside the scrolling content and all dismiss the sheet', () => {
  const sheet = eventSheetHarness();
  const close = sheet.nodes.find(item => item.node.props?.accessibilityLabel === 'Close event details');
  assert.equal(close.ancestors.some(node => node.type === 'ScrollView'), false);
  close.node.props.onPress();
  const backdrop = sheet.nodes.find(item => item.node.type === 'Pressable' && item.node.props.accessible === false);
  backdrop.node.props.onPress(); sheet.tree.props.onRequestClose();
  assert.equal(sheet.closes(), 3);
});

test('event scroll identity resets between events and stays stable when the current event refreshes', () => {
  const scrollKey = id => eventSheetHarness({eventId: id}).nodes.find(item => item.node.type === 'ScrollView').node.key;
  assert.equal(scrollKey(5), scrollKey(5)); assert.notEqual(scrollKey(5), scrollKey(6));
});

test('iOS publishing waits for editor dismissal before exposing the saved event sheet', () => {
  const sheet = find(native, node => ts.isJsxOpeningElement(node) && node.tagName.getText(native) === 'EventDetailsSheet');
  const visible = sheet.attributes.properties.find(prop => prop.name?.getText(native) === 'visible').initializer.expression.getText(native);
  const editor = find(native, node => ts.isJsxOpeningElement(node) && node.tagName.getText(native) === 'Modal'
    && node.attributes.properties.some(prop => prop.name?.getText(native) === 'visible' && prop.initializer?.expression?.getText(native) === '!!eventEditor'));
  const dismissed = editor.attributes.properties.find(prop => prop.name?.getText(native) === 'onDismiss').initializer.expression.getText(native);
  for (const platform of ['ios', 'android']) {
    let keyboardDismissed = false;
    const context = {Platform: {OS: platform}, Keyboard: {dismiss: () => {keyboardDismissed = true;}},
      eventEditorVersion: {current: 1}, eventLocationRequest: {current: 1},
      selectedEvent: {id: 12}, eventEditor: {name: 'Posted event'}, eventEditorClosing: false,
      composeOpen: false, selectedUser: null, peoplePanel: null, commentPost: null, editingPost: null,
      setEventDateField: noop, setEventLocating: noop, setEventLocationStatus: noop};
    context.setEventEditor = value => {context.eventEditor = value;};
    context.setEventEditorClosing = value => {context.eventEditorClosing = value;};
    nativeFunction('closeEventEditor', context)();
    assert.equal(keyboardDismissed, true);
    assert.equal(vm.runInNewContext(visible, context), platform !== 'ios');
    vm.runInNewContext('(' + dismissed + ')()', context);
    assert.equal(vm.runInNewContext(visible, context), true);
  }
});
