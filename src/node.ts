import { dirname, extname } from 'path'
import type { RawSourceMap } from 'source-map'
import sourceMapSupport from 'source-map-support'
import { transformSync, TransformOptions } from 'esbuild'
import { addHook } from 'pirates'
import fs from 'fs'
import module from 'module'
import process from 'process'
import { getOptions, inferPackageFormat } from './options'
import { removeNodePrefix } from './utils'
import { registerTsconfigPaths } from './tsconfig-paths'

const map: { [file: string]: string | RawSourceMap } = {}

function installSourceMapSupport() {
  if ((process as any).setSourceMapsEnabled) {
    (process as any).setSourceMapsEnabled(true);
  } else {
    sourceMapSupport.install({
      handleUncaughtExceptions: false,
      environment: 'node',
      retrieveSourceMap(file) {
        if (map[file]) {
          return {
            url: file,
            map: map[file],
          }
        }
        return null
      },
    })
  }
}

type COMPILE = (
  code: string,
  filename: string,
  format?: 'cjs' | 'esm',
) => string

/**
 * Patch the Node CJS loader to suppress the ESM error
 * https://github.com/nodejs/node/blob/069b5df/lib/internal/modules/cjs/loader.js#L1125
 *
 * As per https://github.com/standard-things/esm/issues/868#issuecomment-594480715
 */
function patchCommonJsLoader(compile: COMPILE) {
  // @ts-expect-error
  const extensions = module.Module._extensions
  const jsHandler = extensions['.js']

  extensions['.js'] = function (module: any, filename: string) {
    try {
      return jsHandler.call(this, module, filename)
    } catch (error: any) {
      if (error.code !== 'ERR_REQUIRE_ESM') {
        throw error
      }

      let content = fs.readFileSync(filename, 'utf8')
      content = compile(content, filename, 'cjs')
      module._compile(content, filename)
    }
  }
}

type LOADERS = 'js' | 'jsx' | 'ts' | 'tsx' | 'binary' | 'text'
const FILE_LOADERS = {
  '.js': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.mjs': 'js',
  '.binary': 'binary',
  '.txt': 'text'
} as const

type EXTENSIONS = keyof typeof FILE_LOADERS

const DEFAULT_EXTENSIONS = Object.keys(FILE_LOADERS)

const getLoader = (filename: string): LOADERS =>
  FILE_LOADERS[extname(filename) as EXTENSIONS]

interface RegisterOptions extends TransformOptions {
  extensions?: EXTENSIONS[]
  /**
   * Auto-ignore node_modules. Independent of any matcher.
   * @default true
   */
  hookIgnoreNodeModules?: boolean
  /**
   * A matcher function, will be called with path to a file. Should return truthy if the file should be hooked, falsy otherwise.
   */
  hookMatcher?(fileName: string): boolean
}

export function register(esbuildOptions: RegisterOptions = {}) {
  const {
    extensions = DEFAULT_EXTENSIONS,
    hookIgnoreNodeModules = true,
    hookMatcher,
    ...overrides
  } = esbuildOptions

  const compile: COMPILE = function compile(code, filename, format) {
    const dir = dirname(filename)
    const options = getOptions(dir)
    format = format ?? inferPackageFormat(dir, filename)

    const {
      code: js,
      warnings,
      map: jsSourceMap,
    } = transformSync(code, {
      sourcefile: filename,
      sourcemap: 'both',
      loader: getLoader(filename),
      target: options.target,
      jsxFactory: options.jsxFactory,
      jsxFragment: options.jsxFragment,
      format,
      ...overrides,
    })
    map[filename] = jsSourceMap
    if (warnings && warnings.length > 0) {
      for (const warning of warnings) {
        console.log(warning.location)
        console.log(warning.text)
      }
    }
    if (format === 'esm') return js
    return removeNodePrefix(js)
  }

  const revert = addHook(compile, {
    exts: extensions,
    ignoreNodeModules: hookIgnoreNodeModules,
    matcher: hookMatcher,
  })

  installSourceMapSupport()
  patchCommonJsLoader(compile)

  const unregisterTsconfigPaths = registerTsconfigPaths()

  return {
    unregister() {
      revert()
      unregisterTsconfigPaths()
    },
  }
}

export type Register = ReturnType<typeof register>
