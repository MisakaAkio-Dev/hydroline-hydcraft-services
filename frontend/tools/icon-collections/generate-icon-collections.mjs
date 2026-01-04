// 这个脚本用于扫描前端源码里所有 icon="i-*" 与 name="i-*" 的用法，
// 同时读取 OAuth 品牌图标（frontend/src/utils/oauth/brand.ts），
// 生成按需的 Iconify 子集 JSON（lucide / heroicons / logos）。
//
// 产出内容：
// - frontend/src/icons/lucide.json
// - frontend/src/icons/heroicons.json
// - frontend/src/icons/logos.json
//
// 背景：
// - 之前直接引入完整图标包导致主包体积过大（例如 @iconify-json/logos 非常大）。
// - 这里改为“1:1 只注册实际使用的图标”，保证不丢图标的同时显著减小体积。
//
// 产出文件用途：
// - 在 frontend/src/main.ts 里通过 addCollection(...) 注册，
//   替代整包 icons.json 的直接引入。
//
// 使用方式：
// - 运行：node frontend/tools/icon-collections/generate-icon-collections.mjs
// - 每次新增或修改图标使用处后，请重新运行一次。

import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const frontendRoot =
  path.basename(cwd) === 'frontend' ? cwd : path.join(cwd, 'frontend')
const srcRoot = path.join(frontendRoot, 'src')

// Match any string starting with "i-" or "logos:" inside quotes
// This catches:
// - icon="i-lucide-home"
// - name="i-lucide-home"
// - :icon="condition ? 'i-lucide-sun' : 'i-lucide-moon'"
// - { icon: 'i-lucide-settings' }
const iconRegex = /['"]((?:i-|logos:)[\w:-]+)['"]/g
const brandFile = path.join(srcRoot, 'utils/oauth/brand.ts')
const outputDir = path.join(srcRoot, 'icons')

function walkFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, files)
    } else if (
      entry.isFile() &&
      (fullPath.endsWith('.vue') || fullPath.endsWith('.ts'))
    ) {
      files.push(fullPath)
    }
  }
  return files
}

function collectIcons() {
  const icons = new Set()
  const files = walkFiles(srcRoot)
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const match of content.matchAll(iconRegex)) {
      icons.add(match[1])
    }
  }

  if (fs.existsSync(brandFile)) {
    const content = fs.readFileSync(brandFile, 'utf8')
    for (const match of content.matchAll(/return\s+'([^']+)'/g)) {
      const value = match[1]
      if (value.startsWith('logos:') || value.startsWith('i-')) {
        icons.add(value)
      }
    }
  }

  return icons
}

function splitCollection(iconName) {
  if (iconName.startsWith('logos:')) {
    return { collection: 'logos', name: iconName.slice('logos:'.length) }
  }
  if (!iconName.startsWith('i-')) return null
  const raw = iconName.slice(2)
  const dashIndex = raw.indexOf('-')
  if (dashIndex === -1) return null
  return {
    collection: raw.slice(0, dashIndex),
    name: raw.slice(dashIndex + 1),
  }
}

function loadCollectionJson(collection) {
  const filePath = path.join(
    frontendRoot,
    'node_modules',
    '@iconify-json',
    collection,
    'icons.json',
  )
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

function buildSubset(collection, names) {
  const source = loadCollectionJson(collection)
  const subset = {
    prefix: source.prefix,
    icons: {},
  }
  if (source.width) subset.width = source.width
  if (source.height) subset.height = source.height
  const aliases = source.aliases ?? {}
  const subsetAliases = {}

  const ensureIcon = (name) => {
    if (subset.icons[name] || subsetAliases[name]) return true
    const icon = source.icons?.[name]
    if (icon) {
      subset.icons[name] = icon
      return true
    }
    const alias = aliases[name]
    if (alias) {
      subsetAliases[name] = alias
      return ensureIcon(alias.parent)
    }
    return false
  }

  const missing = []
  for (const name of names) {
    if (!ensureIcon(name)) missing.push(name)
  }

  if (Object.keys(subsetAliases).length > 0) {
    subset.aliases = subsetAliases
  }

  return { subset, missing }
}

const icons = collectIcons()
const byCollection = new Map()

for (const iconName of icons) {
  const parsed = splitCollection(iconName)
  if (!parsed) {
    console.warn(`Skip unsupported icon: ${iconName}`)
    continue
  }
  if (!byCollection.has(parsed.collection)) {
    byCollection.set(parsed.collection, new Set())
  }
  byCollection.get(parsed.collection).add(parsed.name)
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const allMissing = []
for (const [collection, names] of byCollection.entries()) {
  const { subset, missing } = buildSubset(collection, names)
  if (missing.length) {
    allMissing.push({ collection, missing })
  }
  const outFile = path.join(outputDir, `${collection}.json`)
  fs.writeFileSync(outFile, JSON.stringify(subset, null, 2) + '\n')
  console.log(
    `Generated ${outFile} (${Object.keys(subset.icons).length} icons)`,
  )
}

if (allMissing.length) {
  console.error('Missing icons:')
  for (const entry of allMissing) {
    console.error(`${entry.collection}: ${entry.missing.join(', ')}`)
  }
  process.exit(1)
}
