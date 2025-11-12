# REST API Plan - Dietoterapia Weight Tracking

## 1. Resources

| Resource           | Database Table        | Description                         |
|--------------------|-----------------------|-------------------------------------|
| Users              | `users`               | Patient and dietitian accounts      |
| Sessions           | `sessions`            | Lucia Auth session management       |
| Weight Entries     | `weightEntries`       | Daily weight measurements           |
| Invitations        | `invitations`         | Patient invitation tokens           |
| Password Resets    | `passwordResetTokens` | Password reset tokens               |
| Push Subscriptions | `pushSubscriptions`   | Web push notification endpoints     |
| Consents           | `consents`            | RODO/GDPR consent records           |
| Events             | `events`              | Analytics event tracking            |
| Audit Log          | `auditLog`            | Audit trail for compliance          |
| Login Attempts     | `loginAttempts`       | Rate limiting and security tracking |

## 2. Endpoints

### 2.1 Authentication

#### POST /api/auth/signup

Register new patient account with invitation token.

**Request Body:**

```json
{
  "invitationToken": "abc123...",
  "email": "patient@example.com",
  "password": "SecurePass123",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "age": 35,
  "gender": "male",
  "consents": [
    {
      "type": "data_processing",
      "text": "Zgadzam się na przetwarzanie...",
      "accepted": true
    },
    {
      "type": "health_data",
      "text": "Zgadzam się na przetwarzanie danych zdrowotnych...",
      "accepted": true
    }
  ]
}
```

**Response (201 Created):**

```json
{
  "user": {
    "id": "uuid",
    "email": "patient@example.com",
    "role": "patient",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "age": 35,
    "gender": "male",
    "status": "active"
  },
  "session": {
    "id": "session_token",
    "expiresAt": "2025-11-29T12:00:00Z"
  }
}
```

**Success:**

- `201 Created` - Account created and logged in

**Errors:**

- `400 Bad Request` - Invalid invitation token, expired, or already used
- `400 Bad Request` - Password too short (<8 characters)
- `400 Bad Request` - Missing required consents
- `409 Conflict` - Email already registered
- `422 Unprocessable Entity` - Validation errors (invalid email, missing fields)

---

#### POST /api/auth/login

Login with email and password.

**Request Body:**

```json
{
  "email": "patient@example.com",
  "password": "SecurePass123"
}
```

**Response (200 OK):**

```json
{
  "user": {
    "id": "uuid",
    "email": "patient@example.com",
    "role": "patient",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "active"
  },
  "session": {
    "id": "session_token",
    "expiresAt": "2025-11-29T12:00:00Z"
  }
}
```

**Success:**

- `200 OK` - Logged in successfully

**Errors:**

- `401 Unauthorized` - Invalid email or password
- `429 Too Many Requests` - Rate limit exceeded (5 failed attempts in 15 minutes)
- `422 Unprocessable Entity` - Validation errors

---

#### POST /api/auth/logout

Logout and invalidate current session.

**Request Body:** None (uses session cookie)

**Response (204 No Content):**
No response body.

**Success:**

- `204 No Content` - Logged out successfully

**Errors:**

- `401 Unauthorized` - No valid session

---

#### POST /api/auth/forgot-password

Request password reset link.

**Request Body:**

```json
{
  "email": "patient@example.com"
}
```

**Response (200 OK):**

