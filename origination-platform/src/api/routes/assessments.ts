import { Router } from 'express'

import type { ApplicationService } from '../../domain/application-service'

/**
 * Mounted at `/v1/applications/:id`. Exposes:
 *   - GET  /assessments                   — all stored runs
 *   - POST /assessments/:name/run         — run a named assessment
 *   - GET  /assessments/:name/latest      — most recent stored run
 */
export function buildAssessmentsRouter(service: ApplicationService): Router {
  const router = Router({ mergeParams: true })

  router.get('/assessments', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string }
      const items = await service.assessmentHistory(id)
      res.json({ items })
    } catch (err) {
      next(err)
    }
  })

  router.post('/assessments/:name/run', async (req, res, next) => {
    try {
      const { id, name } = req.params as { id: string; name: string }
      const result = await service.runAssessment(id, name)
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  router.get('/assessments/:name/latest', async (req, res, next) => {
    try {
      const { id, name } = req.params as { id: string; name: string }
      const result = await service.latestAssessment(id, name)
      if (!result) {
        res.status(404).json({
          error: {
            code: 'NO_ASSESSMENT_RUNS',
            message: `No stored runs of '${name}' for application ${id}`,
          },
        })
        return
      }
      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  return router
}
