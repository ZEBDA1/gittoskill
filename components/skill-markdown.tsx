import ReactMarkdown from 'react-markdown'

export function SkillMarkdown({ content }: { content: string }) {
  return <div className="skill-prose"><ReactMarkdown components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{content}</ReactMarkdown></div>
}
