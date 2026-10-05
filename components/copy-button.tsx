'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'

export function CopyButton({ text, label = 'Copy', compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('copied') } catch { setState('failed') }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }
  return <button type="button" className={`copy-button ${compact ? 'icon-button' : ''}`} onClick={() => void copy()} aria-label={state === 'copied' ? `${label}: copied` : state === 'failed' ? `${label}: copy failed, select the text manually` : label} title={state === 'failed' ? 'Select and copy the text manually' : label}>
    <Icon name={state === 'copied' ? 'check' : 'copy'} size={16} />{!compact ? <span>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span> : null}
  </button>
}
