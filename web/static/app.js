const TOKEN_KEY = 'socialquest_token';
const token = localStorage.getItem(TOKEN_KEY);
if (!token) window.location.replace('/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search));

const view = document.querySelector('#view');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
const state = { user: null, currentView: 'home', activeConversation: null, chatOpen: false, conversations: [], profileId: null, profileTab: 'moments', eventId: null, postId: null, openPostId: null, eventQuests: [], messagePoll: null, notificationPoll: null, notificationUnread: 0, exploreQuery: '', nearby: null, nearbyStatus: '', share: null };

document.documentElement.classList.add('dark');
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#050916');
async function logout() {
  try { await api('/auth/logout/', {method:'POST'}); } catch (_) { /* Clearing the local credential still safely ends this session. */ }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('socialquest_user');
  window.location.replace('/login/');
}

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const rows = data => data?.results || data || [];
const initials = person => (person?.display_name || person?.username || 'S').trim().slice(0, 1).toUpperCase();
const avatar = (person, className = '') => `<span class="avatar ${className}" ${person?.avatar ? `style="background-image:url('${escapeHtml(person.avatar)}')"` : ''}>${person?.avatar ? '' : initials(person)}</span>`;
const reactionLabel = reaction => ({LIKE:'♥ Like', DISLIKE:'× Dislike', NONE:'— None'})[reaction] || '— None';
function shareLink(title, text, path) {
  const url = new URL(path, window.location.origin).toString();
  state.share = {title, text, url};
  showModal(`<div class="share-dialog"><p class="eyebrow">SHARE</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><label class="share-link-field">Shareable link<input id="share-link" value="${escapeHtml(url)}" readonly aria-label="Shareable link"></label><div class="share-options"><button class="share-copy" data-action="copy-share-link">Copy link</button><button class="submit" data-action="open-native-share">Share using apps →</button></div></div>`);
}
async function copyShareLink() {
  if (!state.share?.url) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(state.share.url);
    const button = document.querySelector('[data-action="copy-share-link"]');
    if (button) { button.textContent = 'Copied ✓'; button.disabled = true; }
  } catch (error) {
    window.prompt('Copy this link', state.share.url);
  }
}
async function openNativeShare() {
  if (!state.share) return;
  if (!navigator.share) return copyShareLink();
  try {
    await navigator.share(state.share);
    closeModal();
  } catch (error) {
    if (error?.name !== 'AbortError') alert('Could not open sharing options.');
  }
}
const when = date => { const seconds = Math.max(0, (Date.now() - new Date(date)) / 1000); if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return new Date(date).toLocaleDateString('en', {month:'short', day:'numeric'}); };
const eventDate = date => new Date(date).toLocaleDateString('en', {weekday:'short', month:'short', day:'numeric'});