```json
{
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Success:**

- `200 OK` - Request processed (always returns 200 to prevent email enumeration)

**Errors:**

- `422 Unprocessable Entity` - Invalid email format

---

#### POST /api/auth/reset-password

Reset password using token from email.

**Request Body:**

```json
{
  "token": "reset_token_abc123",
  "newPassword": "NewSecurePass456"
}
```

**Response (200 OK):**

```json
{
  "message": "Password reset successfully. Please log in with your new password."
}
```

**Success:**

- `200 OK` - Password reset successfully, all sessions invalidated

**Errors:**

- `400 Bad Request` - Invalid or expired token
- `400 Bad Request` - Password too short (<8 characters)
- `422 Unprocessable Entity` - Validation errors

---

### 2.2 Invitations

#### POST /api/dietitian/invitations

Create invitation for new patient (dietitian only).

**Request Body:**

```json
{
  "email": "newpatient@example.com"
}
```

**Response (201 Created):**

```json
{
  "invitation": {
    "id": "uuid",
    "email": "newpatient@example.com",
    "token": "invite_abc123...",
    "expiresAt": "2025-10-31T12:00:00Z",
    "createdBy": "dietitian_uuid"
  },
  "message": "Invitation email sent successfully"
}
```

**Success:**

- `201 Created` - Invitation created and email sent

**Errors:**

- `401 Unauthorized` - Not authenticated or not a dietitian
- `403 Forbidden` - User is not a dietitian
- `409 Conflict` - Email already has an active account
- `422 Unprocessable Entity` - Invalid email format

---

#### GET /api/invitations/:token

Validate invitation token (public endpoint for signup flow).

**Response (200 OK):**

```json
{
  "valid": true,
  "email": "newpatient@example.com",
  "expiresAt": "2025-10-31T12:00:00Z"
}
```

**Success:**

- `200 OK` - Token is valid

**Errors:**

- `400 Bad Request` - Token expired or already used
- `404 Not Found` - Token does not exist

---

### 2.3 Weight Entries (Patient)

#### POST /api/weight

Add new weight entry (patient only).

**Request Body:**

```json
{
  "weight": 75.5,
  "measurementDate": "2025-10-30T08:00:00+02:00",
  "note": "Morning weight after breakfast"
}
```

**Response (201 Created):**

```json
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 75.5,
    "measurementDate": "2025-10-30T08:00:00+02:00",
    "source": "patient",
    "isBackfill": false,
    "isOutlier": false,
    "outlierConfirmed": null,
    "note": "Morning weight after breakfast",
    "createdAt": "2025-10-30T12:00:00Z",
    "createdBy": "patient_uuid"
  },
  "warnings": []
}
```

**Response with Anomaly (201 Created):**

```json
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 78.8,
    "measurementDate": "2025-10-30T08:00:00+02:00",
    "source": "patient",
    "isBackfill": false,
    "isOutlier": true,
    "outlierConfirmed": false,
    "note": null,
    "createdAt": "2025-10-30T12:00:00Z",
    "createdBy": "patient_uuid"
  },
  "warnings": [
    {
      "type": "anomaly_detected",
      "message": "Weight change of 3.3 kg detected. Please confirm this is correct.",
      "previousWeight": 75.5,
      "previousDate": "2025-10-29T08:00:00+02:00",
      "change": 3.3
    }
  ]
}
```

**Success:**

- `201 Created` - Entry created successfully

**Errors:**

- `400 Bad Request` - Weight outside range (30-250 kg)
- `400 Bad Request` - Measurement date more than 7 days in the past (backfill limit)
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a patient
- `409 Conflict` - Entry already exists for this date
- `422 Unprocessable Entity` - Validation errors (invalid weight format, note too long)

---

#### GET /api/weight

Get weight entry history (patient only, own entries).

**Query Parameters:**

- `startDate` (optional): ISO 8601 date string (e.g., "2025-10-01")
- `endDate` (optional): ISO 8601 date string (e.g., "2025-10-30")
- `limit` (optional): Number of entries (default: 30, max: 100)
- `cursor` (optional): Pagination cursor (measurementDate of last entry from previous page)

**Response (200 OK):**

```json
{
  "entries": [
    {
      "id": "uuid",
      "userId": "patient_uuid",
      "weight": 75.5,
      "measurementDate": "2025-10-30T08:00:00+02:00",
      "source": "patient",
      "isBackfill": false,
      "isOutlier": false,
      "outlierConfirmed": null,
      "note": "Morning weight",
      "createdAt": "2025-10-30T12:00:00Z",
      "updatedAt": null
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "2025-10-01T08:00:00+02:00"
  }
}
```

**Success:**

- `200 OK` - Entries retrieved successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a patient
- `422 Unprocessable Entity` - Invalid date format

---

#### PATCH /api/weight/:id

Edit existing weight entry (patient only, within edit window).

**Request Body:**

```json
{
  "weight": 75.8,
  "note": "Updated note"
}
```

**Response (200 OK):**

```json
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 75.8,
    "measurementDate": "2025-10-29T08:00:00+02:00",
    "source": "patient",
    "isBackfill": false,
    "isOutlier": false,
    "outlierConfirmed": null,
    "note": "Updated note",
    "createdAt": "2025-10-29T08:30:00Z",
    "updatedAt": "2025-10-30T12:00:00Z",
    "updatedBy": "patient_uuid"
  }
}
```

**Success:**

- `200 OK` - Entry updated successfully

**Errors:**

- `400 Bad Request` - Edit window expired (past end of next day after measurement)
- `400 Bad Request` - Weight outside range (30-250 kg)
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not authorized to edit this entry
- `404 Not Found` - Entry does not exist
- `422 Unprocessable Entity` - Validation errors

---

#### POST /api/weight/:id/confirm

Confirm outlier weight entry.

**Request Body:**

```json
{
  "confirmed": true
}
```

**Response (200 OK):**

```json
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 78.8,
    "measurementDate": "2025-10-30T08:00:00+02:00",
    "source": "patient",
    "isBackfill": false,
    "isOutlier": true,
    "outlierConfirmed": true,
    "note": null,
    "createdAt": "2025-10-30T12:00:00Z",
    "updatedAt": "2025-10-30T12:05:00Z"
  }
}
```

**Success:**

- `200 OK` - Outlier confirmed

**Errors:**

- `400 Bad Request` - Entry is not marked as outlier
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not authorized to confirm this entry
- `404 Not Found` - Entry does not exist

---

#### DELETE /api/weight/:id

Delete weight entry (patient only, within edit window).

**Response (204 No Content):**
No response body.

**Success:**

- `204 No Content` - Entry deleted successfully

**Errors:**

- `400 Bad Request` - Edit window expired
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not authorized to delete this entry
- `404 Not Found` - Entry does not exist

---

### 2.4 Weight Entries (Dietitian)

#### POST /api/dietitian/patients/:patientId/weight

Add weight entry on behalf of patient (dietitian only).

**Request Body:**

```json
{
  "weight": 76.2,
  "measurementDate": "2025-10-30T08:00:00+02:00",
  "note": "Reported via phone consultation"
}
```

**Response (201 Created):**

```json
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 76.2,
    "measurementDate": "2025-10-30T08:00:00+02:00",
    "source": "dietitian",
    "isBackfill": false,
    "isOutlier": false,
    "outlierConfirmed": null,
    "note": "Reported via phone consultation",
    "createdAt": "2025-10-30T12:00:00Z",
    "createdBy": "dietitian_uuid"
  }
}
```

**Success:**

- `201 Created` - Entry created successfully

**Errors:**

- `400 Bad Request` - Weight outside range (30-250 kg)
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `404 Not Found` - Patient does not exist
- `409 Conflict` - Entry already exists for this date
- `422 Unprocessable Entity` - Validation errors

---

#### GET /api/dietitian/patients/:patientId/weight

Get patient's weight history (dietitian only).

**Query Parameters:**

- `view` (optional): "today" | "week" | "range" (default: "week")
- `startDate` (optional): ISO 8601 date string (required if view=range)
- `endDate` (optional): ISO 8601 date string (required if view=range)
- `limit` (optional): Number of entries (default: 30, max: 100)
- `cursor` (optional): Pagination cursor

**Response (200 OK):**

```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "active"
  },
  "entries": [
    {
      "id": "uuid",
      "userId": "patient_uuid",
      "weight": 75.5,
      "measurementDate": "2025-10-30T08:00:00+02:00",
      "source": "patient",
      "isBackfill": false,
      "isOutlier": false,
      "note": "Morning weight",
      "createdAt": "2025-10-30T12:00:00Z"
    }
  ],
  "weeklyObligationMet": true,
  "pagination": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

