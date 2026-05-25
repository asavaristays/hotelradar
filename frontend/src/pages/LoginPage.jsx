import { useState } from 'react';

const NAV_GROUPS = [
  {
    label: 'AI Products',
    items: ['WhatsApp API Bot', 'AI Bot', 'Voice Agent'],
  },
  {
    label: 'AI Solutions',
    items: ['Lead Explorer', 'Demand Explorer', 'Leakage Explorer', 'AI Automation'],
  },
  {
    label: 'Hotel Products',
    items: ['Property Management Solutions', 'Channel Manager', 'Booking Engine'],
  },
];

const HIGHLIGHT_SECTIONS = [
  {
    id: 'ai-products',
    eyebrow: 'AI Products',
    title: 'Automation that helps hotels respond faster',
    description:
      'Use AI tools to answer guests, qualify demand, and reduce manual follow-up across WhatsApp, voice, and chat.',
    items: [
      {
        name: 'WhatsApp API Bot',
        text: 'Handle inbound guest questions, quote requests, and follow-ups in one place.',
      },
      {
        name: 'AI Bot',
        text: 'Capture intent, answer common questions, and move conversations toward booking.',
      },
      {
        name: 'Voice Agent',
        text: 'Answer calls, capture lead details, and keep missed calls from turning into lost revenue.',
      },
    ],
  },
  {
    id: 'product-solutions',
    eyebrow: 'Product & Solutions',
    title: 'Ten focused services for hotel operations and revenue teams',
    description:
      'A practical mix of hotel systems and revenue modules, arranged the way hotel teams usually think and act.',
    sectionClassName: 'homepageProductSection',
    gridClassName: 'homepageFeatureGrid homepageFeatureGridProductSolutions',
    items: [
      {
        name: 'Property Management Solutions',
        text: 'Keep room, guest, and stay context in one operational system.',
      },
      {
        name: 'Channel Manager',
        text: 'Keep rates and inventory aligned across connected selling channels.',
      },
      {
        name: 'Booking Engine',
        text: 'Turn direct traffic into bookings with a cleaner hotel checkout flow.',
      },
      {
        name: 'Demand Explorer',
        text: 'Read today-forward demand, events, and market pressure before changing rates.',
      },
      {
        name: 'Leakage Explorer',
        text: 'Spot pricing drift, missed revenue, and avoidable leakage early.',
      },
      {
        name: 'WhatsApp API Bot',
        text: 'Handle guest questions, quotes, and follow-up in the channel guests already use.',
      },
      {
        name: 'AI Bot',
        text: 'Answer common questions and move guests toward booking with less manual work.',
      },
      {
        name: 'Voice Agent',
        text: 'Answer calls, capture lead details, and reduce missed opportunities.',
      },
      {
        name: 'Lead Explorer',
        text: 'Keep enquiry visibility high so follow-up does not disappear in the handoff.',
      },
      {
        name: 'AI Automation',
        text: 'Automate repetitive commercial tasks while keeping the hotel in control.',
      },
    ],
  },
  {
    id: 'hotel-products',
    eyebrow: 'Hotel Products',
    title: 'Core hotel systems that support daily operations',
    description:
      'Connect your daily operating stack with the revenue layer so your teams can act faster and more accurately.',
    items: [
      {
        name: 'Property Management Solutions',
        text: 'Central hotel operations data, guest records, and room inventory context.',
      },
      {
        name: 'Channel Manager',
        text: 'Keep distribution aligned across channels while protecting price integrity.',
      },
      {
        name: 'Booking Engine',
        text: 'Turn higher-intent traffic into direct bookings with a tighter booking flow.',
      },
    ],
  },
];

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function scrollToSection(id) {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function LoginPage({ notice = '', onLogin, onNavigate }) {
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
      const data = await response.json();
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword(event) {
    event.preventDefault();
    setForgotMessage('');
    setError('');
    const safeEmail = email.trim();
    if (!safeEmail) {
      setError('Enter your email first to request password reset.');
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
    } catch (err) {
      setError(err.message || 'Unable to submit password reset request.');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <main className="authShell authShellHomepage">
      <header className="homepageTopbar">
        <div className="homepageBrandBlock">
          <span className="homepageBrandMark" aria-hidden="true">
            HR
          </span>
          <div>
            <strong>HotelRADAR</strong>
            <p>Demand intelligence for modern hotels</p>
          </div>
        </div>

        <nav className="homepageNav" aria-label="Top menu">
          <button type="button" className="homepageNavLink" onClick={() => scrollToSection('top')}>
            Home
          </button>

          {NAV_GROUPS.map((group) => (
            <details key={group.label} className="homepageNavGroup">
              <summary>{group.label}</summary>
              <div className="homepageSubmenu" role="menu" aria-label={`${group.label} submenu`}>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className="homepageSubmenuItem"
                    onClick={() => scrollToSection(slugify(item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </details>
          ))}

          <button type="button" className="homepageNavLink" onClick={() => scrollToSection('pricing')}>
            Pricing
          </button>
          <button type="button" className="homepageNavLink homepageNavLinkAccent" onClick={() => scrollToSection('login-card')}>
            Login
          </button>
        </nav>
      </header>

      <section className="homepageHero" id="top">
        <div className="homepageHeroCopy">
          <span className="homepageKicker">Hotel pricing, explained with evidence</span>
          <h1>See demand, remove noise, and change room prices with confidence.</h1>
          <p className="homepageIntro">
            HotelRADAR helps hotels in Goa, Mumbai, and Jaipur read today-forward demand, compare market pressure, and act only when the price signal is real.
          </p>

          <div className="homepageHeroActions">
            <button type="button" className="primaryButton" onClick={() => scrollToSection('login-card')}>
              Access dashboard
            </button>
            <button type="button" className="secondaryButton" onClick={() => scrollToSection('product-solutions')}>
              Explore solutions
            </button>
          </div>

          <div className="homepageStats">
            <article>
              <strong>3</strong>
              <span>Active hotel markets</span>
            </article>
            <article>
              <strong>Today</strong>
              <span>Forward demand view</span>
            </article>
            <article>
              <strong>Fresh</strong>
              <span>Rate evidence first</span>
            </article>
          </div>
        </div>

        <aside className="homepageHeroPanel">
          <p className="metaLabel">What the platform does</p>
          <h2>Decision support, not guesswork.</h2>
          <ul className="homepageBulletList">
            <li>Compare your hotel against live competitor pricing.</li>
            <li>See events, holidays, and market pressure in one screen.</li>
            <li>Get Reduce, Hold, Watch, or Increase guidance with confidence.</li>
          </ul>
        </aside>
      </section>

      <section className="homepageHighlights" aria-label="Product highlights">
        {HIGHLIGHT_SECTIONS.map((section) => (
          <article key={section.id} className={`homepageHighlightBlock ${section.sectionClassName || ''}`} id={section.id}>
            <div className="homepageHighlightHeading">
              <span className="homepageKicker">{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <div className={section.gridClassName || 'homepageFeatureGrid'}>
              {section.items.map((item) => (
                <div key={item.name} id={slugify(item.name)} className="homepageFeatureCard">
                  <strong>{item.name}</strong>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="homepagePricingPanel" id="pricing" aria-label="Pricing">
        <div>
          <span className="homepageKicker">Pricing</span>
          <h2>Built for hotels that want sharper daily pricing decisions.</h2>
          <p>
            The commercial stack is designed to reduce noise, protect rate integrity, and surface only the signals that matter for hotel revenue teams.
          </p>
        </div>
        <div className="homepagePricingPill">
          <strong>Advisory intelligence</strong>
          <span>Always human-approved</span>
        </div>
      </section>

      <section className="authCard homepageLoginCard" id="login-card" aria-label="Login">
        <h2>Sign in</h2>
        <p className="metaLabel">Enterprise Revenue Intelligence</p>
        {notice ? <p className="successText">{notice}</p> : null}

        <form onSubmit={submit} className="authForm">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@hotel.com"
            autoComplete="email"
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
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="linkButton forgotLink" onClick={submitForgotPassword} disabled={forgotLoading}>
          {forgotLoading ? 'Submitting...' : 'Forgot password'}
        </button>
        <div className="legalLinks authLegalLinks">
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/privacy')}>
            Privacy
          </button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/terms')}>
            Terms
          </button>
          <span>|</span>
          <button type="button" className="linkButton" onClick={() => onNavigate('/legal/disclaimer')}>
            Disclaimer
          </button>
        </div>
        {forgotMessage ? <p className="successText">{forgotMessage}</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
      </section>
    </main>
  );
}
