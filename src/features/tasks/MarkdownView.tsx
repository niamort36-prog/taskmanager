import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Rendu Markdown (GFM : listes de cases à cocher, tableaux, liens auto).
 * Chargé à la demande (React.lazy) pour ne pas alourdir le premier affichage.
 * Le HTML brut n'est pas interprété : pas de risque d'injection.
 */
export default function MarkdownView({ source }: { source: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
