'use client'

import type { ReactNode } from 'react'
import { CopyButton } from '@/components/copy-button'
import { Icon } from '@/components/icons'

type CollapsibleSectionProps = { id: string; title: string; isOpen: boolean; onToggle: () => void; children: ReactNode; isFirst?: boolean; rawContent?: string; count?: number }
export function CollapsibleSection({ id, title, isOpen, onToggle, children, rawContent, count }: CollapsibleSectionProps) {
  return <section className={`style-section ${isOpen ? 'is-open' : ''}`}>
    <div className="style-section-heading">
      <button type="button" id={`${id}-trigger`} aria-expanded={isOpen} aria-controls={`${id}-panel`} onClick={onToggle} className="section-toggle">
        <span>{title}</span>{count !== undefined ? <span className="section-count">{count} {count === 1 ? 'observation' : 'observations'}</span> : null}<Icon name="chevron" className="section-chevron" size={16} />
      </button>
      {rawContent ? <CopyButton text={`## ${title}\n\n${rawContent}`} label={`Copy ${title}`} compact /> : null}
    </div>
    <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} hidden={!isOpen} className="section-content">{isOpen ? children : null}</div>
  </section>
}
