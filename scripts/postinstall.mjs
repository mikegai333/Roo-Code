import ncp from 'ncp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const targetDir = path.join(__dirname, '../dist/tree-sitter-wasms')
fs.mkdirSync(targetDir, { recursive: true })

await new Promise((resolve, reject) => {
  ncp(
    path.join(__dirname, '../node_modules/tree-sitter-wasms/out'),
    targetDir,
    (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
  )
})

const wasmTargetDir = path.join(__dirname, '../out')
fs.mkdirSync(wasmTargetDir, { recursive: true })

fs.copyFileSync(
  path.join(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm'),
  path.join(__dirname, '../dist/tree-sitter.wasm')
)

// 将翻译后的 eslint 规则复制到 eslint 包中
const sourceRulesDir = path.join(__dirname, '../config/custom-rules/eslint')
const targetRulesDir = path.join(__dirname, '../node_modules/eslint/lib/rules')

await new Promise((resolve, reject) => {
  ncp(sourceRulesDir, targetRulesDir, { clobber: true }, (error) => {
    if (error) {
      reject(error)
    } else {
      resolve()
    }
  })
})

// 将翻译后的 vue 规则复制到 eslint-plugin-vue 包中
const sourceVueRulesDir = path.join(__dirname, '../config/custom-rules/vue')
const targetVueRulesDir = path.join(__dirname, '../config/eslint-plugin-vue/lib/rules')

await new Promise((resolve, reject) => {
  ncp(sourceVueRulesDir, targetVueRulesDir, { clobber: true }, (error) => {
    if (error) {
      reject(error)
    } else {
      resolve()
    }
  })
})
