import { ApplicationService } from './domain/application-service'
import { products } from './domain/products'
import { buildEntityEngine } from './engines/entity-engine'
import { buildWorkflowEngine } from './engines/workflow-engine'
import { createServer } from './api/server'

/**
 * Build a fresh ApplicationService with in-memory storage for every
 * registered product. Exposed as a helper so both `index.ts` (server
 * entrypoint) and the test fixtures can use it.
 */
export function buildApplicationService(): ApplicationService {
  const entityEngine = buildEntityEngine(products)
  const workflowEngine = buildWorkflowEngine(products, entityEngine)
  return new ApplicationService(entityEngine, workflowEngine)
}

function main(): void {
  const service = buildApplicationService()
  const app = createServer(service)
  const port = Number(process.env.PORT ?? 3000)
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`origination-platform listening on :${port}`)
  })
}

// Only auto-start when invoked directly — allows tests to import from
// this file without starting a server.
if (require.main === module) {
  main()
}
