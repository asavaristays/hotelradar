import { useMemo, useState } from 'react';

const SIGNAL_TYPES = [
  { value: 'official', label: 'Official rate', helper: 'Own booking engine or direct rate.' },
  { value: 'ota', label: 'OTA rate', helper: 'Google Hotels, Agoda, Expedia, MMT, Booking.com.' },
  { value: 'competitor', label: 'Competitor rate', helper: 'Comparable or aspirational comp-set property.' },
  { value: 'event', label: 'Event / holiday', helper: 'Public holiday, festival, concert, sports, city event.' },
  { value: 'mice', label: 'MICE', helper: 'Corporate offsite, conference, exhibition, meeting demand.' },
  { value: 'wedding', label: 'Wedding', helper: 'Destination wedding or banquet enquiry pressure.' },
  { value: 'airfare', label: 'Travel search / airfare', helper: 'Flight/search pressure or arrival demand.' },
  { value: 'weather', label: 'Weather / risk', helper: 'Rain, disruption, access or cancellation risk.' },
];

function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

async function readError(response, fallback = 'Unable to save signal.') {
  try {
    const text = await response.text();
    if (!text) return fallback;
    const json = JSON.parse(text);
    return json?.error || json?.message || fallback;
  } catch {
    return fallback;
  }
}

function quickSignalFor(type, selectedDate) {
  const date = selectedDate || todayIndia();
  const presets = {
    official: {
      source_name: 'Official booking engine',
      value_numeric: '35400',
      value_text: 'Official rate visible for selected stay date.',
    },
    ota: {
      source_name: 'Google Hotels',
      value_numeric: '36100',
      value_text: 'OTA displayed rate for same occupancy and room basis.',
    },
    competitor: {
      source_name: 'Comparable comp-set property',
      value_numeric: '28600',
      value_text: 'Comparable public rate for selected stay date.',
    },
    event: {
      source_name: 'Market event / holiday pressure',
      value_numeric: '18',
      value_text: 'Event can lift leisure demand for this stay date.',
    },
    mice: {
      source_name: 'Corporate offsite demand window',
      value_numeric: '14',
      value_text: 'MICE/offsite enquiry pressure around this date.',
    },
    wedding: {
      source_name: 'Destination wedding enquiry window',
      value_numeric: '18',
      value_text: 'Wedding/group demand pressure for weekend dates.',
    },
    airfare: {
      source_name: 'Travel search / airfare pressure',
      value_numeric: '16',
      value_text: 'Travel search or airfare movement supports watch status.',
    },
    weather: {
      source_name: 'Weather / monsoon risk',
      value_numeric: '-4',
      value_text: 'Weather can soften last-minute conversion.',
    },
  };
  return {
    source_type: type,
    checkin_date: date,
    confidence_score: type === 'official' ? '88' : '72',
    proof_url: '',
    ...presets[type],
  };
}

export default function SignalInputPanel({
  token = '',
  hotelId = '',
  selectedDate = '',
  onSaved = () => {},
}) {
  const defaultDate = normalizeDate(selectedDate) || todayIndia();
  const [form, setForm] = useState(() => quickSignalFor('official', defaultDate));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedType = useMemo(
    () => SIGNAL_TYPES.find((item) => item.value === form.source_type) || SIGNAL_TYPES[0],
    [form.source_type],
  );
  const isRateType = ['official', 'ota', 'competitor'].includes(form.source_type);
  const valueLabel = isRateType ? 'Rate / ADR' : 'Impact score';

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleTypeChange(nextType) {
    setForm((prev) => ({
      ...quickSignalFor(nextType, prev.checkin_date || defaultDate),
      proof_url: prev.proof_url || '',
    }));
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (!hotelId) throw new Error('Select a hotel before adding market signals.');
      const payload = {
        source_type: form.source_type,
        checkin_date: normalizeDate(form.checkin_date),
        source_name: form.source_name,
        value_numeric: form.value_numeric === '' ? null : Number(form.value_numeric),
        value_text: form.value_text,
        proof_url: form.proof_url,
        confidence_score: Number(form.confidence_score || 72),
      };

      const response = await fetch(`/hotel/${encodeURIComponent(hotelId)}/signals`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const result = await response.json();
      setMessage(
        `Saved ${result.officialRows + result.otaRows + result.competitorRows + result.eventRows + result.airfareRows + result.weatherRows} signal and recalculated ${result.recalculatedDates} date.`,
      );
      await onSaved(payload.checkin_date, result);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save signal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel signalInputPanel" aria-label="Manual market signal input">
      <header className="panelHeader signalInputHeader">
        <div className="gridMetaBlock">
          <span className="workspaceEyebrow">Phase 2 input workflow</span>
          <h2>Signal Input</h2>
          <p className="metaLabel">
            Add verified market observations without CSV. Each entry updates Revenue Intelligence for the selected stay date.
          </p>
        </div>
      </header>

      {!hotelId ? (
        <div className="signalInputEmpty">
          <p>Select a hotel from the top bar before adding signals.</p>
        </div>
      ) : (
        <div className="signalInputGrid">
          <aside className="signalInputTypeList" aria-label="Signal types">
            {SIGNAL_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`signalTypeButton ${form.source_type === type.value ? 'active' : ''}`}
                onClick={() => handleTypeChange(type.value)}
              >
                <span>{type.label}</span>
                <small>{type.helper}</small>
              </button>
            ))}
          </aside>

          <form className="signalInputForm" onSubmit={handleSubmit}>
            <div className="signalInputFormIntro">
              <h3>{selectedType.label}</h3>
              <p>{selectedType.helper}</p>
            </div>

            <div className="signalFormRow">
              <label>
                <span>Stay date</span>
                <input
                  type="date"
                  value={form.checkin_date}
                  onChange={(event) => updateField('checkin_date', normalizeDate(event.target.value))}
                  required
                />
              </label>
              <label>
                <span>Confidence</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.confidence_score}
                  onChange={(event) => updateField('confidence_score', event.target.value)}
                />
              </label>
            </div>

            <label>
              <span>Source name</span>
              <input
                type="text"
                value={form.source_name}
                onChange={(event) => updateField('source_name', event.target.value)}
                placeholder="Example: Google Hotels, Agoda, Comparable property, Wedding enquiry"
                required
              />
            </label>

            <label>
              <span>{valueLabel}</span>
              <input
                type="number"
                step="0.01"
                value={form.value_numeric}
                onChange={(event) => updateField('value_numeric', event.target.value)}
                placeholder={isRateType ? 'Example: 35400' : 'Example: 18'}
                required={isRateType}
              />
            </label>

            <label>
              <span>Signal note</span>
              <textarea
                rows="4"
                value={form.value_text}
                onChange={(event) => updateField('value_text', event.target.value)}
                placeholder="What changed, why this date matters, and how confident we are."
              />
            </label>

            <label>
              <span>Proof URL / source link</span>
              <input
                type="url"
                value={form.proof_url}
                onChange={(event) => updateField('proof_url', event.target.value)}
                placeholder="https://..."
              />
            </label>

            {message ? <p className="signalInputMessage success">{message}</p> : null}
            {error ? <p className="signalInputMessage error">{error}</p> : null}

            <div className="signalInputActions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save signal'}
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setForm(quickSignalFor(form.source_type, defaultDate))}
                disabled={saving}
              >
                Reset example
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
