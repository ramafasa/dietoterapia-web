/**
 * PzkMaterialBody Component
 *
 * Renders material content (Markdown).
 *
 * MVP Implementation:
 * - Displays Markdown as plain text with whitespace-pre-wrap
 * - No HTML parsing (security: prevents XSS)
 *
 * Future Enhancement:
 * - Add react-markdown + remark-gfm
 * - Style with Tailwind Typography (prose)
 *
 * Props:
 * - contentMd: string | null
 */

interface PzkMaterialBodyProps {
  contentMd: string | null
}

export function PzkMaterialBody({ contentMd }: PzkMaterialBodyProps) {
  // Don't render section if no content
  if (!contentMd) {
    return null
  }

  return (
    <section
      className="bg-white rounded-xl border-2 border-neutral-light p-6 mb-6"
      aria-label="Treść materiału"
    >
      <article className="prose prose-neutral max-w-none">
        {/* MVP: Plain text with preserved whitespace */}
        <div className="text-neutral-dark whitespace-pre-wrap leading-relaxed">
          {contentMd}
        </div>

        {/* Future: React Markdown
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className="prose prose-neutral max-w-none"
        >
          {contentMd}
        </ReactMarkdown>
        */}
      </article>
    </section>
  )
}
