import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object Model for Login Page (/logowanie)
 *
 * Represents the login page with all interactive elements and actions.
 * Follows 'Arrange', 'Act', 'Assert' approach.
 *
 * @example
 * ```typescript
 * const loginPage = new LoginPage(page)
 * await loginPage.goto()
 * await loginPage.loginAsPatient('patient@example.com', 'password123')
 * await loginPage.expectRedirectToPatientDashboard()
 * ```
 */
export class LoginPage {
  readonly page: Page

  // Locators - Page elements
  readonly pageContainer: Locator
  readonly loginContainer: Locator
  readonly heading: Locator
  readonly form: Locator
  readonly emailInput: Locator
  readonly emailError: Locator
  readonly passwordInput: Locator
  readonly passwordToggle: Locator
  readonly passwordError: Locator
  readonly submitButton: Locator
  readonly forgotPasswordLink: Locator

  constructor(page: Page) {
    this.page = page

    // Initialize locators using data-test-id attributes
    this.pageContainer = page.getByTestId('login-page')
    this.loginContainer = page.getByTestId('login-container')
    this.heading = page.getByTestId('login-heading')
    this.form = page.getByTestId('login-form')
    this.emailInput = page.getByTestId('login-email-input')
    this.emailError = page.getByTestId('login-email-error')
    this.passwordInput = page.getByTestId('login-password-input')
    this.passwordToggle = page.getByTestId('login-password-toggle')
    this.passwordError = page.getByTestId('login-password-error')
    this.submitButton = page.getByTestId('login-submit-button')
    this.forgotPasswordLink = page.getByTestId('login-forgot-password-link')
  }

