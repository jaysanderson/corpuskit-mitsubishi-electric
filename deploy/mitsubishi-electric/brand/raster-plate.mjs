import { chromium } from '/Users/jsanders/Claude/mitsu/arag-document-processing/node_modules/@playwright/test/index.mjs'
import { readFileSync } from 'node:fs'
const svg = readFileSync('mitsubishi-electric-australia-website-logo-1.svg', 'utf8')
const b = await chromium.launch({ channel: 'chrome' })
const p = await b.newPage({ viewport: { width: 392, height: 164 }, deviceScaleFactor: 2 })
await p.setContent(
  `<html><body style="margin:0;background:transparent"><div style="width:392px;height:164px;background:#fff;border-radius:6px;padding:10px 16px;box-sizing:border-box"><div style="width:360px;height:144px;overflow:hidden">${
    svg.replace('<svg ', '<svg style="width:1018px;height:144px;display:block" ')
  }</div></div></body></html>`,
)
await p.screenshot({ path: 'logo-plate.png', omitBackground: true })
await b.close()
