'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Icon } from '@/components/icons'
import type { SkillOutput } from '@/lib/skill-types'
import { isSkillOutput } from '@/lib/skill-client'
import { parseGitHubProfileInput } from '@/lib/parse-github-profile'

const SkillWorkspace = dynamic(() => import('@/components/skill-workspace').then(module => module.SkillWorkspace), { loading: () => <p className="workspace-loading" role="status">Preparing your guide…</p> })
const EXAMPLES = ['shadcn', 'karpathy', 'torvalds']

type Notice = { title: string; detail: string; kind: 'error' | 'notice' }

function friendlyError(code: string, message: string): Notice {
  if (['CONFIGURATION', 'UPSTREAM_CONFIGURATION', 'STORAGE_UNAVAILABLE'].includes(code)) return { title: 'The service is not ready yet', detail: 'Generation is temporarily unavailable. Please contact the site owner or try again later.', kind: 'error' }
  if (code === 'PROFILE_NOT_FOUND') return { title: 'Profile not found', detail: 'Check the username or link. You can analyse public user and organization profiles.', kind: 'error' }
  if (['RATE_LIMIT', 'BUDGET_LIMIT', 'UPSTREAM_RATE_LIMIT'].includes(code)) return { title: 'Please try again a little later', detail: message, kind: 'error' }
  if (code === 'CAPACITY') return { title: 'All analysis slots are busy', detail: 'Wait a moment, then try again. Your profile is ready to submit.', kind: 'error' }
  if (code === 'TIMEOUT' || code === 'REQUEST_TIMEOUT') return { title: 'This analysis took too long', detail: 'Please retry. A completed result may already be available in the cache.', kind: 'error' }
  return { title: 'We could not finish this analysis', detail: message || 'Please try again. Your profile input has been kept.', kind: 'error' }
}

function ExamplePreview() {
  return <aside className="example-preview" aria-label="Illustrative skill preview">
    <div className="preview-top"><span className="preview-file"><Icon name="file" size={15} /> SKILL.md</span><span className="preview-label">ILLUSTRATIVE PREVIEW</span></div>
    <div className="preview-code">
      <div className="code-row"><span>01</span><code className="code-muted">---</code></div>
      <div className="code-row"><span>02</span><code><b>name:</b> your-coding-skill</code></div>
      <div className="code-row"><span>03</span><code><b>description:</b> A style worth carrying forward.</code></div>
      <div className="code-row"><span>04</span><code className="code-muted">---</code></div>
      <div className="code-row spacer"><span>05</span><code /></div>
      <div className="code-row"><span>06</span><code className="code-heading">## Code Style</code></div>
      <div className="code-row"><span>07</span><code>- Keep validation close to module boundaries.</code></div>
      <div className="code-row"><span>08</span><code>- Prefer small, explicit interfaces.</code></div>
      <div className="code-row spacer"><span>09</span><code /></div>
      <div className="code-row"><span>10</span><code className="code-heading">## Testing</code></div>
      <div className="code-row"><span>11</span><code>- Cover failure paths as well as happy paths.</code></div>
      <div className="code-row spacer"><span>12</span><code /></div>
      <div className="code-row"><span>13</span><code className="code-muted">&gt; Every observation links to its evidence.</code></div>
    </div>
    <div className="preview-bottom"><span><span className="tiny-dot" /> Public code → practical guidance</span><Icon name="code" size={16} /></div>
    <div className="preview-caption"><Icon name="layers" size={16} /><span>One portable skill. Your preferred coding agent.</span></div>
  </aside>
}


