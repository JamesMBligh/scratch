import express from 'express'
import type { Application as ExpressApp } from 'express'

import type { ApplicationService } from '../domain/application-service'
import { errorMiddleware } from './errors'
import { buildApplicationsRouter } from './routes/applications'
import { buildAssessmentsRouter } from './routes/assessments'
import { buildHistoryRouter } from './routes/history'
import { buildProductsRouter } from './routes/products'
import { buildTransitionsRouter } from './routes/transitions'

/**
 * Builds the Express application. Accepts an ApplicationService so that
 * tests can hand in a service backed by fresh in-memory engines on every
 * run.
 */
export function createServer(service: ApplicationService): ExpressApp {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // Health — also useful as a smoke test.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  // Products
  app.use('/v1/products', buildProductsRouter(service))

  // Applications — CRUD lives at the top-level router, and the
  // sub-resource routers (transitions, history, assessments) are mounted
  // at /v1/applications/:id so they share the :id path parameter.
  app.use('/v1/applications', buildApplicationsRouter(service))
  app.use('/v1/applications/:id', buildTransitionsRouter(service))
  app.use('/v1/applications/:id', buildHistoryRouter(service))
  app.use('/v1/applications/:id', buildAssessmentsRouter(service))

  app.use(errorMiddleware)
  return app
}
