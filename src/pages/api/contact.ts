import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { contactSchema } from '../../schemas/contact';
import { checkPublicRateLimit, recordPublicRequest, checkEmailRateLimit, recordEmailSent } from '@/lib/rate-limit-public';
import { verifyCaptcha } from '@/lib/captcha';
import { sanitizeFormData, validateEmailRecipient, getEmailRiskScore } from '@/lib/email-security';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Extract IP address
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';

    // Check IP rate limit
    const ipRateCheck = checkPublicRateLimit(ip);
    if (!ipRateCheck.allowed) {
      console.warn(`[Contact] Rate limit exceeded for IP: ${ip}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Za dużo prób wysłania wiadomości. Spróbuj ponownie za ${ipRateCheck.retryAfter} minut.`,
          retryAfter: ipRateCheck.retryAfter,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate with Zod
    const validatedData = contactSchema.parse(body);

    // Verify reCAPTCHA token
    const captchaResult = await verifyCaptcha(validatedData.recaptchaToken, 'contact_form');
    if (!captchaResult.success) {
      console.warn(`[Contact] reCAPTCHA verification failed for IP: ${ip}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Weryfikacja bezpieczeństwa nieudana. Odśwież stronę i spróbuj ponownie.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize user inputs
    const sanitizedData = sanitizeFormData(validatedData);
    const { fullName, email, phone, message } = sanitizedData;

    // Validate email recipient
    if (!validateEmailRecipient(email)) {
      console.warn(`[Contact] Invalid email recipient: ${email}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Podany adres email jest nieprawidłowy. Użyj swojego prawdziwego adresu email.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check email risk score
    const riskScore = getEmailRiskScore(email);
    if (riskScore > 0.7) {
      console.warn(`[Contact] High risk email detected: ${email}, score: ${riskScore}`);
    }

    // Check email rate limit for confirmation email
    const emailRateCheck = checkEmailRateLimit(email);
    const canSendConfirmation = emailRateCheck.allowed;

    if (!canSendConfirmation) {
      console.warn(`[Contact] Email rate limit exceeded for: ${email}`);
    }

    // Configure SMTP (OVH MX Plan)
    const smtpHost = import.meta.env.SMTP_HOST;
    const smtpPort = parseInt(import.meta.env.SMTP_PORT || '465');
    const smtpUser = import.meta.env.SMTP_USER;
    const smtpPass = import.meta.env.SMTP_PASS;
    const contactEmail = import.meta.env.CONTACT_EMAIL || 'dietoterapia@paulinamaciak.pl';
    const siteUrl = import.meta.env.SITE_URL || 'https://paulinamaciak.pl';

    // In development mode, just log and return success
    if (import.meta.env.DEV) {
      console.log('📧 [DEV MODE] Contact email would be sent with data:', validatedData);
      console.log('📧 [DEV MODE] SMTP Config:', {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        from: contactEmail,
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'DEV MODE: Email logged to console',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate SMTP configuration
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error('SMTP configuration is incomplete');
      throw new Error('Email service not configured');
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true, // use SSL
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // SMTP timeouts (security requirement #6)
      connectionTimeout: 10000, // 10s - max time to establish TCP connection
      greetingTimeout: 5000,    // 5s - max time to receive SMTP greeting (220)
      socketTimeout: 15000,     // 15s - max idle time between SMTP commands
    });

    // Extract first name for personalization (already sanitized)
    const firstName = fullName.split(' ')[0];

    // Email to Paulina (owner)
    const ownerEmailOptions = {
      from: contactEmail,
      to: contactEmail,
      subject: 'Nowa wiadomość kontaktowa - Dietoterapia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4A7C59; border-bottom: 2px solid #4A7C59; padding-bottom: 10px;">
            Nowa wiadomość kontaktowa
          </h2>

          <div style="background-color: #F9F6F3; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Imię i nazwisko:</strong> ${fullName}
            </p>
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Email:</strong>
              <a href="mailto:${email}" style="color: #4A7C59;">${email}</a>
            </p>
            ${phone ? `
              <p style="margin: 10px 0;">
                <strong style="color: #2C3E3A;">Telefon:</strong>
                <a href="tel:${phone}" style="color: #4A7C59;">${phone}</a>
              </p>
            ` : ''}
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #4A7C59; margin-bottom: 10px;">Treść wiadomości:</h3>
            <p style="background-color: #F9F6F3; padding: 15px; border-radius: 8px; white-space: pre-wrap; line-height: 1.6;">${message}</p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E8B4A8;">
            <p style="color: #666; font-size: 14px;">
              <strong>Data wysłania:</strong> ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}
            </p>
          </div>
        </div>
      `,
    };

    // Confirmation email to user
    const userEmailOptions = {
      from: contactEmail,
      to: email,
      subject: 'Potwierdzenie wysłania wiadomości - Dietoterapia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4A7C59; border-bottom: 2px solid #4A7C59; padding-bottom: 10px;">
            Dziękujemy za wiadomość!
          </h2>

          <p style="font-size: 16px; color: #2C3E3A; margin: 20px 0;">
            Cześć <strong>${firstName}</strong>,
          </p>

          <p style="font-size: 16px; color: #2C3E3A; line-height: 1.6;">
            Twoja wiadomość została wysłana pomyślnie. Paulina odpowie na nią <strong>wkrótce</strong>.
          </p>

          <hr style="border: none; border-top: 1px solid #E8B4A8; margin: 30px 0;" />

          <div style="background-color: #F9F6F3; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #4A7C59; margin-top: 0;">Dane kontaktowe:</h3>
            <p style="margin: 10px 0;">
              <strong>Email:</strong>
              <a href="mailto:dietoterapia@paulinamaciak.pl" style="color: #4A7C59;">dietoterapia@paulinamaciak.pl</a>
            </p>
            <p style="margin: 10px 0;">
              <strong>Telefon:</strong>
              <a href="tel:+48518036686" style="color: #4A7C59;">+48 518 036 686</a>
            </p>
            <p style="margin: 10px 0;">
              <strong>Strona:</strong>
              <a href="${siteUrl}" style="color: #4A7C59;">${siteUrl.replace('https://', '')}</a>
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E8B4A8; text-align: center;">
            <p style="color: #666; font-size: 14px; margin: 5px 0;">
              Paulina Maciak - Dietetyk kliniczna
            </p>
          </div>
        </div>
      `,
    };

    // Send emails with error handling
    try {
      // Always send owner email
      const ownerEmailResult = await transporter.sendMail(ownerEmailOptions);
      console.log('✅ Owner email sent successfully:', ownerEmailResult.messageId);

      // Send user confirmation email only if rate limit allows
      if (canSendConfirmation) {
        const userEmailResult = await transporter.sendMail(userEmailOptions);
        console.log('✅ User confirmation email sent successfully:', userEmailResult.messageId);
        recordEmailSent(email);
      } else {
        console.log(`⚠️ User confirmation email skipped due to rate limit: ${email}`);
      }

      // Record successful request for IP rate limiting
      recordPublicRequest(ip);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Wiadomość została wysłana pomyślnie',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (emailError: any) {
      console.error('❌ Failed to send email:', emailError);

      // Return specific error for email sending failure
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nie udało się wysłać wiadomości email. Spróbuj ponownie lub skontaktuj się bezpośrednio.',
          details: import.meta.env.DEV ? emailError.message : undefined,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    console.error('Error processing contact request:', error);

    // Zod validation error
    if (error.errors) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Dane formularza są nieprawidłowe',
          details: error.errors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Other errors
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Wystąpił błąd podczas przetwarzania zapytania',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
