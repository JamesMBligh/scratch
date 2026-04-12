/**
 * Name-prefixing helpers used by the engine builders.
 *
 * The rationale is that `entity-engine` requires assessment `name@version`
 * pairs to be globally unique per engine instance, and `workflow-engine`
 * requires guard keys to be unique per engine instance. We run one of
 * each engine for the whole platform and coexist multiple products by
 * prefixing any name that would otherwise collide with the productId.
 *
 * Prefixing happens only at the boundary — product authors write plain
 * names, the application layer exposes plain names to API callers, and
 * this module is the only place that knows about the wire format.
 */

const SEP = '.'

/** `transaction-account.contact-details-sufficient` */
export function prefixAssessment(productId: string, localName: string): string {
  return `${productId}${SEP}${localName}`
}

/** `transaction-account.validate-tfn-format` */
export function prefixFunction(productId: string, localName: string): string {
  return `${productId}${SEP}${localName}`
}

/** `transaction-account.contact-details-complete` */
export function prefixGuard(productId: string, localName: string): string {
  return `${productId}${SEP}${localName}`
}
