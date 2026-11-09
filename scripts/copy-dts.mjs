// tsdown 的 dts 分块输出为 index-<hash>.d.ts（isolated dts 固有行为），
// 而 package.json 的 types 指向 lib/index.d.ts。构建后复制一份固定名，
// 否则 TS 用户解析类型会 404（v3.1.0 发版前预检发现，2026-11-09）。
import { readdirSync, copyFileSync, existsSync } from 'node:fs'

const files = readdirSync('lib')
const hashDts = files.find(f => /^index-.*\.d\.ts$/.test(f) && !f.endsWith('.map'))

if (hashDts) {
  copyFileSync(`lib/${hashDts}`, 'lib/index.d.ts')
  console.log(`dts: ${hashDts} -> lib/index.d.ts`)
} else if (existsSync('lib/index.d.ts')) {
  console.log('dts: lib/index.d.ts already present')
} else {
  console.error('dts: no .d.ts found in lib/')
  process.exit(1)
}
