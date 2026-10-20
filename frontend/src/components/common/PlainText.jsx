// Renders CMS text. The CMS stores plain text only (HTML is refused by the API), and this component only ever outputs
// text nodes, so nothing a content editor types can become markup. Blank lines start a new paragraph.
export default function PlainText({ text, className = '' }) {
  if (!text) return null;
  const paragraphs = String(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line break-words [&:not(:first-child)]:mt-4">{paragraph}</p>
      ))}
    </div>
  );
}
