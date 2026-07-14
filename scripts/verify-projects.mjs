import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

function walkDir(dir, extension, ignorePattern = null) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(filePath, extension, ignorePattern))
    } else {
      if (filePath.endsWith(extension) && (!ignorePattern || !ignorePattern.test(filePath))) {
        results.push(filePath)
      }
    }
  }
  return results
}

console.log('Running verify-projects gate...')
let failed = false

// Gate 1: Every .mjs in src/ has a .spec.mjs
const backendSrcDir = path.join(ROOT, 'src')
const mjsFiles = walkDir(backendSrcDir, '.mjs', /\.spec\.mjs$/)

for (const mjs of mjsFiles) {
  const specFile = mjs.replace(/\.mjs$/, '.spec.mjs')
  if (!fs.existsSync(specFile)) {
    console.error(`❌ Missing spec file for: ${path.relative(ROOT, mjs)}`)
    failed = true
  }
}

// Gate 2: Every .tsx page in frontend/src/pages has a .spec.tsx
const pagesDir = path.join(ROOT, 'frontend', 'src', 'pages')
const tsxFiles = walkDir(pagesDir, '.tsx', /\.spec\.tsx$/)

for (const tsx of tsxFiles) {
  const specFile = tsx.replace(/\.tsx$/, '.spec.tsx')
  if (!fs.existsSync(specFile)) {
    console.error(`❌ Missing spec file for page: ${path.relative(ROOT, tsx)}`)
    failed = true
  }
}

if (failed) {
  console.error('\n🚫 Gate failed. Please add missing test specs before proceeding.')
  process.exit(1)
}

console.log('✅ verify-projects gate passed.')
process.exit(0)
