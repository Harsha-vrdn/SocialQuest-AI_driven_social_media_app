const requestedReturnTo = new URLSearchParams(window.location.search).get('next') || '/';
let returnTo = '/';
try {
  const destination = new URL(requestedReturnTo, window.location.origin);
  if (destination.origin === window.location.origin && destination.pathname !== '/login/') {
    returnTo = destination.pathname + destination.search + destination.hash;
  }
} catch (_) { /* Invalid return destinations use the home page. */ }
if (localStorage.getItem('socialquest_token')) window.location.replace(returnTo);
let registering = false;
let submitting = false;
const form = document.querySelector('#auth-form');
const error = document.querySelector('#form-error');
const submit = document.querySelector('#auth-submit');
function toggleAuth() {
  if (submitting) return;
  registering = !registering;
  document.querySelector('#auth-title').textContent = registering ? 'Start your story.' : 'Find your people.';
  document.querySelector('#auth-sub').textContent = registering ? 'A few details and you are ready for your first quest.' : 'Log in and see what your community is up to.';
  document.querySelector('#register-fields').hidden = !registering;
  document.querySelector('#email-field').hidden = !registering;
  form.elements.email.required = registering;
  form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  form.elements.password.minLength = registering ? 8 : 1;
  submit.innerHTML = registering ? 'Create my account <span>→</span>' : 'Log in <span>→</span>';
  document.querySelector('#auth-switch').innerHTML = registering ? 'Already a member? <button type="button" data-action="toggle-auth">Log in</button>' : 'New here? <button type="button" data-action="toggle-auth">Create an account</button>';
  error.textContent = '';
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-action=toggle-auth]')) toggleAuth();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  submitting = true;
  error.textContent = '';
  submit.disabled = true;
  const label = submit.innerHTML;
  submit.textContent = registering ? 'Creating account…' : 'Logging in…';
  form.setAttribute('aria-busy', 'true');
  try {
    const values = Object.fromEntries(new FormData(form));
    values.username = values.username.trim();
    if (!registering) { delete values.email; delete values.display_name; }
    else if (!values.display_name.trim()) delete values.display_name;
    const response = await fetch(registering ? '/api/auth/register/' : '/api/auth/login/', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || Object.values(data).flat().join(' ') || 'Something went wrong. Please try again.');
    if (!data.token) throw new Error('Login could not be completed. Please try again.');
    localStorage.setItem('socialquest_token', data.token);
    localStorage.setItem('socialquest_user', JSON.stringify(data.user));
    window.location.replace(returnTo);
  } catch (failure) {
    error.textContent = failure instanceof TypeError ? 'Could not connect. Check your connection and try again.' : failure.message;
  } finally {
    submitting = false;
    submit.disabled = false;
    submit.innerHTML = label;
    form.removeAttribute('aria-busy');
  }
});