**Success:**

- `200 OK` - Entries retrieved successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `404 Not Found` - Patient does not exist
- `422 Unprocessable Entity` - Invalid query parameters

---

#### GET /api/dietitian/patients/:patientId/chart

Get chart data with 7-day moving average (dietitian only).

**Query Parameters:**

- `period` (optional): "30" | "90" (days, default: "30")

**Response (200 OK):**

```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "active"
  },
  "chartData": {
    "entries": [
      {
        "date": "2025-10-01",
        "weight": 78.0,
        "source": "patient",
        "isOutlier": false,
        "ma7": 78.2
      },
      {
        "date": "2025-10-02",
        "weight": 77.8,
        "source": "patient",
        "isOutlier": false,
        "ma7": 78.1
      }
    ],
    "statistics": {
      "startWeight": 78.0,
      "endWeight": 75.5,
      "change": -2.5,
      "changePercent": -3.2,
      "avgWeeklyChange": -0.6,
      "trendDirection": "decreasing"
    },
    "goalWeight": 72.0
  }
}
```

**Success:**

- `200 OK` - Chart data retrieved successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `404 Not Found` - Patient does not exist
- `422 Unprocessable Entity` - Invalid period parameter

---

### 2.5 Patient Management (Dietitian)

#### GET /api/dietitian/patients

Get list of all patients (dietitian only).

**Query Parameters:**

