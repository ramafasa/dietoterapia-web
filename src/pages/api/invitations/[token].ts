/**
 * GET /api/invitations/:token
 *
 * Validates invitation token from registration flow.
 * Public endpoint - no authentication required.
 *
 * Returns:
 * - 200: Token valid → { valid, email, expiresAt }
 * - 400: Token expired or already used
 * - 404: Invitation not found
 * - 500: Server error
 */

import type { APIRoute } from 'astro'
import type { ValidateInvitationResponse, ApiError } from '@/types'
import { invitationService } from '@/lib/services/invitationService'

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  const token = params.token ?? ''

  // Input validation
  if (!token || token.length === 0 || token.length > 255) {
    const error: ApiError = {
      error: 'bad_request',
      message: 'Token is required and must be between 1 and 255 characters.',
      statusCode: 400
    }
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
  }

  try {
    // Validate token through service layer
    const result = await invitationService.validateToken(token)

    // Handle invalid token scenarios
    if (result.valid === false) {
      if (result.reason === 'not_found') {
        const error: ApiError = {
          error: 'not_found',
          message: 'Invitation not found.',
          statusCode: 404
        }
        return new Response(JSON.stringify(error), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
      }

      // expired_or_used
      const error: ApiError = {
        error: 'invalid_token',
        message: 'Invitation token has expired or has already been used.',
        statusCode: 400
      }
      return new Response(JSON.stringify(error), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }

    // Token is valid - return invitation details
    // Note: expiresAt is serialized to ISO 8601 string by JSON.stringify()
    const response = {
      valid: true,
      email: result.email,
      expiresAt: result.expiresAt.toISOString()
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Error validating invitation token:', error)

    const errorResponse: ApiError = {
      error: 'server_error',
      message: 'Unexpected error occurred while validating invitation.',
      statusCode: 500
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}
