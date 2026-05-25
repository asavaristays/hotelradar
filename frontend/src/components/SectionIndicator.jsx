export default function SectionIndicator({ items = [], activeSection = '' }) {
  return (
    <nav className="sectionIndicator" aria-label="Dashboard section indicator">
      {items.map((item) => {
        const active = item.id === activeSection;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`sectionIndicatorItem ${active ? 'is-active' : ''}`}
            aria-current={active ? 'true' : undefined}
          >
            <span className="sectionIndicatorDot" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