- `status` (optional): "active" | "paused" | "ended" | "all" (default: "active")
- `limit` (optional): Number of patients (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**

```json
{
  "patients": [
    {
      "id": "patient_uuid",
      "firstName": "Jan",
      "lastName": "Kowalski",
      "email": "patient@example.com",
      "age": 35,
      "gender": "male",
      "status": "active",
      "createdAt": "2025-09-01T10:00:00Z",
      "lastWeightEntry": "2025-10-30T08:00:00+02:00",
      "weeklyObligationMet": true
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Success:**

- `200 OK` - Patients retrieved successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian

---

#### GET /api/dietitian/patients/:patientId

Get patient details (dietitian only).

**Response (200 OK):**

```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "email": "patient@example.com",
    "age": 35,
    "gender": "male",
    "status": "active",
    "createdAt": "2025-09-01T10:00:00Z",
    "updatedAt": "2025-10-30T12:00:00Z"
  },
  "statistics": {
    "totalEntries": 45,
    "weeklyComplianceRate": 0.85,
    "currentStreak": 12,
    "longestStreak": 28,
    "lastEntry": "2025-10-30T08:00:00+02:00"
  }
}
```

**Success:**

- `200 OK` - Patient retrieved successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `404 Not Found` - Patient does not exist

---

#### PATCH /api/dietitian/patients/:patientId/status

Update patient status (dietitian only).

**Request Body:**

```json
{
  "status": "paused",
  "note": "Patient requested pause due to vacation"
}
```

**Response (200 OK):**

```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "paused",
    "updatedAt": "2025-10-30T12:00:00Z"
  },
  "message": "Patient status updated. Reminders will be paused."
}
```

**Success:**

- `200 OK` - Status updated successfully

**Errors:**

- `400 Bad Request` - Invalid status value
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `404 Not Found` - Patient does not exist
- `422 Unprocessable Entity` - Validation errors

---

### 2.6 Push Notifications

#### POST /api/push/subscribe

Subscribe to web push notifications.

**Request Body:**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "base64_encoded_key",
      "auth": "base64_encoded_key"
    }
  }
}
```

**Response (201 Created):**

```json
{
  "subscription": {
    "id": "uuid",
    "userId": "user_uuid",
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "createdAt": "2025-10-30T12:00:00Z"
  },
  "message": "Push notifications enabled successfully"
}
```

**Success:**

- `201 Created` - Subscription created

**Errors:**

- `401 Unauthorized` - Not authenticated
- `409 Conflict` - Subscription already exists for this endpoint
- `422 Unprocessable Entity` - Invalid subscription format

---

#### DELETE /api/push/subscribe

Unsubscribe from web push notifications.

**Request Body:**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Response (204 No Content):**
No response body.

**Success:**

- `204 No Content` - Unsubscribed successfully

**Errors:**

- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Subscription does not exist

---

### 2.7 User Preferences

#### GET /api/preferences

Get user notification preferences.

**Response (200 OK):**

```json
{
  "preferences": {
    "userId": "user_uuid",
    "pushEnabled": true,
    "emailEnabled": true,
    "reminderFrequency": "default"
  }
}
```

**Success:**

- `200 OK` - Preferences retrieved

**Errors:**

- `401 Unauthorized` - Not authenticated

---

#### PATCH /api/preferences

Update notification preferences.

**Request Body:**

```json
{
  "pushEnabled": false,
  "emailEnabled": true
}
```

**Response (200 OK):**

```json
{
  "preferences": {
    "userId": "user_uuid",
    "pushEnabled": false,
    "emailEnabled": true,
    "reminderFrequency": "default",
    "updatedAt": "2025-10-30T12:00:00Z"
  }
}
```

**Success:**

- `200 OK` - Preferences updated

**Errors:**

- `401 Unauthorized` - Not authenticated
- `422 Unprocessable Entity` - Validation errors

---

### 2.8 Analytics (Dietitian)

#### GET /api/dietitian/analytics/kpi

Get KPI dashboard data (dietitian only).

**Query Parameters:**

- `period` (optional): "week" | "month" | "quarter" (default: "month")

**Response (200 OK):**

```json
{
  "kpi": {
    "period": "month",
    "startDate": "2025-10-01",
    "endDate": "2025-10-30",
    "metrics": {
      "weeklyComplianceRate": 0.82,
      "totalWeeks": 4,
      "weeksWithEntry": 3.28,
      "activePatients": 25,
      "totalEntries": 98,
      "patientEntries": 85,
      "dietitianEntries": 13
    },
    "cohortComparison": {
      "previousPeriod": {
        "weeklyComplianceRate": 0.75,
        "change": 0.07,
        "changePercent": 9.3
      }
    },
    "reminderEffectiveness": {
      "fridayReminders": {
        "sent": 20,
        "opened": 15,
        "clicked": 12,
        "openRate": 0.75,
        "clickRate": 0.60,
        "conversionRate": 0.55
      },
      "sundayReminders": {
        "sent": 12,
        "opened": 9,
        "clicked": 7,
        "openRate": 0.75,
        "clickRate": 0.58,
        "conversionRate": 0.50
      }
    }
  }
}
```

**Success:**

- `200 OK` - KPI data retrieved

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `422 Unprocessable Entity` - Invalid period parameter

---

#### GET /api/dietitian/analytics/cohorts

Get cohort analysis report (dietitian only).

