import type { InfoDoc } from "../lib/content";

export function InfoDocView({ doc }: { doc: InfoDoc }) {
  return (
    <article className="panel-card info-doc">
      <h2>{doc.title}</h2>
      <p className="muted">Last updated {doc.updated}</p>
      {doc.sections.map((section) => (
        <section key={section.heading} className="info-section">
          <h3>{section.heading}</h3>
          {section.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