export function GittoskillHome({ initialProfileInput = '' }: { initialProfileInput?: string }) {
  const [profileInput, setProfileInput] = useState(initialProfileInput)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [output, setOutput] = useState<SkillOutput | null>(null)
  const [cached, setCached] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const parsed = parseGitHubProfileInput(profileInput)
  const validationError = touched && profileInput.trim() && !parsed ? 'Use a GitHub username or profile link, such as @shadcn.' : null


  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    if (!loading) return
    const timer = setInterval(() => setElapsed(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [loading])


  async function runGeneration(input: string) {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true); setElapsed(0); setNotice(null); setOutput(null)
    try {
      const response = await fetch('/api/generate-skill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: input }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)]) })
      const data: unknown = await response.json()
      if (!response.ok) {
        const error = data && typeof data === 'object' ? data as { error?: string; code?: string } : {}
        setNotice(friendlyError(typeof error.code === 'string' ? error.code : '', typeof error.error === 'string' ? error.error : 'Please retry in a moment.'))
        return
      }
      if (!isSkillOutput(data)) throw new Error('The returned skill could not be verified. Please try again.')
      setCached(['HIT', 'COALESCED'].includes(response.headers.get('X-GitToSkill-Cache') || ''))
      setOutput(data)
      window.history.replaceState(null, '', `/${encodeURIComponent(data.login)}`)
    } catch (error) {
      setNotice(controller.signal.aborted ? { title: 'Analysis cancelled', detail: 'You can adjust the profile and start again whenever you are ready.', kind: 'notice' } : error instanceof Error && error.name === 'TimeoutError' ? friendlyError('TIMEOUT', '') : friendlyError('', error instanceof Error ? error.message : 'Check your connection and try again.'))
    } finally { setLoading(false); requestRef.current = null }
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault(); setTouched(true)
    if (!parsed || loading) { inputRef.current?.focus(); return }
    void runGeneration(profileInput)
  }

  return <div className="site-shell">
    <header className="site-header"><div className="page-width header-inner">
      <Link className="wordmark" href="/" aria-label="GitToSkill home"><span className="brand-mark"><Icon name="code" size={20} /></span>GitToSkill<span className="wordmark-dot">.</span></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a className="github-link" href="https://github.com/filiksyos/gittoskill" target="_blank" rel="noreferrer"><Icon name="github" size={17} /><span>GitHub</span><Icon name="external" size={12} /></a></nav>
    </div></header>
    <main className="page-width" id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-main">
          <p className="eyebrow"><span className="eyebrow-line" /> FROM PUBLIC CODE TO YOUR CODING AGENT</p>
          <h1 id="hero-title">Good code has<br />a point of view.<br /><span>Make it a skill.</span></h1>
          <p className="hero-description">Bring a GitHub profile’s coding conventions into your next project. A practical guide, grounded in real code, with sources you can inspect.</p>
          <form className="profile-form" onSubmit={onSubmit} aria-busy={loading}>
            <div className="form-label-row"><label htmlFor="github-profile">GitHub profile</label><span>Public work only</span></div>
            <div className={`profile-input-row ${validationError ? 'has-error' : ''}`}>
              <Icon name="github" size={20} /><input ref={inputRef} id="github-profile" name="profile" type="text" placeholder="@username or github.com/username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={256} value={profileInput} onChange={event => { setProfileInput(event.target.value); setNotice(null) }} onBlur={() => setTouched(true)} disabled={loading} aria-invalid={Boolean(validationError)} aria-describedby={validationError ? 'profile-validation' : 'profile-help'} />
              {profileInput && !loading ? <button type="button" className="input-clear" aria-label="Clear profile" onClick={() => { setProfileInput(''); setTouched(false); inputRef.current?.focus() }}><Icon name="close" size={15} /></button> : null}
              <button className="button button-primary generate-button" type="submit" disabled={loading || !parsed}>{loading ? <><span className="spinner" />Analysing</> : <>Create skill<Icon name="arrow" size={17} /></>}</button>
            </div>
            <p id={validationError ? 'profile-validation' : 'profile-help'} className={`input-help ${validationError ? 'validation-error' : ''}`}>{validationError || (parsed ? `Ready to explore @${parsed.login}’s public work.` : 'Works with personal profiles and organizations.')}</p>
            <div className="example-profiles"><span>Try a profile</span>{EXAMPLES.map(name => <button key={name} type="button" disabled={loading} onClick={() => { setProfileInput(`@${name}`); setTouched(false); setNotice(null); inputRef.current?.focus() }}>@{name}<Icon name="arrow" size={12} /></button>)}</div>
          </form>
          {loading ? <div className="analysis-pending"><div className="pending-top"><span role="status"><span className="spinner" /> Exploring @{parsed?.login}</span><span aria-hidden="true">{elapsed}s</span></div><p>Reading public projects and checking evidence. Your guide will appear below when it is ready.</p><button type="button" className="text-button" onClick={() => requestRef.current?.abort()}>Cancel analysis</button></div> : null}
          {notice ? <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><strong>{notice.title}</strong><p>{notice.detail}</p>{notice.kind === 'error' && parsed ? <button type="button" className="text-button" disabled={loading} onClick={() => void runGeneration(profileInput)}>Try again <Icon name="arrow" size={14} /></button> : null}</div> : null}
          <div className="hero-trust"><span><Icon name="check" size={14} /> Traceable observations</span><span><Icon name="check" size={14} /> Agent-ready files</span></div>
        </div>
        <ExamplePreview />
      </section>

      {output ? <SkillWorkspace key={`${output.login}-${output.generatedAt || ''}`} output={output} cached={cached} onDownloadError={() => setNotice({ title: 'The archive could not be prepared', detail: 'Try the download again, or copy SKILL.md from the file tab.', kind: 'error' })} /> : null}

      <section className="how-section" id="how-it-works" aria-labelledby="how-title"><div className="how-heading"><p className="eyebrow">A SMALL INPUT. A USEFUL STARTING POINT.</p><h2 id="how-title">From profile to practical guidance.</h2><p>You stay in control of what you bring into your project.</p></div><div className="how-steps">{[{ title: 'Start with a profile', text: 'A username or link is all you need. We explore a sample of public projects and contributions.', icon: 'github' as const }, { title: 'Inspect the style', text: 'Review code conventions, testing and design observations. Follow the source links and check their scope.', icon: 'search' as const }, { title: 'Bring it to your agent', text: 'Copy the install command or download the complete skill, with its reference files included.', icon: 'terminal' as const }].map((step, index) => <article key={step.title}><div className="step-top"><span>0{index + 1}</span><Icon name={step.icon} size={21} /></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
    </main>
    <footer className="site-footer"><div className="page-width footer-inner"><Link href="/" className="footer-brand">GitToSkill.</Link><span>Public evidence. Portable guidance.</span><a href="https://filiksyos.com" target="_blank" rel="noreferrer">Made by Filiksyos <Icon name="external" size={12} /></a></div></footer>
  </div>
}