**Query Parameters:**

- `startDate` (required): ISO 8601 date string
- `endDate` (required): ISO 8601 date string
- `groupBy` (optional): "week" | "month" (default: "week")

**Response (200 OK):**

```json
{
  "cohorts": [
    {
      "cohortId": "2025-W40",
      "startDate": "2025-10-01",
      "endDate": "2025-10-07",
      "activePatients": 25,
      "weeklyComplianceRate": 0.88,
      "avgEntriesPerPatient": 1.2,
      "pushOptInRate": 0.72
    }
  ]
}
```

**Success:**

- `200 OK` - Cohort data retrieved

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian
- `422 Unprocessable Entity` - Invalid parameters

---

### 2.9 Audit & Compliance

#### GET /api/dietitian/audit

Get audit log (dietitian only).

**Query Parameters:**

- `userId` (optional): Filter by specific user
- `action` (optional): "create" | "update" | "delete"
- `tableName` (optional): Filter by table name
- `startDate` (optional): ISO 8601 date string
- `endDate` (optional): ISO 8601 date string
- `limit` (optional): Number of entries (default: 50, max: 500)
- `offset` (optional): Pagination offset

**Response (200 OK):**

```json
{
  "auditEntries": [
    {
      "id": "uuid",
      "userId": "user_uuid",
      "action": "update",
      "tableName": "weight_entries",
      "recordId": "entry_uuid",
      "before": {
        "weight": 75.5,
        "note": "Morning weight"
      },
      "after": {
        "weight": 75.8,
        "note": "Updated note"
      },
      "timestamp": "2025-10-30T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 245,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Success:**

- `200 OK` - Audit entries retrieved

**Errors:**

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - User is not a dietitian

---

#### DELETE /api/user/account

Delete user account with RODO-compliant anonymization.

**Request Body:**

```json
{
  "password": "CurrentPassword123",
  "confirmation": "DELETE MY ACCOUNT"
}
```

**Response (200 OK):**

```json
{
  "message": "Account deletion initiated. Your data will be anonymized within 24 hours.",
  "dataExportUrl": "https://api.paulinamaciak.pl/exports/user_data_uuid.json"
}
```

**Success:**

- `200 OK` - Deletion initiated

**Errors:**

- `401 Unauthorized` - Not authenticated
- `400 Bad Request` - Invalid password
- `400 Bad Request` - Invalid confirmation text
- `422 Unprocessable Entity` - Validation errors

---

#### GET /api/user/export

Export all user data (RODO right to data portability).

**Response (200 OK):**

```json
{
  "user": {
    "id": "uuid",
    "email": "patient@example.com",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "age": 35,
    "gender": "male",
    "createdAt": "2025-09-01T10:00:00Z"
  },
  "weightEntries": [
    {
      "weight": 75.5,
      "measurementDate": "2025-10-30T08:00:00+02:00",
      "note": "Morning weight",
      "createdAt": "2025-10-30T12:00:00Z"
    }
  ],
  "consents": [
    {
      "type": "data_processing",
      "accepted": true,
      "timestamp": "2025-09-01T10:00:00Z"
    }
  ],
  "exportedAt": "2025-10-30T12:00:00Z"
}
```

**Success:**

- `200 OK` - Data exported successfully

**Errors:**

- `401 Unauthorized` - Not authenticated

---

### 2.10 CRON Jobs (Scheduled)

#### GET /api/cron/friday-reminder

Send Friday 19:00 weight reminders (called by Vercel Cron).

**Headers:**

```
Authorization: Bearer <CRON_SECRET>
```

**Response (200 OK):**

```json
{
  "jobId": "cron_uuid",
  "timestamp": "2025-10-25T19:00:00+02:00",
  "results": {
    "eligiblePatients": 25,
    "remindersSent": 20,
    "skipped": 5,
    "errors": 0
  },
  "skippedReasons": {
    "alreadyEnteredThisWeek": 3,
    "statusPaused": 2
  }
}
```

**Success:**

- `200 OK` - Job executed successfully

**Errors:**

- `401 Unauthorized` - Invalid or missing CRON_SECRET
- `500 Internal Server Error` - Job execution failed

---

#### GET /api/cron/sunday-reminder

Send Sunday 11:00 weight reminders (called by Vercel Cron).

**Headers:**

```
Authorization: Bearer <CRON_SECRET>
```

**Response (200 OK):**

```json
{
  "jobId": "cron_uuid",
  "timestamp": "2025-10-27T11:00:00+02:00",
  "results": {
    "eligiblePatients": 15,
    "remindersSent": 12,
    "skipped": 3,
    "errors": 0
  },
  "skippedReasons": {
    "alreadyEnteredThisWeek": 2,
    "statusPaused": 1
  }
}
```

**Success:**

- `200 OK` - Job executed successfully

**Errors:**

- `401 Unauthorized` - Invalid or missing CRON_SECRET
- `500 Internal Server Error` - Job execution failed

---

#### GET /api/cron/cleanup-expired-tokens

Clean up expired tokens and sessions (called daily by Vercel Cron).

**Headers:**

```
Authorization: Bearer <CRON_SECRET>
```

**Response (200 OK):**

```json
{
  "jobId": "cron_uuid",
  "timestamp": "2025-10-30T03:00:00Z",
  "results": {
    "expiredSessions": 12,
    "expiredInvitations": 3,
    "expiredResetTokens": 5,
    "accountsScheduledForDeletion": 1
  }
}
```

**Success:**

- `200 OK` - Cleanup completed

**Errors:**

- `401 Unauthorized` - Invalid or missing CRON_SECRET
- `500 Internal Server Error` - Cleanup failed

---

## 3. Authentication and Authorization

### 3.1 Authentication Mechanism

**Session-based authentication using Lucia Auth v3:**

- **Session Duration:** 30 days with automatic renewal on activity
- **Session Storage:** `sessions` table in Neon Postgres
- **Session Cookie:**
    - Name: `auth_session`
    - HttpOnly: `true`
    - Secure: `true` (production only)
    - SameSite: `lax`
    - Path: `/`
    - Max-Age: 2592000 seconds (30 days)

**Session Creation Flow:**

1. User provides email + password
2. Backend validates credentials (bcrypt comparison)
3. If valid, create new session record in `sessions` table
4. Return session ID as httpOnly cookie
5. Log `login_success` event in `events` table

**Session Validation:**

- Middleware checks for `auth_session` cookie on protected routes
- Query `sessions` table by session ID
- Verify session not expired (`expiresAt > NOW()`)
- Attach `user` object to request context
- If invalid/expired, return `401 Unauthorized`

**Session Termination:**

- Logout: Delete session from database + clear cookie
- Password reset: Delete all sessions for user
- Account deletion: Delete all sessions for user

### 3.2 Authorization

**Role-Based Access Control (RBAC):**

**Roles:**

- `patient` - Can manage own weight entries, view own data
- `dietitian` - Can view all patients, manage all weight entries, access analytics

**Authorization Rules:**

| Resource                       | Patient | Dietitian        |
|--------------------------------|---------|------------------|
| Own weight entries (read)      | ✅       | ✅ (all patients) |
| Own weight entries (write)     | ✅       | ❌                |
| Other patient's entries (read) | ❌       | ✅                |
| Add weight for patient         | ❌       | ✅                |
| Patient list                   | ❌       | ✅                |
| Patient status management      | ❌       | ✅                |
| Analytics dashboard            | ❌       | ✅                |
| Audit log                      | ❌       | ✅                |
| Create invitations             | ❌       | ✅                |

**Implementation:**

- Middleware extracts `user.role` from session
- Route handlers check authorization before processing
- Patient-specific routes validate `user.id === resource.userId`
- Unauthorized access attempts logged to `audit_log`

**Rate Limiting (Login Attempts):**

- Track failed login attempts in `login_attempts` table
- Algorithm: 5 failed attempts in 15-minute window = lockout
- Lockout duration: 15 minutes
- Successful login resets counter
- Logged per email address (not IP to avoid shared network issues)

### 3.3 CRON Job Authentication

**Vercel Cron Jobs are authenticated using:**

- Secret token in `Authorization: Bearer <CRON_SECRET>` header
- CRON_SECRET stored in environment variables
- Vercel automatically includes this header (configured in project settings)
- Endpoints validate token before executing scheduled tasks

## 4. Validation and Business Logic

### 4.1 Validation Rules by Resource

#### User Registration

- **Email:** Valid email format, unique, max 255 chars
- **Password:** Minimum 8 characters
- **First Name:** Required, max 100 chars
- **Last Name:** Required, max 100 chars
- **Age:** Optional, integer, 13-120 years
- **Gender:** Optional, one of: "male", "female", "other"
- **Consents:** Required: `data_processing` and `health_data` must be accepted
- **Invitation Token:** Must be valid, not expired, not used

#### Weight Entry

- **Weight:** Required, decimal(4,1), range: 30.0 - 250.0 kg, precision 0.1 kg
- **Measurement Date:** Required, ISO 8601 timestamp with timezone
- **Note:** Optional, max 200 characters
- **Source:** Auto-set: "patient" (patient endpoint) or "dietitian" (dietitian endpoint)
- **isBackfill:** Auto-set: `true` if measurementDate > 0 days and ≤ 7 days in past
- **Backfill Limit:** Measurement date cannot be more than 7 days in the past
- **Future Dates:** Measurement date cannot be in the future
- **One Per Day:** Unique constraint on (userId, DATE(measurementDate AT TIME ZONE 'Europe/Warsaw'))

#### Password Reset

- **Token:** Must be valid, not expired (60 minutes), not used
- **New Password:** Minimum 8 characters

#### Patient Status

- **Status:** Must be one of: "active", "paused", "ended"
- **Note:** Optional, max 500 chars, logged in audit trail

### 4.2 Business Logic Implementation

#### Weight Entry - Anomaly Detection

**Logic:**

1. When new weight entry is created, fetch previous entry for user (by measurementDate DESC)
2. If previous entry exists:
    - Calculate time difference in hours
    - Calculate weight difference in kg
    - If `|weight_diff| > 3.0 kg` AND `time_diff ≤ 48 hours`:
        - Set `isOutlier = true`
        - Set `outlierConfirmed = false`
        - Include warning in response
3. Log event: `outlier_flagged`

**Confirmation Flow:**

- Patient can confirm outlier via `POST /api/weight/:id/confirm`
- Sets `outlierConfirmed = true`
- Log event: `outlier_confirmed`
- Or patient can edit/delete and re-enter correct weight
- Log event: `outlier_corrected`

#### Weight Entry - Edit Window

**Logic:**

1. Calculate edit deadline: `measurementDate + 2 days - 1 second`
    - Example: Measurement on 2025-10-28 → Edit until 2025-10-29 23:59:59
2. On edit request, check: `NOW() <= editDeadline`
3. If expired, return `400 Bad Request` with message
4. If within window, allow edit and log to `audit_log`:
    - Store `before` state (old weight, note)
    - Store `after` state (new weight, note)
    - Record `updatedBy` (user ID) and `updatedAt` (timestamp)

#### Weight Entry - Backfill Detection

**Logic:**

1. Calculate days between `measurementDate` and `NOW()` (in Europe/Warsaw timezone)
2. If `days_ago > 0` AND `days_ago ≤ 7`:
    - Set `isBackfill = true`
3. If `days_ago > 7`:
    - Reject with `400 Bad Request`: "Cannot backfill entries older than 7 days"

#### Weekly Obligation Check

**Definition:** Patient has ≥1 weight entry in current week (Monday 00:00 - Sunday 23:59,
Europe/Warsaw)

**Logic:**

1. Calculate week start: Monday 00:00 of current week
2. Calculate week end: Sunday 23:59 of current week
3. Query `weight_entries` WHERE `userId = patient_id` AND
   `measurementDate BETWEEN week_start AND week_end`
4. If count ≥ 1: `weeklyObligationMet = true`

**Used in:**

- Dietitian patient list view
- Reminder suppression logic
- KPI calculations (exclude paused patients)

#### Reminder Suppression Logic

**Friday 19:00 Reminder:**

1. Get all patients with `status = 'active'`
2. For each patient, check weekly obligation
3. Skip reminder if:
    - Patient has entry this week (Monday 00:00 to NOW)
    - Status is not "active"
4. Send reminder via web push (if subscribed) or email (fallback)
5. Log event: `reminder_sent` with properties: `{channel: 'push' | 'email', day: 'friday'}`

**Sunday 11:00 Reminder:**

1. Get all patients with `status = 'active'`
2. For each patient, check:
    - Has entry this week? If yes, skip
    - Already received Friday reminder AND has entry after Friday 19:00? If yes, skip
    - Status is not "active"? Skip
3. Send reminder
4. Log event: `reminder_sent` with properties: `{channel: 'push' | 'email', day: 'sunday'}`

**Additional Suppression:**

- If dietitian adds entry for patient (`source = 'dietitian'`), patient weekly obligation is met
- No reminders sent for that week

#### KPI Calculation - Weekly Compliance Rate

**Definition:** Percentage of weeks where patient had ≥1 weight entry

**Calculation:**

1. Get all patients with `status = 'active'` (exclude `paused` and `ended`)
2. For each patient:
    - Count total weeks since account creation (or specified period)
    - Count weeks with ≥1 entry (any source: patient or dietitian)
    - Calculate: `patient_compliance = weeks_with_entry / total_weeks`
3. Calculate overall: `avg_compliance = SUM(patient_compliance) / patient_count`
4. Return as decimal (0.0 - 1.0) or percentage (0% - 100%)

**Cohort Comparison:**

- Compare current 4-week period with previous 4-week period
- Calculate difference and percentage change

#### Patient Status Transitions

**Active → Paused:**

- Stop sending reminders
- Exclude from KPI calculations
- Patient can still add weight entries

**Paused → Active:**

- Resume reminders
- Include in KPI calculations from reactivation date

**Active/Paused → Ended:**

- Stop sending reminders
- Exclude from KPI calculations
- Set `endedAt = NOW()`
- Calculate `scheduledDeletionAt = endedAt + 24 months`
- Patient can no longer add weight entries
- Dietitian can still view historical data

**Ended → Active (Reactivation):**

- Resume reminders
- Clear `endedAt` and `scheduledDeletionAt`
- Include in KPI calculations from reactivation date

#### Account Deletion - RODO Compliance

**Anonymization Process:**

1. Validate user password
2. Generate data export (JSON) and make available for download
3. Update `users` table:
    - Set `email = 'deleted_' || user_id || '@anonymized.local'`
    - Set `firstName = 'Deleted'`
    - Set `lastName = 'User'`
    - Clear `age`, `gender`
    - Set `status = 'ended'`
4. Update `weight_entries`:
    - Keep weight data and dates (pseudonymized by user ID)
    - Clear `note` field
5. Delete from `sessions`, `push_subscriptions`, `password_reset_tokens`
6. Keep `audit_log` and `events` (pseudonymized, required for compliance)
7. Update `consents` to log deletion consent
8. Schedule final hard delete after 24 months (retention period)

**Data Retained (Pseudonymized):**

- Weight entries (for historical analytics, no PII)
- Audit log (for compliance, user ID pseudonymized)
- Events (for analytics, user ID pseudonymized)

**Data Deleted Immediately:**

- Email, name, age, gender
- Sessions
- Push subscriptions
- Password reset tokens

#### Idempotency for CRON Jobs

**Implementation:**

1. Each reminder job checks `events` table for existing `reminder_sent` event
2. Query:
   `SELECT * FROM events WHERE event_type = 'reminder_sent' AND user_id = ? AND properties->>'day' = 'friday' AND timestamp >= week_start`
3. If event exists, skip sending (already sent this week)
4. If not exists, send reminder and log event
5. This prevents duplicate reminders if job is retried or runs multiple times

**Job Execution Logging:**

- Log job start: `cron_job_start` event with `jobId`
- Log job completion: `cron_job_complete` event with results
- Log job failure: `cron_job_failed` event with error details
- Vercel automatically retries failed cron jobs (3 attempts)

### 4.3 Event Tracking

**All events logged to `events` table with standard schema:**

```typescript
{
  id: uuid,
      userId
:
  uuid | null,  // null for anonymous events
      eventType
:
  string,
      properties
:
  {
    // Event-specific properties
    channel ? : 'push' | 'email',
        source ? : 'patient' | 'dietitian',
        flags ? : string[],
        [key
  :
    string
  ]:
    any
  }
,
  timestamp: timestamp
}
```

**Event Types:**

| Event Type                   | When Logged                        | Properties                        |
|------------------------------|------------------------------------|-----------------------------------|
| `signup_completed`           | User registers                     | `{invitationId, role}`            |
| `consent_accept`             | User accepts consent               | `{consentType, consentText}`      |
| `login_success`              | User logs in                       | `{role}`                          |
| `login_failed`               | Login attempt fails                | `{email, reason}`                 |
| `password_reset_requested`   | Reset email sent                   | `{email}`                         |
| `password_reset_completed`   | Password reset successful          | `{userId}`                        |
| `view_add_weight`            | Patient views add weight page      | `{}`                              |
| `add_weight_patient`         | Patient adds weight                | `{weight, isBackfill, isOutlier}` |
| `add_weight_dietitian`       | Dietitian adds weight              | `{weight, patientId}`             |
| `edit_weight`                | Weight entry edited                | `{entryId, oldWeight, newWeight}` |
| `outlier_flagged`            | Anomaly detected                   | `{entryId, change}`               |
| `outlier_confirmed`          | Outlier confirmed                  | `{entryId}`                       |
| `outlier_corrected`          | Outlier corrected (edited/deleted) | `{entryId}`                       |
| `reminder_sent`              | Reminder sent                      | `{channel, day: 'friday'          | 'sunday'}` |
| `reminder_open`              | Reminder opened                    | `{reminderId, channel}`           |
| `reminder_click`             | Reminder CTA clicked               | `{reminderId, channel}`           |
| `push_subscribe`             | Web push enabled                   | `{endpoint}`                      |
| `push_unsubscribe`           | Web push disabled                  | `{endpoint}`                      |
| `account_deletion_requested` | User requests deletion             | `{}`                              |

**Event Aggregation for Analytics:**

- Events queried by `event_type` and date range
- Aggregated for KPI dashboard (counts, rates, trends)
- Used for cohort analysis (group by week/month)
- Reminder effectiveness: join `reminder_sent` + `reminder_open` + `reminder_click`