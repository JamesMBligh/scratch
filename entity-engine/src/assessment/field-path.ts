/**
 * Resolve a dot-notation path into a nested object/array structure.
 *
 * Supports:
 *   - 'a.b.c'            → nested object keys
 *   - 'a[0].b'           → array index segments
 *   - 'a.0.b'            → numeric keys treated as array indices
 *
 * Returns `undefined` when any segment along the path is missing.
 */
export function getFieldValue(data: unknown, path: string): unknown {
  if (data === null || data === undefined) return undefined
  if (path === '') return data

  const segments = tokenise(path)
  let cursor: unknown = data
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined
    if (typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

function tokenise(path: string): string[] {
  const tokens: string[] = []
  let buffer = ''

  const flush = () => {
    if (buffer.length > 0) {
      tokens.push(buffer)
      buffer = ''
    }
  }

  for (let i = 0; i < path.length; i++) {
    const ch = path[i]
    if (ch === '.') {
      flush()
    } else if (ch === '[') {
      flush()
      const end = path.indexOf(']', i)
      if (end === -1) {
        // Malformed path; treat the rest as a literal segment.
        buffer = path.slice(i + 1)
        i = path.length
      } else {
        tokens.push(path.slice(i + 1, end))
        i = end
      }
    } else {
      buffer += ch
    }
  }
  flush()
  return tokens
}