async function api(path, options = {}) {
  const headers = {Authorization: `Token ${localStorage.getItem(TOKEN_KEY)}`, ...(options.headers || {})};
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {...options, headers});
  if (response.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.replace('/login/'); throw new Error('Signed out'); }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || Object.values(data).flat?.().join(' ') || 'Something went wrong.');
  return data;
}
function setNav(active) {
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === active));
}
function routeUrl(name, profileId, eventId, postId) {
  const params = new URLSearchParams();
  if (name !== 'home') params.set('view', name);
  if (name === 'profile' && profileId) params.set('profile', String(profileId));
  if (name === 'event' && eventId) params.set('event', String(eventId));
  if (name === 'post' && postId) params.set('post', String(postId));
  const query = params.toString();
  return query ? '/?' + query : '/';
}
function routeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('view') || 'home';
  const valid = ['home', 'explore', 'reels', 'chats', 'notifications', 'profile', 'event', 'post'];
  return {
    name: valid.includes(requested) ? requested : 'home',
    profileId: Number(params.get('profile')) || null,
    eventId: Number(params.get('event')) || null,
    postId: Number(params.get('post')) || null,
  };
}
function addPostControls() {
  if (!state.user) return;
  document.querySelectorAll('.post').forEach(card => {
    const authorId = Number(card.querySelector('.post-person')?.dataset.id);
    const actions = card.querySelector('.post-actions');
    const postId = card.querySelector('[data-action="like"]')?.dataset.id;
    if (authorId !== state.user.id || !actions || !postId || actions.querySelector('.post-manage')) return;
    actions.insertAdjacentHTML('beforeend', '<span class="post-manage"><button data-action="edit-post" data-id="' + postId + '">Edit</button><button data-action="delete-post" data-id="' + postId + '">Delete</button></span>');
  });
}
const postControlObserver = new MutationObserver(addPostControls);
postControlObserver.observe(view, {childList:true, subtree:true});
function syncNotificationBadges(count) {
  state.notificationUnread = count;
  document.querySelectorAll('[data-notification-count]').forEach(badge => {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = !count;
  });
}
async function loadNotificationBadge() {
  try {
    const notifications = rows(await api('/notifications/'));
    syncNotificationBadges(notifications.filter(notification => !notification.is_read).length);
  } catch (_) { /* A failed badge request should never interrupt the app. */ }
}
function startNotificationPolling() {
  if (state.notificationPoll) window.clearInterval(state.notificationPoll);
  state.notificationPoll = window.setInterval(loadNotificationBadge, 15000);
}
function notificationMarkup(notification) {
  const detail = notification.event ? notification.event.name : notification.kind === 'MESSAGE' ? 'Open chat' : 'SocialQuest';
  const action = notification.event ? 'notification-event' : notification.conversation_id ? 'notification-chat' : '';
  const target = notification.event ? ' data-event-id="' + notification.event.id + '"' : notification.conversation_id ? ' data-conversation-id="' + notification.conversation_id + '"' : '';
  return '<button class="notification-row ' + (!notification.is_read ? 'unread' : '') + '" data-action="' + action + '"' + target + '><span class="notification-symbol">' + (notification.kind === 'MESSAGE' ? '✉' : '✦') + '</span><span><strong>' + escapeHtml(notification.text) + '</strong><small>' + escapeHtml(detail) + ' · ' + when(notification.created_at) + '</small></span></button>';
}
async function renderNotifications() {
  view.innerHTML = header('STAY IN THE LOOP', 'Your <em>notifications.</em>', '<button class="header-action" data-action="mark-notifications-read">Mark all read</button>') + '<section class="notifications-list"><p class="empty">Loading notifications…</p></section>';
  try {
    const notifications = rows(await api('/notifications/'));
    const holder = document.querySelector('.notifications-list');
    holder.innerHTML = notifications.length ? notifications.map(notificationMarkup).join('') : '<div class="empty">Nothing new yet. RSVP activity and messages will appear here.</div>';
    const unreadIds = notifications.filter(notification => !notification.is_read).map(notification => notification.id);
    if (unreadIds.length) await api('/notifications/mark-read/', {method:'POST', body:JSON.stringify({ids:unreadIds})});
    syncNotificationBadges(0);
  } catch (error) { document.querySelector('.notifications-list').innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>'; }
}
function header(kicker, title, action = '') { return `<header class="view-header"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1></div>${action}</header>`; }
function commentControls(comment) { return comment.author.id === state.user.id ? `<span class="comment-controls"><button data-action="edit-comment" data-id="${comment.id}" data-body="${escapeHtml(comment.body)}">Edit</button><button data-action="delete-comment" data-id="${comment.id}">Delete</button></span>` : ''; }
function commentMarkup(comment) { return `<div class="comment" data-comment-id="${comment.id}"><button class="comment-person" data-action="open-profile" data-id="${comment.author.id}">${escapeHtml(comment.author.display_name || comment.author.username)}</button><span>${escapeHtml(comment.body)}</span>${commentControls(comment)}</div>`; }
function postMarkup(post) {
  const media = post.media ? (post.kind === 'REEL' ? `<video class="post-media" src="${escapeHtml(post.media)}" controls playsinline></video>` : `<img class="post-media" src="${escapeHtml(post.media)}" alt="Post by ${escapeHtml(post.author.display_name)}" />`) : '';
  const comments = (post.recent_comments || []).map(commentMarkup).join('');
  const questTag = post.quest_title ? `<p class="quest-post-tag">✦ Quest proof · ${escapeHtml(post.quest_title)}</p>` : '';
  const recommendation = post.recommendation_reason ? `<p class="recommendation-tag">For you · ${escapeHtml(post.recommendation_reason)}</p>` : '';
  return `<article class="post" data-post-id="${post.id}"><div class="post-head"><button class="post-person" data-action="open-profile" data-id="${post.author.id}">${avatar(post.author)}<span class="person-line"><strong>${escapeHtml(post.author.display_name || post.author.username)}</strong><span>@${escapeHtml(post.author.username)}</span><small>${when(post.created_at)} ${post.location_name ? `· ⌖ ${escapeHtml(post.location_name)}` : ''}</small></span></button></div>${recommendation}${questTag}${post.body ? `<p class="post-body">${escapeHtml(post.body)}</p>` : ''}${media}<p class="post-meta">${post.kind === 'REEL' ? '◉ Reel' : '✦ Community moment'}</p><div class="post-actions"><button class="${post.liked_by_me ? 'liked' : ''}" data-action="like" data-id="${post.id}" data-liked="${post.liked_by_me}" aria-pressed="${post.liked_by_me}" aria-label="${post.liked_by_me ? 'Unlike' : 'Like'} this post">♥ ${post.like_count}</button><button data-action="focus-comment" data-id="${post.id}">◌ ${post.comment_count} replies</button><button data-action="share-post" data-id="${post.id}">↗ Share</button></div><div class="comments">${comments}<form class="comment-form" data-post="${post.id}"><input aria-label="Reply to post" placeholder="Add a kind reply..." maxlength="500" /><button>Reply</button></form></div></article>`;
}
function postDetailMarkup(post, comments) {
  const authorName = post.author.display_name || post.author.username;
  const media = post.media
    ? post.kind === 'REEL'
      ? `<video src="${escapeHtml(post.media)}" controls playsinline></video>`
      : `<img src="${escapeHtml(post.media)}" alt="Post by ${escapeHtml(authorName)}">`
    : '<div class="post-detail-media-fallback">✦</div>';
  const commentList = comments.length
    ? comments.map(comment => `<article class="post-detail-comment" data-comment-id="${comment.id}"><button class="post-person" data-action="open-profile" data-id="${comment.author.id}">${avatar(comment.author)}<span class="person-line"><strong>${escapeHtml(comment.author.display_name || comment.author.username)}</strong><small>${when(comment.created_at)}</small></span></button><p>${escapeHtml(comment.body)}</p>${commentControls(comment)}</article>`).join('')
    : '<p class="post-detail-empty">Start the conversation with a kind reply.</p>';
  return `<article class="post-detail-dialog" data-post-id="${post.id}"><section class="post-detail-media">${media}</section><section class="post-detail-content"><button class="post-person" data-action="open-profile" data-id="${post.author.id}">${avatar(post.author)}<span class="person-line"><strong>${escapeHtml(authorName)}</strong><span>@${escapeHtml(post.author.username)}</span><small>${when(post.created_at)} ${post.location_name ? `· ⌖ ${escapeHtml(post.location_name)}` : ''}</small></span></button>${post.body ? `<p class="post-detail-body">${escapeHtml(post.body)}</p>` : ''}<div class="post-detail-actions"><button class="${post.liked_by_me ? 'liked' : ''}" data-action="like" data-id="${post.id}" data-liked="${post.liked_by_me}" aria-pressed="${post.liked_by_me}" aria-label="${post.liked_by_me ? 'Unlike' : 'Like'} this post">♥ ${post.like_count}</button><button data-action="focus-detail-comment" data-id="${post.id}">◌ ${post.comment_count} replies</button><button data-action="share-post" data-id="${post.id}">↗ Share</button></div><section class="post-detail-replies"><h3>Replies</h3>${commentList}</section><form class="post-detail-comment-form" data-post="${post.id}"><input aria-label="Reply to post" placeholder="Write a kind reply…" maxlength="500" required><button>Reply</button></form></section></article>`;
}
async function fetchPostDetail(postId) {
  const [post, commentData] = await Promise.all([api(`/posts/${postId}/`), api(`/comments/?post=${postId}`)]);
  return {post, comments: rows(commentData)};
}
async function renderPostModal(postId) {
  const detail = await fetchPostDetail(postId);
  modalContent.innerHTML = postDetailMarkup(detail.post, detail.comments);
}
async function openPostModal(postId) {
  if (!postId) return;
  state.openPostId = postId;
  showModal('<div class="post-detail-loading">Loading moment…</div>', 'post-modal');
  try {
    await renderPostModal(postId);
  } catch (error) {
    modalContent.innerHTML = `<div class="post-detail-loading">${escapeHtml(error.message)}</div>`;
  }
}
function setPostLikeUI(postId, liked, likeCount) {
  document.querySelectorAll('button[data-action="like"]').forEach(likeButton => {
    if (likeButton.dataset.id !== String(postId)) return;
    likeButton.dataset.liked = String(liked);
    likeButton.classList.toggle('liked', liked);
    likeButton.setAttribute('aria-pressed', String(liked));
    likeButton.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} this post`);
    likeButton.textContent = `♥ ${likeCount}`;
  });
}
async function togglePostLike(button) {
  const postId = button?.dataset.id;
  if (!postId || button.disabled) return;
  const liked = button.dataset.liked === 'true';
  const previousCount = Number((button.textContent || '').match(/\d+/)?.[0] || 0);
  const nextLiked = !liked;
  setPostLikeUI(postId, nextLiked, Math.max(0, previousCount + (nextLiked ? 1 : -1)));
  document.querySelectorAll('button[data-action="like"]').forEach(likeButton => {
    if (likeButton.dataset.id === String(postId)) likeButton.disabled = true;
  });
  try {
    const result = await api(`/posts/${postId}/like/`, {method: liked ? 'DELETE' : 'POST'});
    setPostLikeUI(postId, result.liked, result.like_count);
  } catch (error) {
    setPostLikeUI(postId, liked, previousCount);
    alert(error.message);
  } finally {
    document.querySelectorAll('button[data-action="like"]').forEach(likeButton => {
      if (likeButton.dataset.id === String(postId)) likeButton.disabled = false;
    });
  }
}
function clearMediaPreview(form) {
  const preview = form?.querySelector('[data-media-preview]');
  if (!preview) return;
  if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
  delete preview.dataset.objectUrl;
  preview.hidden = true;
  preview.innerHTML = '';
}
function updateMediaPreview(input) {
  const form = input.closest('form');
  const preview = form?.querySelector('[data-media-preview]');
  const file = input.files?.[0];
  if (!preview) return;
  clearMediaPreview(form);
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  preview.dataset.objectUrl = objectUrl;
  preview.hidden = false;
  const media = file.type.startsWith('video/')
    ? `<video src="${objectUrl}" controls playsinline></video>`
    : `<img src="${objectUrl}" alt="Selected photo preview">`;
  preview.innerHTML = `<div class="media-preview-file">${media}<button type="button" class="media-preview-remove" data-action="clear-media-preview" aria-label="Remove selected media">×</button><div class="media-preview-meta"><span>${escapeHtml(file.name)}</span><button type="button" data-action="change-media-preview">Change</button></div></div>`;
}
function composer() { return `<form class="composer" id="composer"><div class="composer-top">${avatar(state.user, 'avatar-me')}<textarea name="body" maxlength="1200" placeholder="What happened on your quest today?"></textarea></div><div class="media-preview" data-media-preview hidden></div><div class="composer-actions"><label class="media-label">▧ Add photo / reel<input name="media" type="file" accept="image/*,video/*" /></label><select class="select-kind" name="kind"><option value="POST">Post</option><option value="REEL">Reel</option></select><button class="post-button">Share moment</button></div></form>`; }
function homeQuestMarkup(event) {
  const art = event.cover_image
    ? `<img src="${escapeHtml(event.cover_image)}" alt="${escapeHtml(event.name)}">`
    : `<span>${event.name.trim().slice(0, 1).toUpperCase() || '✦'}</span>`;
  return `<button class="home-quest-card" data-action="event-detail" data-id="${event.id}"><span class="home-quest-art">${art}<small>${event.quest_status === 'ACTIVE' ? 'LIVE NOW' : 'QUEST READY'}</small></span><span class="home-quest-copy"><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.location_name)} · ${eventDate(event.starts_at)}</small><em>+${event.quest_status === 'ACTIVE' ? '120' : '80'} XP</em></span><span class="home-quest-arrow">›</span></button>`;
}
async function renderHome() {
  const name = state.user?.display_name || state.user?.username || 'Adventurer';
  view.innerHTML = header('YOUR NEXT ADVENTURE', `Good evening, <em>${escapeHtml(name)}.</em>`, '<button class="header-action" data-action="refresh-feed">Refresh ↻</button>') + '<div class="quest-filter-row"><button class="quest-filter active" data-action="refresh-feed">For you</button><button class="quest-filter" data-view="explore">Nearby</button><button class="quest-filter" data-action="explore-people">Following</button><button class="quest-filter" data-view="reels">Popular</button></div><section class="home-quest-section"><div class="home-section-heading"><h2>Recommended quests</h2><button data-view="explore">See all</button></div><div class="home-quest-list"><p class="home-quest-loading">Finding quests for you…</p></div></section>' + composer() + '<div class="feed"><p class="empty">Loading moments…</p></div>';
  try {
    const [posts, eventData] = await Promise.all([api('/posts/for-you/?kind=POST'), api('/events/recommended/')]);
    const events = rows(eventData).slice(0, 2);
    const quests = document.querySelector('.home-quest-list');
    if (quests) quests.innerHTML = events.length ? events.map(homeQuestMarkup).join('') : '<p class="home-quest-loading">No quests yet. Start one for your community.</p>';
    document.querySelector('.feed').innerHTML = rows(posts).length ? rows(posts).map(postMarkup).join('') : '<div class="empty">No moments yet. Share the first tiny win from your day.</div>';
  } catch (error) { showFeedError(error); const quests = document.querySelector('.home-quest-list'); if (quests) quests.innerHTML = '<p class="home-quest-loading">Quest recommendations will appear here soon.</p>'; }
}
async function renderPostDetail() {
  view.innerHTML = header('SHARED MOMENT', 'Loading <em>moment…</em>', '<button class="header-action" data-view="home">‹ Back to home</button>') + '<div class="feed"><p class="empty">Finding the shared moment…</p></div>';
  try {
    const detail = await fetchPostDetail(state.postId);
    view.innerHTML = header('SHARED MOMENT', 'A community <em>moment.</em>', '<button class="header-action" data-view="home">‹ Back to home</button>') + `<div class="post-detail-page">${postDetailMarkup(detail.post, detail.comments)}</div>`;
  } catch (error) { view.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
function showFeedError(error) { const feed = document.querySelector('.feed'); if (feed) feed.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
async function renderExplore() {
  const query = state.exploreQuery.trim();
  const exploreActions = `<div class="header-actions"><button class="header-action ${state.nearby ? 'nearby-active' : ''}" data-action="nearby-events">⌖ ${state.nearby ? 'Near me' : 'Nearby'}</button><button class="header-action" data-action="host-event">Host a quest +</button></div>`;
  view.innerHTML = header('MAKE A PLAN', 'Explore <em>adventures.</em>', exploreActions) + `<p class="nearby-status" data-nearby-status aria-live="polite">${escapeHtml(state.nearbyStatus)}</p><form class="discover-search" id="explore-search"><input name="q" value="${escapeHtml(query)}" maxlength="100" placeholder="Search events or people" aria-label="Search events or people" /><button>Search</button></form><div class="explore-grid"><p class="empty">Finding adventures nearby…</p></div>`;
  try {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
    const nearbySuffix = state.nearby ? `?latitude=${encodeURIComponent(state.nearby.latitude)}&longitude=${encodeURIComponent(state.nearby.longitude)}` : '';
    const [eventData, peopleData] = await Promise.all([query ? api(`/events/${suffix}`) : api(`/events/recommended/${nearbySuffix}`), query ? api(`/people/${suffix}`) : Promise.resolve([])]);
    const events = rows(eventData);
    const people = rows(peopleData);
    const eventCards = events.length ? events.map(event => `<article class="event-card event-card-link" data-action="event-detail" data-id="${event.id}"><div class="event-top"><div><p class="eyebrow">${eventDate(event.starts_at)}</p><h2>${escapeHtml(event.name)}</h2></div><span class="date-chip">${event.accepted_count}/${event.capacity}</span></div><p>${escapeHtml(event.description)}</p>${event.recommendation_reason ? `<span class="recommendation-tag event-recommendation">For you · ${escapeHtml(event.recommendation_reason)}</span>` : ''}<footer><button class="event-host-link" data-action="open-profile" data-id="${event.host.id}">⌖ ${escapeHtml(event.location_name)} · Hosted by ${escapeHtml(event.host.display_name || event.host.username)} · ★ ${event.host.karma || 'new'}</button>${event.my_attendance_status ? `<b>${event.my_attendance_status.toLowerCase()}</b>` : event.is_finished ? '<b>requests closed</b>' : `<button class="request-button" data-action="join-event" data-id="${event.id}">Request to join</button>`}</footer></article>`).join('') : `<div class="empty">${query ? 'No matching events.' : 'No events yet. Be the person who starts one.'}</div>`;
    const peopleResults = query ? `<section class="people-results"><div class="detail-heading"><h2>People <span>${people.length}</span></h2><p>Matching “${escapeHtml(query)}”</p></div>${people.length ? people.map(person => `<button class="search-person" data-action="open-profile" data-id="${person.id}">${avatar(person)}<span><strong>${escapeHtml(person.display_name || person.username)}</strong><small>@${escapeHtml(person.username)} · ★ ${person.karma || 'new'} · ${person.xp} XP</small></span></button>`).join('') : '<p class="empty">No matching people.</p>'}</section>` : '';
    document.querySelector('.explore-grid').innerHTML = peopleResults + eventCards;
  } catch (error) { document.querySelector('.explore-grid').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
async function renderEventDetail() {
  view.innerHTML = header('ADVENTURE DETAILS', 'Loading <em>adventure…</em>', '<button class="header-action" data-view="explore">‹ Back to events</button>') + '<div class="event-detail"><p class="empty">Gathering the details…</p></div>';
  try {
    const event = await api(`/events/${state.eventId}/`);
    const [quests, attendees, ratingData, postData] = await Promise.all([
      api(`/events/${event.id}/quests/`),
      api(`/events/${event.id}/attendees/`),
      event.is_finished && event.my_attendance_status === 'ACCEPTED' ? api(`/ratings/?event=${event.id}`) : Promise.resolve([]),
      api(`/posts/?event=${event.id}`),
    ]);
    state.eventQuests = rows(quests);
    const eventPosts = rows(postData);
    const ratings = rows(ratingData);
    const isHost = event.host.id === state.user.id;
    const requests = isHost ? await api(`/events/${event.id}/requests/`) : [];
    const pending = requests.filter(request => request.status === 'PENDING');
    const requestWindowClosed = event.is_finished;
    const questEmptyMessage = event.quest_status === 'SCHEDULED' ? 'Quests unlock when the event starts.' : event.quest_status === 'EXPIRED' ? 'The quest window has ended.' : 'The host has not added quests yet.';
    const canSubmitQuest = event.quest_status === 'ACTIVE' && event.my_attendance_status === 'ACCEPTED';
    const questList = quests.length ? quests.map(quest => `<article class="quest-row"><span class="quest-kind ${quest.kind.toLowerCase()}">${quest.kind === 'MAIN' ? '✦ MAIN QUEST' : 'SIDE QUEST'}</span><div><h3>${escapeHtml(quest.title)} <small>+${quest.xp_reward} XP</small></h3><p>${escapeHtml(quest.instructions)}</p>${canSubmitQuest ? quest.my_submission ? `<span class="quest-submission-state">Proof ${escapeHtml(quest.my_submission.status.toLowerCase())}</span>` : `<button class="quest-submit" data-action="submit-quest" data-id="${quest.id}">Upload proof</button>` : ''}</div></article>`).join('') : `<p class="empty">${questEmptyMessage}</p>`;
    const eventMoments = `<section class="detail-section event-moments"><div class="detail-heading"><h2>Quest moments <span>${eventPosts.length}</span></h2><p>Proofs shared by people who joined this adventure.</p></div>${eventPosts.length ? eventPosts.map(postMarkup).join('') : '<p class="empty">Quest proofs shared by participants will appear here.</p>'}</section>`;
    const attendeeList = attendees.length ? attendees.map(attendance => `<button class="event-person" data-action="open-profile" data-id="${attendance.user.id}">${avatar(attendance.user)}<span><strong>${escapeHtml(attendance.user.display_name || attendance.user.username)}</strong><small>★ ${attendance.user.karma || 'new'} · ${attendance.user.xp} XP</small></span></button>`).join('') : '<p class="empty">Be the first person to join.</p>';
    const ratingsByTarget = new Map(ratings.map(rating => [rating.target.id, rating.reaction]));
    const ratingCandidates = attendees.filter(attendance => attendance.user.id !== state.user.id);
    const ratingPanel = event.is_finished && event.my_attendance_status === 'ACCEPTED' ? `<section class="detail-section rating-panel"><div class="detail-heading"><h2>Rate your fellow guests</h2><p>Only people accepted into this event can be rated.</p></div>${ratingCandidates.length ? `<div class="rating-list">${ratingCandidates.map(attendance => { const selected = ratingsByTarget.get(attendance.user.id); return `<article class="rating-row"><button class="rating-person" data-action="open-profile" data-id="${attendance.user.id}">${avatar(attendance.user)}<span><strong>${escapeHtml(attendance.user.display_name || attendance.user.username)}</strong><small>${selected ? `Your response: ${reactionLabel(selected)}` : 'Choose a response'}</small></span></button><div class="rating-actions">${['LIKE', 'DISLIKE', 'NONE'].map(reaction => `<button class="rating-choice ${selected === reaction ? 'selected' : ''}" aria-pressed="${selected === reaction}" data-action="rate-attendee" data-event-id="${event.id}" data-target-id="${attendance.user.id}" data-reaction="${reaction}">${reactionLabel(reaction)}</button>`).join('')}</div></article>`; }).join('')}</div>` : '<p class="empty">No other accepted attendees are available to rate.</p>'}</section>` : '';
    const hostControls = isHost ? `<section class="host-console"><div class="host-console-title"><div><p class="eyebrow">HOST CONSOLE</p><h2>Interested people <span>${pending.length}</span></h2></div><p>${requestWindowClosed ? 'Requests are closed because the event has ended.' : 'Review public XP and karma before deciding.'}</p></div><div class="request-list">${pending.length ? pending.map(attendance => `<article class="request"><button class="event-person" data-action="open-profile" data-id="${attendance.user.id}">${avatar(attendance.user)}<span><strong>${escapeHtml(attendance.user.display_name || attendance.user.username)}</strong><small>★ ${attendance.user.karma || 'new'} · ${attendance.user.xp} XP</small>${attendance.note ? `<em>“${escapeHtml(attendance.note)}”</em>` : ''}</span></button>${requestWindowClosed ? '<span class="attendance-state">requests closed</span>' : `<div class="request-actions"><button class="deny" data-action="review-request" data-event-id="${event.id}" data-attendance-id="${attendance.id}" data-decision="DENIED">Decline</button><button class="approve" data-action="review-request" data-event-id="${event.id}" data-attendance-id="${attendance.id}" data-decision="ACCEPTED">Accept</button></div>`}</article>`).join('') : '<p class="empty">No pending requests. Your community will find you.</p>'}</div></section>` : '';
    const join = event.host.id === state.user.id ? '<span class="you-host">You are hosting this adventure</span>' : event.my_attendance_status ? `<span class="attendance-state">${escapeHtml(event.my_attendance_status.toLowerCase())}</span>` : requestWindowClosed ? '<span class="attendance-state">requests closed</span>' : `<button class="request-button detail-request" data-action="join-event" data-id="${event.id}">Request to join ↗</button>`;
    const shareButton = `<button class="detail-share" data-action="share-event" data-id="${event.id}">↗ Share</button>`;
    view.innerHTML = `<header class="event-hero"><button class="back-link" data-view="explore">‹ All events</button><p class="eyebrow">${eventDate(event.starts_at)} · ${escapeHtml(event.location_name)}</p><h1>${escapeHtml(event.name)}</h1><p>${escapeHtml(event.description)}</p><div class="event-hero-footer"><button class="event-host" data-action="open-profile" data-id="${event.host.id}">${avatar(event.host)}<span>Hosted by <strong>${escapeHtml(event.host.display_name || event.host.username)}</strong><small>★ ${event.host.karma || 'new'} karma · ${event.host.xp} XP</small></span></button><div class="event-hero-actions">${shareButton}${join}</div></div></header><div class="event-detail"><section class="detail-section"><div class="detail-heading"><h2>The quest line</h2><span>${quests.length} quests</span></div>${questList}</section>${eventMoments}<section class="detail-section"><div class="detail-heading"><h2>Going <span>${event.accepted_count}/${event.capacity}</span></h2><p>Meet the people who are already in.</p></div><div class="attendee-list">${attendeeList}</div></section>${ratingPanel}${hostControls}</div>`;
  } catch (error) { view.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
async function renderReels() {
  view.innerHTML = header('SMALL MOMENTS, ON REPEAT', 'Quest <em>reels.</em>', '<button class="header-action" data-action="compose-reel">Share a reel +</button>') + '<div class="reel-grid"><p class="empty">Loading reels…</p></div>';
  try { const reels = rows(await api('/posts/?kind=REEL')); const grid = document.querySelector('.reel-grid'); grid.innerHTML = reels.length ? reels.map(reel => `<article class="reel">${reel.media ? `<video src="${escapeHtml(reel.media)}" muted loop controls playsinline></video>` : '<div class="reel-fallback">◉</div>'}<div class="reel-overlay"><button class="reel-person" data-action="open-profile" data-id="${reel.author.id}">${escapeHtml(reel.author.display_name || reel.author.username)}</button><p>${escapeHtml(reel.body || 'A moment worth keeping.')}</p><span>♥ ${reel.like_count}</span><button class="reel-share" data-action="share-post" data-id="${reel.id}">↗ Share</button></div></article>`).join('') : '<div class="empty">No reels yet. Share a 30-second piece of a good day.</div>'; } catch (error) { document.querySelector('.reel-grid').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
async function renderChats() {
  stopMessagePolling();
  view.innerHTML = header('KEEP THE CONVERSATION GOING', 'Your <em>chats.</em>', '<button class="header-action" data-action="new-chat">New chat +</button>') + '<section class="chats-layout' + (state.chatOpen ? ' chat-open' : '') + '"><aside class="conversation-list"><div class="conversation-list-top"><div><p>YOUR INBOX</p><h2>Messages</h2></div><button class="new-chat" data-action="new-chat" aria-label="Start a new chat">＋</button></div><div id="conversations"><p class="empty">Loading…</p></div></aside><section class="chat-panel" id="chat-panel"><div class="chat-empty"><span>✦</span><strong>Choose a conversation</strong><p>Start with someone who made a good impression.</p></div></section></section>';
  try {
    state.conversations = rows(await api('/conversations/'));
    const showingMobileInbox = window.matchMedia?.('(max-width: 720px)').matches && !state.chatOpen;
    if (showingMobileInbox) state.activeConversation = null;
    else if (!state.activeConversation && state.conversations[0]) state.activeConversation = state.conversations[0].id;
    renderConversationList();
    if (state.activeConversation) await renderMessages();
  } catch (error) { document.querySelector('#conversations').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
function renderConversationList() { const holder = document.querySelector('#conversations'); if (!holder) return; holder.innerHTML = state.conversations.length ? `<p class="conversation-count">${state.conversations.length} conversation${state.conversations.length === 1 ? '' : 's'}</p>${state.conversations.map(conversation => { const person = conversation.participants.find(person => person.id !== state.user.id) || state.user; const latest = conversation.latest_message; const preview = latest?.deleted_for_everyone ? 'Message deleted' : latest?.body || 'Start with a simple hello'; return `<button class="conversation ${conversation.id === state.activeConversation ? 'active' : ''}" data-action="open-chat" data-id="${conversation.id}">${avatar(person)}<span class="conversation-copy"><span class="conversation-top"><strong>${escapeHtml(conversation.display_name)}</strong><time>${latest ? escapeHtml(when(latest.created_at)) : ''}</time></span><small>${escapeHtml(preview)}</small></span>${conversation.id === state.activeConversation ? '<i aria-hidden="true"></i>' : ''}</button>`; }).join('')}` : '<div class="chat-list-empty"><span>✉</span><strong>No conversations yet</strong><p>Start a chat with someone you met.</p><button class="new-chat-inline" data-action="new-chat">Start a chat</button></div>'; }
function stopMessagePolling() { if (state.messagePoll) { window.clearInterval(state.messagePoll); state.messagePoll = null; } }
function messageMarkup(message) { const mine = message.sender.id === state.user.id; const deleted = message.deleted_for_everyone; const controls = !deleted ? `<button class="message-more" data-action="message-options" data-id="${message.id}" data-mine="${mine}" data-body="${escapeHtml(message.body)}" aria-label="Message options">•••</button>` : ''; return `<div class="message ${mine ? 'mine' : ''} ${deleted ? 'deleted' : ''}"><p>${deleted ? 'Message deleted' : escapeHtml(message.body)}</p><small>${mine ? 'You · ' : ''}${when(message.created_at)}${message.edited_at && !deleted ? ' · edited' : ''}</small>${controls}</div>`; }
async function refreshMessageList(conversationId) { if (state.currentView !== 'chats' || state.activeConversation !== conversationId) return; const holder = document.querySelector('.messages'); if (!holder) return; const shouldFollow = !holder.dataset.loaded || holder.scrollHeight - holder.scrollTop - holder.clientHeight < 90; try { const messages = rows(await api(`/messages/?conversation=${conversationId}`)); holder.innerHTML = messages.length ? messages.map(messageMarkup).join('') : '<div class="chat-empty"><span>✦</span><strong>This is a new conversation.</strong><p>A thoughtful hello is plenty.</p></div>'; holder.dataset.loaded = 'true'; if (shouldFollow) holder.scrollTop = holder.scrollHeight; } catch (error) { holder.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; } }
function startMessagePolling(conversationId) { stopMessagePolling(); state.messagePoll = window.setInterval(() => refreshMessageList(conversationId), 4000); }
async function renderMessages() {
  const conversation = state.conversations.find(row => row.id === state.activeConversation);
  if (!conversation) return;
  const person = conversation.participants.find(participant => participant.id !== state.user.id) || state.user;
  const panel = document.querySelector('#chat-panel');
  const emojis = ['😊', '😂', '❤️', '👍', '🎉', '✨', '👋', '🙌'];
  panel.innerHTML = `<header class="chat-thread-header"><button class="chat-list-back" data-action="chat-list" aria-label="Back to conversations">‹</button><button class="chat-thread-person" data-action="open-profile" data-id="${person.id}">${avatar(person)}<span><strong>${escapeHtml(conversation.display_name)}</strong><small>Direct conversation</small></span></button><div class="chat-thread-tools"><span class="chat-thread-presence">●</span><button class="chat-manage" data-action="manage-chat" data-id="${conversation.id}" aria-label="Manage chat">•••</button></div></header><div class="messages"><p class="empty">Loading…</p></div><form class="message-form" data-conversation="${conversation.id}"><span class="message-compose-mark">✦</span><span class="message-emoji-wrap"><button type="button" class="emoji-trigger" data-action="toggle-message-emojis" aria-label="Add an emoji" aria-expanded="false">☺</button><span class="message-emoji-picker" hidden>${emojis.map(emoji => `<button type="button" data-action="insert-message-emoji" data-emoji="${emoji}" aria-label="Add ${emoji}">${emoji}</button>`).join('')}</span></span><input maxlength="2000" placeholder="Write a thoughtful message…" required /><button aria-label="Send message">Send <span>↑</span></button></form>`;
  await refreshMessageList(conversation.id);
  startMessagePolling(conversation.id);
}
function profileEventMarkup(event, relationship) {
  const status = relationship === 'hosted'
    ? `Hosted · ${event.accepted_count}/${event.capacity} going`
    : event.is_finished ? 'Completed event' : `Attending · ${event.accepted_count}/${event.capacity} going`;
  return `<button class="profile-event-card" data-action="event-detail" data-id="${event.id}"><span class="profile-event-date">${escapeHtml(eventDate(event.starts_at))}</span><span class="profile-event-copy"><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.location_name)} · ${status}</small></span><span class="profile-event-arrow">›</span></button>`;
}
function selectProfileTab(tab) {
  if (!['moments', 'hosted', 'participated'].includes(tab)) return;
  state.profileTab = tab;
  document.querySelectorAll('[data-profile-tab]').forEach(tabButton => {
    const selected = tabButton.dataset.profileTab === tab;
    tabButton.classList.toggle('active', selected);
    tabButton.setAttribute('aria-selected', String(selected));
  });
  document.querySelectorAll('[data-profile-panel]').forEach(panel => {
    panel.hidden = panel.dataset.profilePanel !== tab;
  });
}
async function renderProfile() {
  view.innerHTML = '<section class="profile-hero"><p class="empty">Loading your profile…</p></section>';
  try {
    const isMe = !state.profileId || state.profileId === state.user.id;
    const person = isMe ? await api('/people/me/') : await api(`/people/${state.profileId}/`);
    if (isMe) { state.user = person; syncUser(); }
    const [posts, hostedEvents, participatedEvents] = await Promise.all([
      api(`/posts/?author=${person.id}`).then(rows),
      api(`/events/?host=${person.id}`).then(rows),
      api(`/events/?participant=${person.id}`).then(rows),
    ]);
    const profileActions = isMe
      ? `<div class="profile-actions"><button class="edit-profile" data-action="edit-profile">Edit profile</button><button class="edit-profile" data-action="share-profile" data-id="${person.id}">Share</button></div>`
      : `<div class="profile-actions"><button class="edit-profile ${person.is_followed_by_me ? 'following-profile' : ''}" data-action="follow-profile" data-id="${person.id}" data-following="${person.is_followed_by_me}">${person.is_followed_by_me ? 'Following' : 'Follow'}</button><button class="edit-profile" data-action="message-person" data-id="${person.id}">Message</button><button class="edit-profile" data-action="share-profile" data-id="${person.id}">Share</button></div>`;
    const displayName = person.display_name || person.username;
    const profilePhoto = `<button class="profile-avatar-button" data-action="preview-profile-photo" data-name="${escapeHtml(displayName)}" data-image="${escapeHtml(person.avatar || '')}" aria-label="Open ${escapeHtml(displayName)}'s profile photo">${avatar(person, 'profile-avatar')}<span class="profile-avatar-hint" aria-hidden="true">⌕</span></button>`;
    const activeTab = ['moments', 'hosted', 'participated'].includes(state.profileTab) ? state.profileTab : 'moments';
    const panel = (tab, content) => `<section class="profile-tab-panel" data-profile-panel="${tab}"${activeTab === tab ? '' : ' hidden'}>${content}</section>`;
    const moments = posts.length ? posts.map(postMarkup).join('') : `<div class="empty">${isMe ? 'Your story starts here. Share a moment after your next quest.' : 'No moments shared yet.'}</div>`;
    const hosted = hostedEvents.length ? `<div class="profile-events">${hostedEvents.map(event => profileEventMarkup(event, 'hosted')).join('')}</div>` : '<div class="empty">No hosted events yet.</div>';
    const participated = participatedEvents.length ? `<div class="profile-events">${participatedEvents.map(event => profileEventMarkup(event, 'participated')).join('')}</div>` : '<div class="empty">No participated events yet.</div>';
    view.innerHTML = `<section class="profile-hero"><div class="profile-top">${profilePhoto}${profileActions}</div><h1>${escapeHtml(displayName)}</h1><p class="profile-handle">@${escapeHtml(person.username)} · ${escapeHtml(person.city || 'Everywhere')}</p><p class="profile-bio">${escapeHtml(person.bio || 'Here for the little adventures that turn into real stories.')}</p><div class="scores"><div class="score"><strong>${person.xp}</strong><span>XP EARNED</span></div><div class="score"><strong>${person.karma ?? 0}</strong><span>KARMA</span></div><div class="score"><strong>${person.follower_count}</strong><span>FOLLOWERS</span></div></div></section><div class="profile-tabs" role="tablist"><button class="${activeTab === 'moments' ? 'active' : ''}" data-action="profile-tab" data-profile-tab="moments" role="tab" aria-selected="${activeTab === 'moments'}">Moments <small>${posts.length}</small></button><button class="${activeTab === 'hosted' ? 'active' : ''}" data-action="profile-tab" data-profile-tab="hosted" role="tab" aria-selected="${activeTab === 'hosted'}">Hosted <small>${hostedEvents.length}</small></button><button class="${activeTab === 'participated' ? 'active' : ''}" data-action="profile-tab" data-profile-tab="participated" role="tab" aria-selected="${activeTab === 'participated'}">Participated <small>${participatedEvents.length}</small></button><span class="profile-following">${person.following_count} following</span></div>${panel('moments', `<div class="feed">${moments}</div>`)}${panel('hosted', hosted)}${panel('participated', participated)}`;
  } catch (error) { view.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}
function syncUser() { if (!state.user) return; document.querySelector('#my-name').textContent = state.user.display_name || state.user.username; document.querySelector('#my-handle').textContent = `@${state.user.username}`; const mine = document.querySelector('#my-avatar'); mine.textContent = state.user.avatar ? '' : initials(state.user); if (state.user.avatar) mine.style.backgroundImage = `url('${state.user.avatar}')`; }
async function loadSide() { try { const [peopleData, eventData] = await Promise.all([api('/people/'), api('/events/recommended/')]); const people = rows(peopleData).filter(person => person.id !== state.user.id).slice(0, 3); document.querySelector('#people-suggestions').innerHTML = people.length ? people.map(person => `<div class="suggestion"><button class="suggestion-person" data-action="open-profile" data-id="${person.id}">${avatar(person)}<span class="suggestion-info"><strong>${escapeHtml(person.display_name || person.username)}</strong><span>★ ${person.karma || 'new'} · ${person.xp} XP</span></span></button><button class="follow-button ${person.is_followed_by_me ? 'following' : ''}" data-action="follow" data-id="${person.id}" data-following="${person.is_followed_by_me}">${person.is_followed_by_me ? 'Following' : 'Follow'}</button></div>`).join('') : '<p class="empty">Invite a friend to begin.</p>'; const events = rows(eventData).slice(0, 2); document.querySelector('#event-mini-list').innerHTML = events.length ? events.map(event => `<div class="mini-event"><span class="event-mark">✦</span><div><strong>${escapeHtml(event.name)}</strong><span>${event.recommendation_reason ? escapeHtml(event.recommendation_reason) + ' · ' : ''}${eventDate(event.starts_at)} · ${escapeHtml(event.location_name)}</span></div></div>`).join('') : '<p class="empty">No adventures yet.</p>'; } catch (_) { /* Sidebars are intentionally non-blocking. */ } }
function showModal(content, variant = '') { modal.className = variant; modalContent.innerHTML = content; modal.showModal(); }
function closeModal() { modal.close(); modal.className = ''; state.openPostId = null; }
function previewProfilePhoto(button) {
  const name = button.dataset.name || 'Profile photo';
  const image = button.dataset.image;
  const preview = image
    ? `<img class="profile-photo-preview" src="${escapeHtml(image)}" alt="${escapeHtml(name)}'s profile photo">`
    : `<div class="profile-photo-placeholder" aria-label="${escapeHtml(name)} has no profile photo">${escapeHtml(name.trim().slice(0, 1).toUpperCase() || 'S')}</div>`;
  showModal(`<div class="profile-photo-modal"><p class="eyebrow">PROFILE PHOTO</p><h2>${escapeHtml(name)}</h2>${preview}</div>`);
}
function editPostModal(post) {
  const postKind = post.kind === 'REEL' ? 'REEL' : 'POST';
  showModal('<div class="modal-inner"><h2>Edit your moment.</h2><p>Make the update you want your community to see.</p><form id="edit-post-form" data-id="' + post.id + '"><label>What happened?<textarea name="body" maxlength="1200">' + escapeHtml(post.body) + '</textarea></label><label>Location<input name="location_name" maxlength="120" value="' + escapeHtml(post.location_name) + '"></label><label>Post type<select name="kind"><option value="POST"' + (postKind === 'POST' ? ' selected' : '') + '>Post</option><option value="REEL"' + (postKind === 'REEL' ? ' selected' : '') + '>Reel</option></select></label><label>Replace photo or video (optional)<input type="file" name="media" accept="image/*,video/*"></label><div class="media-preview" data-media-preview hidden></div><button class="submit">Save changes →</button></form></div>');
}
function editCommentModal(button) { showModal(`<div class="modal-inner"><h2>Edit your reply.</h2><form id="edit-comment-form" data-id="${button.dataset.id}"><label>Your reply<textarea name="body" maxlength="500" required>${escapeHtml(button.dataset.body || '')}</textarea></label><button class="submit">Save reply →</button></form></div>`); }
function editMessageModal(button) { showModal(`<div class="modal-inner"><h2>Edit message.</h2><p>The updated message will be visible to everyone in this chat.</p><form id="edit-message-form" data-id="${button.dataset.id}"><label>Message<textarea name="body" maxlength="2000" required>${escapeHtml(button.dataset.body || '')}</textarea></label><button class="submit">Save message →</button></form></div>`); }
function messageOptionsModal(button) { const mine = button.dataset.mine === 'true'; const edit = mine ? `<button class="modal-action" data-action="edit-message" data-id="${button.dataset.id}" data-body="${escapeHtml(button.dataset.body || '')}">Edit message</button>` : ''; const deleteForEveryone = mine ? `<button class="modal-action danger" data-action="delete-message" data-id="${button.dataset.id}" data-scope="everyone">Delete for everyone</button>` : ''; showModal(`<div class="modal-inner"><h2>Message options</h2><p>${mine ? 'You can edit this message, hide it only for yourself, or remove it for everyone.' : 'You can hide this message from your own view.'}</p><div class="modal-actions">${edit}<button class="modal-action" data-action="delete-message" data-id="${button.dataset.id}" data-scope="me">Delete for me</button>${deleteForEveryone}</div></div>`); }
function manageChatModal(conversation) { showModal(`<div class="modal-inner"><h2>Manage chat.</h2><p>Editing the chat name updates it for both people. Removing it only clears it from your inbox; a new message brings it back.</p><form id="conversation-form" data-id="${conversation.id}"><label>Chat name<input name="title" maxlength="100" value="${escapeHtml(conversation.title || '')}" placeholder="Use the default name"></label><button class="submit">Save chat name →</button></form><div class="modal-actions"><button class="modal-action danger" data-action="delete-conversation" data-id="${conversation.id}">Remove from my inbox</button></div></div>`); }
function removeCommentFromUI(commentId, control) {
  const postId = control.closest('[data-post-id]')?.dataset.postId;
  document.querySelectorAll(`[data-comment-id="${commentId}"]`).forEach(comment => comment.remove());
  if (!postId) return;
  document.querySelectorAll(`button[data-id="${postId}"][data-action="focus-comment"], button[data-id="${postId}"][data-action="focus-detail-comment"]`).forEach(button => {
    button.textContent = button.textContent.replace(/\d+/, count => String(Math.max(0, Number(count) - 1)));
  });
  document.querySelectorAll(`[data-post-id="${postId}"] .post-detail-replies`).forEach(replies => {
    if (!replies.querySelector('.post-detail-comment')) replies.insertAdjacentHTML('beforeend', '<p class="post-detail-empty">Start the conversation with a kind reply.</p>');
  });
}
async function refreshCommentsAfterChange() { if (modal.open && state.openPostId) await renderPostModal(state.openPostId); else await loadView(state.currentView); }
function composeModal(reel = false) { showModal(`<div class="modal-inner"><h2>${reel ? 'Share a quest reel.' : 'Share a moment.'}</h2><p>Bring someone along in the little moment that made your day better.</p><form id="modal-compose"><label>What happened?<textarea name="body" maxlength="1200" placeholder="A few words go a long way…"></textarea></label><label>Photo or video${reel ? ' (required)' : ''}<input type="file" name="media" accept="image/*,video/*" ${reel ? 'required' : ''}></label><div class="media-preview" data-media-preview hidden></div><label>Location (optional)<input name="location_name" maxlength="120" placeholder="Indiranagar, Bengaluru"></label><input type="hidden" name="kind" value="${reel ? 'REEL' : 'POST'}"><button class="submit">Share with the community →</button></form></div>`); }
function submitQuestModal(quest) { showModal(`<div class="modal-inner"><p class="eyebrow">QUEST PROOF</p><h2>${escapeHtml(quest.title)}</h2><p>Share the photo or reel that shows how you completed this quest. It will be added to this event's Quest moments.</p><form id="quest-submission-form" data-quest="${quest.id}"><label>Caption (optional)<textarea name="caption" maxlength="280" placeholder="What made this moment memorable?"></textarea></label><label>Photo or video<input type="file" name="media" accept="image/*,video/*" required></label><div class="media-preview" data-media-preview hidden></div><label>Proof type<select name="media_type"><option value="IMAGE">Photo</option><option value="REEL">Reel</option></select></label><button class="submit">Share quest proof →</button></form></div>`); }
function directConversationFor(personId) { return state.conversations.find(conversation => conversation.participants.some(person => person.id === Number(personId))); }
async function startOrOpenDirectConversation(personId) { const targetId = Number(personId); if (targetId === state.user.id) return alert('You cannot start a chat with yourself.'); try { const conversation = directConversationFor(targetId) || await api('/conversations/direct/', {method:'POST', body:JSON.stringify({user_id:targetId})}); state.conversations = rows(await api('/conversations/')); state.activeConversation = conversation.id; state.chatOpen = true; if (modal.open) closeModal(); await loadView('chats'); } catch (error) { alert(error.message); } }
async function openPeoplePicker() { try { const people = rows(await api('/people/following/')); showModal(`<div class="modal-inner"><h2>Start a conversation.</h2><p>Only people you follow appear here. Choose someone you would genuinely like to know better.</p><div class="people-picker">${people.map(person => { const existing = directConversationFor(person.id); return `<button class="picker-person" data-action="${existing ? 'open-chat' : 'start-direct'}" data-id="${existing ? existing.id : person.id}">${avatar(person)}<span><strong>${escapeHtml(person.display_name || person.username)}</strong><br><span>@${escapeHtml(person.username)} · ★ ${person.karma || 'new'}${existing ? ' · chat started' : ''}</span></span></button>`; }).join('') || '<p class="empty">Follow someone first, then they will appear here.</p>'}</div></div>`); } catch (error) { alert(error.message); } }
function setNearbyStatus(message) { state.nearbyStatus = message; const status = document.querySelector('[data-nearby-status]'); if (status) status.textContent = message; }
function isTrustedLocationOrigin() { return window.isSecureContext || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname); }
function locationProblem(error) {
  if (error?.code === 1) return 'Location is blocked for this site. Use the address-bar site controls to allow Location, then try again.';
  if (error?.code === 2) return 'Your location is temporarily unavailable. Check that device location services are on, then try again.';
  if (error?.code === 3) return 'Finding your location took too long. Try again somewhere with a stronger signal.';
  return 'Location could not be requested. You can still explore by search or city.';
}
async function requestBrowserLocation(onSuccess, setStatus) {
  const update = message => setStatus?.(message);
  if (!navigator.geolocation) { const message = 'Location is not available in this browser.'; update(message); alert(message); return; }
  if (!isTrustedLocationOrigin()) {
    const message = 'Location permission needs HTTPS when this site is opened from another device. Open it on localhost or use an HTTPS address, then try again.';
    update(message);
    alert(message);
    return;
  }
  try {
    const permission = navigator.permissions?.query ? await navigator.permissions.query({name:'geolocation'}) : null;
    if (permission?.state === 'denied') {
      const message = 'Location is blocked for this site. Use the lock or site-controls icon beside the address, set Location to Allow, then try Nearby again.';
      update(message);
      alert(message);
      return;
    }
  } catch (_) { /* Some browsers do not expose the Permissions API; their prompt still works below. */ }
  update('Requesting your approximate location…');
  navigator.geolocation.getCurrentPosition(onSuccess, error => {
    const message = locationProblem(error);
    update(message);
    if (error?.code === 1) alert(message);
  }, {enableHighAccuracy:false, maximumAge:300000, timeout:10000});
}
function requestNearbyEvents() { requestBrowserLocation(position => { state.nearby = {latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6))}; state.exploreQuery = ''; setNearbyStatus('Showing upcoming and ongoing events near you.'); renderExplore(); }, setNearbyStatus); }
function captureEventLocation(button) { const status = button.parentElement?.querySelector('[data-event-location-status]'); const setStatus = message => { if (status) status.textContent = message; }; requestBrowserLocation(position => { const form = button.closest('form'); form.querySelector('[name="latitude"]').value = position.coords.latitude.toFixed(6); form.querySelector('[name="longitude"]').value = position.coords.longitude.toFixed(6); setStatus('Current location attached for nearby discovery.'); }, setStatus); }
function hostEventModal() { showModal(`<div class="modal-inner"><h2>Host a little adventure.</h2><p>Attach your approximate location so nearby discovery can surface this event to people close by.</p><form id="event-form"><label>Event name<input name="name" required maxlength="120"></label><label>Description<textarea name="description" required maxlength="2000"></textarea></label><label>Location<input name="location_name" required maxlength="160"></label><button class="location-capture" type="button" data-action="event-use-location">⌖ Use my current location</button><small class="location-capture-status" data-event-location-status>Optional — your coordinates are used only for nearby event matching.</small><input type="hidden" name="latitude"><input type="hidden" name="longitude"><label>Starts at<input name="starts_at" type="datetime-local" required></label><label>Ends at<input name="ends_at" type="datetime-local" required></label><label>Capacity<input name="capacity" type="number" min="2" value="12" required></label><button class="submit">Publish adventure →</button></form></div>`); }
async function submitPost(form) { const data = new FormData(form); try { await api('/posts/', {method:'POST', body:data}); clearMediaPreview(form); closeModal(); if (form.id === 'composer') form.reset(); await loadView('home'); } catch (error) { alert(error.message); } }
async function loadView(name, options = {}) {
  const nextProfileId = name === 'profile' ? (options.profileId || state.user.id) : null;
  const nextEventId = name === 'event' ? (options.eventId || state.eventId) : null;
  const nextPostId = name === 'post' ? (options.postId || state.postId) : null;
  const changed = state.currentView !== name || state.profileId !== nextProfileId || state.eventId !== nextEventId || state.postId !== nextPostId;
  if (name === 'profile' && state.profileId !== nextProfileId) state.profileTab = 'moments';
  if (name !== 'chats') stopMessagePolling();
  state.profileId = nextProfileId;
  state.eventId = nextEventId;
  state.postId = nextPostId;
  state.currentView = name;
  if (options.history !== false && changed) history.pushState({view:name, profileId:nextProfileId, eventId:nextEventId, postId:nextPostId}, '', routeUrl(name, nextProfileId, nextEventId, nextPostId));
  setNav(name === 'event' ? 'explore' : name === 'post' ? 'home' : name);
  const renderer = {home:renderHome, explore:renderExplore, reels:renderReels, chats:renderChats, notifications:renderNotifications, profile:renderProfile, event:renderEventDetail, post:renderPostDetail}[name];
  if (renderer) await renderer();
}

