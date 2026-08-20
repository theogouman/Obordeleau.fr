export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Structured data is generated from local content, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
