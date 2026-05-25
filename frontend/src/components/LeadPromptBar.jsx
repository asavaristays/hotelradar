const SUGGESTED_PROMPTS = [
  'Find hotels in Goa without chatbot',
  'Jaipur hotels rating below 4',
  'Mumbai hotels with many reviews',
];

export default function LeadPromptBar({
  onSubmit,
  loading = false,
  placeholder = 'Find hotels in Goa without chatbot rating below 4',
  value = '',
  onChange = () => {},
  recentPrompts = [],
  onSelectRecentPrompt = () => {},
}) {
  async function handleSubmit(event) {
    event.preventDefault();
    const safePrompt = String(value || '').trim();
    if (!safePrompt || loading) return;
    await onSubmit(safePrompt);
  }

  return (
    <form className="panel leadPromptBar" onSubmit={handleSubmit}>
      <div className="leadPromptBarHeader">
        <h3>Lead Search</h3>
        <p className="metaLabel">Use natural language to rank hotel opportunities.</p>
      </div>
      <div className="leadPromptBarControls">
        <input
          className="leadPromptInput"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" disabled={loading || !String(value || '').trim()}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      <div className="leadPromptSuggestions" aria-label="Suggested prompts">
        {SUGGESTED_PROMPTS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="leadPromptSuggestion"
            onClick={() => onChange(suggestion)}
            disabled={loading}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {recentPrompts.length > 0 && (
        <div className="leadPromptRecent">
          <span className="metaLabel">Recent searches:</span>
          <div className="leadPromptSuggestions" aria-label="Recent prompts">
            {recentPrompts.map((recentPrompt) => (
              <button
                key={recentPrompt}
                type="button"
                className="leadPromptSuggestion"
                onClick={() => onSelectRecentPrompt(recentPrompt)}
                disabled={loading}
              >
                {recentPrompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