document.addEventListener('click', async event => {
  const actionTarget = event.target.closest('[data-action]'); const action = actionTarget?.dataset.action; const button = event.target.closest('button');
  const postCard = event.target.closest('.post[data-post-id]');
  if (!action && postCard && !event.target.closest('button,input,textarea,select,label,form,video,a')) return openPostModal(Number(postCard.dataset.postId));
  const viewName = event.target.closest('[data-view]')?.dataset.view; if (viewName) { if (viewName === 'chats') { state.chatOpen = false; state.activeConversation = null; } return loadView(viewName); }
  if (action === 'clear-media-preview') { const form = actionTarget.closest('form'); if (form) { clearMediaPreview(form); const input = form.querySelector('input[type="file"][name="media"]'); if (input) input.value = ''; } return; }
  if (action === 'change-media-preview') return actionTarget.closest('form')?.querySelector('input[type="file"][name="media"]')?.click();
  if (action === 'logout') return logout();
  if (action === 'nearby-events') return requestNearbyEvents();
  if (action === 'event-use-location') return captureEventLocation(actionTarget);
  if (action === 'compose') composeModal(); if (action === 'compose-reel') composeModal(true); if (action === 'close-modal') closeModal(); if (action === 'refresh-feed') loadView('home'); if (action === 'host-event') hostEventModal(); if (action === 'new-chat' || action === 'explore-people') openPeoplePicker();
  if (action === 'submit-quest') { const quest = state.eventQuests.find(item => item.id === Number(actionTarget.dataset.id)); if (quest) submitQuestModal(quest); }
  if (action === 'event-detail') return loadView('event', {eventId:Number(actionTarget.dataset.id)});
  if (action === 'open-profile') { if (modal.open) closeModal(); return loadView('profile', {profileId:Number(actionTarget.dataset.id)}); }
  if (action === 'profile-tab') return selectProfileTab(actionTarget.dataset.profileTab);
  if (action === 'join-event') { try { await api(`/events/${button.dataset.id}/join/`, {method:'POST', body:'{}'}); await loadView(state.currentView === 'event' ? 'event' : 'explore'); } catch (error) { alert(error.message); } }
  if (action === 'review-request') { try { await api(`/events/${actionTarget.dataset.eventId}/review-request/`, {method:'POST', body:JSON.stringify({attendance_id:Number(actionTarget.dataset.attendanceId), decision:actionTarget.dataset.decision})}); await loadView('event'); } catch (error) { alert(error.message); } }
  if (action === 'rate-attendee') { try { await api('/ratings/', {method:'POST', body:JSON.stringify({event:Number(actionTarget.dataset.eventId), target_id:Number(actionTarget.dataset.targetId), reaction:actionTarget.dataset.reaction})}); await loadView('event'); } catch (error) { alert(error.message); } }
  if (action === 'share-post') return shareLink('A SocialQuest moment', 'Come see this community moment on SocialQuest.', `/s/post/${actionTarget.dataset.id}/`);
  if (action === 'share-event') return shareLink('A SocialQuest adventure', 'Join me at this SocialQuest event.', `/?view=event&event=${actionTarget.dataset.id}`);
  if (action === 'share-profile') return shareLink('A SocialQuest profile', 'Meet this person on SocialQuest.', `/?view=profile&profile=${actionTarget.dataset.id}`);
  if (action === 'copy-share-link') return copyShareLink();
  if (action === 'open-native-share') return openNativeShare();
  if (action === 'preview-profile-photo') return previewProfilePhoto(actionTarget);
  if (action === 'toggle-message-emojis') { const picker = actionTarget.parentElement?.querySelector('.message-emoji-picker'); if (picker) { const open = picker.hidden; picker.hidden = !open; actionTarget.setAttribute('aria-expanded', String(open)); } return; }
  if (action === 'insert-message-emoji') { const form = actionTarget.closest('.message-form'); const input = form?.querySelector('input'); if (input) { input.value += actionTarget.dataset.emoji || ''; input.focus(); } const picker = actionTarget.closest('.message-emoji-picker'); if (picker) { picker.hidden = true; picker.parentElement?.querySelector('.emoji-trigger')?.setAttribute('aria-expanded', 'false'); } return; }
  if (action === 'like') return togglePostLike(button);
  if (action === 'focus-comment') document.querySelector(`form[data-post="${button.dataset.id}"] input`)?.focus();
  if (action === 'focus-detail-comment') return document.querySelector(`form[data-post="${button.dataset.id}"].post-detail-comment-form input`)?.focus();
  if (action === 'follow') { try { await api(`/people/${button.dataset.id}/follow/`, {method:button.dataset.following === 'true' ? 'DELETE' : 'POST'}); await loadSide(); } catch (error) { alert(error.message); } }
  if (action === 'follow-profile') { try { await api(`/people/${actionTarget.dataset.id}/follow/`, {method:actionTarget.dataset.following === 'true' ? 'DELETE' : 'POST'}); await loadView('profile', {profileId:state.profileId}); await loadSide(); } catch (error) { alert(error.message); } }
  if (action === 'message-person') return startOrOpenDirectConversation(actionTarget.dataset.id);
  if (action === 'edit-post') { try { editPostModal(await api('/posts/' + button.dataset.id + '/')); } catch (error) { alert(error.message); } }
  if (action === 'delete-post') { if (window.confirm('Delete this post? This cannot be undone.')) { try { await api('/posts/' + button.dataset.id + '/', {method:'DELETE'}); if (modal.open) closeModal(); await loadView(state.currentView); } catch (error) { alert(error.message); } } }
  if (action === 'edit-comment') return editCommentModal(actionTarget);
  if (action === 'delete-comment') { if (window.confirm('Delete this comment?')) { try { await api('/comments/' + actionTarget.dataset.id + '/', {method:'DELETE'}); removeCommentFromUI(actionTarget.dataset.id, actionTarget); } catch (error) { alert(error.message); } } }
  if (action === 'message-options') return messageOptionsModal(actionTarget);
  if (action === 'edit-message') return editMessageModal(actionTarget);
  if (action === 'delete-message') { const scope = actionTarget.dataset.scope; const warning = scope === 'everyone' ? 'Delete this message for everyone?' : 'Delete this message from your view?'; if (window.confirm(warning)) { try { await api(`/messages/${actionTarget.dataset.id}/?scope=${scope}`, {method:'DELETE'}); if (modal.open) closeModal(); state.conversations = rows(await api('/conversations/')); renderConversationList(); await refreshMessageList(state.activeConversation); } catch (error) { alert(error.message); } } }
  if (action === 'manage-chat') { const conversation = state.conversations.find(item => item.id === Number(actionTarget.dataset.id)); if (conversation) manageChatModal(conversation); }
  if (action === 'delete-conversation') { if (window.confirm('Remove this chat from your inbox? New messages will bring it back.')) { try { await api(`/conversations/${actionTarget.dataset.id}/`, {method:'DELETE'}); if (modal.open) closeModal(); state.conversations = rows(await api('/conversations/')); state.activeConversation = state.conversations[0]?.id || null; await loadView('chats'); } catch (error) { alert(error.message); } } }
  if (action === 'mark-notifications-read') { try { await api('/notifications/mark-read/', {method:'POST', body:'{}'}); await loadView('notifications'); } catch (error) { alert(error.message); } }
  if (action === 'notification-event') return loadView('event', {eventId:Number(actionTarget.dataset.eventId)});
  if (action === 'chat-list') { state.chatOpen = false; state.activeConversation = null; stopMessagePolling(); document.querySelector('.chats-layout')?.classList.remove('chat-open'); renderConversationList(); return; }
  if (action === 'notification-chat') { state.activeConversation = Number(actionTarget.dataset.conversationId); state.chatOpen = true; return loadView('chats'); }
  if (action === 'open-chat') { if (modal.open) closeModal(); state.activeConversation = Number(button.dataset.id); state.chatOpen = true; return loadView('chats'); }
  if (action === 'start-direct') return startOrOpenDirectConversation(button.dataset.id);
  if (action === 'edit-profile') showModal(`<div class="modal-inner"><h2>Make it feel like you.</h2><form id="profile-form"><label>Display name<input name="display_name" value="${escapeHtml(state.user.display_name)}" maxlength="80"></label><label>Bio<textarea name="bio" maxlength="280">${escapeHtml(state.user.bio)}</textarea></label><label>City<input name="city" value="${escapeHtml(state.user.city)}" maxlength="80"></label><label>Avatar<input name="avatar" type="file" accept="image/*"></label><button class="submit">Save profile →</button></form></div>`);
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('.post-detail-comment-form')) return;
  event.preventDefault();
  const input = form.querySelector('input');
  if (!input.value.trim()) return;
  try {
    await api('/comments/', {method:'POST', body:JSON.stringify({post:Number(form.dataset.post), body:input.value.trim()})});
    if (modal.open && state.openPostId === Number(form.dataset.post)) await renderPostModal(state.openPostId);
    else await renderPostDetail();
  } catch (error) { alert(error.message); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id !== 'quest-submission-form') return;
  event.preventDefault();
  const data = new FormData(form);
  data.append('quest', form.dataset.quest);
  try {
    await api('/submissions/', {method:'POST', body:data});
    clearMediaPreview(form);
    closeModal();
    await loadView('event', {eventId: state.eventId, history:false});
  } catch (error) { alert(error.message); }
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.matches('input[type="file"][name="media"]')) {
    updateMediaPreview(input);
    const mediaType = input.closest('form')?.querySelector('select[name="media_type"]');
    const file = input.files?.[0];
    if (mediaType && file) mediaType.value = file.type.startsWith('video/') ? 'REEL' : 'IMAGE';
  }
});

