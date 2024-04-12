import cors from 'cors'
import express from 'express'
import { TaskState } from '../generated/graphql'
import { getDigest, setDigest } from '../services/digest'
import { findActiveUser } from '../services/user'
import { analytics } from '../utils/analytics'
import { getClaimsByToken, getTokenByRequest } from '../utils/auth'
import { corsConfig } from '../utils/corsConfig'
import { logger } from '../utils/logger'

interface Feedback {
  digestRating: number
  rankingModels: string[]
  rankingRating: number
  summaryRating: number
  summaryModels: string[]
  voiceRating: number
  musicRating: number
  comment?: string
}

const isFeedback = (data: any): data is Feedback => {
  return (
    'digestRating' in data &&
    'rankingRating' in data &&
    'summaryRating' in data &&
    'voiceRating' in data &&
    'musicRating' in data
  )
}

export function digestRouter() {
  const router = express.Router()

  // v1 version of create digest api
  router.post('/v1', cors<express.Request>(corsConfig), async (req, res) => {
    const token = getTokenByRequest(req)

    let userId: string
    try {
      // get claims from token
      const claims = await getClaimsByToken(token)
      if (!claims) {
        logger.info('Token not found')
        return res.sendStatus(401)
      }

      // get user by uid from claims
      userId = claims.uid
    } catch (error) {
      logger.info('Error while getting claims from token', error)
      return res.sendStatus(401)
    }

    try {
      const user = await findActiveUser(userId)
      if (!user) {
        logger.info(`User not found: ${userId}`)
        return res.sendStatus(401)
      }

      // check if digest job is running
      // if yes then return 202 accepted
      // else enqueue job
      const digest = await getDigest(userId)
      if (digest?.jobState === TaskState.Running) {
        logger.info(`job is running: ${userId}`)
        return res.sendStatus(202)
      }

      // enqueue job and return job id
      const jobId = await setDigest(userId, {
        jobState: TaskState.Running,
      })

      // return job id
      return res.status(201).send({
        jobId,
      })
    } catch (error) {
      logger.error('Error while enqueuing create digest task', error)
      return res.sendStatus(500)
    }
  })

  // v1 version of get digest api
  router.get('/v1', cors<express.Request>(corsConfig), async (req, res) => {
    const token = getTokenByRequest(req)

    let userId: string
    try {
      // get claims from token
      const claims = await getClaimsByToken(token)
      if (!claims) {
        logger.info('Token not found')
        return res.sendStatus(401)
      }

      // get user by uid from claims
      userId = claims.uid
    } catch (error) {
      logger.info('Error while getting claims from token', error)
      return res.sendStatus(401)
    }

    try {
      const user = await findActiveUser(userId)
      if (!user) {
        logger.info(`User not found: ${userId}`)
        return res.sendStatus(401)
      }

      // get digest from redis
      const digest = await getDigest(userId)
      if (!digest) {
        logger.info(`Digest not found: ${userId}`)
        return res.sendStatus(404)
      }

      if (digest.jobState === TaskState.Running) {
        // if job is in queue then return job state
        return res.status(202).send({
          jobState: TaskState.Running,
        })
      }

      // return digest
      return res.send(digest)
    } catch (error) {
      logger.error('Error while getting digest', error)
      return res.sendStatus(500)
    }
  })

  // v1 version of sending feedback api
  router.post(
    '/v1/feedback',
    cors<express.Request>(corsConfig),
    async (req, res) => {
      const token = getTokenByRequest(req)

      let userId: string
      try {
        // get claims from token
        const claims = await getClaimsByToken(token)
        if (!claims) {
          logger.info('Token not found')
          return res.sendStatus(401)
        }

        // get user by uid from claims
        userId = claims.uid
      } catch (error) {
        logger.info('Error while getting claims from token', error)
        return res.sendStatus(401)
      }

      try {
        const user = await findActiveUser(userId)
        if (!user) {
          logger.info(`User not found: ${userId}`)
          return res.sendStatus(401)
        }

        // get feedback from request body
        if (!isFeedback(req.body)) {
          logger.info('Invalid feedback format')
          return res.sendStatus(400)
        }

        const feedback = req.body
        logger.info(`Sending feedback: ${JSON.stringify(feedback)}`)

        // remove comment from feedback before sending to analytics
        delete feedback.comment
        // send feedback to analytics
        analytics.capture({
          distinctId: userId,
          event: 'digest_feedback',
          properties: feedback,
        })

        // return success
        return res.sendStatus(200)
      } catch (error) {
        logger.error('Error while saving feedback', error)
        return res.sendStatus(500)
      }
    }
  )

  return router
}
