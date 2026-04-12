import { Router } from 'express'

import type { ApplicationService } from '../../domain/application-service'

/**
 * Mounted at `/v1/applications/:id`. Exposes:
 *   - GET /history
 */
export function buildHistoryRouter(service: ApplicationService): Router {
  const router = Router({ mergeParams: true })

  router.get('/history', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string }
      const events = await service.history(id)
      res.json({ items: events })
    } catch (err) {
      next(err)
    }
  })

  return router
}
