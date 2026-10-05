#!/usr/bin/env node
import { main } from '../packages/cli/bin/gittoskill.mjs'
main().catch(error => { console.error(`[gittoskill] ${error.message}`); process.exitCode = 1 })
