import { serializeJsonLd } from './json-ld'

/**
 * Inline structured data. `dangerouslySetInnerHTML` is safe here only because
 * `serializeJsonLd` escapes every character that could close the script tag;
 * never pass it anything that has not been through that function.
 */
export function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
