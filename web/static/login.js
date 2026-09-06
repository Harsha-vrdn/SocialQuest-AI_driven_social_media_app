const requestedReturnTo = new URLSearchParams(window.location.search).get('next') || '/';
const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/';
const token = localStorage.getItem('socialquest_token');
if (token) window.location.replace(returnTo);
document.documentElement.classList.add('dark');
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#050916');
let registering = false;
const form = document.querySelector('#auth-form');
const error = document.querySelector('#form-error');
function toggleAuth() {
  registering = !registering;
  document.querySelector('#auth-title').textContent = registering ? 'Start your story.' : 'Find your people.';
  document.querySelector('#auth-sub').textContent = registering ? 'A few details and you are ready for your first quest.' : 'Log in and see what your community is up to.';
  document.querySelector('#register-fields').hidden = !registering;
  document.querySelector('#email-field').hidden = !registering;
  document.querySelector('[name=email]').required = registering;
  document.querySelector('[name=password]').autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#auth-submit').innerHTML = registering ? 'Create my account <span>→</span>' : 'Log in <span>→</span>';
  document.querySelector('#auth-switch').innerHTML = registering ? 'Already a member? <button type="button" data-action="toggle-auth">Log in</button>' : 'New here? <button type="button" data-action="toggle-auth">Create an account</button>';
  error.textContent = '';
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-action=toggle-auth]')) toggleAuth();
});
form.addEventListener('submit', async event => {
  event.preventDefault(); error.textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const response = await fetch(registering ? '/api/auth/register/' : '/api/auth/login/', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { error.textContent = data.detail || Object.values(data).flat().join(' ') || 'Something went wrong. Please try again.'; return; }
  localStorage.setItem('socialquest_token', data.token);
  localStorage.setItem('socialquest_user', JSON.stringify(data.user));
  window.location.replace(returnTo);
});
