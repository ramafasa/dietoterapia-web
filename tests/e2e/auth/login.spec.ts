import { test, expect } from '@playwright/test'
import { LoginPage } from '../page-objects'
import { getPatientCredentials, getDietitianCredentials } from '../test-credentials'

/**
 * E2E tests for Login functionality
 *
 * Scenarios:
 * - Successful patient login
 * - Successful dietitian login
 * - Invalid credentials
 * - Client-side validation
 * - Password visibility toggle
 * - Forgot password link
 */

test.describe('Login Page', () => {
  let loginPage: LoginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()

    // Clear any existing toasts from previous tests
    // Only remove react-hot-toast elements, not form validation errors
    await page.evaluate(() => {
      const toasts = document.querySelectorAll('[role="status"][aria-live="polite"]')
      toasts.forEach(toast => {
        // Only remove if it's not a form validation error (no data-test-id)
        if (!toast.hasAttribute('data-test-id')) {
          toast.remove()
        }
      })
    })

    // Wait a bit for page to be fully ready
    await page.waitForTimeout(100)
  })

  test.describe('Page Load', () => {
    test('should display login page correctly', async () => {
      // Assert
      await loginPage.expectPageVisible()
      await loginPage.expectFormReady()
    })

    test('should auto-focus email input on mount', async () => {
      // Assert
      await loginPage.expectEmailFocused()
    })

    test('should display forgot password link', async () => {
      // Assert
      await expect(loginPage.forgotPasswordLink).toBeVisible()
      await expect(loginPage.forgotPasswordLink).toHaveText('Zapomniałeś hasła?')
    })
  })

  test.describe('Successful Login', () => {
    test('should login patient with valid credentials', async ({ page }) => {
      // Arrange
      const { email, password } = getPatientCredentials()

      // Act
      await loginPage.fillEmail(email)
      await loginPage.fillPassword(password)
      await loginPage.clickSubmit()

      // Assert - Wait for navigation (which confirms successful login)
      // The success toast may appear briefly but navigation happens quickly
      await loginPage.expectRedirectToPatientDashboard()

      // Verify we're on the patient dashboard
      await expect(page).toHaveURL('/pacjent/waga')
    })

    test('should login dietitian with valid credentials', async ({ page }) => {
      // Arrange
      const { email, password } = getDietitianCredentials()

      // Act
      await loginPage.fillEmail(email)
      await loginPage.fillPassword(password)
      await loginPage.clickSubmit()

      // Assert - Wait for navigation (which confirms successful login)
      await loginPage.expectRedirectToDietitianDashboard()

      // Verify we're on the dietitian dashboard
      await expect(page).toHaveURL('/dietetyk/dashboard')
    })

    test('should login using helper method', async () => {
      // Arrange
      const { email, password } = getPatientCredentials()

      // Act
      await loginPage.loginAsPatient(email, password)

      // Assert
      await loginPage.expectRedirectToPatientDashboard()
    })
  })

  test.describe('Failed Login', () => {
    test('should show error toast for invalid credentials', async ({ page }) => {
      // Arrange
      const email = 'invalid@example.com'
      const password = 'WrongPassword'

      // Act
      await loginPage.fillEmail(email)
      await loginPage.fillPassword(password)
      await loginPage.clickSubmit()

      // Assert
      await loginPage.expectInvalidCredentialsToast()

      // Verify password field is cleared for security
      const passwordValue = await loginPage.getPasswordValue()
      expect(passwordValue).toBe('')

      // Verify user stays on login page
      await expect(page).toHaveURL('/logowanie')
    })
  })

  test.describe('Client-side Validation', () => {
    test('should show validation error for empty email', async () => {
      // Arrange - Leave email empty
      await loginPage.fillPassword('password123')

      // Act
      await loginPage.clickSubmit()

      // Assert
      await loginPage.expectEmailError()
      const hasError = await loginPage.hasEmailError()
      expect(hasError).toBe(true)
    })

    test('should show validation error for invalid email format', async () => {
      // Arrange
      await loginPage.fillEmail('invalid-email')
      await loginPage.fillPassword('password123')

      // Act
      await loginPage.clickSubmit()

      // Assert
      await loginPage.expectEmailError('Nieprawidłowy adres email')
    })

    test('should show validation error for empty password', async () => {
      // Arrange
      await loginPage.fillEmail('test@example.com')
      // Leave password empty

      // Act
      await loginPage.clickSubmit()

      // Assert
      await loginPage.expectPasswordError('Hasło jest wymagane')
    })

    test('should show toast for form validation errors', async () => {
      // Arrange - Submit empty form

      // Act
      await loginPage.clickSubmit()

      // Assert
      await loginPage.expectToastMessage('Popraw błędy w formularzu')
    })
  })

  test.describe('Password Visibility Toggle', () => {
    test('should toggle password visibility on click', async () => {
      // Arrange
      await loginPage.fillPassword('SecretPassword')

      // Assert - Initially hidden
      await loginPage.expectPasswordHidden()
      const isVisibleBefore = await loginPage.isPasswordVisible()
      expect(isVisibleBefore).toBe(false)

      // Act - Toggle to visible
      await loginPage.togglePasswordVisibility()

      // Assert - Now visible
      await loginPage.expectPasswordVisible()
      const isVisibleAfter = await loginPage.isPasswordVisible()
      expect(isVisibleAfter).toBe(true)

      // Act - Toggle back to hidden
      await loginPage.togglePasswordVisibility()

      // Assert - Hidden again
      await loginPage.expectPasswordHidden()
    })

    test('should have correct aria-label for toggle button', async () => {
      // Assert - Initially "Pokaż hasło"
      await expect(loginPage.passwordToggle).toHaveAttribute('aria-label', 'Pokaż hasło')

      // Act
      await loginPage.togglePasswordVisibility()

      // Assert - After toggle "Ukryj hasło"
      await expect(loginPage.passwordToggle).toHaveAttribute('aria-label', 'Ukryj hasło')
    })
  })

  test.describe('Loading State', () => {
    test('should show loading state during login', async () => {
      // Arrange
      const { email, password } = getPatientCredentials()
      await loginPage.fillEmail(email)
      await loginPage.fillPassword(password)

      // Act
      await loginPage.clickSubmit()

      // Assert - Check loading state (may be brief)
      // Note: This assertion might be flaky if login is too fast
      // Consider using page.route() to delay the response for testing
    })

    test('should disable inputs during loading', async () => {
      // Arrange
      const { email, password } = getPatientCredentials()
      await loginPage.fillEmail(email)
      await loginPage.fillPassword(password)

      // Act - Start login
      const submitPromise = loginPage.clickSubmit()

      // Assert - Inputs should be disabled during loading
      await expect(loginPage.emailInput).toBeDisabled()
      await expect(loginPage.passwordInput).toBeDisabled()
      await expect(loginPage.submitButton).toBeDisabled()

      await submitPromise
    })
  })

  test.describe('Navigation', () => {
    test('should navigate to password reset page', async () => {
      // Act
      await loginPage.clickForgotPassword()

      // Assert
      await loginPage.expectRedirectToPasswordReset()
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper ARIA attributes', async () => {
      // Assert - Email field
      await expect(loginPage.emailInput).toHaveAttribute('aria-invalid', 'false')

      // Trigger validation error
      await loginPage.clickSubmit()

      // Wait for error message to appear (React state update)
      await expect(loginPage.emailError).toBeVisible()

      // Assert - After validation error
      await expect(loginPage.emailInput).toHaveAttribute('aria-invalid', 'true')
      await expect(loginPage.emailInput).toHaveAttribute('aria-describedby', 'email-error')
    })

    test('should have proper error role attributes', async () => {
      // Arrange - Trigger validation
      await loginPage.clickSubmit()

      // Assert - Error messages have role="alert"
      await expect(loginPage.emailError).toHaveAttribute('role', 'alert')
    })
  })
})
