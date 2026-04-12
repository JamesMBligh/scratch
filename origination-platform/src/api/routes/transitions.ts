import { Router } from 'express'

import type { ApplicationService } from '../../domain/application-service'

/**
 * Mounted at `/v1/applications/:id` by the server. Handles:
 *   - GET  /available-transitions
 *   - POST /transitions
 */
export function buildTransitionsRouter(service: ApplicationService): Router {
  const router = Router({ mergeParams: true })

  router.get('/available-transitions', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string }
      const transitions = await service.availableTransitions(id)
      res.json({
        items: transitions.map((t) => ({
          name: t.name,
          from: t.from,
          to: t.to,
          guard: t.guard,
          label: t.label,
          description: t.description,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/transitions', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string }
      const { name, eventData, actor, note } = req.body ?? {}
      if (typeof name !== 'string' || name.length === 0) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'transition name is required in the request body',
          },
        })
        return
      }
      const outcome = await service.fire(id, { name, eventData, actor, note })
      res.json(outcome)
    } catch (err) {
      next(err)
    }
  })

  return router
}
