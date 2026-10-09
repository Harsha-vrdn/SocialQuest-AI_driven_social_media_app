window.SocialQuestPostStudio = (() => {
  const drafts = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const imageMark = '<svg viewBox="0 0 110 100" aria-hidden="true"><rect x="12" y="9" width="70" height="78" rx="12" fill="#493578" stroke="#9c79dc" transform="rotate(-12 47 48)"/><rect x="35" y="17" width="66" height="75" rx="12" fill="#b998fb" stroke="#e1ceff" transform="rotate(10 68 54)"/><path d="m48 66 13-19 12 13 8-9 10 20H48Z" fill="#553f7e"/><circle cx="80" cy="37" r="6" fill="#efe6ff"/></svg>';
  function open(options) {
    const {user, quest, api, showModal, closeModal, published} = options;
    const key = user.id + ':' + (quest?.id || 'post');
    const draft = drafts.get(key) || {caption:'', location:'', kind:options.reel ? 'REEL' : 'POST', file:null, original:null};
    let step = 0, busy = false, error = '', url = '', editing = false, busyLabel = 'Publishing…';
    const limit = quest ? 280 : 1200;
    const name = user.display_name || user.username;
    showModal('<section class="post-studio" aria-label="Create a post"></section>', 'creator-modal');
    const dialog = document.getElementById('modal');
    const root = dialog.querySelector('.post-studio');
    const avatar = `<span class="studio-avatar">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc(name.slice(0,1))}</span>`;
    const author = () => `<div class="studio-author">${avatar}<span><strong>${esc(name)}</strong><small>${esc(draft.location || (quest ? 'Quest moment' : 'SocialQuest community'))}</small></span></div>`;
    const media = () => draft.file ? `<div class="studio-preview ${draft.kind === 'REEL' ? 'studio-video' : ''}">${draft.kind === 'REEL' ? `<video src="${url}" controls playsinline preload="metadata"></video>` : `<img src="${url}" alt="Your selected photo">`}</div>` : `<div class="studio-text-preview"><span>✦</span><p>${esc(draft.caption || 'Your next story starts here.')}</p></div>`;
    const button = (action, label, classes = 'studio-secondary') => `<button type="button" class="${classes}" data-studio="${action}" ${busy ? 'disabled' : ''}>${label}</button>`;
    function updateUrl() { if (url) URL.revokeObjectURL(url); url = draft.file ? URL.createObjectURL(draft.file) : ''; }
    function finishClose(save) { if (save) drafts.set(key, {...draft}); else drafts.delete(key); closeModal(); }
    function requestClose() {
      if (busy) return;
      if (!draft.file && !draft.caption.trim() && !draft.location.trim()) return finishClose(false);
      const leave = root.querySelector('.studio-leave');
      for (const child of root.querySelector('form').children) if (child !== leave) child.inert = true;
      leave.hidden = false; leave.querySelector('button').focus();
    }
    function cancel(event) { event.preventDefault(); requestClose(); }
    function cleanup() { if (url) URL.revokeObjectURL(url); dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('close', cleanup); }
    dialog.addEventListener('cancel', cancel); dialog.addEventListener('close', cleanup);

    function render() {
      root.innerHTML = `<form class="studio-form" aria-busy="${busy}">
        <header class="studio-header">${button('close', '<span aria-hidden="true">×</span><span class="studio-sr-only">Close post creator</span>', 'studio-close')}<div><p class="studio-eyebrow">SOCIALQUEST STUDIO</p><h2>${quest ? 'Share quest proof' : 'Create a post'}</h2></div><span class="studio-step-badge">${step + 1} / 3</span></header>
        <nav class="studio-steps" aria-label="Post creation steps">${['Media','Details','Preview'].map((label,index) => `<button type="button" data-step="${index}" ${index > step || busy ? 'disabled' : ''} ${index === step ? 'aria-current="step"' : ''}>${index < step ? '✓' : '0' + (index+1)} <span>${label}</span></button>`).join('')}</nav>
        <div class="studio-scroll"><div class="studio-layout ${step === 0 ? 'studio-media-step' : ''}">
          <section class="studio-stage">${step === 0 && !draft.file ? `<div class="studio-dropzone" tabindex="0" role="button" aria-label="Choose or drop a photo or video"><div class="studio-art">${imageMark}</div><h3>${draft.kind === 'REEL' ? 'A little motion.<br>A great story.' : 'A moment<br>worth sharing.'}</h3><p>Drag your ${draft.kind === 'REEL' ? 'video' : 'photo or video'} here<br>or choose a file to get started.</p>${button('choose', draft.kind === 'REEL' ? 'Choose a video' : 'Choose photo / video', 'studio-primary')}<small>One file · up to 50 MB</small></div>` : step === 2 ? `<div class="studio-feed-preview">${author()}${media()}${draft.file && draft.caption ? `<p class="studio-preview-caption">${esc(draft.caption)}</p>` : ''}<div class="studio-preview-social"><span aria-hidden="true">♡ &nbsp; ◌ &nbsp; ↗</span><small>Post preview</small></div></div>` : media()}
          ${step === 0 && draft.file ? `<div class="studio-media-tools">${draft.kind === 'POST' ? button('edit','✧ Edit photo') : ''}${button('choose','↻ Replace')}${button('remove','Remove','studio-danger')}</div>${editing && draft.kind === 'POST' ? `<div class="studio-edit-tools"><p>FRAME YOUR PHOTO</p><div>${button('square','1:1 Square')}${button('portrait','4:5 Portrait')}${button('wide','16:9 Wide')}</div><div>${button('rotate','↷ Rotate')}${button('mirror','⇆ Mirror')}${button('reset','Reset')}</div><small>Crop uses the center of the photo. Reset restores your original.</small></div>` : ''}` : ''}
          </section>
          <section class="studio-details">
            ${quest ? `<div class="studio-quest"><strong>✦ ${esc(quest.title)}</strong><small>Share proof to claim +${quest.xp_reward} XP</small></div>` : ''}
            ${step === 0 ? `<p class="studio-eyebrow">MAKE IT YOURS</p><h3>Your adventure.<br>Your point of view.</h3><p class="studio-copy">The little wins, the new faces, the unexpected detours. Give them a place in your story.</p>${!draft.file ? `<div class="studio-types">${['POST','REEL'].map(kind => `<button type="button" data-kind="${kind}" aria-pressed="${draft.kind === kind}"><strong>${kind === 'POST' ? '▧ Post' : '▷ Reel'}</strong><small>${kind === 'POST' ? 'Photo or a thought' : 'A moment in motion'}</small></button>`).join('')}</div>` : `<div class="studio-file-card"><span>${draft.kind === 'REEL' ? '▷' : '▧'}</span><div><strong>${esc(draft.file.name)}</strong><small>${draft.file.size < 1024*1024 ? Math.max(1,Math.round(draft.file.size/1024)) + ' KB' : (draft.file.size/1024/1024).toFixed(1) + ' MB'} · ${draft.kind === 'REEL' ? 'Video reel' : 'Photo post'}</small></div><b>✓</b></div><p class="studio-copy">${draft.kind === 'REEL' ? 'Play your video to check it before moving on.' : 'Use Edit photo to crop, rotate, or mirror your image.'}</p>`}${!quest && draft.kind === 'POST' && !draft.file ? button('text','Just writing? Create a text post →','studio-text-link') : ''}` : step === 1 ? `${author()}<div class="studio-label-row"><label for="studio-caption">Tell the story</label><small data-caption-count>${draft.caption.length} / ${limit}</small></div><textarea id="studio-caption" maxlength="${limit}" placeholder="What made this moment yours?">${esc(draft.caption)}</textarea><p class="studio-field-help">${quest ? 'A caption is optional. Your proof tells the story.' : 'A little context goes a long way.'}</p>${!quest ? `<label class="studio-location" for="studio-location">⌖ Add a place <small>Optional</small></label><input id="studio-location" maxlength="120" placeholder="Where did it happen?" value="${esc(draft.location)}">` : ''}<div class="studio-visibility"><span>✦</span><p>${quest ? 'Your proof will appear in this event’s Quest moments.' : 'Your post will appear on your profile and in the community feed.'}</p></div>` : `<p class="studio-eyebrow">THE FINAL LOOK</p><h3>Ready for<br>the feed.</h3><p class="studio-copy">This is how your moment will look. When you’re happy with it, share it with your community.</p><div class="studio-publish-details"><span>Format<strong>${draft.kind === 'REEL' ? 'Video reel' : draft.file ? 'Photo post' : 'Text post'}</strong></span><span>Shared to<strong>${quest ? 'Quest moments' : 'Community feed'}</strong></span>${draft.location ? `<span>Location<strong>${esc(draft.location)}</strong></span>` : ''}</div>${button('details','Edit caption & details','studio-text-link')}`}
          </section></div></div>
        <footer class="studio-footer"><p class="studio-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p><div>${step ? button('back','‹ Back') : '<span class="studio-footer-note">Make it a moment.</span>'}<button type="submit" class="studio-primary" ${busy ? 'disabled' : ''}>${busy ? busyLabel : step < 2 ? 'Next →' : quest ? 'Share & claim XP' : 'Share ' + (draft.kind === 'REEL' ? 'reel' : 'post')}</button></div></footer>
        <input class="studio-sr-only" type="file" tabindex="-1" aria-label="Upload post media" accept="${draft.kind === 'REEL' ? 'video/*' : 'image/*,video/*'}">
        <section class="studio-leave" role="alertdialog" aria-modal="true" aria-label="Leave this post?" hidden><div><h3>Keep this moment?</h3><p>Your draft can stay here until you close this page.</p>${button('stay','Keep editing','studio-primary')}${button('save','Save draft & close')}${button('discard','Discard draft','studio-danger')}</div></section>
      </form>`;
      root.querySelector('form').onsubmit = event => {event.preventDefault(); event.stopPropagation(); void next();};
      root.querySelector('input[type=file]').onchange = event => { const file = event.target.files?.[0]; if (file) selectFile(file); };
      const dropzone = root.querySelector('.studio-dropzone');
      if (dropzone) {
        dropzone.onclick = event => {if (!event.target.closest('button')) root.querySelector('input[type=file]').click();};
        dropzone.onkeydown = event => {if (event.target === dropzone && ['Enter',' '].includes(event.key)) {event.preventDefault(); root.querySelector('input[type=file]').click();}};
        dropzone.ondragover = event => {event.preventDefault(); dropzone.classList.add('drag-over');};
        dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
        dropzone.ondrop = event => {event.preventDefault(); dropzone.classList.remove('drag-over'); if (event.dataTransfer.files.length !== 1) return showError('Choose one photo or video for this post.'); selectFile(event.dataTransfer.files[0]);};
      }
      const caption = root.querySelector('#studio-caption');
      if (caption) caption.oninput = () => {draft.caption = caption.value; root.querySelector('[data-caption-count]').textContent = draft.caption.length + ' / ' + limit;};
      const location = root.querySelector('#studio-location');
      if (location) location.oninput = () => {draft.location = location.value;};
    }
    function showError(message) {error = message; const element = root.querySelector('.studio-error'); element.textContent = message; element.hidden = false;}
    function selectFile(file) {
      if (!file || !/^(image|video)\//.test(file.type) || file.size > 50*1024*1024 || !file.size) return showError('Choose a photo or video smaller than 50 MB.');
      draft.file = file; draft.original = file; draft.kind = file.type.startsWith('video/') ? 'REEL' : 'POST'; error = ''; editing = false; updateUrl(); render();
    }
    async function transform(action) {
      if (busy || !draft.file) return;
      if (action === 'reset') {draft.file = draft.original; updateUrl(); render(); return;}
      busy = true; busyLabel = 'Applying edit…'; error = ''; render();
      let bitmap;
      try {
        bitmap = await createImageBitmap(draft.file);
        let w = bitmap.width, h = bitmap.height, x = 0, y = 0;
        const ratio = {square:1,portrait:4/5,wide:16/9}[action];
        if (ratio) {if (w/h > ratio) {w = Math.floor(h*ratio); x = Math.floor((bitmap.width-w)/2);} else {h = Math.floor(w/ratio); y = Math.floor((bitmap.height-h)/2);}}
        const scale = Math.min(1,1920/Math.max(w,h));
        const dw = Math.max(1,Math.round(w*scale)), dh = Math.max(1,Math.round(h*scale));
        const canvas = document.createElement('canvas'); canvas.width = action === 'rotate' ? dh : dw; canvas.height = action === 'rotate' ? dw : dh;
        const context = canvas.getContext('2d');
        if (action === 'rotate') {context.translate(dh,0); context.rotate(Math.PI/2);}
        if (action === 'mirror') {context.translate(dw,0); context.scale(-1,1);}
        context.drawImage(bitmap,x,y,w,h,0,0,dw,dh);
        const png = draft.file.type === 'image/png';
        const blob = await new Promise(resolve => canvas.toBlob(resolve,png ? 'image/png' : 'image/jpeg',0.9));
        if (!blob) throw new Error('Could not save the edit.');
        draft.file = new File([blob],png ? 'socialquest-photo.png' : 'socialquest-photo.jpg',{type:blob.type}); updateUrl();
      } catch (_) {error = 'This photo could not be edited in your browser. You can still share the original or choose another photo.';}
      finally {bitmap?.close(); busy = false; render();}
    }
    async function next() {
      if (busy) return;
      if ((quest || draft.kind === 'REEL') && !draft.file) return showError(draft.kind === 'REEL' ? 'Choose a video for your reel.' : 'Add a photo or video as quest proof.');
      if (step > 0 && !draft.file && !draft.caption.trim()) return showError('Write a caption or add a photo before sharing.');
      error = '';
      if (step < 2) {step++; render(); root.querySelector('textarea, .studio-stage')?.focus(); return;}
      busy = true; busyLabel = 'Publishing…'; render();
      const data = new FormData();
      if (quest) {data.append('quest',quest.id); data.append('caption',draft.caption.trim()); data.append('media_type',draft.kind === 'REEL' ? 'REEL' : 'IMAGE');}
      else {data.append('body',draft.caption.trim()); data.append('kind',draft.kind); data.append('location_name',draft.location.trim());}
      if (draft.file) data.append('media',draft.file);
      try { await api(quest ? '/submissions/' : '/posts/',{method:'POST',body:data}); }
      catch (failure) {busy = false; error = failure instanceof TypeError ? 'Connection failed. Your draft is still here. Check your connection and try again.' : failure.message || 'Could not publish. Your draft is still here.'; render(); return;}
      drafts.delete(key); closeModal();
      try { await published(); } catch (_) { alert('Your post was shared. Refresh the feed to see it.'); }
    }
    root.onclick = event => {
      if (busy) return;
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.step !== undefined) {step = Number(target.dataset.step); error=''; render(); return;}
      if (target.dataset.kind) {draft.kind = target.dataset.kind; error=''; render(); return;}
      const action = target.dataset.studio;
      if (action === 'choose') root.querySelector('input[type=file]').click();
      if (action === 'close') requestClose();
      if (action === 'stay') {root.querySelector('.studio-leave').hidden = true; for (const child of root.querySelector('form').children) child.inert = false; root.querySelector('[data-studio=close]').focus();}
      if (action === 'save') finishClose(true);
      if (action === 'discard') finishClose(false);
      if (action === 'back') {step--; error=''; render();}
      if (action === 'text' || action === 'details') {step=1; error=''; render(); root.querySelector('textarea')?.focus();}
      if (action === 'remove') {draft.file=null; draft.original=null; editing=false; updateUrl(); render();}
      if (action === 'edit') {editing=!editing; render();}
      if (['square','portrait','wide','rotate','mirror','reset'].includes(action)) void transform(action);
    };
    updateUrl(); render();
  }
  return {open};
})();