  // NAVIGATION

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/logowanie')
  }

  // ACTIONS

  /**
   * Fill email input field
   * @param email - Email address
   */
  async fillEmail(email: string) {
    await this.emailInput.fill(email)
  }

  /**
   * Fill password input field
   * @param password - Password
   */
  async fillPassword(password: string) {
    await this.passwordInput.fill(password)
  }

  /**
   * Toggle password visibility (show/hide)
   */
  async togglePasswordVisibility() {
    await this.passwordToggle.click()
  }

  /**
   * Click submit button to log in
   */
  async clickSubmit() {
    await this.submitButton.click()
  }

  /**
   * Click "Forgot Password?" link
   */
  async clickForgotPassword() {
    await this.forgotPasswordLink.click()
  }

  /**
   * Submit login form with provided credentials
   * @param email - Email address
   * @param password - Password
   */
  async submitLogin(email: string, password: string) {
    await this.fillEmail(email)
    await this.fillPassword(password)
    await this.clickSubmit()
  }

  /**
   * Complete login flow as patient
   * @param email - Patient email
   * @param password - Patient password
   */
  async loginAsPatient(email: string, password: string) {
    await this.submitLogin(email, password)
    // Wait for navigation to patient dashboard
    await this.page.waitForURL('/pacjent/waga', { timeout: 5000 })
  }

  /**
   * Complete login flow as dietitian
   * @param email - Dietitian email
   * @param password - Dietitian password
   */
  async loginAsDietitian(email: string, password: string) {
    await this.submitLogin(email, password)
    // Wait for navigation to dietitian dashboard
    await this.page.waitForURL('/dietetyk/dashboard', { timeout: 5000 })
  }

  // ASSERTIONS

  /**
   * Verify login page is visible
   */
  async expectPageVisible() {
    await expect(this.pageContainer).toBeVisible()
    await expect(this.heading).toBeVisible()
    await expect(this.heading).toHaveText('Logowanie')
  }

  /**
   * Verify login form is visible and enabled
   */
  async expectFormReady() {
    await expect(this.form).toBeVisible()
    await expect(this.emailInput).toBeVisible()
    await expect(this.emailInput).toBeEnabled()
    await expect(this.passwordInput).toBeVisible()
    await expect(this.passwordInput).toBeEnabled()
    await expect(this.submitButton).toBeVisible()
    await expect(this.submitButton).toBeEnabled()
  }

  /**
   * Verify email field is focused (auto-focus on mount)
   */
  async expectEmailFocused() {
    await expect(this.emailInput).toBeFocused()
  }

  /**
   * Verify email validation error is displayed
   * @param errorMessage - Expected error message
   */
  async expectEmailError(errorMessage?: string) {
    await expect(this.emailError).toBeVisible()
    if (errorMessage) {
      await expect(this.emailError).toHaveText(errorMessage)
    }
  }

  /**
   * Verify password validation error is displayed
   * @param errorMessage - Expected error message
   */
  async expectPasswordError(errorMessage?: string) {
    await expect(this.passwordError).toBeVisible()
    if (errorMessage) {
      await expect(this.passwordError).toHaveText(errorMessage)
    }
  }

  /**
   * Verify password is visible (toggle active)
   */
  async expectPasswordVisible() {
    await expect(this.passwordInput).toHaveAttribute('type', 'text')
  }

  /**
   * Verify password is hidden (toggle inactive)
   */
  async expectPasswordHidden() {
    await expect(this.passwordInput).toHaveAttribute('type', 'password')
  }

  /**
   * Verify submit button is in loading state
   */
  async expectSubmitLoading() {
    await expect(this.submitButton).toBeDisabled()
    await expect(this.submitButton).toHaveText('Logowanie...')
  }

  /**
   * Verify toast notification with specific message
   * @param message - Expected toast message
   */
  async expectToastMessage(message: string) {
    // react-hot-toast creates elements with role="status" or role="alert"
    const toast = this.page.getByRole('status').or(this.page.getByRole('alert'))
    await expect(toast).toContainText(message)
  }

  /**
   * Verify success toast is displayed
   */
  async expectSuccessToast() {
    await this.expectToastMessage('Zalogowano pomyślnie')
  }

  /**
   * Verify error toast for invalid credentials (401)
   */
  async expectInvalidCredentialsToast() {
    await this.expectToastMessage('Nieprawidłowy email lub hasło')
  }

  /**
   * Verify error toast for rate limiting (429)
   */
  async expectRateLimitToast() {
    const toast = this.page.getByRole('status').or(this.page.getByRole('alert'))
    await expect(toast).toContainText('zbyt wielu nieudanych prób')
  }

  /**
   * Verify redirect to patient dashboard after successful login
   */
  async expectRedirectToPatientDashboard() {
    await expect(this.page).toHaveURL('/pacjent/waga')
  }

  /**
   * Verify redirect to dietitian dashboard after successful login
   */
  async expectRedirectToDietitianDashboard() {
    await expect(this.page).toHaveURL('/dietetyk/dashboard')
  }

  /**
   * Verify redirect to password reset page
   */
  async expectRedirectToPasswordReset() {
    await expect(this.page).toHaveURL('/reset-hasla')
  }

  // HELPER METHODS

  /**
   * Check if email input has error styling
   */
  async hasEmailError(): Promise<boolean> {
    const classList = await this.emailInput.getAttribute('class')
    return classList?.includes('border-red-500') ?? false
  }

  /**
   * Check if password input has error styling
   */
  async hasPasswordError(): Promise<boolean> {
    const classList = await this.passwordInput.getAttribute('class')
    return classList?.includes('border-red-500') ?? false
  }

  /**
   * Get current email input value
   */
  async getEmailValue(): Promise<string> {
    return (await this.emailInput.inputValue()) ?? ''
  }

  /**
   * Get current password input value
   */
  async getPasswordValue(): Promise<string> {
    return (await this.passwordInput.inputValue()) ?? ''
  }

  /**
   * Check if password is currently visible
   */
  async isPasswordVisible(): Promise<boolean> {
    const type = await this.passwordInput.getAttribute('type')
    return type === 'text'
  }
}
