import { Fragment, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Props {
  children: string
  /** Tighter spacing for compact panels (e.g. floating assistant) */
  compact?: boolean
  /**
   * Optional transform applied to every string child inside parsed markdown
   * nodes. Used by the answer renderer to swap [n] markers for citation chips.
   */
  transformText?: (text: string) => ReactNode
}

function applyTransform(
  children: ReactNode,
  transform?: (s: string) => ReactNode,
): ReactNode {
  if (!transform) return children
  if (typeof children === 'string') return transform(children)
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === 'string'
        ? <Fragment key={i}>{transform(c)}</Fragment>
        : c
    )
  }
  return children
}

export function NootMarkdown({ children, compact = false, transformText }: Props) {
  const gap = compact ? 'mb-1.5' : 'mb-2'
  const tx = (c: ReactNode) => applyTransform(c, transformText)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p({ children }) {
          return <p className={`${gap} last:mb-0 leading-relaxed`}>{tx(children)}</p>
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !String(children).includes('\n')
          return isInline ? (
            <code
              className="font-mono text-[0.82em] bg-forest/[0.08] border border-forest/15 px-1.5 py-0.5 rounded"
              {...props}
            >
              {children}
            </code>
          ) : (
            <pre className="bg-forest/[0.05] border border-forest/10 rounded-lg p-3 overflow-x-auto my-2 text-left">
              <code className={`font-mono text-xs ${className ?? ''}`}>
                {String(children).replace(/\n$/, '')}
              </code>
            </pre>
          )
        },
        ul({ children }) {
          return <ul className={`list-disc pl-4 ${gap} space-y-0.5`}>{children}</ul>
        },
        ol({ children }) {
          return <ol className={`list-decimal pl-5 ${gap} space-y-0.5`}>{children}</ol>
        },
        li({ children }) {
          return <li className="leading-relaxed">{tx(children)}</li>
        },
        strong({ children }) {
          return <strong className="font-semibold">{tx(children)}</strong>
        },
        em({ children }) {
          return <em className="opacity-80">{tx(children)}</em>
        },
        h1({ children }) {
          const cls = compact
            ? 'text-lg font-medium mb-1 mt-2 first:mt-0'
            : 'text-[30px] font-semibold mb-3 mt-6 first:mt-0 tracking-tight text-forest leading-tight'
          return <h1 className={`font-[family-name:var(--font-display)] ${cls}`}>{tx(children)}</h1>
        },
        h2({ children }) {
          const cls = compact
            ? 'text-base font-medium mb-1 mt-2 first:mt-0'
            : 'text-[23px] font-semibold mb-2 mt-5 first:mt-0 tracking-tight text-forest leading-snug'
          return <h2 className={`font-[family-name:var(--font-display)] ${cls}`}>{tx(children)}</h2>
        },
        h3({ children }) {
          const cls = compact
            ? 'text-sm font-medium mb-1 mt-1 first:mt-0'
            : 'text-[18px] font-semibold mb-1.5 mt-4 first:mt-0 tracking-tight text-forest leading-snug'
          return <h3 className={`font-[family-name:var(--font-display)] ${cls}`}>{tx(children)}</h3>
        },
        blockquote({ children }) {
          return <blockquote className="border-l-2 border-sage/40 pl-3 opacity-70 my-2">{tx(children)}</blockquote>
        },
        a({ href, children }) {
          return (
            <a href={href} className="underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity" target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        },
        hr() {
          return <hr className="border-forest/15 my-3" />
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
