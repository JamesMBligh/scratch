import { Router } from 'express'

import type { ApplicationService } from '../../domain/application-service'
import type { ProductDefinition } from '../../domain/products'

/**
 * Strip the function-valued `guards` field from a product before
 * serialising it to JSON. Clients want the declarative shape only.
 */
function serialiseProduct(product: ProductDefinition) {
  return {
    id: product.id,
    label: product.label,
    description: product.description,
    schema: product.schema,
    assessments: product.assessments.map((a) => ({
      name: a.name,
      version: a.version,
      schemaId: a.schemaId,
      precondition: a.precondition,
      rules: a.rules,
    })),
    workflow: {
      name: product.workflow.name,
      version: product.workflow.version,
      initialState: product.workflow.initialState,
      finalStates: product.workflow.finalStates,
      states: product.workflow.states,
      transitions: product.workflow.transitions,
    },
  }
}

export function buildProductsRouter(service: ApplicationService): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      items: service.listProducts().map(serialiseProduct),
    })
  })

  router.get('/:productId', (req, res, next) => {
    try {
      const product = service.getProduct(req.params.productId)
      if (!product) {
        res.status(404).json({
          error: { code: 'UNKNOWN_PRODUCT', message: `Unknown product: ${req.params.productId}` },
        })
        return
      }
      res.json(serialiseProduct(product))
    } catch (err) {
      next(err)
    }
  })

  return router
}
