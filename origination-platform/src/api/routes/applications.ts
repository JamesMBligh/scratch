import { Router } from 'express'

import type { ApplicationService } from '../../domain/application-service'

export function buildApplicationsRouter(service: ApplicationService): Router {
  const router = Router()

  // POST /v1/applications
  router.post('/', async (req, res, next) => {
    try {
      const { productId, data, note } = req.body ?? {}
      if (typeof productId !== 'string') {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'productId is required in the request body',
          },
        })
        return
      }
      const application = await service.create({ productId, data, note })
      res.status(201).json(application)
    } catch (err) {
      next(err)
    }
  })

  // GET /v1/applications
  router.get('/', async (req, res, next) => {
    try {
      const { productId, state, status, limit, offset } = req.query
      const parsedStatus =
        status === 'active' || status === 'completed' ? status : undefined
      const result = await service.list({
        productId:
          typeof productId === 'string' && productId.length > 0
            ? productId
            : undefined,
        state: typeof state === 'string' && state.length > 0 ? state : undefined,
        status: parsedStatus,
        limit: typeof limit === 'string' ? Number(limit) : undefined,
        offset: typeof offset === 'string' ? Number(offset) : undefined,
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  // GET /v1/applications/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const application = await service.get(req.params.id)
      if (!application) {
        res.status(404).json({
          error: {
            code: 'WORKFLOW_INSTANCE_NOT_FOUND',
            message: `Application not found: ${req.params.id}`,
          },
        })
        return
      }
      res.json(application)
    } catch (err) {
      next(err)
    }
  })

  // PUT /v1/applications/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const { data, note } = req.body ?? {}
      const application = await service.update(req.params.id, { data, note })
      res.json(application)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /v1/applications/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      await service.delete(req.params.id)
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  return router
}