document.addEventListener('submit', async event => { const form = event.target; if (form.id === 'explore-search') { event.preventDefault(); state.exploreQuery = String(new FormData(form).get('q') || '').trim(); state.nearby = null; return renderExplore(); } if (form.id === 'composer' || form.id === 'modal-compose') { event.preventDefault(); return submitPost(form); } if (form.matches('.comment-form')) { event.preventDefault(); const input = form.querySelector('input'); if (!input.value.trim()) return; try { await api('/comments/', {method:'POST', body:JSON.stringify({post:form.dataset.post, body:input.value.trim()})}); await loadView(state.currentView); } catch (error) { alert(error.message); } } if (form.matches('.message-form')) { event.preventDefault(); const input = form.querySelector('input'); if (!input.value.trim()) return; try { await api('/messages/', {method:'POST', body:JSON.stringify({conversation:form.dataset.conversation, body:input.value.trim()})}); input.value = ''; state.conversations = rows(await api('/conversations/')); renderConversationList(); await refreshMessageList(Number(form.dataset.conversation)); input.focus(); } catch (error) { alert(error.message); } } if (form.id === 'profile-form') { event.preventDefault(); try { state.user = await api('/people/me/', {method:'PATCH', body:new FormData(form)}); syncUser(); closeModal(); await renderProfile(); } catch (error) { alert(error.message); } } if (form.id === 'event-form') { event.preventDefault(); try { const raw = Object.fromEntries(new FormData(form)); raw.capacity = Number(raw.capacity); raw.starts_at = new Date(raw.starts_at).toISOString(); raw.ends_at = new Date(raw.ends_at).toISOString(); if (raw.latitude === '') delete raw.latitude; else raw.latitude = Number(raw.latitude); if (raw.longitude === '') delete raw.longitude; else raw.longitude = Number(raw.longitude); const created = await api('/events/', {method:'POST', body:JSON.stringify(raw)}); await api(`/events/${created.id}/generate-quests/`, {method:'POST', body:'{}'}); closeModal(); await loadView('explore'); } catch (error) { alert(error.message); } } });
document.addEventListener('submit', async event => { const form = event.target; if (!['edit-comment-form', 'edit-message-form', 'conversation-form'].includes(form.id)) return; event.preventDefault(); const body = String(new FormData(form).get('body') || '').trim(); try { if (form.id === 'edit-comment-form') { if (!body) return; await api(`/comments/${form.dataset.id}/`, {method:'PATCH', body:JSON.stringify({body})}); if (state.openPostId) await renderPostModal(state.openPostId); else { closeModal(); await loadView(state.currentView); } } if (form.id === 'edit-message-form') { if (!body) return; await api(`/messages/${form.dataset.id}/`, {method:'PATCH', body:JSON.stringify({body})}); closeModal(); state.conversations = rows(await api('/conversations/')); renderConversationList(); await refreshMessageList(state.activeConversation); } if (form.id === 'conversation-form') { const title = String(new FormData(form).get('title') || '').trim(); await api(`/conversations/${form.dataset.id}/`, {method:'PATCH', body:JSON.stringify({title})}); closeModal(); state.conversations = rows(await api('/conversations/')); await loadView('chats'); } } catch (error) { alert(error.message); } });

(async function init() {
  try {
    state.user = await api('/people/me/');
    syncUser();
    const route = routeFromLocation();
    history.replaceState({view:route.name, profileId:route.profileId, eventId:route.eventId, postId:route.postId}, '', routeUrl(route.name, route.profileId, route.eventId, route.postId));
    await Promise.all([loadView(route.name, {profileId:route.profileId, eventId:route.eventId, postId:route.postId, history:false}), loadSide(), loadNotificationBadge()]);
    startNotificationPolling();
  } catch (_) { localStorage.removeItem(TOKEN_KEY); window.location.replace('/login/'); }
})();
window.addEventListener('popstate', () => {
  const route = routeFromLocation();
  loadView(route.name, {profileId:route.profileId, eventId:route.eventId, postId:route.postId, history:false});
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id !== 'edit-post-form') return;
  event.preventDefault();
  const data = new FormData(form);
  const media = form.querySelector('[name="media"]');
  if (!media.files?.length) data.delete('media');
  try {
    await api('/posts/' + form.dataset.id + '/', {method:'PATCH', body:data});
    closeModal();
    await loadView(state.currentView);
  } catch (error) { alert(error.message); }
});
