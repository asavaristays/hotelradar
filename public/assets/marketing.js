document.addEventListener('DOMContentLoaded', () => {
  const radarField = document.querySelector('[data-radar-field]');
  if (radarField && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const syncRadarScroll = () => {
      radarField.style.setProperty('--radar-scroll', `${Math.min(window.scrollY * 0.035, 42)}deg`);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(syncRadarScroll);
      }
    }, { passive: true });
    syncRadarScroll();
  }

  const header = document.querySelector('header.site-header');
  if (header) {
    const homeClass = 'nav-link active';
    const pricingClass = 'nav-link';
    const loginClass = 'nav-cta';

    header.innerHTML = `
      <div class="nav-wrap">
        <a class="brand-lockup" href="/" aria-label="HotelRADAR home">
          <img class="brand-logo" src="/assets/hotelradar-logo.png?v=20260602d" alt="HotelRADAR AI Agency Goa" width="740" height="158" />
        </a>
        <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-menu-toggle>&#9776;</button>
        <div class="nav-main" data-nav-main>
          <nav class="nav-links" aria-label="Primary">
            <a class="${homeClass}" href="/">Home</a>
            <details class="nav-group">
              <summary class="nav-link nav-group-trigger">
                <span>AI Products</span>
                <svg class="nav-caret" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M5.5 7.75 10 12.25l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </summary>
              <div class="nav-submenu" aria-label="AI Products submenu">
                <a class="nav-submenu-link" href="/whatsapp-automation/">WhatsApp API Bot</a>
                <a class="nav-submenu-link" href="/ai-bot/">AI Bot</a>
                <a class="nav-submenu-link" href="/voice-agent/">Voice Agent</a>
              </div>
            </details>
            <details class="nav-group">
              <summary class="nav-link nav-group-trigger">
                <span>AI Solutions</span>
                <svg class="nav-caret" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M5.5 7.75 10 12.25l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </summary>
              <div class="nav-submenu" aria-label="AI Solutions submenu">
                <a class="nav-submenu-link" href="/lead/">Lead Explorer</a>
                <a class="nav-submenu-link" href="/demand-explorer/">Demand Explorer</a>
                <a class="nav-submenu-link" href="/leakage-explorer/">Leakage Explorer</a>
                <a class="nav-submenu-link" href="/vps-cloud-infra/">VPS and Cloud Infra</a>
                <a class="nav-submenu-link" href="/ai-consulting-training/">AI Consulting & Training</a>
              </div>
            </details>
            <a class="nav-link" href="/hotel-ai-automation/">AI Automation</a>
            <a class="nav-link" href="https://pms.hotelradar.in" target="_blank" rel="noreferrer">PMS/CM/BE</a>
            <a class="${pricingClass}" href="/pricing/">Pricing</a>
          </nav>
          <div class="nav-actions">
            <a class="${loginClass}" href="/login.html">Login</a>
          </div>
        </div>
      </div>
    `;
  }

  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav-main]');
  const navGroups = Array.from(document.querySelectorAll('.nav-group'));

  const closeNavGroups = (except = null) => {
    navGroups.forEach((group) => {
      if (group !== except) {
        group.open = false;
      }
    });
  };

  if (toggle && nav) {
    const syncExpanded = () => {
      toggle.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    };
    syncExpanded();
    toggle.addEventListener('click', () => {
      const willOpen = !nav.classList.contains('open');
      nav.classList.toggle('open');
      if (!willOpen) {
        closeNavGroups();
      }
      syncExpanded();
    });
    nav.querySelectorAll('a, button').forEach((item) => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 820) {
          nav.classList.remove('open');
          closeNavGroups();
          syncExpanded();
        }
      });
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 820 && nav.classList.contains('open')) {
        nav.classList.remove('open');
        closeNavGroups();
        syncExpanded();
      }
    });
  }

  const productSelector = document.querySelector('[data-product-selector]');
  if (productSelector) {
    const tabs = Array.from(productSelector.querySelectorAll('[data-product-tab]'));

    const applyLinkTarget = (link, href) => {
      if (!link) return;
      if (/^https?:\/\//i.test(href || '')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noreferrer');
      } else {
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
    };

    const buildAccordionPanel = (tab, index) => {
      const row = tab.closest('.product-selector-item-row');
      if (!row || row.querySelector('.product-selector-accordion-panel')) return;

      const panel = document.createElement('div');
      panel.className = 'product-selector-accordion-panel';
      panel.id = `product-selector-panel-${index + 1}`;

      const shell = document.createElement('div');
      shell.className = 'product-selector-accordion-shell';

      const copyWrap = document.createElement('div');
      const eyebrow = document.createElement('span');
      eyebrow.className = 'product-selector-accordion-eyebrow';
      eyebrow.textContent = tab.dataset.eyebrow || '';
      const title = document.createElement('h3');
      title.textContent = tab.dataset.title || '';
      const copy = document.createElement('p');
      copy.textContent = tab.dataset.copy || '';
      copyWrap.append(eyebrow, title, copy);

      const pointWrap = document.createElement('div');
      const points = document.createElement('ul');
      points.className = 'product-selector-accordion-points';
      String(tab.dataset.points || '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          const point = document.createElement('li');
          point.textContent = item;
          points.appendChild(point);
        });

      const action = document.createElement('div');
      action.className = 'product-selector-accordion-action';
      const link = document.createElement('a');
      link.className = 'btn btn-secondary tile-more-link';
      link.href = tab.dataset.link || '#';
      link.textContent = tab.dataset.linkLabel || 'Open';
      applyLinkTarget(link, tab.dataset.link || '#');
      action.appendChild(link);
      pointWrap.append(points, action);

      shell.append(copyWrap, pointWrap);
      panel.appendChild(shell);
      row.appendChild(panel);
      tab.setAttribute('aria-controls', panel.id);
    };

    const activateTab = (tab) => {
      if (!tab) return;
      tabs.forEach((button) => {
        const isActive = button === tab;
        const row = button.closest('.product-selector-item-row');
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (row) row.classList.toggle('is-active', isActive);
      });
    };

    tabs.forEach((tab, index) => buildAccordionPanel(tab, index));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab));
    });

    activateTab(tabs.find((tab) => tab.classList.contains('is-active')) || tabs[0]);
  }

  if (navGroups.length) {
    navGroups.forEach((group) => {
      group.addEventListener('toggle', () => {
        if (group.open) {
          closeNavGroups(group);
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (nav && !nav.contains(event.target)) {
        closeNavGroups();
      }
    });
  }

  const whatsappDemo = document.querySelector('[data-whatsapp-demo]');
  if (whatsappDemo) {
    const thread = whatsappDemo.querySelector('[data-whatsapp-demo-thread]');
    const firstCopy = thread?.querySelector('.whatsapp-thread-copy');
    const messages = whatsappDemo.querySelectorAll('.whatsapp-message');

    messages.forEach((message, index) => {
      window.setTimeout(() => message.classList.add('is-visible'), 120 + index * 110);
    });

    if (thread && firstCopy) {
      let offset = 0;
      let lastFrame = 0;
      const limit = () => firstCopy.offsetHeight + 20;
      const speed = 0.045;

      const tick = (timestamp) => {
        if (!lastFrame) lastFrame = timestamp;
        const delta = timestamp - lastFrame;
        lastFrame = timestamp;
        offset += delta * speed;
        const maxOffset = limit();
        if (offset >= maxOffset) {
          offset = 0;
        }
        thread.style.transform = `translate3d(0, -${offset}px, 0)`;
        window.requestAnimationFrame(tick);
      };

      window.requestAnimationFrame(tick);
    }
  }

  const productMap = document.querySelector('[data-product-map]');
  if (productMap) {
    const beam = productMap.querySelector('[data-product-map-beam]');
    const status = productMap.querySelector('[data-product-map-status]');
    const title = productMap.querySelector('[data-product-map-title]');
    const group = productMap.querySelector('[data-product-map-group]');
    const nodes = Array.from(productMap.querySelectorAll('[data-product-node]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (nodes.length) {
      const rotationSpeed = 0.012;
      const sweepWidth = 10;
      let startTime = 0;
      let activeIndex = -1;

      const normalizeAngle = (angle) => {
        const wrapped = angle % 360;
        return wrapped < 0 ? wrapped + 360 : wrapped;
      };

      const angleDistance = (a, b) => {
        const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
        return Math.min(diff, 360 - diff);
      };

      const setActiveNode = (index) => {
        nodes.forEach((item, itemIndex) => {
          item.classList.toggle('is-active', itemIndex === index);
        });

        const node = index >= 0 ? nodes[index] : null;
        if (node) {
          const nextTitle = node.dataset.title || node.textContent.trim();
          const nextGroup = node.dataset.group || '';
          if (title) title.textContent = nextTitle;
          if (group) group.textContent = nextGroup;
          if (status) status.textContent = nextTitle;
        }
      };

      const tick = (timestamp) => {
        if (!startTime) {
          startTime = timestamp;
        }

        const elapsed = timestamp - startTime;
        const angle = elapsed * rotationSpeed;

        productMap.classList.add('is-animating');
        if (beam) {
          beam.style.setProperty('--beam-angle', `${angle}deg`);
        }

        let nextActiveIndex = -1;
        let closestDistance = Infinity;
        nodes.forEach((node, index) => {
          const nodeAngle = Number(node.dataset.angle || 0);
          const distance = angleDistance(angle, nodeAngle);
          if (distance <= sweepWidth && distance < closestDistance) {
            closestDistance = distance;
            nextActiveIndex = index;
          }
        });

        if (nextActiveIndex !== -1 && nextActiveIndex !== activeIndex) {
          activeIndex = nextActiveIndex;
          setActiveNode(activeIndex);
        }

        window.requestAnimationFrame(tick);
      };

      if (reducedMotion) {
        const first = nodes[0];
        if (first) {
          const firstAngle = Number(first.dataset.angle || 0);
          if (beam) beam.style.setProperty('--beam-angle', `${firstAngle}deg`);
          activeIndex = 0;
          setActiveNode(activeIndex);
        }
      } else {
        productMap.classList.add('is-animating');
        window.requestAnimationFrame(tick);
      }
    }
  }

  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  if (revealItems.length) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
      revealItems.forEach((item) => observer.observe(item));
    } else {
      revealItems.forEach((item) => item.classList.add('is-visible'));
    }
  }

  const initBotSim = (root, mode) => {
    if (!root) return;
    const version = root.getAttribute('data-sim-version') || '';
    const image = root.querySelector('[data-sim-image]');
    const subtitle = root.querySelector('[data-sim-subtitle]');
    const stateLabel = root.querySelector('[data-sim-state-label]');
    const badge = root.querySelector('[data-sim-badge]');
    const title = root.querySelector('[data-sim-title]');
    const copy = root.querySelector('[data-sim-copy]');
    const user = root.querySelector('[data-sim-user]');
    const assistant = root.querySelector('[data-sim-assistant]');
    const quick = root.querySelector('[data-sim-quick]');
    const prompt = root.querySelector('[data-sim-prompt]');
    const tabs = Array.from(root.querySelectorAll('[data-sim-tab]'));
    const states = mode === 'whatsapp' ? {
      welcome: {
        tab: 'Welcome',
        subtitle: 'WhatsApp API · quick reply',
        stateLabel: 'Click a tab to preview',
        image: `/whatsapp-bot1.PNG?v=${version}`,
        badge: 'WhatsApp welcome',
        title: 'Guests get a fast branded reply on WhatsApp.',
        copy: 'The same knowledge base powers WhatsApp conversations so the hotel can stay responsive around the clock.',
        user: 'Hi, do you have rooms available?',
        assistant: 'Yes. I can answer using the hotel knowledge base and share room options right here.',
        prompt: 'Try asking: room availability, rates today, or amenities.',
        quick: ['Room availability', 'Rates today', 'Book now'],
      },
      kb: {
        tab: 'KB Answer',
        subtitle: 'Knowledge-base answer',
        stateLabel: 'Knowledge preview',
        image: `/whatsapp-bot2.PNG?v=${version}`,
        badge: 'KB answer',
        title: 'Answers come from the hotel knowledge base.',
        copy: 'Policy, location, inclusions, and stay details can be answered consistently on WhatsApp.',
        user: 'What time is check-in?',
        assistant: 'I can answer that from the hotel KB and keep the reply consistent with your website bot.',
        quick: ['Check-in time', 'Policies', 'Amenities'],
      },
      lead: {
        tab: 'Lead Capture',
        subtitle: 'Lead Explorer handoff',
        stateLabel: 'Lead capture preview',
        image: `/whatsapp-bot3.PNG?v=${version}`,
        badge: 'Lead capture',
        title: 'Lead details flow into the team workflow.',
        copy: 'Guest name, phone number, stay intent, and booking context can be captured without losing the chat.',
        user: 'Please send me the best package.',
        assistant: 'Sure. I’ll capture your request and keep it ready for the hotel team to follow up.',
        quick: ['Send package', 'Share details', 'Callback'],
      },
      handoff: {
        tab: 'Handoff',
        subtitle: 'Human takeover',
        stateLabel: 'Handoff preview',
        image: `/whatsapp-bot4.PNG?v=${version}`,
        badge: 'Human handoff',
        title: 'When needed, the conversation moves cleanly to a person.',
        copy: 'The bot can hand over the thread to the team so replies continue without starting again.',
        user: 'I’d like to speak with someone.',
        assistant: 'Of course. I’ll connect you to the team and preserve the conversation context.',
        quick: ['Talk to team', 'Call me back', 'Send details'],
      },
    } : {
      welcome: {
        tab: 'Welcome',
        subtitle: 'Website · WhatsApp · QR codes',
        stateLabel: 'Click a tab to preview',
        image: `/ai-bot-web1.png?v=${version}`,
        badge: 'Asavari welcome',
        title: 'Asavari welcomes the guest instantly.',
        copy: 'Visitors get a branded first response that feels like a front desk assistant, with helpful prompts so they know what to ask next.',
        user: 'Hi, what can you help me with?',
        assistant: 'I can answer room, package, booking, and property questions instantly.',
        prompt: 'Try asking: room availability, rates today, photos, or check-in time.',
        quick: ['Room options', 'Rates today', 'Photos', 'Check-in time'],
      },
      availability: {
        tab: 'Availability',
        subtitle: 'Live room discovery',
        stateLabel: 'Availability preview',
        image: `/ai-bot-web2.png?v=${version}`,
        badge: 'Availability check',
        title: 'Guests can check stay options in one conversation.',
        copy: 'The assistant can surface room types, stay dates, and booking-ready answers without sending guests away.',
        user: 'Do you have rooms for this weekend?',
        assistant: 'Yes. I can check room options and guide you to the best available stay.',
        quick: ['Show rooms', 'Weekend dates', 'Book now'],
      },
      upsell: {
        tab: 'Upsell',
        subtitle: 'Packages · add-ons',
        stateLabel: 'Upsell preview',
        image: `/ai-bot-web3.png?v=${version}`,
        badge: 'Upsell moment',
        title: 'The assistant can promote upgrades naturally.',
        copy: 'Meal plans, airport pickup, premium rooms, and experience add-ons appear at the right moment.',
        user: 'Can you share something better than the base room?',
        assistant: 'Absolutely. I can suggest room upgrades and add-ons based on your travel style.',
        quick: ['Premium room', 'Meal plan', 'Airport pickup'],
      },
      experience: {
        tab: 'Experience',
        subtitle: 'Discovery to intent',
        stateLabel: 'Experience preview',
        image: `/ai-bot-web4.png?v=${version}`,
        badge: 'Experience mode',
        title: 'The bot keeps the experience polished and branded.',
        copy: 'HotelRADAR can guide guests with quick answers, property context, and a smoother first touchpoint.',
        user: 'What makes your stay different?',
        assistant: 'I can explain the property, highlights, and guest experience in a clear branded flow.',
        quick: ['Property story', 'Nearby spots', 'Why book direct'],
      },
      handoff: {
        tab: 'Handoff',
        subtitle: 'Human takeover · Lead Explorer',
        stateLabel: 'Handoff preview',
        image: `/ai-bot-web5.png?v=${version}`,
        badge: 'Human handoff',
        title: 'When a human should step in, the bot hands over cleanly.',
        copy: 'Callback capture and lead context move into the team workflow without losing the conversation history.',
        user: 'Can someone call me back?',
        assistant: 'Of course. I’ll collect your details and hand this over to the team right away.',
        quick: ['Call me back', 'Send details', 'Talk to team'],
      },
    };
    const order = Object.keys(states);
    let activeKey = order[0];
    let timer = null;

    const applyState = (key, { animate = true } = {}) => {
      const state = states[key];
      if (!state) return;
      activeKey = key;
      root.dataset.activeState = key;

      tabs.forEach((tab) => {
        const isActive = tab.getAttribute('data-sim-tab') === key;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      if (animate) root.classList.add('is-switching');

      const commit = () => {
        if (subtitle) subtitle.textContent = state.subtitle;
        if (stateLabel) stateLabel.textContent = state.stateLabel;
        if (badge) badge.textContent = state.badge;
        if (title) title.textContent = state.title;
        if (copy) copy.textContent = state.copy;
        if (user) user.textContent = state.user;
        if (assistant) assistant.textContent = state.assistant;
        if (prompt) prompt.textContent = state.prompt || '';
        if (image) {
          const nextSrc = state.image;
          const nextAlt = `${state.badge} preview`;
          const currentSrc = image.getAttribute('src') || '';
          if (currentSrc === nextSrc) {
            image.alt = nextAlt;
          } else {
            const preload = new window.Image();
            preload.onload = () => {
              image.classList.add('is-fading');
              window.setTimeout(() => {
                image.src = nextSrc;
                image.alt = nextAlt;
                image.dataset.currentSrc = nextSrc;
                window.requestAnimationFrame(() => {
                  image.classList.remove('is-fading');
                });
              }, 80);
            };
            preload.src = nextSrc;
          }
        }
      if (quick) {
        quick.innerHTML = '';
        if (state.prompt) {
          const promptEl = document.createElement('div');
          promptEl.className = 'ai-bot-sim-prompt';
          promptEl.textContent = state.prompt;
          quick.appendChild(promptEl);
        }
        state.quick.forEach((label) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          quick.appendChild(button);
        });
      }
      };

      if (!animate) {
        commit();
        return;
      }

      window.setTimeout(() => {
        commit();
        window.setTimeout(() => {
          root.classList.remove('is-switching');
        }, 40);
      }, 140);
    };

    const scheduleNext = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };

    quick?.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const label = button.textContent?.toLowerCase() || '';
      if (mode === 'whatsapp') {
        if (label.includes('book') || label.includes('room')) {
          applyState('welcome');
        } else if (label.includes('policy') || label.includes('amenit') || label.includes('check')) {
          applyState('kb');
        } else if (label.includes('call') || label.includes('team') || label.includes('details')) {
          applyState('handoff');
        } else {
          applyState('lead');
        }
      } else if (label.includes('room') || label.includes('rate') || label.includes('book')) {
        applyState('availability');
      } else if (label.includes('premium') || label.includes('meal') || label.includes('pickup') || label.includes('upgrade')) {
        applyState('upsell');
      } else if (label.includes('call') || label.includes('team') || label.includes('details')) {
        applyState('handoff');
      } else {
        applyState('welcome');
      }
    });

    tabs.forEach((tab) => {
      tab.setAttribute('aria-pressed', tab.getAttribute('data-sim-tab') === activeKey ? 'true' : 'false');
      tab.addEventListener('click', () => {
        applyState(tab.getAttribute('data-sim-tab') || activeKey);
      });
    });

    applyState(activeKey, { animate: false });
    scheduleNext();
  };

  const initHeroFader = (root) => {
    if (!root) return;
    const images = Array.from(root.querySelectorAll('.hero-fade-image'));
    if (images.length < 2) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = 0;
    let timer = null;

    const setActive = (index) => {
      active = index % images.length;
      images.forEach((img, idx) => {
        img.classList.toggle('is-visible', idx === active);
      });
    };

    const schedule = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      if (prefersReducedMotion) return;
      timer = window.setInterval(() => {
        setActive((active + 1) % images.length);
      }, 5000);
    };

    setActive(0);
    schedule();
    root.addEventListener('mouseenter', schedule);
    root.addEventListener('mouseleave', schedule);
    root.addEventListener('touchstart', schedule, { passive: true });
  };

  const initChecklistCarousel = (root) => {
    if (!root) return;
    const track = root.querySelector('[data-checklist-track]');
    const slides = Array.from(root.querySelectorAll('[data-checklist-slide]'));
    const prev = root.querySelector('[data-checklist-prev]');
    const next = root.querySelector('[data-checklist-next]');
    const dotsWrap = root.querySelector('[data-checklist-dots]');
    const progress = root.querySelector('[data-checklist-progress]');
    const stepLabel = root.querySelector('[data-checklist-step]');
    const totalLabel = root.querySelector('[data-checklist-total]');
    const total = slides.length;
    if (!track || !total) return;

    const storageKey = `hotelradar.whatsappChecklist:${window.location.pathname}`;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const autoplayEnabled = root.getAttribute('data-checklist-autoplay') !== 'false';
    const dots = [];
    let completed = new Set();
    let activeIndex = 0;
    let timer = null;
    let hovering = false;
    let raf = 0;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) completed = new Set(JSON.parse(raw));
    } catch (_) {
      completed = new Set();
    }

    const persistCompleted = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(completed)));
      } catch (_) {
        // Ignore storage failures.
      }
    };

    const updateProgress = () => {
      if (progress) progress.style.width = `${((activeIndex + 1) / total) * 100}%`;
      if (stepLabel) stepLabel.textContent = `Step ${activeIndex + 1}`;
      if (totalLabel) totalLabel.textContent = `of ${total}`;
      prev?.toggleAttribute('disabled', activeIndex === 0);
      next?.toggleAttribute('disabled', activeIndex === total - 1);
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
        dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
      });
    };

    const scrollToIndex = (index, behavior = 'smooth') => {
      const targetIndex = Math.max(0, Math.min(total - 1, index));
      const targetSlide = slides[targetIndex];
      if (!targetSlide) return;
      track.scrollTo({ left: targetSlide.offsetLeft, behavior });
    };

    const syncFromScroll = () => {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      const scrollLeft = track.scrollLeft + 1;
      slides.forEach((slide, index) => {
        const distance = Math.abs(slide.offsetLeft - scrollLeft);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      if (nearestIndex !== activeIndex) {
        activeIndex = nearestIndex;
        updateProgress();
      }
    };

    const scheduleAutoplay = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      if (prefersReducedMotion || hovering || !autoplayEnabled || total <= 1) return;
      timer = window.setInterval(() => {
        scrollToIndex((activeIndex + 1) % total);
      }, 6500);
    };

    slides.forEach((slide, index) => {
      slide.querySelectorAll('[data-checkitem]').forEach((button) => {
        const key = button.getAttribute('data-checkitem') || `${index}:${button.textContent?.trim() || ''}`;
        const applyState = () => {
          const isComplete = completed.has(key);
          button.classList.toggle('is-complete', isComplete);
          button.setAttribute('aria-pressed', isComplete ? 'true' : 'false');
        };
        applyState();
        button.addEventListener('click', () => {
          if (completed.has(key)) {
            completed.delete(key);
          } else {
            completed.add(key);
          }
          applyState();
          persistCompleted();
        });
      });
    });

    slides.forEach((slide, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'checklist-dot';
      dot.setAttribute('aria-label', `Go to checklist step ${index + 1}`);
      dot.addEventListener('click', () => {
        scrollToIndex(index);
        scheduleAutoplay();
      });
      dotsWrap?.appendChild(dot);
      dots.push(dot);
    });

    prev?.addEventListener('click', () => {
      scrollToIndex(activeIndex - 1);
      scheduleAutoplay();
    });

    next?.addEventListener('click', () => {
      scrollToIndex(activeIndex + 1);
      scheduleAutoplay();
    });

    track.addEventListener('scroll', () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(syncFromScroll);
    }, { passive: true });

    root.addEventListener('mouseenter', () => {
      hovering = true;
      scheduleAutoplay();
    });

    root.addEventListener('mouseleave', () => {
      hovering = false;
      scheduleAutoplay();
    });

    root.addEventListener('touchstart', () => {
      hovering = true;
      scheduleAutoplay();
    }, { passive: true });

    root.addEventListener('touchend', () => {
      hovering = false;
      scheduleAutoplay();
    }, { passive: true });

    window.addEventListener('resize', () => {
      scrollToIndex(activeIndex, 'auto');
    });

    updateProgress();
    scrollToIndex(0, 'auto');
    scheduleAutoplay();
  };

  document.querySelectorAll('[data-ai-bot-sim]').forEach((root) => initBotSim(root, 'assistant'));
  document.querySelectorAll('[data-whatsapp-sim]').forEach((root) => initBotSim(root, 'whatsapp'));
  document.querySelectorAll('[data-hero-fader]').forEach((root) => initHeroFader(root));
  document.querySelectorAll('[data-checklist-carousel]').forEach((root) => initChecklistCarousel(root));

  document.querySelectorAll('.faq').forEach((item) => {
    const button = item.querySelector('button');
    if (!button) return;
    button.addEventListener('click', () => {
      item.classList.toggle('open');
    });
  });

  const screenButtons = Array.from(document.querySelectorAll('[data-screen-open]'));
  if (screenButtons.length) {
    const lightbox = document.createElement('div');
    lightbox.className = 'screen-lightbox';
    lightbox.innerHTML = `
      <button class="screen-lightbox-backdrop" type="button" aria-label="Close preview" data-screen-close></button>
      <div class="screen-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Product preview">
        <button class="screen-lightbox-nav prev" type="button" aria-label="Previous preview" data-screen-prev>&larr;</button>
        <button class="screen-lightbox-nav next" type="button" aria-label="Next preview" data-screen-next>&rarr;</button>
        <div class="screen-lightbox-head">
          <h3 data-screen-lightbox-title></h3>
          <button class="screen-lightbox-close" type="button" aria-label="Close preview" data-screen-close>&times;</button>
        </div>
        <div class="screen-lightbox-image-wrap">
          <img src="" alt="" data-screen-lightbox-image />
        </div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const lightboxImage = lightbox.querySelector('[data-screen-lightbox-image]');
    const lightboxTitle = lightbox.querySelector('[data-screen-lightbox-title]');
    let activeIndex = 0;

    const renderLightbox = (index) => {
      const button = screenButtons[index];
      if (!button || !lightboxImage || !lightboxTitle) return;
      activeIndex = index;
      lightboxImage.src = button.getAttribute('data-screen-open') || '';
      lightboxImage.alt = button.getAttribute('data-screen-alt') || '';
      lightboxTitle.textContent = button.getAttribute('data-screen-title') || 'Product preview';
    };

    const closeLightbox = () => {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    };

    lightbox.querySelectorAll('[data-screen-close]').forEach((button) => {
      button.addEventListener('click', closeLightbox);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeLightbox();
      if (!lightbox.classList.contains('open')) return;
      if (event.key === 'ArrowLeft') renderLightbox((activeIndex - 1 + screenButtons.length) % screenButtons.length);
      if (event.key === 'ArrowRight') renderLightbox((activeIndex + 1) % screenButtons.length);
    });

    lightbox.querySelector('[data-screen-prev]')?.addEventListener('click', () => {
      renderLightbox((activeIndex - 1 + screenButtons.length) % screenButtons.length);
    });

    lightbox.querySelector('[data-screen-next]')?.addEventListener('click', () => {
      renderLightbox((activeIndex + 1) % screenButtons.length);
    });

    screenButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        renderLightbox(index);
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
  }

  const demoWidget = document.querySelector('[data-demo-widget]');
  if (demoWidget) {
    const demoOpenButtons = Array.from(document.querySelectorAll('[data-demo-open]'));
    const widgetToggle = demoWidget.querySelector('[data-demo-toggle]');
    const demoForm = demoWidget.querySelector('[data-demo-form]');
    const status = demoWidget.querySelector('[data-demo-status]');
    const title = demoWidget.querySelector('[data-demo-title]');
    const copy = demoWidget.querySelector('[data-demo-copy]');
    const note = demoWidget.querySelector('[data-demo-note]');
    const submitText = demoWidget.querySelector('[data-demo-submit]');
    const fields = {
      name: demoForm?.querySelector('[name="name"]'),
      email: demoForm?.querySelector('[name="email"]'),
      propertyName: demoForm?.querySelector('[name="propertyName"]'),
      phone: demoForm?.querySelector('[name="phone"]'),
      note: demoForm?.querySelector('[name="note"]'),
    };
    const fieldWraps = {
      name: demoForm?.querySelector('[data-demo-field="name"]'),
      email: demoForm?.querySelector('[data-demo-field="email"]'),
      propertyName: demoForm?.querySelector('[data-demo-field="propertyName"]'),
      phone: demoForm?.querySelector('[data-demo-field="phone"]'),
      note: demoForm?.querySelector('[data-demo-field="note"]'),
    };
    const firstInput = demoForm?.querySelector('input, textarea');
    let demoMode = 'demo';

    const applyDemoMode = (mode = 'demo') => {
      demoMode = mode;
      const isTrial = mode === 'trial';
      if (title) title.textContent = isTrial ? 'Sign-up for AI-Bot 15 days Free Trial' : 'Book a HotelRADAR demo';
      if (copy) {
        copy.innerHTML = isTrial
          ? 'Share your name and mobile number. Our team will help you activate your 15 days AI-Bot free trial.'
          : 'Share a few details and our team will reach out on <a href="mailto:support@hotelradar.in"><strong>support@hotelradar.in</strong></a>.';
      }
      if (note) {
        note.textContent = isTrial
          ? 'Best for quick AI-Bot trial activation and onboarding support.'
          : 'Best for platform walkthroughs, pricing questions, and onboarding discussions.';
      }
      if (submitText) submitText.textContent = isTrial ? 'Start free trial' : 'Notify support';

      if (fieldWraps.email) fieldWraps.email.hidden = isTrial;
      if (fieldWraps.propertyName) fieldWraps.propertyName.hidden = isTrial;
      if (fieldWraps.note) fieldWraps.note.hidden = isTrial;
      if (fields.email) fields.email.required = !isTrial;
      if (fields.phone) fields.phone.required = true;
      if (fields.note && isTrial) fields.note.value = 'AI-Bot 15 days Free Trial signup';
    };

    const openDemoWidget = (mode = 'demo') => {
      applyDemoMode(mode);
      demoWidget.classList.add('open');
      demoWidget.scrollIntoView({ behavior: 'smooth', block: 'end' });
      window.setTimeout(() => {
        const activeFirstInput = isFinite(0) && mode === 'trial'
          ? (fields.name || fields.phone || firstInput)
          : firstInput;
        activeFirstInput?.focus();
      }, 180);
    };

    if (widgetToggle) {
      widgetToggle.addEventListener('click', () => {
        demoWidget.classList.toggle('open');
      });
    }

    demoOpenButtons.forEach((button) => {
      button.addEventListener('click', () => {
        openDemoWidget(button.getAttribute('data-demo-mode') || 'demo');
      });
    });

    if (demoForm && status) {
      demoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = 'Sending your request...';
        status.className = 'demo-widget-status';

        const submitButton = demoForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        const payload = {
          name: demoForm.querySelector('[name="name"]')?.value?.trim() || '',
          email: demoForm.querySelector('[name="email"]')?.value?.trim() || '',
          propertyName: demoForm.querySelector('[name="propertyName"]')?.value?.trim() || '',
          phone: demoForm.querySelector('[name="phone"]')?.value?.trim() || '',
          note: demoForm.querySelector('[name="note"]')?.value?.trim() || '',
          sourcePage: window.location.pathname,
          requestType: demoMode,
        };

        try {
          const response = await fetch('/api/public/demo-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to submit request.');
          status.textContent = result.message || 'Thanks. Your request has been saved.';
          status.className = 'demo-widget-status success';
          demoForm.reset();
          applyDemoMode(demoMode);
        } catch (error) {
          status.textContent = error.message || 'Unable to submit request right now.';
          status.className = 'demo-widget-status error';
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    }

    applyDemoMode('demo');
  }


  // HotelRADAR_AI_WIDGET_CONFIGURED_20260601
  const hotelRadarAiWidgetSrc = 'https://gpt.hotelradar.in/widget.js?v=20260601o';
  if (!document.body.classList.contains('noir-home') && !document.body.classList.contains('tech-page') && !document.querySelector('script[data-hotelradar-ai-widget="true"]')) {
    const aiWidgetScript = document.createElement('script');
    aiWidgetScript.src = hotelRadarAiWidgetSrc;
    aiWidgetScript.defer = true;
    aiWidgetScript.dataset.hotelradarAiWidget = 'true';
    aiWidgetScript.dataset.hotelId = 'hotelradar';
    aiWidgetScript.dataset.hotelName = 'HotelRADAR Assistant';
    aiWidgetScript.dataset.hotelLocation = 'LeadOS revenue intelligence';
    aiWidgetScript.dataset.productMode = 'true';
    aiWidgetScript.dataset.color = '#16a34a';
    aiWidgetScript.dataset.font = 'Plus Jakarta Sans';
    aiWidgetScript.dataset.heroImage = 'https://hotelradar.in/leados-1.jpg?v=20260601m';
    aiWidgetScript.dataset.launcherIcon = 'https://hotelradar.in/hotelradar-ai-bot-icon.svg?v=20260601o';
    document.body.appendChild(aiWidgetScript);
  }

});
