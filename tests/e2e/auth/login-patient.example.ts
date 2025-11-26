import { test } from '@playwright/test'
import { LoginPage } from '../page-objects'

/**
 * Example E2E Test - Patient Login Scenario
 *
 * This is a simple example demonstrating the Page Object Model pattern
 * for the user scenario: "Login as patient with valid credentials"
 *
 * Scenario:
 * 1. Open login page
 * 2. Provide valid patient credentials
 * 3. Verify successful login and redirect to patient dashboard
 */

test.describe('Patient Login - Example Scenario', () => {
  test('should successfully login as patient', async ({ page }) => {
    // ARRANGE - Set up the test
    const loginPage = new LoginPage(page)
    const patientEmail = 'patient@example.com'
    const patientPassword = 'SecurePass123'

    // Navigate to login page
    await loginPage.goto()

    // Verify page loaded correctly
    await loginPage.expectPageVisible()
    await loginPage.expectFormReady()

    // ACT - Perform the action
    // Fill in patient credentials
    await loginPage.fillEmail(patientEmail)
    await loginPage.fillPassword(patientPassword)

    // Submit the form
    await loginPage.clickSubmit()

    // ASSERT - Verify the outcome
    // Check success toast notification
    await loginPage.expectSuccessToast()

    // Verify redirect to patient dashboard
    await loginPage.expectRedirectToPatientDashboard()
  })

  test('should login as patient using helper method', async ({ page }) => {
    // ARRANGE
    const loginPage = new LoginPage(page)
    await loginPage.goto()

    // ACT - Use high-level helper method
    await loginPage.loginAsPatient('patient@example.com', 'SecurePass123')

    // ASSERT - Already at dashboard (loginAsPatient waits for navigation)
    await loginPage.expectRedirectToPatientDashboard()
  })
})
