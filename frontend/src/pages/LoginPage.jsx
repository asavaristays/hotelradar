import { useState } from 'react';

export default function LoginPage({ notice = '', onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials.');
      }

      onLogin(await response.json());
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword() {
    setForgotMessage('');
    setError('');
    const safeEmail = email.trim();

    if (!safeEmail) {
      setError('Enter your username first to request a password reset.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: safeEmail }),
      });

      if (!response.ok) {
        throw new Error('Unable to submit password reset request.');
      }

      const data = await response.json();
      setForgotMessage(data.message || 'Password reset request submitted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit password reset request.');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <main className="authShell loginShell">
      <section className="authCard loginCard" aria-label="Login">
        <h1>Sign in</h1>
        <p className="metaLabel">HotelRADAR Revenue Intelligence</p>
        {notice ? <p className="successText">{notice}</p> : null}

        <form onSubmit={submit} className="authForm">
          <label htmlFor="email">Username</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />

          <label htmlFor="password">Password</label>
          <div className="passwordWrap">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ghostButton"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="linkButton forgotLink"
          onClick={submitForgotPassword}
          disabled={forgotLoading}
        >
          {forgotLoading ? 'Submitting...' : 'Forgot password'}
        </button>

        {forgotMessage ? <p className="successText">{forgotMessage}</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
      </section>
    </main>
  );
}
