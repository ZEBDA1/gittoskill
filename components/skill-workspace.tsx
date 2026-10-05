'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import { CollapsibleSection } from '@/components/collapsible-section'
import { CopyButton } from '@/components/copy-button'
import { Icon } from '@/components/icons'
import type { SkillOutput, StyleObservation } from '@/lib/skill-types'
import { splitSkillMarkdownSections, getDefaultOpenSectionId } from '@/lib/parse-skill-sections'

const SkillMarkdown = dynamic(() => import('@/components/skill-markdown').then(module => module.SkillMarkdown), { loading: () => <p className="muted">Loading preview…</p> })
const TABS = ['Style guide', 'Evidence', 'SKILL.md'] as const
const AGENTS = [{ value: '', label: 'Choose during installation' }, { value: 'cursor', label: 'Cursor' }, { value: 'codex', label: 'Codex' }, { value: 'claude-code', label: 'Claude Code' }]
const supportLabel = { repeated: 'Across projects', 'single-project': 'Project observation', 'self-described': 'Self-described' }
function markdownBody(markdown: string) { return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim() }

function Observation({ item }: { item: StyleObservation }) {
  return <article className="observation">
    <div className="observation-top"><span className={`support-badge ${item.support === 'repeated' ? 'repeated' : ''}`}>{supportLabel[item.support]}</span>{item.sources.every(source => source.attribution === 'verified') ? <span className="attributed-label"><Icon name="check" size={13} /> Profile-attributed excerpt</span> : null}</div>
    <p>{item.text}</p>
    <div className="observation-sources">{item.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" title={`${source.repo}/${source.path}`}><Icon name="file" size={13} /><span>{source.repo.split('/').at(-1)}/{source.path}{source.startLine ? `:${source.startLine}` : ''}</span><Icon name="external" size={11} /></a>)}</div>
  </article>
}

export function SkillWorkspace({ output, cached, onDownloadError }: { output: SkillOutput; cached: boolean; onDownloadError: () => void }) {
  const body = markdownBody(output.skillMarkdown)
  const sections = useMemo(() => splitSkillMarkdownSections(body).filter(section => !['overview', 'references', 'evidence-scope'].includes(section.id)), [body])
  const [tab, setTab] = useState<(typeof TABS)[number]>('Style guide')
  const [openSectionId, setOpenSectionId] = useState<string | null>(() => sections.find(section => section.title === 'Code Style')?.id || getDefaultOpenSectionId(sections))
  const [agent, setAgent] = useState('')
  const [archiving, setArchiving] = useState(false)
  const resultRef = useRef<HTMLHeadingElement | null>(null)
  const analysis = output.analysis
  const displayName = output.displayName || output.login
  const installCommand = `${output.installCommand}${agent ? ` --agent ${agent}` : ''}`
  const evidenceSources = useMemo(() => [...new Map((analysis?.observations ?? []).flatMap(item => item.sources).map(source => [source.id, source])).values()], [analysis])
  useEffect(() => {
    document.title = `@${output.login} coding style guide | GitToSkill`
    resultRef.current?.focus({ preventScroll: true })
    resultRef.current?.closest('[data-results]')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [output])
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a')
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  async function downloadBundle() {
    if (!output || archiving) return
    setArchiving(true)
    try {
      const { createSkillArchive } = await import('@/lib/skill-archive')
      downloadBlob(new Blob([createSkillArchive(output)], { type: 'application/x-tar' }), `${output.skillDirectoryName}.tar`)
    } catch { onDownloadError() }
    finally { setArchiving(false) }
  }
  function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null
    if (next === null) return
    event.preventDefault(); setTab(TABS[next]); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <section className="result-workspace" aria-labelledby="skill-title" data-results>
        <div className="result-header"><div className="profile-monogram" aria-hidden="true">{output.login.slice(0, 2).toUpperCase()}</div><div className="result-identity"><p className="eyebrow">YOUR CODING STYLE GUIDE</p><h2 ref={resultRef} id="skill-title" tabIndex={-1}>{displayName}</h2><a href={`https://github.com/${output.login}`} target="_blank" rel="noreferrer">@{output.login}<Icon name="external" size={12} /></a>{analysis?.profileType === 'Organization' ? <span className="profile-type">Organization</span> : null}</div><div className="result-meta"><span className="ready-badge"><Icon name="check" size={13} /> {cached ? 'Cached analysis' : analysis?.observations.length === 0 ? 'Analysis ready' : 'Guide ready'}</span>{output.generatedAt ? <span>{new Date(output.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span> : null}</div></div>
        <div className="workspace-grid"><div className="workspace-main">
          <div className="result-tabs" role="tablist" aria-label="Skill views" onKeyDown={tabKeys}>{TABS.map((name, index) => <button type="button" key={name} id={`view-tab-${index}`} role="tab" aria-selected={tab === name} aria-controls={`view-panel-${index}`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}>{name}{name === 'Evidence' && analysis ? <span>{analysis.coverage.sources}</span> : null}</button>)}</div>
          <div id={`view-panel-${TABS.indexOf(tab)}`} role="tabpanel" aria-labelledby={`view-tab-${TABS.indexOf(tab)}`} className="view-panel" tabIndex={0}>
            {tab === 'Style guide' ? <>
              <div className="view-intro"><h3>{analysis?.observations.length === 0 ? 'Not enough evidence for a style guide.' : 'Observed conventions, ready to use.'}</h3><p>{analysis?.observations.length === 0 ? 'Review the scope of this analysis before using the downloaded files.' : 'Apply these when they fit your project. The labels show how broadly each observation is supported.'}</p></div>
              {analysis?.observations.length !== 0 ? sections.map(section => <CollapsibleSection key={section.id} id={section.id} title={section.title} rawContent={section.content} count={analysis?.observations.filter(item => item.section === section.title).length || undefined} isOpen={openSectionId === section.id} onToggle={() => setOpenSectionId(value => value === section.id ? null : section.id)}>{analysis?.observations.some(item => item.section === section.title) ? analysis.observations.filter(item => item.section === section.title).map((item, index) => <Observation key={index} item={item} />) : <SkillMarkdown content={section.content} />}</CollapsibleSection>) : null}
              {!sections.length || analysis?.observations.length === 0 ? <p className="empty-state">There was not enough public evidence to infer a coding style. Explore the evidence tab for the scope of this analysis.</p> : null}
              <div className="guide-footnote"><Icon name="search" size={16} /><span>This is a sampled guide, not a complete account of someone’s work.</span><button type="button" onClick={() => setTab('Evidence')}>See the evidence <Icon name="arrow" size={13} /></button></div>
            </> : tab === 'Evidence' ? <>
              <div className="view-intro"><h3>See what the guide is based on.</h3><p>Project ownership and code authorship are different. Only explicitly attributed excerpts are labelled as this profile’s work.</p></div>
              {analysis ? <><div className="evidence-summary"><span className="coverage-label">{analysis.coverage.level === 'broad' ? 'Broader implementation sample' : analysis.coverage.level === 'limited' ? 'Limited implementation sample' : 'Minimal implementation sample'}</span><p>{analysis.coverage.repositories} repositories · {analysis.coverage.codeSamples} code excerpts · {analysis.coverage.attributedSamples} profile-attributed excerpts</p></div><div className="repository-list">{analysis.repositories.map(repo => <article key={repo.name} className="repository-row"><div><a href={repo.url} target="_blank" rel="noreferrer"><Icon name="github" size={16} />{repo.name}<Icon name="external" size={12} /></a><p>{repo.language || 'Language not reported'} · {repo.relationship === 'owned' ? 'Profile-owned project' : 'Public contribution'} · {repo.files} sampled files</p></div><span>{repo.attributedSamples} attributed excerpts</span></article>)}</div>
                <h4 className="subsection-label">Cited files</h4>{evidenceSources.length ? <ul className="source-list">{evidenceSources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer"><Icon name="file" size={16} /><span><strong>{source.path}</strong><small>{source.repo}{source.startLine ? ` · lines ${source.startLine}–${source.endLine}` : ''}</small></span><Icon name="external" size={13} /></a><span className="source-attribution">{source.attribution === 'verified' ? 'Profile-attributed' : source.attribution === 'self-described' ? 'Self-described' : 'Project context'}</span></li>)}</ul> : <p className="muted">No files were cited in a style observation.</p>}
                <div className="scope-note"><h4>What this sample can tell you</h4><ul>{analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul></div></> : <p className="empty-state">Detailed evidence metadata is unavailable in this older result. The downloadable bundle includes its reference files.</p>}
            </> : <><div className="file-toolbar"><span><Icon name="file" size={16} />{output.skillDirectoryName}/SKILL.md</span><CopyButton text={output.skillMarkdown} label="Copy SKILL.md" /></div><pre className="raw-skill" tabIndex={0}><code>{output.skillMarkdown}</code></pre></>}
          </div>
        </div><aside className="install-sidebar" aria-label="Use your skill">
          <div className="install-panel"><span className="install-icon"><Icon name="terminal" size={22} /></span><h3>Make it part of your workflow.</h3><p>Install the guide in your coding agent, or download all files for a manual setup.</p><label htmlFor="coding-agent">Coding agent</label><select id="coding-agent" value={agent} onChange={event => setAgent(event.target.value)}>{AGENTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div className="install-command"><code>{installCommand}</code><CopyButton text={installCommand} label="Copy install command" compact /></div><p className="install-hint">Run from your project folder. The installer helps you choose where to add the skill.</p><div className="download-separator"><span>or take the files with you</span></div><button type="button" className="button button-primary download-button" disabled={archiving} onClick={() => void downloadBundle()}><Icon name="download" size={16} />{archiving ? 'Preparing bundle…' : 'Download skill bundle'}</button><p className="bundle-hint">SKILL.md + {output.references.length} reference {output.references.length === 1 ? 'file' : 'files'} · .tar</p><button type="button" className="text-button markdown-download" onClick={() => downloadBlob(new Blob([output.skillMarkdown], { type: 'text/markdown;charset=utf-8' }), 'SKILL.md')}>Download only SKILL.md <Icon name="arrow" size={13} /></button></div>
          <div className="sample-note"><Icon name="layers" size={18} /><div><strong>Keep the context.</strong><p>References travel with the bundle so your agent can inspect the evidence behind the guide.</p></div></div>
        </aside></div>
      </section>
  )
}
