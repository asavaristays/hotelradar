import { jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../src/db/pool.js', () => ({
  pool: {
    query,
  },
}));

const { getSystemStatus } = await import('../src/services/systemStatusService.js');

describe('systemStatusService', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('returns system counters using the available notifications table', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ table_name: 'market_opportunity_notifications' }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 4275 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 2155 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 300 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 3765 }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-15T12:05:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-15T12:20:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 12, yesterday_total: 9 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 2155, yesterday_total: 2148 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 300, yesterday_total: 295 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 3765, yesterday_total: 3761 }],
      });

    const payload = await getSystemStatus({
      now: new Date('2026-03-15T13:00:00.000Z'),
    });

    expect(payload.hotels_indexed).toBe(4275);
    expect(payload.signals_generated).toBe(2155);
    expect(payload.ranked_opportunities).toBe(300);
    expect(payload.notifications_generated).toBe(3765);
    expect(payload.hotels_delta).toEqual({ today_total: 12, yesterday_total: 9, delta: 3 });
    expect(payload.signals_delta).toEqual({ today_total: 2155, yesterday_total: 2148, delta: 7 });
    expect(payload.scrape_status).toBe('completed');
    expect(payload.system_message).toContain('5:30 PM scrape completed');
    expect(payload).toHaveProperty('system_time');
  });

  test('marks scrape as missed after 5:30 PM when no fresh scrape is available', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ table_name: 'market_opportunity_notifications' }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 4275 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 2155 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 300 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 3765 }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-14T08:30:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-14T09:10:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 0, yesterday_total: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 0, yesterday_total: 10 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 0, yesterday_total: 3 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 0, yesterday_total: 6 }],
      });

    const payload = await getSystemStatus({
      now: new Date('2026-03-15T13:30:00.000Z'),
    });

    expect(payload.scrape_status).toBe('missed');
    expect(payload.system_message).toContain('5:30 PM scrape has not run yet');
  });

  test('reports scrape completed but signal refresh pending when only hotel scrape has run', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ table_name: 'market_opportunity_notifications' }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 4275 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 2155 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 300 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: 3765 }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-15T14:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ observed_at: '2026-03-15T05:41:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 7, yesterday_total: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 2, yesterday_total: 8 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 1, yesterday_total: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [{ today_total: 0, yesterday_total: 3 }],
      });

    const payload = await getSystemStatus({
      now: new Date('2026-03-15T14:15:00.000Z'),
    });

    expect(payload.scrape_status).toBe('delayed');
    expect(payload.system_message).toContain('signal refresh is still pending');
  });
});
