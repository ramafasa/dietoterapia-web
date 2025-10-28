import { sequence } from 'astro:middleware'
import { onRequest as authMiddleware } from './auth'
import { onRequest as rbacMiddleware } from './rbac'

export const onRequest = sequence(authMiddleware, rbacMiddleware)
